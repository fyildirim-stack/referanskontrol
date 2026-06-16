/**
 * Open Library API client
 * Free, open book catalog (no API key). CORS enabled - works from browser.
 * Docs: https://openlibrary.org/developers/api
 */

import { fetchJsonWithRetry } from './httpClient.js';

const BASE_URL = 'https://openlibrary.org';

/**
 * Search Open Library for a book by ISBN (preferred) or title + author.
 * @param {object} params - { title, author, year, isbn }
 * @returns {Promise<object[]|null>}
 */
export async function searchOpenLibrary({ title, author, year, isbn }) {
  // Direct ISBN lookup when the reference already carries an ISBN
  if (isbn) {
    const byIsbn = await lookupByIsbn(isbn);
    if (byIsbn) return [byIsbn];
  }

  if (!title || title.length < 4) return null;

  const params = new URLSearchParams({
    title: title.trim(),
    limit: '5',
    fields: 'title,author_name,first_publish_year,isbn,key',
  });
  if (author) params.set('author', author.trim());

  const data = await fetchJsonWithRetry(`${BASE_URL}/search.json?${params}`, {
    label: 'OpenLibrary',
  });
  if (!data) return null;

  const docs = data.docs;
  if (!docs || docs.length === 0) return null;

  return docs.map(doc => ({
    source: 'Open Library',
    title: doc.title || '',
    authors: doc.author_name || [],
    year: doc.first_publish_year || (year || null),
    isbn: pickIsbn(doc.isbn),
    doi: null,
    journal: '',
    type: 'book',
    url: doc.key ? `${BASE_URL}${doc.key}` : '',
  }));
}

/**
 * Look up a single book directly by ISBN.
 */
async function lookupByIsbn(isbn) {
  const clean = isbn.replace(/[^0-9Xx]/g, '');
  if (clean.length !== 10 && clean.length !== 13) return null;

  const book = await fetchJsonWithRetry(`${BASE_URL}/isbn/${clean}.json`, {
    label: 'OpenLibrary',
  });
  if (!book) return null;

  return {
    source: 'Open Library',
    title: book.title || '',
    authors: [], // author records are separate keys; title/isbn match is enough here
    year: parseYear(book.publish_date),
    isbn: clean,
    doi: null,
    journal: '',
    type: 'book',
    url: book.key ? `${BASE_URL}${book.key}` : `${BASE_URL}/isbn/${clean}`,
  };
}

/** Prefer a 13-digit ISBN, else the first available. */
function pickIsbn(isbnArray) {
  if (!Array.isArray(isbnArray) || isbnArray.length === 0) return '';
  const isbn13 = isbnArray.find(i => i.replace(/[^0-9Xx]/g, '').length === 13);
  return (isbn13 || isbnArray[0]).replace(/[^0-9Xx]/g, '');
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}
