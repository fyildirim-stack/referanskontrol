import { findCitations, makeKey } from "./citationFinder.js";
import { extractReferenceAuthors, extractReferenceAliases, findYearInReference, getActualAuthorSegment } from "./isnadFormatter.js";

const REPEAT_PATTERNS = /^(a\.g\.e\.|a\.g\.m\.|ibid|op\.\s*cit\.|loc\.\s*cit\.)/i;

export function findFootnoteCitations(footnotes, references = []) {
  const result = [];
  const resolved = new Map();

  footnotes.forEach((footnote) => {
    const citation = resolveFootnoteCitation(footnote, resolved, references);
    result.push(citation);
    if (citation.keys && citation.keys.length > 0) {
      resolved.set(footnote.id, citation.keys);
    }
  });

  return result;
}

function resolveFootnoteCitation(footnote, resolved, references) {
  const base = {
    id: footnote.id,
    text: footnote.text,
    kind: "footnote-unresolved",
    keys: [],
  };

  // 1. Try: short APA pattern (Yazar, Yıl) or Yazar (Yıl)
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

  // 2. Try: repeat pattern (a.g.e., ibid, op. cit., etc.)
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

  // 3. Try: full Chicago/ISNAD pattern (Yazar Adı, Başlık, (Yıl), ...)
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

  // 4. Try: shortened footnote citation (matching using references dictionary)
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

function resolveShortenedFootnote(footnoteText, references) {
  if (!references || !references.length) return null;

  // Extract text inside quotation marks
  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/g;
  let match = quoteRegex.exec(footnoteText);
  if (!match) return null;

  const quotedTitle = match[1].trim();
  if (quotedTitle.length < 3) return null;

  // Normalize helper
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
    
    // Check if titles match (either one contains the other)
    const titleMatches = cleanRefTitle.includes(cleanQuoted) || cleanQuoted.includes(cleanRefTitle);
    if (!titleMatches) continue;

    // Check if any author of this reference is mentioned in the footnote text
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
