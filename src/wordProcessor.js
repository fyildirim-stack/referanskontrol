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
  const missing = citations.filter((citation) => !isCitationMatched(citation.keys, referenceKeys, references));
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
    (fp) => fp.keys.length > 0 && !isCitationMatched(fp.keys, referenceKeys, references)
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

function filterRunningHeaders(lines) {
  if (lines.length < 5) return lines;

  // Helper: strip leading/trailing page numbers for fuzzy header matching
  const normalizeForHeaderMatch = (text) =>
    text.trim().replace(/^\d{1,4}\s+/, "").replace(/\s+\d{1,4}$/, "").trim();

  // 1) Detect exact-text repeats across 3+ pages (running header/footer)
  const textPageMap = new Map();
  const fuzzyPageMap = new Map();
  lines.forEach(l => {
    const t = l.text.trim();
    if (t.length < 3) return;
    // Exact match
    if (!textPageMap.has(t)) textPageMap.set(t, new Set());
    textPageMap.get(t).add(l.pageNumber);
    // Fuzzy match (strip page numbers)
    const fuzzy = normalizeForHeaderMatch(t);
    if (fuzzy.length >= 5) {
      if (!fuzzyPageMap.has(fuzzy)) fuzzyPageMap.set(fuzzy, new Set());
      fuzzyPageMap.get(fuzzy).add(l.pageNumber);
    }
  });
  const repeatedTexts = new Set();
  for (const [t, pages] of textPageMap.entries()) {
    if (pages.size >= 3) repeatedTexts.add(t);
  }
  const repeatedFuzzyTexts = new Set();
  for (const [t, pages] of fuzzyPageMap.entries()) {
    if (pages.size >= 3) repeatedFuzzyTexts.add(t);
  }

  // 2) Detect isolated top/bottom lines per page (gap-based)
  const byPage = new Map();
  lines.forEach(l => {
    if (!byPage.has(l.pageNumber)) byPage.set(l.pageNumber, []);
    byPage.get(l.pageNumber).push(l);
  });

  const isolatedSet = new Set();
  for (const [, pageLines] of byPage.entries()) {
    if (pageLines.length < 4) continue;
    const sorted = [...pageLines].sort((a, b) => b.y - a.y);

    // Compute content gaps (skip first 2 lines for the median)
    const contentGaps = [];
    for (let i = 3; i < sorted.length; i++) {
      const g = sorted[i - 1].y - sorted[i].y;
      if (g > 3 && g < 50) contentGaps.push(g);
    }
    if (contentGaps.length === 0) continue;
    contentGaps.sort((a, b) => a - b);
    const typicalGap = contentGaps[Math.floor(contentGaps.length / 2)];

    // Top line isolated check
    const topGap = sorted[0].y - sorted[1].y;
    if (topGap > typicalGap * 2 && !isReferenceStart(sorted[0].text)) {
      isolatedSet.add(sorted[0]);
    }

    // Top two lines forming a header block — if they are both isolated
    // from the content, filter them unconditionally (even if they pass
    // isReferenceStart, because real references do not float above the
    // bibliography body with a large gap).
    if (sorted.length > 2) {
      const secondGap = sorted[1].y - sorted[2].y;
      if (secondGap > typicalGap * 2.5) {
        isolatedSet.add(sorted[0]);
        isolatedSet.add(sorted[1]);
      }
    }

    // Bottom footer / page number
    if (sorted.length > 2) {
      const bottomGap = sorted[sorted.length - 2].y - sorted[sorted.length - 1].y;
      if (bottomGap > typicalGap * 2.5 && /^\d{1,4}$/.test(sorted[sorted.length - 1].text.trim())) {
        isolatedSet.add(sorted[sorted.length - 1]);
      }
    }
  }

  return lines.filter(l => {
    const t = l.text.trim();
    if (repeatedTexts.has(t)) return false;
    if (repeatedFuzzyTexts.has(normalizeForHeaderMatch(t))) return false;
    if (isolatedSet.has(l)) return false;
    if (/^\d{1,4}$/.test(t)) return false;
    return true;
  });
}

