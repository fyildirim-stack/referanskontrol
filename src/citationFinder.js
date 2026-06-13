export function findCitations(text, paragraphIndex) {
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

export function looksLikeCitation(content) {
  return /\b(?:19|20)\d{2}[a-z]?\b/i.test(content) && /[\p{L}]/u.test(content) && !/^(?:19|20)\d{2}[a-z]?$/i.test(content.trim());
}

export function splitCitationContent(content) {
  return content.split(";").map((part) => part.trim()).filter(Boolean);
}

export function parseCitationPart(part) {
  const yearMatch = part.match(/\b((?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.)\b/i);
  if (!yearMatch) return null;
  const authorPart = part.slice(0, yearMatch.index).replace(/\b(see|bkz|cf|e\.g\.|ör\.|örn)\b\.?/giu, "").trim();
  if (!authorPart || !isPlausibleCitationAuthorPart(authorPart)) return null;
  const authors = extractCitationAuthors(authorPart);
  if (!authors.length) return null;
  return { keys: authors.map((author) => makeKey(author, yearMatch[1])) };
}

export function extractCitationAuthors(authorPart) {
  const cleaned = authorPart.replace(/\b(?:et al|vd)\.?/giu, "").replace(/\s+/g, " ");
  return cleaned.split(/\s*(?:,?\s*&\s*|,?\s+and\s+|,?\s+ve\s+|,)\s*/iu).map(cleanAuthor).filter(Boolean);
}

export function isPlausibleCitationAuthorPart(authorPart) {
  const cleaned = authorPart.replace(/\b(?:et al|vd)\.?/giu, "").trim();
  if (!cleaned || /\d/.test(cleaned)) return false;
  return /^\p{Lu}/u.test(cleaned) || /^[A-Z&.\s-]{2,}$/u.test(cleaned);
}

export function makeKey(author, year) {
  return `${normalize(author)}:${normalizeYear(year)}`;
}

export function cleanAuthor(value) {
  return value.replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").replace(/[^\p{L}'-]/gu, " ").trim().split(/\s+/).at(-1) || "";
}

export function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}0-9]/gu, "");
}

export function normalizeYear(year) {
  const normalized = String(year).toLowerCase().replace(/\s+/g, "");
  if (normalized === "n.d." || normalized === "t.y.") return "nodate";
  return normalized;
}

export function groupMissingCitations(missing) {
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

export function dedupeOverlaps(matches) {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = [];
  for (const match of sorted) {
    if (result.some((item) => rangesOverlap(item, match) && item.display === match.display)) continue;
    result.push(match);
  }
  return result;
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}
