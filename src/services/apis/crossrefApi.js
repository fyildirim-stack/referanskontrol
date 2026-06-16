/**
 * Crossref API client
 * Free metadata search for DOIs and academic works
 * CORS enabled - works from browser
 * Docs: https://api.crossref.org/swagger-ui/index.html
 */

import { fetchJsonWithRetry } from './httpClient.js';

const BASE_URL = 'https://api.crossref.org';
const POLITE_EMAIL = 'referanskontrol@gmail.com';

/**
 * Search Crossref for academic works
 * @param {object} params - { title, author, year }
 * @returns {Promise<object[]|null>}
 */
export async function searchCrossref({ title, author, year }) {
  if (!title || title.length < 5) return null;

  const params = new URLSearchParams({
    'query.bibliographic': title.trim(),
    rows: '5',
    sort: 'relevance',
  });

  if (author) {
    params.set('query.author', author.trim());
  }

  const headers = {
    'User-Agent': `ReferansKontrol/1.0 (mailto:${POLITE_EMAIL})`,
  };

  const data = await fetchJsonWithRetry(`${BASE_URL}/works?${params}`, {
    headers,
    label: 'Crossref',
  });
  if (!data) return null;

  const items = data.message?.items;
  if (!items || items.length === 0) return null;

  return items.map(item => ({
    source: 'Crossref',
    title: Array.isArray(item.title) ? item.title[0] : (item.title || ''),
    authors: (item.author || []).map(a => [a.given, a.family].filter(Boolean).join(' ')),
    year: item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0],
    doi: item.DOI,
    url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
    journal: (item['container-title'] || [])[0] || '',
    type: item.type || '',
    score: item.score || 0,
  }));
}
