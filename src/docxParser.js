import JSZip from "jszip";

export const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
export const FOOTNOTE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";

export async function readZipText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`${path} dosyası bulunamadı. Geçerli bir .docx seçin.`);
  return file.async("text");
}

export function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error("Word XML içeriği okunamadı.");
  return doc;
}

export function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

export function extractParagraphs(doc) {
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

export function normalizeVisibleText(text) {
  return String(text).replace(/[ \t\r\n]+/g, " ").trim();
}

export function getParagraphText(paragraph, options = {}) {
  const pieces = [];
  collectText(paragraph, pieces, options);
  return pieces.join("");
}

export function collectText(node, pieces, options) {
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

export function rewriteBibliography(doc, analysis) {
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

export function rewriteParagraph(paragraph, chunks, doc) {
  const preserved = Array.from(paragraph.childNodes).filter((node) => node.localName === "pPr");
  while (paragraph.firstChild) paragraph.removeChild(paragraph.firstChild);
  preserved.forEach((node) => paragraph.appendChild(node));
  chunks.forEach((chunk) => {
    if (chunk.type === "text" && chunk.value) paragraph.appendChild(createTextRun(doc, chunk.value));
    if (chunk.type === "footnote") paragraph.appendChild(createFootnoteReferenceRun(doc, chunk.id));
  });
}

export function createParagraph(doc, text) {
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  paragraph.appendChild(createTextRun(doc, text));
  return paragraph;
}

export function createTextRun(doc, text) {
  const run = doc.createElementNS(WORD_NS, "w:r");
  const textNode = doc.createElementNS(WORD_NS, "w:t");
  if (/^\s|\s$/.test(text)) textNode.setAttribute("xml:space", "preserve");
  textNode.textContent = text;
  run.appendChild(textNode);
  return run;
}

export function createFootnoteReferenceRun(doc, id) {
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

export async function getNextFootnoteId(zip) {
  const existing = zip.file("word/footnotes.xml");
  if (!existing) return 1;
  const doc = parseXml(await existing.async("text"));
  const ids = Array.from(doc.getElementsByTagNameNS(WORD_NS, "footnote")).map((node) => Number(node.getAttributeNS(WORD_NS, "id") || "0"));
  return Math.max(0, ...ids) + 1;
}

export async function upsertFootnotes(zip, notes) {
  const existing = zip.file("word/footnotes.xml");
  const doc = existing ? parseXml(await existing.async("text")) : createFootnotesDocument();
  const root = doc.documentElement;
  notes.forEach((note) => root.appendChild(createFootnote(doc, note.id, note.text)));
  zip.file("word/footnotes.xml", serializeXml(doc));
}

export function createFootnotesDocument() {
  const doc = document.implementation.createDocument(WORD_NS, "w:footnotes");
  const root = doc.documentElement;
  root.setAttribute("xmlns:w", WORD_NS);
  root.appendChild(createSpecialFootnote(doc, "-1", "separator"));
  root.appendChild(createSpecialFootnote(doc, "0", "continuationSeparator"));
  return doc;
}

export function createSpecialFootnote(doc, id, separatorName) {
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

export function createFootnote(doc, id, text) {
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

export function createParagraphStyle(doc, styleId) {
  const props = doc.createElementNS(WORD_NS, "w:pPr");
  const style = doc.createElementNS(WORD_NS, "w:pStyle");
  style.setAttributeNS(WORD_NS, "w:val", styleId);
  props.appendChild(style);
  return props;
}

export function createFootnoteNumberRun(doc) {
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

export async function ensureFootnoteRelationship(zip) {
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

export async function ensureFootnoteContentType(zip) {
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
