/**
 * Academic Verifier - Main orchestrator for verifying references against multiple APIs
 */

import { searchOpenAlex } from './apis/openalexApi.js';
import { searchCrossref } from './apis/crossrefApi.js';
import { searchSemanticScholar } from './apis/semanticScholarApi.js';
import { findBestMatch } from './matchScorer.js';

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
  const CONCURRENCY = 3; // Max parallel requests

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
      await delay(300);
    }
  }

  return results;
}

/**
 * Verify a single reference against all available APIs
 */
async function verifyOneReference(reference) {
  const searchParams = {
    title: reference.title,
    author: reference.authors?.[0] || '',
    year: reference.year,
  };

  // Search all APIs in parallel
  const [openalexResults, crossrefResults, semanticResults] = await Promise.allSettled([
    searchOpenAlex(searchParams),
    searchCrossref(searchParams),
    searchSemanticScholar(searchParams),
  ]);

  // Collect all results
  const allResults = [
    ...(openalexResults.status === 'fulfilled' && openalexResults.value ? openalexResults.value : []),
    ...(crossrefResults.status === 'fulfilled' && crossrefResults.value ? crossrefResults.value : []),
    ...(semanticResults.status === 'fulfilled' && semanticResults.value ? semanticResults.value : []),
  ];

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
      pages: reference.pages,
    },
    found: bestResult !== null && bestResult.score >= 40,
    match: bestResult ? {
      ...bestResult.match,
      score: bestResult.score,
    } : null,
    searchedApis: [
      openalexResults.status === 'fulfilled' ? 'OpenAlex' : null,
      crossrefResults.status === 'fulfilled' ? 'Crossref' : null,
      semanticResults.status === 'fulfilled' ? 'Semantic Scholar' : null,
    ].filter(Boolean),
    matchDetails: bestResult ? {
      source: bestResult.match.source,
      confidence: bestResult.score >= 80 ? 'high' : bestResult.score >= 60 ? 'medium' : 'low',
      score: bestResult.score,
    } : null,
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
