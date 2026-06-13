import JSZip from "jszip";
import { buildVerificationRecords } from "./zoteroExport.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const FOOTNOTE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";

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
  const isnadBibliography = buildIsnadBibliography(references);
  const verificationRecords = buildVerificationRecords(references);

  return {
    citations,
    references,
    missing,
    missingUnique,
    isnadBibliography,
    verificationRecords,
    referencesStart,
    diagnostics: {
      referencesHeadingFound: referencesStart !== -1,
      referenceCandidateCount: referenceEntries.length,
      unparsedReferenceCount: Math.max(0, referenceEntries.length - references.length),
    },
    paragraphs: paragraphs.map(({ index, text }) => ({ index, text })),
  };
}

export async function convertDocxToFootnotes(file, analysis) {
  const zip = await JSZip.loadAsync(file);
  const documentXml = await readZipText(zip, "word/document.xml");
  const doc = parseXml(documentXml);
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

async function readZipText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`${path} dosyası bulunamadı. Geçerli bir .docx seçin.`);
  return file.async("text");
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error("Word XML içeriği okunamadı.");
  return doc;
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function extractParagraphs(doc) {
  return Array.from(doc.getElementsByTagNameNS(WORD_NS, "p")).map((node, index) => {
    const rawText = getParagraphText(node, { preserveBreaks: true });
    return {
      index,
      node,
      rawText,
      text: normalizeVisibleText(rawText),
    };
  });
}

function normalizeVisibleText(text) {
  return String(text).replace(/[ \t\r\n]+/g, " ").trim();
}

function getParagraphText(paragraph, options = {}) {
  const pieces = [];
  collectText(paragraph, pieces, options);
  return pieces.join("");
}

function collectText(node, pieces, options) {
  Array.from(node.childNodes || []).forEach((child) => {
    if (child.namespaceURI === WORD_NS && child.localName === "t") {
      pieces.push(child.textContent || "");
      return;
    }
    if (options.preserveBreaks && child.namespaceURI === WORD_NS && (child.localName === "br" || child.localName === "cr")) {
      pieces.push("\n");
      return;
    }
    if (options.preserveBreaks && child.namespaceURI === WORD_NS && child.localName === "tab") {
      pieces.push("\t");
      return;
    }
    collectText(child, pieces, options);
  });
}

function buildReferenceEntries(referenceParagraphs) {
  const entries = [];
  let current = null;

  referenceParagraphs.forEach((paragraph) => {
    splitReferenceParagraph(paragraph.rawText || paragraph.text).forEach((line) => {
      if (!line) return;
      if (isReferenceStart(line)) {
        if (current) entries.push(current);
        current = { text: line, paragraphIndex: paragraph.index };
        return;
      }
      if (current) current.text = `${current.text} ${line}`;
    });
  });

  if (current) entries.push(current);
  return entries.map((entry) => ({
    ...entry,
    text: normalizeVisibleText(entry.text).replace(/^\s*\[\d+\]\s*/, ""),
  }));
}

function splitReferenceParagraph(text) {
  const lines = String(text)
    .split(/\n+/)
    .map((line) => normalizeVisibleText(line))
    .filter(Boolean);

  if (lines.length > 1) return lines;

  const single = lines[0] || "";
  const starts = [...single.matchAll(referenceStartGlobalRegex())]
    .map((match) => match.index)
    .filter((index) => isInlineReferenceBoundary(single, index));
  if (!starts.length) return single ? [single] : [];

  const chunks = [];
  let cursor = 0;
  starts.forEach((start) => {
    chunks.push(single.slice(cursor, start).trim());
    cursor = start;
  });
  chunks.push(single.slice(cursor).trim());
  return chunks.filter(Boolean);
}

function referenceStartGlobalRegex() {
  const authorStart = String.raw`(?:\p{Lu}[\p{L}'-]{1,}|\p{Lu}[\p{L}'-]{1,}\s*,\s*\p{Lu}\.|\p{Lu}[\p{L}'-]{1,}\s+ve\s+\p{Lu}[\p{L}'-]{1,})`;
  const yearStart = String.raw`\((?:(?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.)(?:[^)]*)\)`;
  return new RegExp(String.raw`(?=${authorStart}.{0,220}?${yearStart})`, "gu");
}

