/**
 * Reference Parser - Extract individual references from bibliography text
 * Supports APA, Chicago, ISNAD-style references
 */

import { splitConcatenatedReferences } from './referenceSplitter.js';

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

  // Tek bloğa birleşmiş ardışık referansları "(YYYY)" sınırlarından ayır
  entries = entries.flatMap((entry) => splitConcatenatedReferences(entry));

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
  const numberPattern = /^(?:\d+[\.\)]\s*|\[\d+\]\s*)/;
  // A 4-digit year in parentheses, e.g. (2024) or (2024a) — strong APA reference-start signal
  const yearInParens = /\((?:19|20)\d{2}[a-z]?\)/;
  // Strict author start: "Surname, A." — an initial (capital + period) after the comma.
  // Avoids matching corporate continuations like "Directorate of Secondary Education, Ministry ..."
  const strictAuthorStart = /^(?:\d+[\.\)]\s*|\[\d+\]\s*)?[A-ZÇĞİÖŞÜ][a-zA-ZçğıöşüÇĞİÖŞÜ.'’-]+(?:\s+[A-ZÇĞİÖŞÜ][a-zA-ZçğıöşüÇĞİÖŞÜ.'’-]+)*,\s*[A-ZÇĞİÖŞÜ]\./;
  // A line begins a new reference if it starts with a number marker, a strict author name,
  // or (capitalized line that contains a year in parentheses — covers corporate authors like MEB).
  const startsNewReference = (line) =>
    numberPattern.test(line) ||
    strictAuthorStart.test(line) ||
    (/^[A-ZÇĞİÖŞÜ]/.test(line) && yearInParens.test(line));

  const entries = [];
  // Append a continuation block/fragment to the previous entry, or start a new one
  const pushEntry = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (entries.length > 0 && !startsNewReference(trimmed)) {
      // Continuation of the previous reference (e.g. a multi-line / page-spanning entry)
      entries[entries.length - 1] += ' ' + trimmed;
    } else {
      entries.push(trimmed);
    }
  };

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      pushEntry(block);
      continue;
    }

    // Check if there is a line after the first one that begins a new reference
    let hasMultipleRefs = false;
    for (let i = 1; i < lines.length; i++) {
      if (startsNewReference(lines[i])) {
        hasMultipleRefs = true;
        break;
      }
    }

    if (!hasMultipleRefs) {
      pushEntry(block);
    } else {
      // Split this block line-by-line. Lines that don't start a new
      // reference are merged into the current fragment.
      let currentEntry = '';
      for (const line of lines) {
        if (startsNewReference(line) && currentEntry) {
          pushEntry(currentEntry);
          currentEntry = line;
        } else {
          currentEntry += (currentEntry ? ' ' : '') + line;
        }
      }
      if (currentEntry) pushEntry(currentEntry);
    }
  }

  // Fallback: if we didn't find any entries, try parsing the whole text line by line
  if (entries.length <= 1) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let currentEntry = '';
    const fallbackEntries = [];
    for (const line of lines) {
      if (startsNewReference(line) && currentEntry) {
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
    isbn: '',
    publisher: '',
  };

  // Extract and remove DOI for cleaner parsing
  let cleanedForParsing = cleaned;
  const doiMatch = cleaned.match(/(?:doi:\s*|https?:\/\/doi\.org\/)?(10\.\d{4,}\/[^\s,;]+)/i);
  if (doiMatch) {
    ref.doi = doiMatch[1].replace(/[\.\)]+$/, '');
    cleanedForParsing = cleaned.replace(doiMatch[0], '').trim();
  }

  // Extract ISBN if present (e.g. "ISBN 978-3-16-148410-0" or a bare 13/10-digit ISBN)
  const isbnMatch = cleaned.match(/ISBN(?:-1[03])?:?\s*((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx])/i);
  if (isbnMatch) {
    ref.isbn = isbnMatch[1].replace(/[-\s]/g, '');
    cleanedForParsing = cleanedForParsing.replace(isbnMatch[0], '').trim();
  }

  // Clean trailing punctuation and spaces
  cleanedForParsing = cleanedForParsing.replace(/[,\.\s\-–]+$/, '').trim();

  // Author-date çıkarımı: ilk "(YYYY)" parantezi yazar/başlık sınırıdır.
  // Hem "Yazar (Yıl) “Başlık”, Dergi, ..." (yıldan sonra nokta YOK) hem klasik
  // "Yazar (Yıl). Başlık. Dergi." stilini, hem de tırnaksız kitap başlıklarını
  // ("Yazar (Yıl) Kitap Adı , Yer: Yayınevi.") doğru işler.
  const yearParen = cleanedForParsing.match(/\(((?:19|20)\d{2})[a-z]?\)/);
  if (yearParen) {
    ref.year = parseInt(yearParen[1], 10);
    const yIdx = cleanedForParsing.indexOf(yearParen[0]);
    // Sondaki virgül/noktalı virgül/boşlukları temizle ama baş harfin noktasını
    // ("V.") KORU.
    const authorPart = cleanedForParsing.slice(0, yIdx).trim().replace(/[,;\s]+$/, '');
    // Klasik APA'da yıldan sonra nokta gelir ("(2020). Başlık"); onu at.
    let afterYear = cleanedForParsing.slice(yIdx + yearParen[0].length).trim().replace(/^[.\s]+/, '');

    if (authorPart) ref.authors = parseAuthors(authorPart);

    const quoted = afterYear.match(/^["“«]\s*(.+?)\s*["”»]/u);
    if (quoted) {
      ref.title = cleanTitle(quoted[1]);
      const rest = afterYear.slice(quoted[0].length).replace(/^[\s,]+/, '');
      ref.journal = extractContainer(rest);
    } else {
      // Tırnaksız: başlık, güçlü bir ayraca kadar (" , " | ", Şehir:" | ". " | son)
      const tMatch = afterYear.match(/^(.+?)(?:\s+,\s|,\s+[A-ZÇĞİÖŞÜ][^,:]*:|\.\s+|$)/u);
      ref.title = cleanTitle(tMatch ? tMatch[1] : afterYear);
      const afterTitle = tMatch ? afterYear.slice(tMatch[0].length) : '';
      if (afterTitle) ref.journal = extractContainer(afterTitle.replace(/^[\s,]+/, ''));
    }
  } else {
    // "(YYYY)" yoksa son çare: noktadan böl
    const parts = cleanedForParsing.split(/\.\s+/);
    if (parts.length >= 2) {
      ref.authors = parseAuthors(parts[0]);
      ref.title = cleanTitle(parts[1]);
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

  // Yazar ayraçlarını ('&', ';', ' ve ', ' and ') tek bir sentinel'e (|) indir.
  // Ardından yalnızca BAŞ HARFLER grubundan sonra gelen virgülde böl ("A.," → boundary),
  // böylece "Soyadı, A." ikilisindeki (harften sonraki) virgül korunur ve baş harfler
  // ayrı bir "yazar" olarak sızmaz.
  const normalized = authorStr
    .replace(/\s*&\s*/g, '|')
    .replace(/\s*;\s*/g, '|')
    .replace(/\s+\bve\b\s+/gi, '|')
    .replace(/\s+\band\b\s+/gi, '|')
    .replace(/\.\s*,\s*/g, '.|');

  return normalized
    .split('|')
    // Token kenarlarındaki ayraç kalıntılarını temizle; baş harf noktasını koru ("B.").
    .map(a => a.trim().replace(/^[\s,;&|]+/, '').replace(/[\s,;&|]+$/, ''))
    .filter(a => a.length > 1 && !/^\d/.test(a))
    .slice(0, 10);
}

/**
 * Bir referansın başlık-sonrası bölümünden dergi/kapsayıcı (container) adını çıkar.
 * İlk cilt/sayı işaretine (", 16(", " , (2)," vb.) ya da " içinde" kalıbına kadar.
 */
function extractContainer(rest) {
  if (!rest) return '';
  let c = rest;
  const volMatch = rest.match(/^(.+?)\s*,\s*[(\d]/u);
  if (volMatch) c = volMatch[1];
  c = c.replace(/\s+içinde\b.*$/iu, ''); // "... içinde, Yer: Yayınevi" → kapsayıcıyı kes
  return c.replace(/[\s,.:]+$/u, '').trim();
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
