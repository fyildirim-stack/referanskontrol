export function findCitations(text, paragraphIndex) {
  const matches = [];
  const occupied = [];
  const parenthetical = /\(([^()]{0,280}\b(?:(?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.|t\.s\.|ts\.)\b[^()]*)\)/giu;
  const narrative = /([\p{Lu}][\p{L}'-]+(?:\s+(?:ve|and|&)\s+[\p{Lu}][\p{L}'-]+|\s+et al\.)?)\s*\(((?:(?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.|t\.s\.|ts\.))\)/gu;

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
    const authorPart = match[1];
    if (!isPlausibleCitationAuthorPart(authorPart)) continue;
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
  const containsYear = /\b(?:19|20)\d{2}[a-z]?\b/i.test(content) || /\b(?:n\.d\.|t\.y\.|t\.s\.|ts\.)\b/i.test(content);
  return containsYear && /[\p{L}]/u.test(content) && !/^(?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.|t\.s\.|ts\.$/i.test(content.trim());
}

export function splitCitationContent(content) {
  return content.split(";").map((part) => part.trim()).filter(Boolean);
}

export function parseCitationPart(part) {
  const yearMatch = part.match(/\b((?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.|t\.s\.|ts\.)\b/i);
  if (!yearMatch) return null;
  const authorPart = part.slice(0, yearMatch.index).replace(/\b(see|bkz|cf|e\.g\.|ör\.|örn)\b\.?/giu, "").trim();
  if (!authorPart || !isPlausibleCitationAuthorPart(authorPart)) return null;
  const authors = extractCitationAuthors(authorPart);
  if (!authors.length) return null;
  return { keys: authors.map((author) => makeKey(author, yearMatch[1])) };
}

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

export function extractCitationAuthors(authorPart) {
  const cleaned = authorPart.replace(/\b(?:et al|vd)\.?/giu, "").replace(/\s+/g, " ");
  return cleaned.split(/\s*(?:,?\s*&\s*|,?\s+and\s+|,?\s+ve\s+|,|[\u2013\u2014]|\s+-\s*|\s*-\s+)\s*/iu).map(cleanAuthor).filter(Boolean);
}

export function isPlausibleCitationAuthorPart(authorPart) {
  const cleaned = authorPart.replace(/\b(?:et al|vd)\.?/giu, "").trim();
  if (!cleaned || /\d/.test(cleaned)) return false;
  
  const folded = foldTurkish(cleaned);
  const FORBIDDEN_KEYWORDS = /\b(?:yayin|press|publisher|edition|editor|cev|trans|tezi|tez|dissertation|universite|enstitu|dergi|journal|cilt|vol|sayi|issue|no|ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik|january|february|march|april|may|june|july|august|september|october|november|december|erisim|accessed|access|url|web|http|https|www|istanbul|ankara|bursa|izmir|konya|erzurum|kayseri|sivas|london|new\s+york|chicago|boston|oxford|cambridge|antlasmasi|antlasma|anlasmasi|anlasma|sozlesmesi|sozlesme|kanunu|kanun|yonetmeligi|yonetmelik|karari|karar|raporu|rapor|bildirgesi|bildirge|genelgesi|genelge|tuzugu|tuzuk|belgesi|belge|green\s+paper|white\s+paper|agreement|treaty|directive|regulation|protocol|declaration)\b/i;
  if (FORBIDDEN_KEYWORDS.test(folded)) return false;

  const hasCityPublisher = /[\p{L}]:\s*\p{L}/u.test(cleaned);
  if (hasCityPublisher) return false;

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
  const normalized = String(year).toLowerCase().replace(/\s+/g, "").replace(/\.+$/g, "");
  if (normalized === "n.d" || normalized === "t.y" || normalized === "ts" || normalized === "t.s" || normalized === "nodate") return "nodate";
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