function isInlineReferenceBoundary(text, index) {
  if (index <= 0 || !/^\p{Lu}/u.test(text.slice(index))) return false;
  if (!/\s/.test(text[index - 1] || "")) return false;
  const before = text.slice(0, index).trimEnd();
  if (!before) return false;
  return /[.!?)]$/.test(before) || /(?:https?:\/\/|www\.)\S+$/i.test(before);
}

function isReferenceStart(text) {
  const candidate = normalizeVisibleText(text).replace(/^\s*\[\d+\]\s*/, "");
  const yearMatch = candidate.match(referenceYearRegex());
  if (!yearMatch || yearMatch.index > 260) return false;
  const authorSegment = candidate.slice(0, yearMatch.index).trim();
  return /[\p{L}]/u.test(authorSegment) && authorSegment.length >= 2;
}

function referenceYearRegex() {
  return /\(((?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.)(?:[^)]*)\)/i;
}

function findReferencesStart(paragraphs) {
  return paragraphs.findIndex((paragraph) => /^(kaynakça|kaynaklar|references|bibliography)$/i.test(paragraph.text.trim()));
}

function isReferencesHeading(text) {
  const normalized = normalizeVisibleText(text).replace(/^[\dIVXLC]+\s*[.)-]\s*/i, "").replace(/[:：]\s*$/, "");
  return /^(kaynak(?:ça|ca)|kaynaklar|references?|reference list|bibliography)(?:\s*[/,-]\s*(kaynak(?:ça|ca)|kaynaklar|references?|bibliography))?$/i.test(normalized);
}

function findReferencesStartRobust(paragraphs) {
  return paragraphs.findIndex((paragraph) => isReferencesHeading(paragraph.text));
}

function findCitations(text, paragraphIndex) {
  const matches = [];
  const occupied = [];
  const parenthetical = /\(([^()]{0,280}\b(?:19|20)\d{2}[a-z]?[^()]*)\)/giu;
  const narrative = /([\p{Lu}][\p{L}'-]+(?:\s+(?:ve|and|&)\s+[\p{Lu}][\p{L}'-]+|\s+et al\.)?)\s*\(((?:19|20)\d{2}[a-z]?)\)/gu;

  for (const match of text.matchAll(parenthetical)) {
    const content = match[1];
    if (!looksLikeCitation(content)) continue;
    const parts = splitCitationContent(content);
    parts.forEach((part) => {
      const parsed = parseCitationPart(part);
      if (!parsed) return;
      matches.push({
        kind: "parenthetical",
        display: part.trim(),
        keys: parsed.keys,
        paragraphIndex,
        start: match.index,
        end: match.index + match[0].length,
      });
      occupied.push([match.index, match.index + match[0].length]);
    });
  }

  for (const match of text.matchAll(narrative)) {
    const rangeStart = match.index + match[1].length;
    const rangeEnd = match.index + match[0].length;
    if (occupied.some(([start, end]) => rangeStart >= start && rangeStart < end)) continue;
    const display = `${match[1]} (${match[2]})`;
    matches.push({
      kind: "narrative",
      display,
      keys: [makeKey(match[1], match[2])],
      paragraphIndex,
      start: rangeStart,
      end: rangeEnd,
    });
  }

  return dedupeOverlaps(matches);
}

function looksLikeCitation(content) {
  return /\b(?:19|20)\d{2}[a-z]?\b/i.test(content) && /[\p{L}]/u.test(content) && !/^(?:19|20)\d{2}[a-z]?$/i.test(content.trim());
}

function splitCitationContent(content) {
  return content.split(";").map((part) => part.trim()).filter(Boolean);
}

