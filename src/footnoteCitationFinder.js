import { findCitations, makeKey } from "./citationFinder.js";
import { extractReferenceAuthors, extractReferenceAliases, referenceYearRegex } from "./isnadFormatter.js";

const REPEAT_PATTERNS = /^(a\.g\.e\.|a\.g\.m\.|ibid|op\.\s*cit\.|loc\.\s*cit\.)/i;

export function findFootnoteCitations(footnotes) {
  const result = [];
  const resolved = new Map();

  footnotes.forEach((footnote) => {
    const citation = resolveFootnoteCitation(footnote, resolved);
    result.push(citation);
    if (citation.keys && citation.keys.length > 0) {
      resolved.set(footnote.id, citation.keys);
    }
  });

  return result;
}

function resolveFootnoteCitation(footnote, resolved) {
  const base = {
    id: footnote.id,
    text: footnote.text,
    kind: "footnote-unresolved",
    keys: [],
  };

  // Try: short APA pattern (Yazar, Yıl) or Yazar (Yıl)
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

  // Try: repeat pattern (a.g.e., ibid, op. cit., etc.)
  const repeatMatch = REPEAT_PATTERNS.exec(footnote.text);
  if (repeatMatch) {
    // Walk back to find the previous resolved footnote
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
    // No previous footnote to resolve from
    return base;
  }

  // Try: full Chicago/ISNAD pattern (Yazar Adı, Başlık, (Yıl), ...)
  const yearMatch = footnote.text.match(referenceYearRegex());
  if (yearMatch && yearMatch.index < 280) {
    const authorSegment = footnote.text.slice(0, yearMatch.index).trim();
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

  return base;
}