function reorderColumnsInBibLines(bibLines) {
  if (bibLines.length < 3) return bibLines;

  // Group lines by page
  const byPage = new Map();
  bibLines.forEach(l => {
    if (!byPage.has(l.pageNumber)) byPage.set(l.pageNumber, []);
    byPage.get(l.pageNumber).push(l);
  });

  // Detect consistent gutter across pages
  let detectedMidX = 0;
  let detectedPages = 0;

  for (const [, pageLines] of byPage.entries()) {
    if (pageLines.length < 3) continue;

    // Group lines at same y-level
    const yGroups = new Map();
    for (const line of pageLines) {
      let foundY = null;
      for (const existingY of yGroups.keys()) {
        if (Math.abs(existingY - line.y) < 6) {
          foundY = existingY;
          break;
        }
      }
      if (foundY !== null) {
        yGroups.get(foundY).push(line);
      } else {
        yGroups.set(line.y, [line]);
      }
    }

    // Lines at same y-level with 2+ items → two-column candidate
    const gutterCandidates = [];
    for (const [, group] of yGroups.entries()) {
      if (group.length >= 2) {
        group.sort((a, b) => a.minX - b.minX);
        for (let j = 0; j < group.length - 1; j++) {
          const leftEnd = group[j].maxX || (group[j].minX + 200);
          const rightStart = group[j + 1].minX;
          const gap = rightStart - leftEnd;
          if (gap > 20) {
            gutterCandidates.push((leftEnd + rightStart) / 2);
          }
        }
      }
    }

    if (gutterCandidates.length >= 2) {
      gutterCandidates.sort((a, b) => a - b);
      const median = gutterCandidates[Math.floor(gutterCandidates.length / 2)];
      detectedMidX = (detectedMidX * detectedPages + median) / (detectedPages + 1);
      detectedPages++;
    }
  }

  if (detectedPages === 0) return bibLines;

  // Reorder: for each page, split lines into left/right columns,
  // then output left-top-to-bottom, right-top-to-bottom
  const result = [];
  for (const [, pageLines] of byPage.entries()) {
    const leftLines = [];
    const rightLines = [];

    for (const line of pageLines) {
      const center = (line.minX + (line.maxX || line.minX + 100)) / 2;
      if (center < detectedMidX) {
        leftLines.push(line);
      } else {
        rightLines.push(line);
      }
    }

    leftLines.sort((a, b) => b.y - a.y);
    rightLines.sort((a, b) => b.y - a.y);

    result.push(...leftLines, ...rightLines);
  }

  return result;
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
          maxX: line.maxX || 0,
          y: line.y,
          pageNumber: page.pageNumber,
        });
      }
    });
  });

  const headingIndex = allLines.findIndex(l => isReferencesHeading(l.text));
  
  const bodyLines = headingIndex === -1 ? allLines : allLines.slice(0, headingIndex);
  let bibLines = headingIndex === -1 ? [] : allLines.slice(headingIndex + 1);

  // Truncate bibliography lines when hitting an Appendix/Ekler section
  const appendixIndex = bibLines.findIndex(l => 
    /^(EKLER|EK\s+\d+|APPENDIX|APPENDICES|Appendix|Appendices|Ekler)\b/i.test(l.text.trim())
  );
  if (appendixIndex !== -1) {
    bibLines = bibLines.slice(0, appendixIndex);
  }

  bibLines = filterRunningHeaders(bibLines);
  bibLines = reorderColumnsInBibLines(bibLines);

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
      const lastWord = currentBody.text.split(/\s+/).at(-1) || "";
      const isUrlHyphen = currentBody.text.endsWith("-") && (lastWord.includes("/") || lastWord.includes("http") || lastWord.includes("www."));
      if (isUrlHyphen) {
        currentBody.text += line.text;
      } else if (currentBody.text.endsWith("-")) {
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

  // Group bibLines by page
  const bibLinesByPage = new Map();
  bibLines.forEach(l => {
    if (!bibLinesByPage.has(l.pageNumber)) {
      bibLinesByPage.set(l.pageNumber, []);
    }
    bibLinesByPage.get(l.pageNumber).push(l);
  });

  const pageBaseMargins = new Map();
  const pageLineSpacings = new Map();
  const pageHangingIndentFlags = new Map();

  for (const [pageNum, lines] of bibLinesByPage.entries()) {
    const longLines = lines.filter(l => l.text.length > 15);
    const baseMargin = longLines.length > 0 ? Math.min(...longLines.map(l => l.minX)) : 50;
    pageBaseMargins.set(pageNum, baseMargin);

    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      if (gap > 5 && gap < 30) {
        gaps.push(gap);
      }
    }
    gaps.sort((a, b) => a - b);
    const standardSpacing = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 12;
    pageLineSpacings.set(pageNum, standardSpacing);

    const indentedCount = lines.filter(l => l.minX > baseMargin + 5).length;
    const hasHangingIndent = lines.length > 0 && (indentedCount / lines.length > 0.25);
    pageHangingIndentFlags.set(pageNum, hasHangingIndent);
  }

  // Reconstruct bibliography paragraphs
  const bibParagraphs = [];
  let currentBib = null;
  let bibIdx = 0;

  for (let i = 0; i < bibLines.length; i++) {
    const line = bibLines[i];
    if (!currentBib) {
      currentBib = { text: line.text, pageNumber: line.pageNumber };
      continue;
    }

    const cleanText = line.text.trim();
    const startsWithUrl = /^https?:\/\//i.test(cleanText);
    const startsWithAccessDate = /^\((?:Erişim(?:\s+Tarihi)?|Access(?:\s+Date)?|Accessed|Son\s+Erişim)/i.test(cleanText);

    const prevLine = bibLines[i - 1];
    const isSamePage = prevLine.pageNumber === line.pageNumber;
    const pageBaseMargin = pageBaseMargins.get(line.pageNumber) || 50;
    const pageLineSpacing = pageLineSpacings.get(line.pageNumber) || 12;
    const hasHangingIndent = pageHangingIndentFlags.get(line.pageNumber) || false;

    const isIndented = line.minX > pageBaseMargin + 4;
    const verticalGap = isSamePage ? (prevLine.y - line.y) : 999;
    const isTightSpacing = isSamePage && (verticalGap <= pageLineSpacing + 3);

    let isContinuation = false;
    const endsWithHyphen = currentBib.text.endsWith("-");
    const firstLetterMatch = cleanText.match(/\p{L}/u);
    const startsWithLowercase = firstLetterMatch && 
                                firstLetterMatch[0] === firstLetterMatch[0].toLowerCase() && 
                                firstLetterMatch[0] !== firstLetterMatch[0].toUpperCase();

    const yearMatchInCurrent = findYearInReference(currentBib.text);
    let currentEndsWithYear = false;
    if (yearMatchInCurrent) {
      const indexAfterYear = yearMatchInCurrent.index + yearMatchInCurrent[0].length;
      const textAfterYear = currentBib.text.slice(indexAfterYear).trim();
      if (textAfterYear.length < 5) {
        currentEndsWithYear = true;
      }
    }

    if (endsWithHyphen || startsWithUrl || startsWithAccessDate || startsWithLowercase || currentEndsWithYear) {
      isContinuation = true;
    } else if (isSamePage) {
      if (hasHangingIndent) {
        isContinuation = isIndented || !isReferenceStart(cleanText);
      } else {
        isContinuation = !isReferenceStart(cleanText);
      }
    } else {
      isContinuation = !isReferenceStart(cleanText);
    }

    if (isContinuation) {
      const lastWord = currentBib.text.split(/\s+/).at(-1) || "";
      const isUrlHyphen = currentBib.text.endsWith("-") && (lastWord.includes("/") || lastWord.includes("http") || lastWord.includes("www."));
      if (isUrlHyphen) {
        currentBib.text += line.text;
      } else if (currentBib.text.endsWith("-")) {
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
  const missing = citations.filter((citation) => !isCitationMatched(citation.keys, referenceKeys, references));
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
    (fp) => fp.keys.length > 0 && !isCitationMatched(fp.keys, referenceKeys, references)
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

export function isCitationMatched(citationKeys, referenceKeys, references) {
  return citationKeys.some(key => referenceKeys.has(key));
}