function parseCitationPart(part) {
  const yearMatch = part.match(/\b((?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.)\b/i);
  if (!yearMatch) return null;
  const authorPart = part.slice(0, yearMatch.index).replace(/\b(see|bkz|cf|e\.g\.|ör\.|örn)\b\.?/giu, "").trim();
  if (!authorPart || !isPlausibleCitationAuthorPart(authorPart)) return null;
  const authors = extractCitationAuthors(authorPart);
  if (!authors.length) return null;
  return { keys: authors.map((author) => makeKey(author, yearMatch[1])) };
}

function extractCitationAuthors(authorPart) {
  const cleaned = authorPart.replace(/\b(?:et al|vd)\.?/giu, "").replace(/\s+/g, " ");
  return cleaned.split(/\s*(?:,?\s*&\s*|,?\s+and\s+|,?\s+ve\s+|,)\s*/iu).map(cleanAuthor).filter(Boolean);
}

function isPlausibleCitationAuthorPart(authorPart) {
  const cleaned = authorPart.replace(/\b(?:et al|vd)\.?/giu, "").trim();
  if (!cleaned || /\d/.test(cleaned)) return false;
  return /^\p{Lu}/u.test(cleaned) || /^[A-Z&.\s-]{2,}$/u.test(cleaned);
}

function parseReference(text, paragraphIndex) {
  const yearMatch = text.match(referenceYearRegex());
  if (!yearMatch) return null;
  const authorSegment = text.slice(0, yearMatch.index).trim();
  const authors = extractReferenceAuthors(authorSegment);
  if (!authors.length) return null;
  const keys = [...new Set([...authors.map((author) => makeKey(author, yearMatch[1])), ...extractReferenceAliases(authorSegment, yearMatch[1])])];
  const structured = parseApaReference(text, authorSegment, yearMatch);
  return {
    display: text,
    paragraphIndex,
    keys,
    structured,
    isnadFootnote: formatIsnadFootnote(structured),
    isnadBibliography: formatIsnadBibliography(structured),
  };
}

function parseApaReference(text, authorSegment, yearMatch) {
  const year = yearMatch[1];
  const dateText = yearMatch[0].replace(/[()]/g, "");
  const afterDate = normalizeVisibleText(text.slice(yearMatch.index + yearMatch[0].length)).replace(/^\.\s*/, "");
  const url = afterDate.match(/https?:\/\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const doi = afterDate.match(/https?:\/\/doi\.org\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const withoutUrl = normalizeVisibleText(afterDate.replace(/https?:\/\/\S+/gi, "")).replace(/[.]+$/g, "");
  const titleSplit = splitTitleAndContainer(withoutUrl);
  const authors = parseAuthorNames(authorSegment);
  const type = inferReferenceType(titleSplit.container, url, doi);

  return {
    raw: text,
    authors,
    authorText: authors.map((author) => author.full).join(" - ") || authorSegment,
    bibliographyAuthorText: formatBibliographyAuthors(authors, authorSegment),
    year,
    dateText,
    title: titleSplit.title,
    container: titleSplit.container,
    url,
    doi,
    type,
  };
}

function splitTitleAndContainer(text) {
  const parts = text.split(/(?<=\.)\s+(?=\p{Lu}|\d)/u).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { title: text, container: "" };
  if (parts.length === 1) return { title: parts[0].replace(/[.]+$/g, ""), container: "" };
  return {
    title: parts[0].replace(/[.]+$/g, ""),
    container: parts.slice(1).join(" ").replace(/[.]+$/g, ""),
  };
}

function parseAuthorNames(authorSegment) {
  return authorSegment
    .split(/\s*(?:,\s*&|,\s*\band\b|\bve\b)\s*/iu)
    .flatMap((part) => part.split(/\s*,\s*(?=[\p{Lu}][\p{L}'-]+\s*,)/u))
    .map((part) => part.trim().replace(/[.]+$/g, ""))
    .filter(Boolean)
    .map((part) => {
      if (part.includes(",")) {
        const [family, given = ""] = part.split(/\s*,\s*/);
        return { family: family.trim(), given: given.trim(), full: `${given.trim()} ${family.trim()}`.trim() };
      }
      return { family: cleanAuthor(part), given: "", full: part };
    });
}

function formatBibliographyAuthors(authors, fallback) {
  if (!authors.length) return fallback.replace(/[.]+$/g, "");
  return authors
    .map((author, index) => {
      if (index === 0 && author.given) return `${author.family}, ${author.given}`;
      return author.full;
    })
    .join(" - ");
}

function inferReferenceType(container, url, doi) {
  if (doi || /\b\d+\s*\(\d+\)|\b\d+\/\d+|\bjournal|dergi|policy|reviews?|energy policy\b/i.test(container)) return "article";
  if (url) return "web";
  if (/\bpress|publisher|university|institute|yayın/i.test(container)) return "book";
  return "book";
}

function extractReferenceAuthors(authorSegment) {
  return authorSegment
    .split(/\s*(?:,\s*&|,\s*\band\b|\bve\b)\s*/iu)
    .flatMap((part) => part.split(/\s*,\s*(?=[\p{Lu}][\p{L}'-]+\s*,)/u))
    .map((part) => cleanAuthor(part.split(",")[0]))
    .filter(Boolean);
}

function extractReferenceAliases(authorSegment, year) {
  const aliases = [];
  const explicitAcronyms = [...authorSegment.matchAll(/\(([A-ZÇĞİÖŞÜ&.\s-]{2,})\)/gu)].map((match) => match[1].replace(/[\s.]/g, ""));
  explicitAcronyms.forEach((alias) => {
    if (alias.length >= 2) aliases.push(makeKey(alias, year));
  });

  const withoutParentheses = authorSegment.replace(/\([^)]*\)/g, "").replace(/[.]+$/g, "").trim();
  const acronym = withoutParentheses
    .split(/\s+/)
    .map((word) => word.match(/^\p{Lu}/u)?.[0] || "")
    .join("");
  if (acronym.length >= 2) aliases.push(makeKey(acronym, year));
  return aliases;
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

function formatIsnadFootnote(item) {
  if (!item) return "";
  const author = item.authorText || "Yazar belirtilmemiş";
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const container = item.container ? `, ${item.container}` : "";
  const date = item.dateText ? ` (${formatDateText(item.dateText)})` : "";
  const url = item.url ? `, ${item.url}` : "";

  if (item.type === "article") return `${author}, ${title}${container}${date}${url}.`;
  if (item.type === "web") return `${author}, ${title}${container}${date}${url}.`;
  return `${author}, ${item.title || "Başlık belirtilmemiş"}${container ? ` (${container}, ${item.year})` : ` (${item.year})`}${url}.`;
}

function formatIsnadBibliography(item) {
  if (!item) return "";
  const author = item.bibliographyAuthorText || item.authorText || "Yazar belirtilmemiş";
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const container = item.container ? `. ${item.container}` : "";
  const date = item.dateText ? `. ${formatDateText(item.dateText)}` : "";
  const url = item.url ? `. ${item.url}` : "";

  if (item.type === "article") return `${author}. ${title}${container}${date}${url}.`;
  if (item.type === "web") return `${author}. ${title}${container}${date}${url}.`;
  return `${author}. ${item.title || "Başlık belirtilmemiş"}${container ? `. ${item.container}` : ""}. ${item.year}${url}.`;
}

function buildIsnadBibliography(references) {
  return [...references]
    .map((reference) => reference.isnadBibliography || formatIsnadBibliography(reference.structured))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "tr"));
}

function formatDateText(dateText) {
  return String(dateText).replace(/\.+$/g, "");
}

function rewriteBibliography(doc, analysis) {
  if (analysis.referencesStart === -1 || !analysis.isnadBibliography?.length) return;
  const body = doc.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) return;
  const paragraphs = Array.from(body.getElementsByTagNameNS(WORD_NS, "p"));
  const heading = paragraphs[analysis.referencesStart];
  if (!heading) return;
  const sectionProps = Array.from(body.childNodes).find((node) => node.namespaceURI === WORD_NS && node.localName === "sectPr");
  let node = heading.nextSibling;
  while (node && node !== sectionProps) {
    const next = node.nextSibling;
    body.removeChild(node);
    node = next;
  }
  analysis.isnadBibliography.forEach((entry) => {
    body.insertBefore(createParagraph(doc, entry), sectionProps || null);
  });
}

function createParagraph(doc, text) {
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  paragraph.appendChild(createTextRun(doc, text));
  return paragraph;
}

function makeKey(author, year) {
  return `${normalize(author)}:${normalizeYear(year)}`;
}

function cleanAuthor(value) {
  return value.replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").replace(/[^\p{L}'-]/gu, " ").trim().split(/\s+/).at(-1) || "";
}

function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}0-9]/gu, "");
}

function normalizeYear(year) {
  const normalized = String(year).toLowerCase().replace(/\s+/g, "");
  if (normalized === "n.d." || normalized === "t.y.") return "nodate";
  return normalized;
}

function groupMissingCitations(missing) {
  const grouped = new Map();
  missing.forEach((citation) => {
    const key = citation.keys.length ? [...citation.keys].sort().join("|") : normalize(citation.display);
    const existing = grouped.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.paragraphs = [...new Set([...existing.paragraphs, citation.paragraphIndex + 1])];
      existing.items.push(citation);
      return;
    }
    grouped.set(key, {
      display: citation.display,
      keys: citation.keys,
      occurrences: 1,
      paragraphs: [citation.paragraphIndex + 1],
      items: [citation],
    });
  });
  return [...grouped.values()].sort((a, b) => a.display.localeCompare(b.display, "tr"));
}

function dedupeOverlaps(matches) {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  for (const match of sorted) {
    if (result.some((item) => rangesOverlap(item, match) && item.display === match.display)) continue;
    result.push(match);
  }
  return result;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function rewriteParagraph(paragraph, chunks, doc) {
  const preserved = Array.from(paragraph.childNodes).filter((node) => node.localName === "pPr");
  while (paragraph.firstChild) paragraph.removeChild(paragraph.firstChild);
  preserved.forEach((node) => paragraph.appendChild(node));
  chunks.forEach((chunk) => {
    if (chunk.type === "text" && chunk.value) paragraph.appendChild(createTextRun(doc, chunk.value));
    if (chunk.type === "footnote") paragraph.appendChild(createFootnoteReferenceRun(doc, chunk.id));
  });
}

function createTextRun(doc, text) {
  const run = doc.createElementNS(WORD_NS, "w:r");
  const textNode = doc.createElementNS(WORD_NS, "w:t");
  if (/^\s|\s$/.test(text)) textNode.setAttribute("xml:space", "preserve");
  textNode.textContent = text;
  run.appendChild(textNode);
  return run;
}

function createFootnoteReferenceRun(doc, id) {
  const run = doc.createElementNS(WORD_NS, "w:r");
  const props = doc.createElementNS(WORD_NS, "w:rPr");
  const style = doc.createElementNS(WORD_NS, "w:rStyle");
  style.setAttributeNS(WORD_NS, "w:val", "FootnoteReference");
  const vertAlign = doc.createElementNS(WORD_NS, "w:vertAlign");
  vertAlign.setAttributeNS(WORD_NS, "w:val", "superscript");
  props.appendChild(style);
  props.appendChild(vertAlign);
  const reference = doc.createElementNS(WORD_NS, "w:footnoteReference");
  reference.setAttributeNS(WORD_NS, "w:id", String(id));
  run.appendChild(props);
  run.appendChild(reference);
  return run;
}

async function getNextFootnoteId(zip) {
  const existing = zip.file("word/footnotes.xml");
  if (!existing) return 1;
  const doc = parseXml(await existing.async("text"));
  const ids = Array.from(doc.getElementsByTagNameNS(WORD_NS, "footnote")).map((node) => Number(node.getAttributeNS(WORD_NS, "id") || "0"));
  return Math.max(0, ...ids) + 1;
}

async function upsertFootnotes(zip, notes) {
  const existing = zip.file("word/footnotes.xml");
  const doc = existing ? parseXml(await existing.async("text")) : createFootnotesDocument();
  const root = doc.documentElement;
  notes.forEach((note) => root.appendChild(createFootnote(doc, note.id, note.text)));
  zip.file("word/footnotes.xml", serializeXml(doc));
}

function createFootnotesDocument() {
  const doc = document.implementation.createDocument(WORD_NS, "w:footnotes");
  const root = doc.documentElement;
  root.setAttribute("xmlns:w", WORD_NS);
  root.appendChild(createSpecialFootnote(doc, "-1", "separator"));
  root.appendChild(createSpecialFootnote(doc, "0", "continuationSeparator"));
  return doc;
}

function createSpecialFootnote(doc, id, separatorName) {
  const footnote = doc.createElementNS(WORD_NS, "w:footnote");
  footnote.setAttributeNS(WORD_NS, "w:id", id);
  footnote.setAttributeNS(WORD_NS, "w:type", separatorName);
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  const run = doc.createElementNS(WORD_NS, "w:r");
  run.appendChild(doc.createElementNS(WORD_NS, `w:${separatorName}`));
  paragraph.appendChild(run);
  footnote.appendChild(paragraph);
  return footnote;
}

function createFootnote(doc, id, text) {
  const footnote = doc.createElementNS(WORD_NS, "w:footnote");
  footnote.setAttributeNS(WORD_NS, "w:id", String(id));
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  paragraph.appendChild(createParagraphStyle(doc, "FootnoteText"));
  paragraph.appendChild(createFootnoteNumberRun(doc));
  paragraph.appendChild(createTextRun(doc, " "));
  paragraph.appendChild(createTextRun(doc, text));
  footnote.appendChild(paragraph);
  return footnote;
}

function createParagraphStyle(doc, styleId) {
  const props = doc.createElementNS(WORD_NS, "w:pPr");
  const style = doc.createElementNS(WORD_NS, "w:pStyle");
  style.setAttributeNS(WORD_NS, "w:val", styleId);
  props.appendChild(style);
  return props;
}

function createFootnoteNumberRun(doc) {
  const run = doc.createElementNS(WORD_NS, "w:r");
  const props = doc.createElementNS(WORD_NS, "w:rPr");
  const style = doc.createElementNS(WORD_NS, "w:rStyle");
  style.setAttributeNS(WORD_NS, "w:val", "FootnoteReference");
  const vertAlign = doc.createElementNS(WORD_NS, "w:vertAlign");
  vertAlign.setAttributeNS(WORD_NS, "w:val", "superscript");
  props.appendChild(style);
  props.appendChild(vertAlign);
  run.appendChild(props);
  run.appendChild(doc.createElementNS(WORD_NS, "w:footnoteRef"));
  return run;
}

async function ensureFootnoteRelationship(zip) {
  const path = "word/_rels/document.xml.rels";
  const relsXml = zip.file(path) ? await zip.file(path).async("text") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"/>`;
  const doc = parseXml(relsXml);
  const hasRel = Array.from(doc.getElementsByTagNameNS(REL_NS, "Relationship")).some((node) => node.getAttribute("Type") === FOOTNOTE_REL);
  if (!hasRel) {
    const ids = Array.from(doc.getElementsByTagNameNS(REL_NS, "Relationship")).map((node) => Number((node.getAttribute("Id") || "").replace(/^rId/i, ""))).filter(Number.isFinite);
    const rel = doc.createElementNS(REL_NS, "Relationship");
    rel.setAttribute("Id", `rId${Math.max(0, ...ids) + 1}`);
    rel.setAttribute("Type", FOOTNOTE_REL);
    rel.setAttribute("Target", "footnotes.xml");
    doc.documentElement.appendChild(rel);
  }
  zip.file(path, serializeXml(doc));
}

async function ensureFootnoteContentType(zip) {
  const path = "[Content_Types].xml";
  const xml = await readZipText(zip, path);
  const doc = parseXml(xml);
  const hasOverride = Array.from(doc.getElementsByTagName("Override")).some((node) => node.getAttribute("PartName") === "/word/footnotes.xml");
  if (!hasOverride) {
    const override = doc.createElement("Override");
    override.setAttribute("PartName", "/word/footnotes.xml");
    override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml");
    doc.documentElement.appendChild(override);
  }
  zip.file(path, serializeXml(doc));
}
