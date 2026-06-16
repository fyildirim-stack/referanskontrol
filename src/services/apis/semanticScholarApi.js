/**
 * Semantic Scholar API client
 * Free academic search API
 * Docs: https://api.semanticscholar.org/
 */

import { fetchJsonWithRetry } from './httpClient.js';

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

/**
 * Search Semantic Scholar for papers
 * @param {object} params - { title, author, year }
 * @returns {Promise<object[]|null>}
 */
export async function searchSemanticScholar({ title, author, year }) {
  if (!title || title.length < 5) return null;

  const params = new URLSearchParams({
    query: title.trim(),
    limit: '5',
    fields: 'title,authors,year,externalIds,url,venue,citationCount',
  });

  if (year) {
    params.set('year', String(year));
  }

  const data = await fetchJsonWithRetry(`${BASE_URL}/paper/search?${params}`, {
    label: 'SemanticScholar',
  });
  if (!data) return null;

  if (!data.data || data.data.length === 0) return null;

  return data.data.map(paper => ({
    source: 'Semantic Scholar',
    title: paper.title || '',
    authors: (paper.authors || []).map(a => a.name),
    year: paper.year,
    doi: paper.externalIds?.DOI || null,
    url: paper.url || (paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : ''),
    journal: paper.venue || '',
    type: 'journal-article',
    citedByCount: paper.citationCount || 0,
  }));
}
