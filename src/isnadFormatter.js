import { makeKey } from "./citationFinder.js";

export function referenceYearRegex() {
  return /\(((?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.)(?:[^)]*)\)/i;
}

export function parseReference(text, paragraphIndex) {
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

export function parseApaReference(text, authorSegment, yearMatch) {
  const year = yearMatch[1];
  const dateText = yearMatch[0].replace(/[()]/g, "");
  const afterDate = String(text.slice(yearMatch.index + yearMatch[0].length)).replace(/[ \t\r\n]+/g, " ").trim().replace(/^\.\s*/, "");
  const url = afterDate.match(/https?:\/\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const doi = afterDate.match(/https?:\/\/doi\.org\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const withoutUrl = String(afterDate.replace(/https?:\/\/\S+/gi, "")).replace(/[ \t\r\n]+/g, " ").trim().replace(/[.]+$/g, "");
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

export function splitTitleAndContainer(text) {
  const parts = text.split(/(?<=\.)\s+(?=\p{Lu}|\d)/u).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { title: text, container: "" };
  if (parts.length === 1) return { title: parts[0].replace(/[.]+$/g, ""), container: "" };
  return {
    title: parts[0].replace(/[.]+$/g, ""),
    container: parts.slice(1).join(" ").replace(/[.]+$/g, ""),
  };
}

export function parseAuthorNames(authorSegment) {
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
      // Clean name without dots or special chars for fallback
      const cleanFam = part.replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").replace(/[^\p{L}'-]/gu, " ").trim().split(/\s+/).at(-1) || "";
      return { family: cleanFam, given: "", full: part };
    });
}

export function formatBibliographyAuthors(authors, fallback) {
  if (!authors.length) return fallback.replace(/[.]+$/g, "");
  return authors
    .map((author, index) => {
      if (index === 0 && author.given) return `${author.family}, ${author.given}`;
      return author.full;
    })
    .join(" - ");
}

export function inferReferenceType(container, url, doi) {
  if (doi || /\b\d+\s*\(\d+\)|\b\d+\/\d+|\bjournal|dergi|policy|reviews?|energy policy\b/i.test(container)) return "article";
  if (url) return "web";
  if (/\bpress|publisher|university|institute|yayın/i.test(container)) return "book";
  return "book";
}

export function extractReferenceAuthors(authorSegment) {
  return authorSegment
    .split(/\s*(?:,\s*&|,\s*\band\b|\bve\b)\s*/iu)
    .flatMap((part) => part.split(/\s*,\s*(?=[\p{Lu}][\p{L}'-]+\s*,)/u))
    .map((part) => part.split(",")[0].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").replace(/[^\p{L}'-]/gu, " ").trim().split(/\s+/).at(-1) || "")
    .filter(Boolean);
}

export function extractReferenceAliases(authorSegment, year) {
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

export function formatIsnadFootnote(item) {
  if (!item) return "";
  const author = item.authorText || "Yazar belirtilmemiş";
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const container = item.container ? `, ${item.container}` : "";
  const date = item.dateText ? ` (${formatDateText(item.dateText)})` : "";
  const url = item.url ? `, ${item.url}` : "";

  if (item.type === "article") return `${author}, ${title}${container}${date}${url}.`;
  if (item.type === "web") return `${author}, ${title}${container}${date}${url}.`;
  return `${author}, ${item.title || "Başlık belirtilmemiş"}${item.container ? ` (${item.container}, ${item.year})` : ` (${item.year})`}${url}.`;
}

export function formatIsnadBibliography(item) {
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

export function buildIsnadBibliography(references) {
  return [...references]
    .map((reference) => reference.isnadBibliography || formatIsnadBibliography(reference.structured))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "tr"));
}

export function formatDateText(dateText) {
  return String(dateText).replace(/\.+$/g, "");
}
