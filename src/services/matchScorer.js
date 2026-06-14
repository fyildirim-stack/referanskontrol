/**
 * Match Scorer - Calculate similarity scores between parsed references and API results
 */

/**
 * Calculate how well an API result matches a parsed reference
 * @param {object} reference - Parsed reference { title, authors, year, journal }
 * @param {object} result - API result { title, authors, year, journal }
 * @returns {number} Score 0-100
 */
export function calculateMatchScore(reference, result) {
  if (!reference || !result) return 0;

  let score = 0;
  let weights = { title: 50, author: 25, year: 15, journal: 10 };

  // Title similarity (50 points)
  const titleSim = stringSimilarity(
    normalize(reference.title),
    normalize(result.title)
  );
  score += titleSim * weights.title;

  // Author match (25 points)
  const authorScore = calculateAuthorScore(reference.authors, result.authors);
  score += authorScore * weights.author;

  // Year match (15 points)
  if (reference.year && result.year) {
    if (reference.year === result.year) {
      score += weights.year;
    } else if (Math.abs(reference.year - result.year) === 1) {
      score += weights.year * 0.5;
    }
  }

  // Journal match (10 points)
  if (reference.journal && result.journal) {
    const journalSim = stringSimilarity(
      normalize(reference.journal),
      normalize(result.journal)
    );
    score += journalSim * weights.journal;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Normalized string for comparison
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\sçğıöşü]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Jaccard-like similarity between two strings
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate author match score
 */
function calculateAuthorScore(refAuthors, resultAuthors) {
  if (!refAuthors?.length || !resultAuthors?.length) return 0;

  const refNames = refAuthors.map(a => normalize(extractSurname(a)));
  const resultNames = resultAuthors.map(a => normalize(extractSurname(a)));

  let matches = 0;
  for (const name of refNames) {
    if (name && resultNames.some(rn => rn.includes(name) || name.includes(rn))) {
      matches++;
    }
  }

  return refNames.length > 0 ? matches / refNames.length : 0;
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
  if (bestScore < 30) return null;

  return { match: bestMatch, score: bestScore };
}
