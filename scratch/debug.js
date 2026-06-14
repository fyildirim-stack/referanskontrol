import fs from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { makeKey, findCitations, groupMissingCitations } from '../src/citationFinder.js';
import { extractReferenceAuthors, extractReferenceAliases, buildIsnadBibliography, formatIsnadFootnote, formatIsnadBibliography, formatBibliographyAuthors, parseAuthorNames } from '../src/isnadFormatter.js';
import { buildVerificationRecords } from '../src/zoteroExport.js';
import {
  readZipText,
  parseXml,
  extractParagraphs,
  normalizeVisibleText,
  extractFootnotes
} from '../src/docxParser.js';

// Polyfill DOMParser
globalThis.DOMParser = DOMParser;

// Proposed findYearInReference supporting ts. and t.s.
export function findYearInReference(text) {
  // 1. Try parenthesized year, e.g. (2020) or (Aralık 2020) or (t.y.)
  const parenRegex = /\((?:[^)]*?\s+)?((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)[^)]*?\)/i;
  const parenMatch = text.match(parenRegex);
  if (parenMatch) {
    const res = [parenMatch[0], parenMatch[1]];
    res.index = parenMatch.index;
    return res;
  }

  // 2. Try to find a year near the end of the citation (excluding URLs or access dates)
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

  // 3. Fallback: search for any year in the text
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
  if (yearMatch && yearMatch.index < 120) {
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
    if (lastWord.length === 1 && lastWord === lastWord.toUpperCase()) {
      continue;
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

// Proposed parseReferenceFixed supporting nodate fallback
function parseReferenceFixed(text, paragraphIndex) {
  let yearMatch = findYearInReference(text);
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
    if (yearMatch && yearMatch.index < 120) {
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
    bibliographyAuthorText: formatBibliographyAuthors(authors, authorSegment),
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

function resolveShortenedFootnote(footnoteText, references) {
  if (!references || !references.length) return null;

  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/g;
  let match = quoteRegex.exec(footnoteText);
  if (!match) return null;

  const quotedTitle = match[1].trim();
  if (quotedTitle.length < 3) return null;

  const clean = (str) =>
    str
      .toLowerCase()
      .replace(/[ıİ]/g, "i")
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[şŞ]/g, "s")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .replace(/[^\w]/g, "")
      .trim();

  const cleanQuoted = clean(quotedTitle);
  if (!cleanQuoted) return null;

  for (const ref of references) {
    const refTitle = ref.structured?.title || "";
    const cleanRefTitle = clean(refTitle);
    const titleMatches = cleanRefTitle.includes(cleanQuoted) || cleanQuoted.includes(cleanRefTitle);
    
    if (!titleMatches) continue;

    const authors = ref.structured?.authors || [];
    const authorMatches = authors.some((author) => {
      const familyName = typeof author === "string" ? author : author.family;
      if (!familyName) return false;
      const cleanFamily = clean(familyName);
      const cleanFootnote = clean(footnoteText);
      return cleanFootnote.includes(cleanFamily);
    });

    if (authorMatches) {
      return {
        kind: "footnote-shortened",
        keys: ref.keys,
      };
    }
  }

  return null;
}

const REPEAT_PATTERNS = /^(a\.g\.e\.|a\.g\.m\.|ibid|op\.\s*cit\.|loc\.\s*cit\.)/i;

function resolveFootnoteCitationFixed(footnote, resolved, references) {
  const base = {
    id: footnote.id,
    text: footnote.text,
    kind: "footnote-unresolved",
    keys: [],
  };

  const inlineCitations = findCitations(footnote.text, 0);
  if (inlineCitations.length > 0) {
    const keys = inlineCitations.flatMap((c) => c.keys).filter(Boolean);
    if (keys.length > 0) {
      return {
        ...base,
        kind: "footnote-inline",
        keys: [...new Set(keys)],
      };
    }
  }

  const repeatMatch = REPEAT_PATTERNS.exec(footnote.text);
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
    return base;
  }

  const yearMatch = findYearInReference(footnote.text);
  if (yearMatch && yearMatch.index < 280) {
    const authorSegment = getActualAuthorSegment(footnote.text, yearMatch);
    if (authorSegment && /[\p{L}]/u.test(authorSegment)) {
      const authors = extractReferenceAuthors(authorSegment);
      if (authors.length > 0) {
        const year = yearMatch[1];
        const aliases = extractReferenceAliases(authorSegment, year);
        const keys = [...new Set([...authors.map((author) => makeKey(author, year)), ...aliases])];
        return {
          ...base,
          kind: "footnote-fulltext",
          keys,
        };
      }
    }
  }

  const shortened = resolveShortenedFootnote(footnote.text, references);
  if (shortened) {
    return {
      ...base,
      kind: shortened.kind,
      keys: shortened.keys,
    };
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

async function analyzeDocxFixed(file) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await readZipText(zip, "word/document.xml");
  const doc = parseXml(documentXml);
  const paragraphs = extractParagraphs(doc);
  const referencesStart = paragraphs.findIndex((paragraph) => {
    const normalized = paragraph.text.toLowerCase();
    return normalized.includes("kaynakça") || normalized.includes("kaynaklar") || normalized.includes("references");
  });
  
  const bodyParagraphs = referencesStart === -1 ? paragraphs : paragraphs.slice(0, referencesStart);
  const referenceParagraphs = referencesStart === -1 ? [] : paragraphs.slice(referencesStart + 1);
  const citations = bodyParagraphs.flatMap((paragraph) => findCitations(paragraph.text, paragraph.index));
  const referenceEntries = buildReferenceEntries(referenceParagraphs);
  
  const references = referenceEntries.map((entry) => parseReferenceFixed(entry.text, entry.paragraphIndex)).filter(Boolean);
  const referenceKeys = new Set(references.flatMap((reference) => reference.keys));
  const missing = citations.filter((citation) => !citation.keys.some((key) => referenceKeys.has(key)));
  const missingUnique = groupMissingCitations(missing);

  const footnotes = await extractFootnotes(zip);
  const footnoteCitations = findFootnoteCitationsFixed(footnotes, references);
  const missingFootnoteCitations = footnoteCitations.filter(
    (fc) => fc.keys.length > 0 && !fc.keys.some((key) => referenceKeys.has(key))
  );
  const unresolvedFootnoteCitations = footnoteCitations.filter((fc) => fc.keys.length === 0);
  const missingFootnoteUnique = groupMissingCitations(
    missingFootnoteCitations.flatMap((fc) => ({
      display: fc.text,
      keys: fc.keys,
      paragraphIndex: 0,
      kind: "footnote",
    }))
  );

  const isnadBibliography = buildIsnadBibliography(references);
  const verificationRecords = buildVerificationRecords(references);

  return {
    citations,
    references,
    missing,
    missingUnique,
    footnoteCitations,
    missingFootnoteCitations,
    missingFootnoteUnique,
    unresolvedFootnoteCitations,
    isnadBibliography,
    verificationRecords,
    referencesStart,
    diagnostics: {
      referencesHeadingFound: referencesStart !== -1,
      referenceCandidateCount: referenceEntries.length,
      unparsedReferenceCount: Math.max(0, referenceEntries.length - references.length),
      footnoteCount: footnotes.length,
      unresolvedFootnoteCount: unresolvedFootnoteCitations.length,
    },
    paragraphs: paragraphs.map(({ index, text }) => ({ index, text })),
  };
}

async function run() {
  const filePath = "C:\\Users\\Fatih YILDIRIM\\Downloads\\1956119-AF-T0-V0-20260521084022.docx";
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const result = await analyzeDocxFixed(fileBuffer);
    
    let output = "";
    
    output += "=== DIAGNOSTICS ===\n";
    output += JSON.stringify(result.diagnostics, null, 2) + "\n\n";
    
    output += `=== REFERENCES (KAYNAKÇA) (Total: ${result.references.length}) ===\n`;
    result.references.forEach((ref, index) => {
      output += `${index + 1}: Keys: [${ref.keys.join(', ')}] | Title: "${ref.structured?.title}" | Display: ${ref.display}\n`;
    });
    
    output += `\n=== UNRESOLVED FOOTNOTES (Total: ${result.unresolvedFootnoteCitations.length}) ===\n`;
    result.unresolvedFootnoteCitations.forEach((fc) => {
      output += `FN ${fc.id}: [${fc.kind}] Text: ${fc.text}\n`;
    });

    output += `\n=== RESOLVED FOOTNOTES (Total: ${result.footnoteCitations.length - result.unresolvedFootnoteCitations.length}) ===\n`;
    const resolved = result.footnoteCitations.filter(fc => fc.keys.length > 0);
    resolved.forEach((fc) => {
      output += `FN ${fc.id}: [${fc.kind}] Keys: [${fc.keys.join(', ')}] | Resolved From: ${fc.resolvedFrom || 'N/A'} | Text: ${fc.text}\n`;
    });

    fs.writeFileSync('scratch/debug_output.txt', output);
    console.log("Output written to scratch/debug_output.txt successfully.");
  } catch (err) {
    console.error("Error running debug script:", err);
  }
}

run();
