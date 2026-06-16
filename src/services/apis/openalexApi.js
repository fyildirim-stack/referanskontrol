/**
 * OpenAlex API client
 * Free, open academic database with 250M+ works
 * CORS enabled - works from browser
 * Docs: https://docs.openalex.org/
 */

import { fetchJsonWithRetry } from './httpClient.js';

const BASE_URL = 'https://api.openalex.org';
const POLITE_EMAIL = 'referanskontrol@gmail.com';

/**
 * Search for an academic work by title and optionally author/year
 * @param {object} params - { title, author, year }
 * @returns {Promise<object[]|null>} Search results or null
 */
export async function searchOpenAlex({ title, author, year }) {
  if (!title || title.length < 5) return null;

  const searchQuery = title.trim();
  const params = new URLSearchParams({
    search: searchQuery,
    per_page: '5',
    mailto: POLITE_EMAIL,
  });

  if (year) {
    params.set('filter', `publication_year:${year}`);
  }

  const data = await fetchJsonWithRetry(`${BASE_URL}/works?${params}`, {
    label: 'OpenAlex',
  });
  if (!data) return null;

  if (!data.results || data.results.length === 0) return null;

  // Map results
  return data.results.map(work => ({
    source: 'OpenAlex',
    title: work.title || '',
    authors: (work.authorships || []).map(a => a.author?.display_name).filter(Boolean),
    year: work.publication_year,
    doi: work.doi ? work.doi.replace('https://doi.org/', '') : null,
    url: work.doi || work.id,
    journal: work.primary_location?.source?.display_name || '',
    type: work.type_crossref || work.type || '',
    citedByCount: work.cited_by_count || 0,
    openalexId: work.id,
  }));
}
