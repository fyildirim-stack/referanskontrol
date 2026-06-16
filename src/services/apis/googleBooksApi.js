/**
 * Google Books API client
 * Free book search (no API key required for basic queries). CORS enabled.
 * Docs: https://developers.google.com/books/docs/v1/using
 */

import { fetchJsonWithRetry } from './httpClient.js';

const BASE_URL = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Search Google Books by ISBN (preferred) or title + author.
 * @param {object} params - { title, author, year, isbn }
 * @returns {Promise<object[]|null>}
 */
export async function searchGoogleBooks({ title, author, year, isbn }) {
  let query;
  if (isbn) {
    query = `isbn:${isbn.replace(/[^0-9Xx]/g, '')}`;
  } else {
    if (!title || title.length < 4) return null;
    // Operators are separated by spaces; URLSearchParams encodes the space as "+",
    // which is exactly what the Google Books query syntax expects.
    query = `intitle:${title.trim()}`;
    if (author) query += ` inauthor:${author.trim()}`;
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: '5',
    printType: 'books',
  });

  const data = await fetchJsonWithRetry(`${BASE_URL}?${params}`, {
    label: 'GoogleBooks',
  });
  if (!data) return null;

  const items = data.items;
  if (!items || items.length === 0) return null;

  return items.map(item => {
    const v = item.volumeInfo || {};
    return {
      source: 'Google Books',
      title: v.title ? (v.subtitle ? `${v.title}: ${v.subtitle}` : v.title) : '',
      authors: v.authors || [],
      year: parseYear(v.publishedDate),
      isbn: pickIsbn(v.industryIdentifiers),
      doi: null,
      journal: '',
      type: 'book',
      url: v.infoLink || v.canonicalVolumeLink || '',
    };
  });
}

/** Prefer ISBN_13, else ISBN_10, else empty. */
function pickIsbn(identifiers) {
  if (!Array.isArray(identifiers)) return '';
  const isbn13 = identifiers.find(i => i.type === 'ISBN_13');
  const isbn10 = identifiers.find(i => i.type === 'ISBN_10');
  return (isbn13 || isbn10)?.identifier || '';
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}
