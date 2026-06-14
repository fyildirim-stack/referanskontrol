/**
 * Semantic Scholar API client
 * Free academic search API
 * Docs: https://api.semanticscholar.org/
 */

const BASE_URL = 'https://api.semanticscholar.org/graph/v1';

/**
 * Search Semantic Scholar for papers
 * @param {object} params - { title, author, year }
 * @returns {Promise<object[]|null>}
 */
export async function searchSemanticScholar({ title, author, year }) {
  if (!title || title.length < 5) return null;

  try {
    const params = new URLSearchParams({
      query: title.trim(),
      limit: '5',
      fields: 'title,authors,year,externalIds,url,venue,citationCount',
    });

    if (year) {
      params.set('year', String(year));
    }

    const response = await fetch(`${BASE_URL}/paper/search?${params}`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;

    const data = await response.json();
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
  } catch (err) {
    console.warn('[SemanticScholar] Search failed:', err.message);
    return null;
  }
}
