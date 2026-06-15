/**
 * Reference Parser - Extract individual references from bibliography text
 * Supports APA, Chicago, ISNAD-style references
 */

/**
 * Parse bibliography text into individual reference objects
 * @param {string} text - Raw bibliography/reference list text
 * @returns {object[]} Array of parsed references
 */
export function parseReferences(text) {
  if (!text || typeof text !== 'string') return [];

  // Remove bibliography header (including optional markdown markers)
  const cleaned = text
    .replace(/^(?:#+\s*)?(Kaynakça|Kaynaklar|References|Bibliography|Referanslar)\s*/im, '')
    .trim();

  // Split by numbered references (1. Author...) or by double newlines or by line breaks that look like separate entries
  let entries = splitIntoEntries(cleaned);

  return entries
    .map((entry, index) => parseEntry(entry.trim(), index))
    .filter(ref => ref && ref.title);
}

/**
 * Split raw text into individual reference entries
 */
function splitIntoEntries(text) {
  // Try numbered format first: "1." or "[1]"
  const numberedPattern = /(?:^|\n)\s*(?:\d+[\.\)]\s*|\[\d+\]\s*)/;
  if (numberedPattern.test(text)) {
    const parts = text.split(/\n\s*(?=\d+[\.\)]\s|\[\d+\]\s)/);
    if (parts.length > 1) return parts.filter(p => p.trim());
  }

  // Try splitting by blank lines to get blocks (e.g. page chunks in PDFs)
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  const authorPattern = /^(?:\d+[\.\)]\s*|\[\d+\]\s*)?[A-ZÇĞİÖŞÜ][a-zA-ZçğıöşüÇĞİÖŞÜ\s'-]+?,\s*[A-ZÇĞİÖŞÜ]/;

  const entries = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      if (block.trim()) entries.push(block.trim());
      continue;
    }

    // Check if there is a line after the first one that starts with the author pattern
    let hasMultipleRefs = false;
    for (let i = 1; i < lines.length; i++) {
      if (authorPattern.test(lines[i])) {
        hasMultipleRefs = true;
        break;
      }
    }

    if (!hasMultipleRefs) {
      entries.push(block.trim());
    } else {
      // Split this block line-by-line using the author pattern
      let currentEntry = '';
      for (const line of lines) {
        if (authorPattern.test(line) && currentEntry) {
          entries.push(currentEntry.trim());
          currentEntry = line;
        } else {
          currentEntry += (currentEntry ? ' ' : '') + line;
        }
      }
      if (currentEntry) entries.push(currentEntry.trim());
    }
  }

  // Fallback: if we didn't find any entries, try parsing the whole text line by line
  if (entries.length <= 1) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let currentEntry = '';
    const fallbackEntries = [];
    for (const line of lines) {
      if (authorPattern.test(line) && currentEntry) {
        fallbackEntries.push(currentEntry.trim());
        currentEntry = line;
      } else {
        currentEntry += (currentEntry ? ' ' : '') + line;
      }
    }
    if (currentEntry) fallbackEntries.push(currentEntry.trim());
    if (fallbackEntries.length > 0) return fallbackEntries;
  }

  return entries;
}

/**
 * Parse a single reference entry into structured data
 */
