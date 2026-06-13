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

  // 1. Try inline or narrative APA citation match (e.g. Smith (2020))
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

  // Split footnote by semicolon in case it contains multiple citations
  const parts = footnote.text.split(';').map(p => p.trim()).filter(Boolean);
  const allKeys = [];
  let kind = "footnote-unresolved";

  for (const part of parts) {
    // 2. Try parenthetical or inline citation match
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

    // 3. Try shortened citation match
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

  // 4. Try repeat pattern
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
  }

  return base;
}

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
