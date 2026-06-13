import { findCitations, makeKey } from "./citationFinder.js";
import { extractReferenceAuthors, extractReferenceAliases, findYearInReference, getActualAuthorSegment } from "./isnadFormatter.js";

const REPEAT_PATTERNS = /^(a\.g\.e\.|a\.g\.m\.|ibid|op\.\s*cit\.|loc\.\s*cit\.)/i;

function splitBySemicolonOutsideQuotes(text) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/[“"«»”]/.test(char)) {
      inQuotes = !inQuotes;
    }
    if (char === ';' && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts.map(p => p.trim()).filter(Boolean);
}

export function findFootnoteCitations(footnotes, references = []) {
  const result = [];
  const resolved = new Map();
  const resolvedHistory = [];

  footnotes.forEach((footnote) => {
    const partTexts = splitBySemicolonOutsideQuotes(footnote.text);
    const resolvedParts = [];
    const footnoteKeys = [];

    partTexts.forEach((partText) => {
      const partRes = resolveFootnotePart(partText, resolvedHistory, references);
      resolvedParts.push(partRes);
      if (partRes.keys && partRes.keys.length > 0) {
        footnoteKeys.push(...partRes.keys);
        resolvedHistory.push({ id: footnote.id, keys: partRes.keys });
      }
    });

    const uniqueKeys = [...new Set(footnoteKeys)];

    let kind = "footnote-unresolved";
    if (resolvedParts.length > 0) {
      const resolvedPart = resolvedParts.find(p => p.kind !== "footnote-unresolved");
      if (resolvedPart) {
        kind = resolvedPart.kind;
      } else {
        kind = resolvedParts[0].kind;
      }
    }

    const citation = {
      id: footnote.id,
      text: footnote.text,
      kind,
      keys: uniqueKeys,
      parts: resolvedParts
    };

    const resolvedFromPart = resolvedParts.find(p => p.resolvedFrom);
    if (resolvedFromPart) {
      citation.resolvedFrom = resolvedFromPart.resolvedFrom;
    }

    result.push(citation);
    if (uniqueKeys.length > 0) {
      resolved.set(footnote.id, uniqueKeys);
    }
  });

  return result;
}

function resolveFootnotePart(partText, resolvedHistory, references) {
  // 1. Try inline or narrative APA citation match (e.g. Smith (2020))
  const hasQuotes = /[“"‘«'”’»]/.test(partText);
  if (!hasQuotes) {
    const inlineCitations = findCitations(partText, 0);
    if (inlineCitations.length > 0) {
      const keys = inlineCitations.flatMap((c) => c.keys).filter(Boolean);
      if (keys.length > 0) {
        return {
          text: partText,
          kind: "footnote-inline",
          keys: [...new Set(keys)],
        };
      }
    }
  }

  // 2. Try parenthetical or inline citation match (full text)
  const yearMatch = findYearInReference(partText);
  if (yearMatch && yearMatch.index < 280) {
    const authorSegment = getActualAuthorSegment(partText, yearMatch);
    if (authorSegment && /[\p{L}]/u.test(authorSegment)) {
      const authors = extractReferenceAuthors(authorSegment);
      if (authors.length > 0) {
        const year = yearMatch[1];
        const aliases = extractReferenceAliases(authorSegment, year);
        const keys = [...new Set([...authors.map((author) => makeKey(author, year)), ...aliases])];
        return {
          text: partText,
          kind: "footnote-fulltext",
          keys,
        };
      }
    }
  }

  // 3. Try shortened citation match
  const shortened = resolveShortenedFootnote(partText, references);
  if (shortened) {
    return {
      text: partText,
      kind: shortened.kind,
      keys: shortened.keys,
    };
  }

  // 4. Try repeat pattern
  const repeatMatch = REPEAT_PATTERNS.exec(partText);
  if (repeatMatch) {
    if (resolvedHistory.length > 0) {
      const lastEntry = resolvedHistory[resolvedHistory.length - 1];
      if (lastEntry && lastEntry.keys && lastEntry.keys.length > 0) {
        return {
          text: partText,
          kind: "footnote-repeat",
          keys: lastEntry.keys,
          resolvedFrom: lastEntry.id,
        };
      }
    }
  }

  return {
    text: partText,
    kind: "footnote-unresolved",
    keys: [],
  };
}

// Custom Turkish Folding
function foldTurkish(str) {
  return str
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .toLowerCase();
}

function cleanWithSpaces(str) {
  return foldTurkish(str)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
        return { keys: ref.keys, kind: "footnote-shortened" };
      }
    }

    // Check 2: Exact title substring match
    if (cleanPart.includes(cleanTitle)) {
      return { keys: ref.keys, kind: "footnote-shortened" };
    }

    // Check 3: Word overlap scoring
    const titleWords = cleanTitle.split(' ').filter(w => w.length > 2);
    if (titleWords.length > 0) {
      const matchingWords = titleWords.filter(w => partWords.includes(w));
      const score = matchingWords.length / titleWords.length;
      
      const firstTitleWord = cleanTitle.split(' ')[0];
      const firstWordMatches = firstTitleWord && firstTitleWord.length > 2 && partWords.includes(firstTitleWord);

      if (score > bestScore && (score >= 0.3 || firstWordMatches)) {
        bestScore = score;
        bestMatch = { keys: ref.keys, kind: "footnote-shortened" };
      }
    }
  }

  return bestMatch;
}