function parseEntry(text, index) {
  if (!text || text.length < 10) return null;

  // Remove leading numbers: "1." or "[1]"
  const cleaned = text.replace(/^\s*(?:\d+[\.\)]\s*|\[\d+\]\s*)/, '').trim();

  const ref = {
    id: `ref-${index}`,
    originalText: cleaned,
    authors: [],
    year: null,
    title: '',
    journal: '',
    volume: '',
    issue: '',
    pages: '',
    doi: '',
    publisher: '',
  };

  // Extract and remove DOI for cleaner parsing
  let cleanedForParsing = cleaned;
  const doiMatch = cleaned.match(/(?:doi:\s*|https?:\/\/doi\.org\/)?(10\.\d{4,}\/[^\s,;]+)/i);
  if (doiMatch) {
    ref.doi = doiMatch[1].replace(/[\.\)]+$/, '');
    cleanedForParsing = cleaned.replace(doiMatch[0], '').trim();
  }

  // Clean trailing punctuation and spaces
  cleanedForParsing = cleanedForParsing.replace(/[,\.\s\-–]+$/, '').trim();

  // Extract year
  const yearMatch = cleanedForParsing.match(/\((\d{4})\)/);
  if (yearMatch) {
    ref.year = parseInt(yearMatch[1]);
  } else {
    const yearMatch2 = cleanedForParsing.match(/\b(19|20)\d{2}\b/);
    if (yearMatch2) ref.year = parseInt(yearMatch2[0]);
  }

  // Try APA style: Author, A. B. (Year). Title. Journal, Volume(Issue), Pages.
  // Using end anchor ($) and removing DOI/trailing punctuation beforehand ensures correct title capture
  const apaMatch = cleanedForParsing.match(/^(.+?)\s*\((\d{4})\)\.\s*(.+?)(?:\.\s*(.+?))?(?:,\s*(\d+)(?:\((\d+)\))?,\s*([\d\-–]+))?$/);
  if (apaMatch) {
    ref.authors = parseAuthors(apaMatch[1]);
    ref.year = parseInt(apaMatch[2]);
    ref.title = cleanTitle(apaMatch[3]);
    if (apaMatch[4]) ref.journal = apaMatch[4].replace(/\.\s*$/, '').trim();
    if (apaMatch[5]) ref.volume = apaMatch[5];
    if (apaMatch[6]) ref.issue = apaMatch[6];
    if (apaMatch[7]) ref.pages = apaMatch[7];
  } else {
    // Fallback: try to extract author and title more loosely
    const parts = cleanedForParsing.split(/\.\s+/);
    if (parts.length >= 2) {
      ref.authors = parseAuthors(parts[0]);
      ref.title = cleanTitle(parts.length > 2 ? parts[1] : parts[1]);
      if (parts.length > 2) ref.journal = parts[2].replace(/\.\s*$/, '').trim();
    } else {
      ref.title = cleanTitle(cleanedForParsing);
    }
  }

  // Extract pages if not found yet
  if (!ref.pages) {
    const pagesMatch = cleaned.match(/(?:pp?\.\s*|s\.\s*|:?\s*)([\d]+)\s*[-–]\s*([\d]+)/);
    if (pagesMatch) ref.pages = `${pagesMatch[1]}-${pagesMatch[2]}`;
  }

  return ref;
}

/**
 * Parse author string into array of names
 */
function parseAuthors(authorStr) {
  if (!authorStr) return [];

  return authorStr
    .split(/\s*(?:,\s*(?=[A-ZÇĞİÖŞÜ])|;\s*|&\s*|\bve\b\s*|\band\b\s*)/i)
    .map(a => a.trim())
    .filter(a => a.length > 1 && !/^\d/.test(a))
    .slice(0, 10);
}

/**
 * Clean a title string
 */
function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\.\s*$/, '')
    .replace(/^\s*["'""'']|["'""'']\s*$/g, '')
    .trim();
}

/**
 * Extract bibliography section from full document text
 */
export function extractBibliographySection(fullText) {
  if (!fullText) return null;

  const patterns = [
    /(?:^|\n)\s*(?:#+\s*)?(Kaynakça|Kaynaklar|References|Bibliography|Referanslar)\s*\n/im,
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) {
      const startIndex = match.index + match[0].length;
      let bibText = fullText.substring(startIndex).trim();
      
      const endMatch = bibText.match(/(?:^|\n)\s*(?:#+\s*)?(EKLER|EK\s+\d+|APPENDIX|APPENDICES)\b/im);
      if (endMatch) {
         bibText = bibText.substring(0, endMatch.index).trim();
      }
      return bibText;
    }
  }

  return null;
}
