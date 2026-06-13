import JSZip from "jszip";
import { buildVerificationRecords } from "./zoteroExport.js";
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
