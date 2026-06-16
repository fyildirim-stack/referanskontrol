/**
 * Academic Verifier - Main orchestrator for verifying references against multiple APIs
 */

import { searchOpenAlex } from './apis/openalexApi.js';
import { searchCrossref } from './apis/crossrefApi.js';
import { searchOpenLibrary } from './apis/openLibraryApi.js';
import { searchGoogleBooks } from './apis/googleBooksApi.js';
import { searchSemanticScholar } from './apis/semanticScholarApi.js';
import { findBestMatch } from './matchScorer.js';
import {
  CONCURRENCY,
  BATCH_DELAY_MS,
  FOUND_THRESHOLD,
  CONFIDENCE,
  ENABLED_APIS,
} from './verificationConfig.js';

/** Kayıtlı API kaynakları (anahtar → etiket + arama fonksiyonu). */
const API_REGISTRY = {
  openalex: { label: 'OpenAlex', search: searchOpenAlex },
  crossref: { label: 'Crossref', search: searchCrossref },
  openLibrary: { label: 'Open Library', search: searchOpenLibrary },
  googleBooks: { label: 'Google Books', search: searchGoogleBooks },
  semanticScholar: { label: 'Semantic Scholar', search: searchSemanticScholar },
};

/** ENABLED_APIS sırasına göre etkin kaynaklar. */
const ACTIVE_APIS = ENABLED_APIS.map((key) => API_REGISTRY[key]).filter(Boolean);

/**
 * Verify a list of parsed references against academic databases
 * @param {object[]} references - Parsed reference objects
 * @param {function} onProgress - Callback with (completed, total)
 * @returns {Promise<object[]>} Verification results
 */
export async function verifyReferences(references, onProgress) {
  if (!references || references.length === 0) return [];

  const results = [];
  const total = references.length;

  // Process in batches
  for (let i = 0; i < references.length; i += CONCURRENCY) {
    const batch = references.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(ref => verifyOneReference(ref))
    );

    results.push(...batchResults);

    if (onProgress) {
      onProgress(Math.min(results.length, total), total);
    }

    // Small delay between batches to respect rate limits
    if (i + CONCURRENCY < references.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return results;
}

/**
 * Verify a single reference against all active APIs
 */
async function verifyOneReference(reference) {
  const searchParams = {
    title: reference.title,
    author: reference.authors?.[0] || '',
    year: reference.year,
    isbn: reference.isbn || '',
  };

  // Tüm etkin kaynakları paralel ara (her biri kendi retry/backoff'unu uygular)
  const settled = await Promise.allSettled(
    ACTIVE_APIS.map(api => api.search(searchParams))
  );

  // Sonuçları topla
  const allResults = settled.flatMap((s) =>
    s.status === 'fulfilled' && s.value ? s.value : []
  );

  // Hangi kaynaklar yanıt verdi (hata fırlatmadı)
  const searchedApis = settled
    .map((s, i) => (s.status === 'fulfilled' ? ACTIVE_APIS[i].label : null))
    .filter(Boolean);

  // Find best match across all results
  const bestResult = findBestMatch(reference, allResults);

  return {
    id: reference.id,
    originalText: reference.originalText,
    parsed: {
      title: reference.title,
      authors: reference.authors,
      year: reference.year,
      journal: reference.journal,
      doi: reference.doi,
      isbn: reference.isbn,
      pages: reference.pages,
    },
    found: bestResult !== null && bestResult.score >= FOUND_THRESHOLD,
    match: bestResult ? {
      ...bestResult.match,
      score: bestResult.score,
    } : null,
    searchedApis,
    matchDetails: bestResult ? {
      source: bestResult.match.source,
      confidence:
        bestResult.score >= CONFIDENCE.high
          ? 'high'
          : bestResult.score >= CONFIDENCE.medium
            ? 'medium'
            : 'low',
      score: bestResult.score,
    } : null,
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
