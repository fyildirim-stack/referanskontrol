import JSZip from "jszip";
import { buildVerificationRecords } from "./zoteroExport.js";
import { extractTextFromPdf } from "./pdfParser.js";
import {
  readZipText,
  parseXml,
  serializeXml,
  extractParagraphs,
  normalizeVisibleText,
  getParagraphText,
  rewriteBibliography,
  rewriteParagraph,
  getNextFootnoteId,
  upsertFootnotes,
  ensureFootnoteRelationship,
  ensureFootnoteContentType,
  extractFootnotes
} from "./docxParser.js";
import {
  findCitations,
  groupMissingCitations
} from "./citationFinder.js";
import { findFootnoteCitations } from "./footnoteCitationFinder.js";
import {
  parseReference,
  buildIsnadBibliography,
  formatIsnadFootnote,
  findYearInReference,
  getActualAuthorSegment
} from "./isnadFormatter.js";

export async function analyzeDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await readZipText(zip, "word/document.xml");
  const doc = parseXml(documentXml);
  const paragraphs = extractParagraphs(doc);
  const referencesStart = findReferencesStartRobust(paragraphs);
  const bodyParagraphs = referencesStart === -1 ? paragraphs : paragraphs.slice(0, referencesStart);
  const referenceParagraphs = referencesStart === -1 ? [] : paragraphs.slice(referencesStart + 1);
  const citations = bodyParagraphs.flatMap((paragraph) => findCitations(paragraph.text, paragraph.index));
  const referenceEntries = buildReferenceEntries(referenceParagraphs);
  const references = referenceEntries.map((entry) => parseReference(entry.text, entry.paragraphIndex)).filter(Boolean);
  const referenceKeys = new Set(references.flatMap((reference) => reference.keys));
  const missing = citations.filter((citation) => !citation.keys.some((key) => referenceKeys.has(key)));
  const missingUnique = groupMissingCitations(missing);

  // Process footnotes
  const footnotes = await extractFootnotes(zip);
  const footnoteCitations = findFootnoteCitations(footnotes, references);
  
  // Flatten the footnote citations into individual parts to verify each citation independently
  const footnoteParts = footnoteCitations.flatMap((fc) => {
    if (fc.parts && fc.parts.length > 0) {
      return fc.parts.map((part) => ({
        id: fc.id,
        text: part.text,
        kind: part.kind,
        keys: part.keys,
      }));
    }
    return [{
      id: fc.id,
      text: fc.text,
      kind: fc.kind,
      keys: fc.keys,
    }];
  });

  const missingFootnoteCitations = footnoteParts.filter(
    (fp) => fp.keys.length > 0 && !fp.keys.some((key) => referenceKeys.has(key))
  );
  const unresolvedFootnoteCitations = footnoteParts.filter((fp) => fp.keys.length === 0);
  const missingFootnoteUnique = groupMissingCitations(
    missingFootnoteCitations.flatMap((fp) => ({
      display: fp.text,
      keys: fp.keys,
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

export async function convertDocxToFootnotes(file, analysis) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await readZipText(zip, "word/document.xml");
  const doc = parseXml(documentXml);
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(doc.getElementsByTagNameNS(WORD_NS, "p"));
  const footnotes = [];
  const referenceByKey = buildReferenceLookup(analysis.references);
  let nextFootnoteId = await getNextFootnoteId(zip);

  paragraphs.forEach((paragraph, index) => {
    if (analysis.referencesStart !== -1 && index >= analysis.referencesStart) return;
    const text = getParagraphText(paragraph);
    const matches = findCitations(text, index);
    if (!matches.length) return;

    const chunks = [];
    let cursor = 0;
    matches.sort((a, b) => a.start - b.start).forEach((match) => {
      if (match.start < cursor) return;
      if (match.start > cursor) chunks.push({ type: "text", value: text.slice(cursor, match.start) });
      const id = nextFootnoteId++;
      chunks.push({ type: "footnote", id });
      footnotes.push({ id, text: formatCitationFootnote(match, referenceByKey) });
      cursor = match.end;
    });
    if (cursor < text.length) chunks.push({ type: "text", value: text.slice(cursor) });
    rewriteParagraph(paragraph, chunks, doc);
  });

  if (!footnotes.length) {
    throw new Error("Dönüştürülecek metin içi atıf bulunamadı.");
  }

  await upsertFootnotes(zip, footnotes);
  await ensureFootnoteRelationship(zip);
  await ensureFootnoteContentType(zip);
  rewriteBibliography(doc, analysis);
  zip.file("word/document.xml", serializeXml(doc));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
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

function splitReferenceParagraph(text) {
  return String(text)
    .split(/\n+/)
    .map((line) => normalizeVisibleText(line))
    .filter(Boolean);
}

function isReferenceStart(text) {
  const candidate = normalizeVisibleText(text).replace(/^\s*\[\d+\]\s*/, "");
  const yearMatch = findYearInReference(candidate);
  if (!yearMatch || yearMatch.index > 260) return false;
  const authorSegment = getActualAuthorSegment(candidate, yearMatch);
  return /[\p{L}]/u.test(authorSegment) && authorSegment.length >= 2;
}

function isReferencesHeading(text) {
  const normalized = normalizeVisibleText(text).replace(/^[\dIVXLC]+\s*[.)-]\s*/i, "").replace(/[:：]\s*$/, "");
  return /^(kaynak(?:ça|ca)|kaynaklar|references?|reference list|bibliography)(?:\s*[/,-]\s*(kaynak(?:ça|ca)|kaynaklar|references?|bibliography))?$/i.test(normalized);
}

function findReferencesStartRobust(paragraphs) {
  return paragraphs.findIndex((paragraph) => isReferencesHeading(paragraph.text));
}

function buildReferenceLookup(references) {
  const lookup = new Map();
  references.forEach((reference) => {
    reference.keys.forEach((key) => {
      if (!lookup.has(key)) lookup.set(key, reference);
    });
  });
  return lookup;
}

function formatCitationFootnote(citation, referenceByKey) {
  const reference = citation.keys.map((key) => referenceByKey.get(key)).find(Boolean);
  if (!reference) return `${citation.display}.`;
  return reference.isnadFootnote || formatIsnadFootnote(reference.structured);
}

function convertSuperscriptToNormal(str) {
  const mapping = {
    "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
    "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁰": "0"
  };
  return str.split("").map(c => mapping[c] || c).join("");
}

function resolveShortenedFootnoteCheck(partText, references) {
  if (!references || !references.length) return false;
  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/;
  const quoteMatch = partText.match(quoteRegex);
  
  const cleanPart = partText
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const partWords = cleanPart.split(' ');

  for (const ref of references) {
    const authors = ref.structured?.authors || [];
    if (!authors.length) continue;
    const authorMatches = authors.some((author) => {
      const familyName = typeof author === "string" ? author : author.family;
      if (!familyName) return false;
      const cleanFamily = familyName
        .replace(/[ıİ]/g, "i")
        .replace(/[ğĞ]/g, "g")
        .replace(/[üÜ]/g, "u")
        .replace(/[şŞ]/g, "s")
        .replace(/[öÖ]/g, "o")
        .replace(/[çÇ]/g, "c")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      return partWords.includes(cleanFamily);
    });
    if (!authorMatches) continue;
    const title = ref.structured?.title || "";
    if (!title) continue;
    const cleanTitle = title
      .replace(/[ıİ]/g, "i")
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[şŞ]/g, "s")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (quoteMatch) {
      const quoted = quoteMatch[1]
        .replace(/[ıİ]/g, "i")
        .replace(/[ğĞ]/g, "g")
        .replace(/[üÜ]/g, "u")
        .replace(/[şŞ]/g, "s")
        .replace(/[öÖ]/g, "o")
        .replace(/[çÇ]/g, "c")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleanTitle.includes(quoted) || quoted.includes(cleanTitle)) {
        return true;
      }
    }
    if (cleanPart.includes(cleanTitle)) {
      return true;
    }
    const titleWords = cleanTitle.split(' ').filter(w => w.length > 2);
    if (titleWords.length > 0) {
      const matchingWords = titleWords.filter(w => partWords.includes(w));
      const score = matchingWords.length / titleWords.length;
      const firstTitleWord = cleanTitle.split(' ')[0];
      const firstWordMatches = firstTitleWord && firstTitleWord.length > 2 && partWords.includes(firstTitleWord);
      if (score >= 0.3 || firstWordMatches) {
        return true;
      }
    }
  }
  return false;
}

function looksLikeFootnote(text, references) {
  const clean = text.trim();
  if (/a\.g\.e\.|a\.g\.m\.|ibid|op\.\s*cit\.|loc\.\s*cit\./i.test(clean)) return true;
  if (/[“"‘«'”’»]/.test(clean)) return true;
  if (/\b(?:19|20)\d{2}[a-z]?\b/i.test(clean) || /\b(?:n\.d\.|t\.y\.|t\.s\.|ts\.)\b/i.test(clean)) return true;
  if (resolveShortenedFootnoteCheck(clean, references)) return true;
  return false;
}

export async function analyzePdf(file) {
  const pages = await extractTextFromPdf(file);
  
  const allLines = [];
  pages.forEach((page) => {
    page.lines.forEach((line) => {
      // Filter running headers (y > 640) and page numbers (y < 25)
      if (line.y <= 640 && line.y >= 25 && line.text.trim().length > 1) {
        allLines.push({
          text: line.text.trim(),
          minX: line.minX,
          y: line.y,
          pageNumber: page.pageNumber,
        });
      }
    });
  });

  const headingIndex = allLines.findIndex(l => isReferencesHeading(l.text));
  
  const bodyLines = headingIndex === -1 ? allLines : allLines.slice(0, headingIndex);
  const bibLines = headingIndex === -1 ? [] : allLines.slice(headingIndex + 1);

  // Reconstruct body paragraphs
  const bodyParagraphs = [];
  let currentBody = null;
  let bodyIdx = 0;
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    if (!currentBody) {
      currentBody = { text: line.text, pageNumber: line.pageNumber };
      continue;
    }
    
    let shouldMerge = false;
    if (currentBody.text.endsWith("-")) {
      shouldMerge = true;
    } else if (/^\p{Ll}/u.test(line.text)) {
      shouldMerge = true;
    } else if (!/[.?!:]\s*$/.test(currentBody.text)) {
      shouldMerge = true;
    }
    
    if (shouldMerge) {
      if (currentBody.text.endsWith("-")) {
        currentBody.text = currentBody.text.slice(0, -1) + line.text;
      } else {
        currentBody.text += " " + line.text;
      }
    } else {
      currentBody.index = bodyIdx++;
      bodyParagraphs.push(currentBody);
      currentBody = { text: line.text, pageNumber: line.pageNumber };
    }
  }
  if (currentBody) {
    currentBody.index = bodyIdx++;
    bodyParagraphs.push(currentBody);
  }

  // Reconstruct bibliography paragraphs
  const bibParagraphs = [];
  let currentBib = null;
  let bibIdx = 0;
  
  const nonShortBibLines = bibLines.filter(l => l.text.length > 10);
  const baseMargin = nonShortBibLines.length > 0 ? Math.min(...nonShortBibLines.map(l => l.minX)) : 60;

  for (let i = 0; i < bibLines.length; i++) {
    const line = bibLines[i];
    if (!currentBib) {
      currentBib = { text: line.text, pageNumber: line.pageNumber };
      continue;
    }
    
    const cleanText = line.text.trim();
    const startsWithUrl = /^https?:\/\//i.test(cleanText);
    const startsWithAccessDate = /^\((?:Erişim(?:\s+Tarihi)?|Access(?:\s+Date)?|Accessed)/i.test(cleanText);
    const isContinuation = (line.minX > baseMargin + 5) || startsWithUrl || startsWithAccessDate;
    if (isContinuation) {
      if (currentBib.text.endsWith("-")) {
        currentBib.text = currentBib.text.slice(0, -1) + line.text;
      } else {
        currentBib.text += " " + line.text;
      }
    } else {
      currentBib.index = bibIdx++;
      bibParagraphs.push(currentBib);
      currentBib = { text: line.text, pageNumber: line.pageNumber };
    }
  }
  if (currentBib) {
    currentBib.index = bibIdx++;
    bibParagraphs.push(currentBib);
  }

  let paragraphs = [];
  let referencesStart = -1;
  if (headingIndex === -1) {
    paragraphs = bodyParagraphs;
  } else {
    referencesStart = bodyParagraphs.length;
    
    const headingParagraph = {
      text: allLines[headingIndex].text,
      pageNumber: allLines[headingIndex].pageNumber,
      index: referencesStart,
    };
    
    paragraphs = [
      ...bodyParagraphs,
      headingParagraph,
      ...bibParagraphs
    ];
  }
  
  // Re-assign exact indices
  paragraphs.forEach((p, idx) => {
    p.index = idx;
  });

  const parsedBodyParagraphs = referencesStart === -1 ? paragraphs : paragraphs.slice(0, referencesStart);
  const referenceParagraphs = referencesStart === -1 ? [] : paragraphs.slice(referencesStart + 1);

  // In-text citations
  const citations = parsedBodyParagraphs.flatMap((paragraph) => {
    const found = findCitations(paragraph.text, paragraph.index);
    return found.map(c => ({
      ...c,
      pageNumber: paragraph.pageNumber,
    }));
  });

  // Bibliography references
  const referenceEntries = buildReferenceEntries(referenceParagraphs);
  const references = referenceEntries.map((entry) => parseReference(entry.text, entry.paragraphIndex)).filter(Boolean);
  const referenceKeys = new Set(references.flatMap((reference) => reference.keys));
  const missing = citations.filter((citation) => !citation.keys.some((key) => referenceKeys.has(key)));
  const missingUnique = groupMissingCitations(missing);

  // Extract footnotes from PDF body
  const footnotes = [];
  let footnoteIdCounter = 1;

  parsedBodyParagraphs.forEach((paragraph) => {
    const match = /^\s*([¹²³⁴⁵⁶⁷⁸⁹⁰\d]+)\s*[\.\s-]*\s*([\p{L}].*)$/u.exec(paragraph.text);
    if (match) {
      const numStr = convertSuperscriptToNormal(match[1]);
      const footnoteId = parseInt(numStr, 10);
      const footnoteText = match[2].trim();

      if (looksLikeFootnote(footnoteText, references)) {
        footnotes.push({
          id: isNaN(footnoteId) ? footnoteIdCounter++ : footnoteId,
          text: footnoteText,
          pageNumber: paragraph.pageNumber,
        });
      }
    }
  });

  footnotes.sort((a, b) => a.pageNumber - b.pageNumber || a.id - b.id);

  const footnoteCitations = findFootnoteCitations(footnotes, references);
  
  const footnoteParts = footnoteCitations.flatMap((fc) => {
    if (fc.parts && fc.parts.length > 0) {
      return fc.parts.map((part) => ({
        id: fc.id,
        text: part.text,
        kind: part.kind,
        keys: part.keys,
        pageNumber: fc.pageNumber || 0,
      }));
    }
    return [{
      id: fc.id,
      text: fc.text,
      kind: fc.kind,
      keys: fc.keys,
      pageNumber: fc.pageNumber || 0,
    }];
  });

  const missingFootnoteCitations = footnoteParts.filter(
    (fp) => fp.keys.length > 0 && !fp.keys.some((key) => referenceKeys.has(key))
  );
  const unresolvedFootnoteCitations = footnoteParts.filter((fp) => fp.keys.length === 0);
  
  const missingFootnoteUnique = groupMissingCitations(
    missingFootnoteCitations.flatMap((fp) => ({
      display: fp.text,
      keys: fp.keys,
      paragraphIndex: 0,
      kind: "footnote",
      pageNumber: fp.pageNumber,
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
    paragraphs: paragraphs.map(({ index, text, pageNumber }) => ({ index, text, pageNumber })),
  };
}
