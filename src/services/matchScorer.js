/**
 * Match Scorer - Calculate similarity scores between parsed references and API results
 */

import {
  SCORING_WEIGHTS,
  MIN_MATCH_SCORE,
  AUTHOR_SIM_THRESHOLD,
  YEAR_TOLERANCE,
} from './verificationConfig.js';
import {
  normalizeForMatch,
  meaningfulTokens,
  diceCoefficient,
  levenshteinRatio,
} from './textNormalize.js';

/**
 * Calculate how well an API result matches a parsed reference
 * @param {object} reference - Parsed reference { title, authors, year, journal, doi, isbn }
 * @param {object} result - API result { title, authors, year, journal, doi, isbn }
 * @returns {number} Score 0-100
 */
export function calculateMatchScore(reference, result) {
  if (!reference || !result) return 0;

  // Kesin tanımlayıcı kısa devresi: DOI veya ISBN birebir eşleşiyorsa ~kesin eşleşme.
  const refDoi = normalizeDoi(reference.doi);
  const resDoi = normalizeDoi(result.doi);
  if (refDoi && resDoi && refDoi === resDoi) return 100;

  const refIsbn = normalizeIsbn(reference.isbn);
  const resIsbn = normalizeIsbn(result.isbn);
  if (refIsbn && resIsbn && refIsbn === resIsbn) return 100;

  let score = 0;

  // Title similarity
  const titleSim = stringSimilarity(reference.title, result.title);
  score += titleSim * SCORING_WEIGHTS.title;

  // Author match
  const authorScore = calculateAuthorScore(reference.authors, result.authors);
  score += authorScore * SCORING_WEIGHTS.author;

  // Year match
  if (reference.year && result.year) {
    const diff = Math.abs(Number(reference.year) - Number(result.year));
    if (diff === 0) {
      score += SCORING_WEIGHTS.year;
    } else if (diff <= YEAR_TOLERANCE) {
      score += SCORING_WEIGHTS.year * 0.5;
    }
  }

  // Journal match (yalnızca ikisinde de varsa)
  if (reference.journal && result.journal) {
    const journalSim = stringSimilarity(reference.journal, result.journal);
    score += journalSim * SCORING_WEIGHTS.journal;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/** DOI'yi karşılaştırma için normalize et. */
function normalizeDoi(doi) {
  if (!doi) return '';
  return String(doi)
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
    .replace(/[).,;]+$/, '')
    .trim();
}

/** ISBN'i karşılaştırma için normalize et (tireler/boşluklar atılır). */
function normalizeIsbn(isbn) {
  if (!isbn) return '';
  return String(isbn).replace(/[^0-9Xx]/g, '').toUpperCase();
}

/**
 * Başlık/dergi benzerliği:
 * - İki tarafta da ≥2 anlamlı kelime varsa → durak-sözcüksüz token Jaccard
 *   (yaygın kelimelerden kaynaklı yanlış pozitifleri eler).
 * - Aksi halde (kısa/durak ağırlıklı başlık) → karakter-bigram (Dice) yedeği.
 */
function stringSimilarity(a, b) {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = meaningfulTokens(na);
  const tb = meaningfulTokens(nb);

  if (ta.length >= 2 && tb.length >= 2) {
    const setA = new Set(ta);
    const setB = new Set(tb);
    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  // Kısa başlık yedeği: durak sözcükler hariç anlamlı kelimeler üzerinden Dice.
  // (Ham normalize dize üzerinde çalıştırılırsa "X üzerine çalışma" gibi durak
  //  ağırlıklı başlıklar yanlış pozitif üretir; bu yüzden anlamlı kısmı kullanırız.)
  const ja = ta.join(' ');
  const jb = tb.join(' ');
  if (ja && jb) return diceCoefficient(ja, jb);
  return diceCoefficient(na, nb);
}

/**
 * Calculate author match score (0-1).
 * Soyadları normalize edilip birebir veya Levenshtein benzerliği ile eşleştirilir;
 * substring eşleşmesi KULLANILMAZ (örn. "Smith" ⊄ "Smithson").
 */
function calculateAuthorScore(refAuthors, resultAuthors) {
  if (!refAuthors?.length || !resultAuthors?.length) return 0;

  const refNames = refAuthors
    .map((a) => normalizeForMatch(extractSurname(a)))
    .filter(Boolean);
  const resultNames = resultAuthors
    .map((a) => normalizeForMatch(extractSurname(a)))
    .filter(Boolean);

  if (!refNames.length || !resultNames.length) return 0;

  let matches = 0;
  for (const name of refNames) {
    if (resultNames.some((rn) => surnamesMatch(name, rn))) {
      matches++;
    }
  }

  return matches / refNames.length;
}

/** İki normalize soyadının eşleşip eşleşmediği (birebir veya bulanık). */
function surnamesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // Çok kısa parçalar (baş harf vb.) için yalnızca birebir kabul edilir.
  if (a.length < 3 || b.length < 3) return false;
  return levenshteinRatio(a, b) >= AUTHOR_SIM_THRESHOLD;
}

/**
 * Extract surname from full author name
 */
function extractSurname(name) {
  if (!name) return '';
  // "Surname, Name" format
  if (name.includes(',')) return name.split(',')[0].trim();
  // "Name Surname" format - last word
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Find best match from API results for a given reference
 * @param {object} reference - Parsed reference
 * @param {object[]} results - API results array
 * @returns {{ match: object, score: number } | null}
 */
export function findBestMatch(reference, results) {
  if (!results || results.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const result of results) {
    const score = calculateMatchScore(reference, result);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  // Minimum threshold
  if (bestScore < MIN_MATCH_SCORE) return null;

  return { match: bestMatch, score: bestScore };
}
