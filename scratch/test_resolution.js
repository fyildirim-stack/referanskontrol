import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { makeKey } from '../src/citationFinder.js';
import { extractReferenceAuthors, extractReferenceAliases, parseAuthorNames, formatIsnadFootnote, formatIsnadBibliography } from '../src/isnadFormatter.js';
import {
  readZipText,
  parseXml,
  extractParagraphs,
  normalizeVisibleText,
  extractFootnotes
} from '../src/docxParser.js';

// Polyfill DOMParser
globalThis.DOMParser = DOMParser;

// Custom Turkish Folding
function foldTurkish(str) {
  return str
    .toLowerCase()
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c");
}

function cleanWithSpaces(str) {
  return foldTurkish(str)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isReferencesHeading(text) {
  const normalized = normalizeVisibleText(text).replace(/^[\dIVXLC]+\s*[.)-]\s*/i, "").replace(/[:：]\s*$/, "");
  return /^(kaynak(?:ça|ca)|kaynaklar|references?|reference list|bibliography)(?:\s*[/,-]\s*(kaynak(?:ça|ca)|kaynaklar|references?|bibliography))?$/i.test(normalized);
}

// Year finder supporting ts., t.s., t.y., n.d.
export function findYearInReference(text) {
  const parenRegex = /\((?:[^)]*?\s+)?((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)[^)]*?\)/i;
  const parenMatch = text.match(parenRegex);
  if (parenMatch) {
    const res = [parenMatch[0], parenMatch[1]];
    res.index = parenMatch.index;
    return res;
  }

  const cleanText = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, "")
    .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}\s+\p{L}+\s+\d{2,4}/giu, "");

  const yearRegex = /\b((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)\b/gi;
  let lastMatch = null;
  let match;
  while ((match = yearRegex.exec(cleanText)) !== null) {
    lastMatch = {
      year: match[1],
      matchText: match[0],
      index: match.index
    };
  }
  if (lastMatch) {
    const originalIndex = text.indexOf(lastMatch.year);
    if (originalIndex !== -1) {
      const res = [lastMatch.matchText, lastMatch.year];
      res.index = originalIndex;
      return res;
    }
  }

  const fallbackRegex = /\b((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)\b/i;
  const fallbackMatch = text.match(fallbackRegex);
  if (fallbackMatch) {
    const res = [fallbackMatch[0], fallbackMatch[1]];
    res.index = fallbackMatch.index;
    return res;
  }

  return null;
}

function getActualAuthorSegment(text, yearMatch) {
  const isApasque = yearMatch && yearMatch[0] && yearMatch[0].startsWith("(") && yearMatch.index < 60;
  if (isApasque) {
    return text.slice(0, yearMatch.index).trim();
  }
  
  const quoteIndex = text.search(/[“"‘«]/);
  if (quoteIndex !== -1 && quoteIndex < 150) {
    return text.slice(0, quoteIndex).trim().replace(/[.,\s]+$/, "");
  }
  
  const dotMatches = [...text.matchAll(/\.\s+/g)];
  for (const match of dotMatches) {
    const idx = match.index;
    if (idx > 150) break;
    const before = text.slice(0, idx).trim();
    const lastWord = before.split(/\s+/).at(-1) || "";
    if (lastWord.length === 1) {
      if (lastWord === lastWord.toLowerCase()) {
        continue;
      }
      const afterDot = text.slice(idx + match[0].length).trim();
      const nextWord = afterDot.split(/\s+/)[0] || "";
      if (/^[\p{L}]\.?$/u.test(nextWord)) {
        continue;
      }
    }
    return before;
  }
  
  return text.slice(0, 80).trim();
}

function buildReferenceEntries(referenceParagraphs) {
  const entries = [];
  referenceParagraphs.forEach((paragraph) => {
    const text = normalizeVisibleText(paragraph.rawText || paragraph.text);
    if (text.length > 5) {
      entries.push({
        text: text.replace(/^\s*\[\d+\]\s*/, ""),
        paragraphIndex: paragraph.index
      });
    }
  });
  return entries;
}

function parseReferenceFixed(text, paragraphIndex) {
  const yearMatch = findYearInReference(text);
  let year = "nodate";
  let dateText = "t.y.";
  let yearIndex = text.length;
  let yearMatchText = "";

  if (yearMatch) {
    year = yearMatch[1];
    dateText = yearMatch[0].replace(/[()]/g, "");
    yearIndex = yearMatch.index;
    yearMatchText = yearMatch[0];
  }

  const authorSegment = getActualAuthorSegment(text, yearMatch || { index: yearIndex });
  const authors = parseAuthorNames(authorSegment);
  if (!authors.length) return null;

  let title = "";
  let container = "";

  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/;
  const quoteMatch = text.match(quoteRegex);
  const isApasque = yearMatch && yearMatch[0].startsWith("(") && yearMatch.index < 60;

  if (quoteMatch) {
    title = quoteMatch[1].trim();
    const afterQuote = text.slice(quoteMatch.index + quoteMatch[0].length).trim();
    container = afterQuote
      .replace(yearMatchText, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, "")
      .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}\s+\p{L}+\s+\d{2,4}/giu, "")
      .replace(/[.,\s]+$/, "")
      .trim();
  } else {
    if (isApasque) {
      const afterDate = String(text.slice(yearMatch.index + yearMatch[0].length)).replace(/[ \t\r\n]+/g, " ").trim().replace(/^\.\s*/, "");
      const withoutUrl = String(afterDate.replace(/https?:\/\/\S+/gi, "")).replace(/[ \t\r\n]+/g, " ").trim().replace(/[.]+$/g, "");
      const titleSplit = withoutUrl.split(/(?<=\.)\s+(?=\p{Lu}|\d)/u).map((part) => part.trim()).filter(Boolean);
      if (titleSplit.length === 1) title = titleSplit[0].replace(/[.]+$/g, "");
      else if (titleSplit.length > 1) {
        title = titleSplit[0].replace(/[.]+$/g, "");
        container = titleSplit.slice(1).join(" ").replace(/[.]+$/g, "");
      }
    } else {
      const afterAuthor = text.slice(authorSegment.length).trim().replace(/^\.\s*/, "");
      const cleanAfterAuthor = afterAuthor.replace(yearMatchText, "").trim().replace(/[.,\s]+$/, "");
      const parts = cleanAfterAuthor.split(/\.\s+/);
      if (parts.length > 0) {
        title = parts[0].trim();
        container = parts.slice(1).join(". ").trim();
      } else {
        title = cleanAfterAuthor;
      }
    }
  }

  title = title.replace(/^[.,\s“"‘«]+|[.,\s”"’»]+$/g, "").trim();
  container = container.replace(/^[.,\s]+|[.,\s]+$/g, "").trim();

  const url = text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const doi = text.match(/https?:\/\/doi\.org\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const type = (doi || /\b\d+\s*\(\d+\)|\b\d+\/\d+|\bjournal|dergi|policy|reviews?|energy policy\b/i.test(container)) ? "article" : (url ? "web" : "book");

  const structured = {
    raw: text,
    authors,
    authorText: authors.map((author) => author.full).join(" - ") || authorSegment,
    bibliographyAuthorText: authors.map((author, index) => {
      if (index === 0 && author.given) return `${author.family}, ${author.given}`;
      return author.full;
    }).join(" - "),
    year,
    dateText,
    title,
    container,
    url,
    doi,
    type,
  };

  const authorKeys = extractReferenceAuthors(authorSegment);
  const keys = [...new Set([...authorKeys.map((author) => makeKey(author, year)), ...extractReferenceAliases(authorSegment, year)])];

  return {
    display: text,
    paragraphIndex,
    keys,
    structured,
    isnadFootnote: formatIsnadFootnote(structured),
    isnadBibliography: formatIsnadBibliography(structured),
  };
}

// Improved resolveShortenedFootnote with whole-word checks and fallback matching
function resolveShortenedFootnote(partText, references) {
  if (!references || !references.length) return null;

  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/;
  const quoteMatch = partText.match(quoteRegex);
  
  const cleanPart = cleanWithSpaces(partText);
  const partWords = cleanPart.split(' ');

  let bestMatch = null;
  let bestScore = 0;

  for (const ref of references) {
    const authors = ref.structured?.authors || [];
    if (!authors.length) continue;

    // Check if author family name is present in footnote part
    const authorMatches = authors.some((author) => {
      const familyName = typeof author === "string" ? author : author.family;
      if (!familyName) return false;
      const cleanFamily = cleanWithSpaces(familyName);
      return partWords.includes(cleanFamily);
    });

    if (!authorMatches) continue;

    // Now score the title match
    const title = ref.structured?.title || "";
    if (!title) continue;

    const cleanTitle = cleanWithSpaces(title);
    
    // Check 1: Quotation match if available
    if (quoteMatch) {
      const quoted = cleanWithSpaces(quoteMatch[1]);
      if (cleanTitle.includes(quoted) || quoted.includes(cleanTitle)) {
        return { keys: ref.keys, kind: "footnote-shortened-quoted" };
      }
    }

    // Check 2: Exact title substring match
    if (cleanPart.includes(cleanTitle)) {
      return { keys: ref.keys, kind: "footnote-shortened-exact-title" };
    }

    // Check 3: Word overlap scoring
    const titleWords = cleanTitle.split(' ').filter(w => w.length > 2);
    if (titleWords.length > 0) {
      const matchingWords = titleWords.filter(w => partWords.includes(w));
      const score = matchingWords.length / titleWords.length;
      
      // We need at least one word matching or first word matching
      const firstTitleWord = cleanTitle.split(' ')[0];
      const firstWordMatches = firstTitleWord && firstTitleWord.length > 2 && partWords.includes(firstTitleWord);

      if (score > bestScore && (score >= 0.3 || firstWordMatches)) {
        bestScore = score;
        bestMatch = { keys: ref.keys, kind: "footnote-shortened-overlap" };
      }
    }
  }

  return bestMatch;
}

function resolveFootnoteCitationFixed(footnote, resolved, references) {
  const base = {
    id: footnote.id,
    text: footnote.text,
    kind: "footnote-unresolved",
    keys: [],
  };

  // Split footnote by semicolon in case it contains multiple citations
  const parts = footnote.text.split(';').map(p => p.trim()).filter(Boolean);
  const allKeys = [];
  let kind = "footnote-unresolved";

  for (const part of parts) {
    // 1. Try parenthetical or inline citation match
    // (Bkz. Aka, 1994) etc.
    const yearMatch = findYearInReference(part);
    if (yearMatch && yearMatch.index < 280) {
      const authorSegment = getActualAuthorSegment(part, yearMatch);
      if (authorSegment && /[\p{L}]/u.test(authorSegment)) {
        const authors = extractReferenceAuthors(authorSegment);
        if (authors.length > 0) {
          const year = yearMatch[1];
          const aliases = extractReferenceAliases(authorSegment, year);
          const keys = [...new Set([...authors.map((author) => makeKey(author, year)), ...aliases])];
          allKeys.push(...keys);
          kind = "footnote-fulltext";
          continue;
        }
      }
    }

    // 2. Try shortened citation match
    const shortened = resolveShortenedFootnote(part, references);
    if (shortened) {
      allKeys.push(...shortened.keys);
      kind = shortened.kind;
      continue;
    }
  }

  if (allKeys.length > 0) {
    return {
      ...base,
      kind,
      keys: [...new Set(allKeys)],
    };
  }

  // 3. Try repeat pattern
  const repeatMatch = /^(a\.g\.e\.|a\.g\.m\.|ibid|op\.\s*cit\.|loc\.\s*cit\.)/i.exec(footnote.text);
  if (repeatMatch) {
    const allIds = Array.from(resolved.keys());
    if (allIds.length > 0) {
      const lastId = allIds[allIds.length - 1];
      const inheritedKeys = resolved.get(lastId);
      if (inheritedKeys && inheritedKeys.length > 0) {
        return {
          ...base,
          kind: "footnote-repeat",
          keys: inheritedKeys,
          resolvedFrom: lastId,
        };
      }
    }
  }

  return base;
}

function findFootnoteCitationsFixed(footnotes, references) {
  const result = [];
  const resolved = new Map();

  footnotes.forEach((footnote) => {
    const citation = resolveFootnoteCitationFixed(footnote, resolved, references);
    result.push(citation);
    if (citation.keys && citation.keys.length > 0) {
      resolved.set(footnote.id, citation.keys);
    }
  });

  return result;
}

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1956119-AF-T0-V0-20260521084022.docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);
    const documentXml = await readZipText(zip, "word/document.xml");
    const doc = parseXml(documentXml);
    const paragraphs = extractParagraphs(doc);
    
    const referencesStart = paragraphs.findIndex((paragraph) => isReferencesHeading(paragraph.text));
    if (referencesStart === -1) {
      console.log("Could not find bibliography start!");
      return;
    }

    const referenceParagraphs = paragraphs.slice(referencesStart + 1);
    const referenceEntries = buildReferenceEntries(referenceParagraphs);
    const references = referenceEntries.map((entry) => parseReferenceFixed(entry.text, entry.paragraphIndex)).filter(Boolean);
    
    const footnotes = await extractFootnotes(zip);
    const footnoteCitations = findFootnoteCitationsFixed(footnotes, references);
    const unresolved = footnoteCitations.filter(fc => fc.keys.length === 0);
    const resolved = footnoteCitations.filter(fc => fc.keys.length > 0);

    let output = `=== SUMMARY ===\n`;
    output += `Total Bibliography Paragraphs: ${referenceParagraphs.length}\n`;
    output += `Parsed Bibliography Entries: ${references.length}\n`;
    output += `Total Footnotes: ${footnotes.length}\n`;
    output += `Resolved Footnotes: ${resolved.length}\n`;
    output += `Unresolved Footnotes: ${unresolved.length}\n\n`;

    output += `=== PARSED REFERENCES (Total: ${references.length}) ===\n`;
    references.forEach((ref, idx) => {
      output += `${idx + 1}: Keys: [${ref.keys.join(', ')}] | Title: "${ref.structured?.title}" | Year: "${ref.structured?.year}" | Display: ${ref.display}\n`;
    });

    output += `\n=== RESOLVED FOOTNOTES (Total: ${resolved.length}) ===\n`;
    resolved.forEach((fc) => {
      output += `FN ${fc.id}: [${fc.kind}] Keys: [${fc.keys.join(', ')}] Text: ${fc.text}\n`;
    });

    output += `\n=== UNRESOLVED FOOTNOTES (Total: ${unresolved.length}) ===\n`;
    unresolved.forEach((fc) => {
      output += `FN ${fc.id}: Text: ${fc.text}\n`;
    });

    fs.writeFileSync('scratch/resolution_output.txt', output);
    console.log("Written output to scratch/resolution_output.txt");
  } catch (err) {
    console.error(err);
  }
}

run();
