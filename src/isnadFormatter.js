import { makeKey } from "./citationFinder.js";

export function referenceYearRegex() {
  return /\(((?:19|20)\d{2}[a-z]?|n\.d\.|t\.y\.|t\.s\.|ts\.)(?:[^)]*)\)/i;
}

export function findYearInReference(text) {
  // 1. Try parenthesized year, e.g. (2020) or (Aralık 2020) or (t.y.)
  const parenRegex = /\((?:[^)]*?\s+)?((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)[^)]*?\)/i;
  const parenMatch = text.match(parenRegex);
  if (parenMatch) {
    const res = [parenMatch[0], parenMatch[1]];
    res.index = parenMatch.index;
    return res;
  }

  // 2. Try to find a year near the end of the citation (excluding URLs or access dates)
  const cleanText = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, "")
    .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}\s+\p{L}+\s+\d{2,4}/giu, "");

  const yearRegex = /\b((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)\b/gi;
  let lastMatch = null;
  let match;
  while ((match = yearRegex.exec(cleanText)) !== null) {
    lastMatch = {
      year: match[1],
      matchText: match[0],
      index: match.index
    };
  }
  if (lastMatch) {
    const originalIndex = text.indexOf(lastMatch.year);
    if (originalIndex !== -1) {
      const res = [lastMatch.matchText, lastMatch.year];
      res.index = originalIndex;
      return res;
    }
  }

  // 3. Fallback: search for any year in the text
  const fallbackRegex = /\b((?:19|20)\d{2}[a-z]?|t\.y\.|n\.d\.|t\.s\.|ts\.)\b/i;
  const fallbackMatch = text.match(fallbackRegex);
  if (fallbackMatch) {
    const res = [fallbackMatch[0], fallbackMatch[1]];
    res.index = fallbackMatch.index;
    return res;
  }

  return null;
}

export function getActualAuthorSegment(text, yearMatch) {
  const isApasque = yearMatch && yearMatch[0] && yearMatch[0].startsWith("(") && yearMatch.index < 250;
  if (isApasque) {
    return text.slice(0, yearMatch.index).trim();
  }
  
  const quoteIndex = text.search(/[“"‘«]/);
  if (quoteIndex !== -1 && quoteIndex < 150) {
    return text.slice(0, quoteIndex).trim().replace(/[.,\s]+$/, "");
  }
  
  const dotMatches = [...text.matchAll(/\.\s+/g)];
  for (const match of dotMatches) {
    const idx = match.index;
    if (idx > 150) break;
    const before = text.slice(0, idx).trim();
    const lastWord = before.split(/\s+/).at(-1) || "";
    if (lastWord.length === 1) {
      if (lastWord === lastWord.toLowerCase()) {
        continue;
      }
      const afterDot = text.slice(idx + match[0].length).trim();
      const nextWord = afterDot.split(/\s+/)[0] || "";
      if (/^[\p{L}]\.?$/u.test(nextWord)) {
        continue;
      }
    }
    return before;
  }
  
  return text.slice(0, 80).trim();
}

export function parseReference(text, paragraphIndex) {
  const yearMatch = findYearInReference(text);
  let year = "nodate";
  let dateText = "t.y.";
  let yearIndex = text.length;
  let yearMatchText = "";

  if (yearMatch) {
    year = yearMatch[1];
    dateText = yearMatch[0].replace(/[()]/g, "");
    yearIndex = yearMatch.index;
    yearMatchText = yearMatch[0];
  }

  const authorSegment = getActualAuthorSegment(text, yearMatch || { index: yearIndex });
  const authors = parseAuthorNames(authorSegment);
  if (!authors.length) return null;

  let title = "";
  let container = "";

  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/;
  const quoteMatch = text.match(quoteRegex);
  const isApasque = yearMatch && yearMatch[0] && yearMatch[0].startsWith("(") && yearMatch.index < 250;

  if (quoteMatch) {
    title = quoteMatch[1].trim();
    const afterQuote = text.slice(quoteMatch.index + quoteMatch[0].length).trim();
    container = afterQuote
      .replace(yearMatchText, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, "")
      .replace(/(?:Erişim|Accessed)[\s:]*\d{1,2}\s+\p{L}+\s+\d{2,4}/giu, "")
      .replace(/[.,\s]+$/, "")
      .trim();
  } else {
    if (isApasque) {
      const afterDate = String(text.slice(yearMatch.index + yearMatch[0].length)).replace(/[ \t\r\n]+/g, " ").trim().replace(/^\.\s*/, "");
      const withoutUrl = String(afterDate.replace(/https?:\/\/\S+/gi, "")).replace(/[ \t\r\n]+/g, " ").trim().replace(/[.]+$/g, "");
      const titleSplit = splitTitleAndContainer(withoutUrl);
      title = titleSplit.title;
      container = titleSplit.container;
    } else {
      const afterAuthor = text.slice(authorSegment.length).trim().replace(/^\.\s*/, "");
      const cleanAfterAuthor = afterAuthor.replace(yearMatchText, "").trim().replace(/[.,\s]+$/, "");
      const parts = cleanAfterAuthor.split(/\.\s+/);
      if (parts.length > 0) {
        title = parts[0].trim();
        container = parts.slice(1).join(". ").trim();
      } else {
        title = cleanAfterAuthor;
      }
    }
  }

  title = title.replace(/^[.,\s“"‘«]+|[.,\s”"’»]+$/g, "").trim();
  container = container.replace(/^[.,\s]+|[.,\s]+$/g, "").trim();

  const url = text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const doi = text.match(/https?:\/\/doi\.org\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const isChapter = /\b(?:İçinde|In)\b/i.test(text) && !doi && !url;
  const type = (doi || /\b\d+\s*\(\d+\)|\b\d+\/\d+|\bjournal|dergi|policy|reviews?|energy policy\b/i.test(container)) ? "article" : (url ? "web" : (isChapter ? "chapter" : "book"));

  let publisher = "";
  let place = "";
  if (type === "book" || type === "chapter") {
    const pubInfo = extractPublisherAndPlaceFromContainer(container, type);
    publisher = pubInfo.publisher;
    place = pubInfo.place;
    container = pubInfo.cleanContainer;
  }

  const structured = {
    raw: text,
    authors,
    authorText: authors.map((author) => author.full).join(" - ") || authorSegment,
    bibliographyAuthorText: formatBibliographyAuthors(authors, authorSegment),
    year,
    dateText,
    title,
    container,
    publisher,
    place,
    url,
    doi,
    type,
  };

  const authorKeys = extractReferenceAuthors(authorSegment);
  const keys = [...new Set([...authorKeys.map((author) => makeKey(author, year)), ...extractReferenceAliases(authorSegment, year)])];

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
  const chapterMatch = text.match(/(.*?)\s+(?:,\s*)?(İçinde|içinde|In)\b\s+(.*)/);
  if (chapterMatch) {
    const beforeInside = chapterMatch[1].trim();
    const afterInside = chapterMatch[3].trim();
    
    let chapterTitle = beforeInside;
    let bookTitle = "";
    
    if (beforeInside.includes(".")) {
      const dotIdx = beforeInside.lastIndexOf(".");
      chapterTitle = beforeInside.slice(0, dotIdx).trim();
      bookTitle = beforeInside.slice(dotIdx + 1).trim();
    } else if (beforeInside.includes(",")) {
      const commaIdx = beforeInside.indexOf(",");
      chapterTitle = beforeInside.slice(0, commaIdx).trim();
      bookTitle = beforeInside.slice(commaIdx + 1).trim();
    }
    
    const matchWord = chapterMatch[2];
    const container = `${bookTitle} ${matchWord} ${afterInside}`.trim();
    
    return {
      title: chapterTitle.replace(/^[.,\s“"‘«]+|[.,\s”"’»]+$/g, "").trim(),
      container: container.replace(/^[.,\s]+|[.,\s]+$/g, "").trim()
    };
  }

  const rawParts = text.split(/(?<=\.)\s+(?=\p{Lu}|\d)/u).map((part) => part.trim()).filter(Boolean);
  if (!rawParts.length) return { title: text, container: "" };
  
  const parts = [];
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (parts.length > 0) {
      const prev = parts[parts.length - 1];
      const lastWord = prev.split(/\s+/).at(-1).toLowerCase().replace(/[^\p{L}]/gu, "");
      if (/^(?:s|p|pp|ed|eds|vol|no|cev|trans|haz)$/.test(lastWord)) {
        parts[parts.length - 1] = prev + " " + part;
        continue;
      }
    }
    parts.push(part);
  }

  if (parts.length === 1) return { title: parts[0].replace(/[.]+$/g, ""), container: "" };
  return {
    title: parts[0].replace(/[.]+$/g, ""),
    container: parts.slice(1).join(" ").replace(/[.]+$/g, ""),
  };
}

export function parseAuthorNames(authorSegment) {
  const blocks = authorSegment
    .split(/\s*(?:,\s*&|,\s*\band\b|,\s*\bve\b|\b&\b|\band\b|\bve\b|[\u2013\u2014]|\s+-\s*|\s*-\s+)\s*/iu)
    .map(b => b.trim())
    .filter(Boolean);

  const authors = [];
  for (const block of blocks) {
    const parts = block.split(/\s*,\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    if (parts.length === 1) {
      const part = parts[0];
      const words = part.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        const family = words[words.length - 1].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
        const given = words.slice(0, -1).join(" ").replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
        authors.push({
          family,
          given,
          full: part
        });
      } else {
        authors.push({ family: part, given: "", full: part });
      }
    } else {
      for (let i = 0; i < parts.length; i += 2) {
        if (i + 1 < parts.length) {
          const family = parts[i].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
          const given = parts[i + 1].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
          authors.push({
            family,
            given,
            full: `${given} ${family}`.trim()
          });
        } else {
          const family = parts[i].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
          authors.push({
            family,
            given: "",
            full: family
          });
        }
      }
    }
  }
  return authors;
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
  return parseAuthorNames(authorSegment).map(a => a.family).filter(Boolean);
}

export function extractReferenceAliases(authorSegment, year) {
  const aliases = [];
  const explicitAcronyms = [...authorSegment.matchAll(/\(([A-ZÇĞİÖŞÜ&.\s-]{2,})\)/gu)].map((match) => match[1].replace(/[\s.]/g, ""));
  explicitAcronyms.forEach((alias) => {
    if (alias.length >= 2) aliases.push(makeKey(alias, year));
  });

  const withoutParentheses = authorSegment.replace(/\([^)]*\)/g, "").replace(/[.]+$/g, "").trim();
  if (!withoutParentheses.includes(",")) {
    const acronym = withoutParentheses
      .split(/\s+/)
      .map((word) => word.match(/^\p{Lu}/u)?.[0] || "")
      .join("");
    if (acronym.length >= 2) aliases.push(makeKey(acronym, year));
  }
  return aliases;
}

export function formatIsnadFootnote(item) {
  if (!item) return "";
  const author = item.authorText || "Yazar belirtilmemiş";
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const url = item.url ? `, ${item.url}` : "";

  if (item.type === "article" || item.type === "web") {
    const container = item.container ? `, ${item.container}` : "";
    const date = item.dateText ? ` (${formatDateText(item.dateText)})` : "";
    return `${author}, ${title}${container}${date}${url}.`;
  }

  const pubPlace = [item.place, item.publisher].filter(Boolean).join(": ");
  const pubInfo = [pubPlace, item.year].filter(Boolean).join(", ");
  const parenContent = item.container ? `${item.container}, ${pubInfo}` : pubInfo;
  return `${author}, ${item.title || "Başlık belirtilmemiş"} (${parenContent})${url}.`;
}

export function formatIsnadBibliography(item) {
  if (!item) return "";
  const author = item.bibliographyAuthorText || item.authorText || "Yazar belirtilmemiş";
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const container = item.container ? `. ${item.container}` : "";
  const url = item.url ? `. ${item.url}` : "";

  if (item.type === "article" || item.type === "web") {
    const date = item.dateText ? `. ${formatDateText(item.dateText)}` : "";
    return `${author}. ${title}${container}${date}${url}.`;
  }

  const pubPlace = [item.place, item.publisher].filter(Boolean).join(": ");
  const pubInfo = [pubPlace, item.year].filter(Boolean).join(", ");
  return `${author}. ${item.title || "Başlık belirtilmemiş"}${container ? `. ${item.container}` : ""}. ${pubInfo}${url}.`;
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

export function parsePublisherAndPlace(container) {
  if (!container) return { publisher: "", place: "" };
  const clean = container.replace(/[.]+$/g, "").trim();
  
  if (clean.includes(":")) {
    const parts = clean.split(/\s*:\s*/);
    return {
      place: parts[0].trim(),
      publisher: parts.slice(1).join(": ").trim()
    };
  }
  
  if (clean.includes(",")) {
    const parts = clean.split(/\s*,\s*/);
    const cities = /\b(?:ankara|istanbul|izmir|bursa|konya|sivas|london|new\s*york|boston|chicago|cambridge|oxford|seattle|san\s*francisco|paris|berlin|roma)\b/i;
    if (cities.test(parts[0])) {
      return {
        place: parts[0].trim(),
        publisher: parts.slice(1).join(", ").trim()
      };
    }
    if (cities.test(parts[1])) {
      return {
        publisher: parts[0].trim(),
        place: parts[1].trim()
      };
    }
    const lastPart = parts[parts.length - 1];
    if (cities.test(lastPart)) {
      return {
        publisher: parts.slice(0, -1).join(", ").trim(),
        place: lastPart.trim()
      };
    }
    return {
      publisher: parts[0].trim(),
      place: parts[1].trim()
    };
  }
  
  return {
    publisher: clean,
    place: ""
  };
}

export function extractPublisherAndPlaceFromContainer(container, type) {
  if (!container) return { publisher: "", place: "", cleanContainer: "" };
  const clean = container.replace(/[.]+$/g, "").trim();
  
  const partsByDot = clean.split(/\.\s+/);
  if (partsByDot.length > 1) {
    const lastPart = partsByDot[partsByDot.length - 1];
    const pubInfo = parsePublisherAndPlace(lastPart);
    if (pubInfo.publisher) {
      const lastIdx = clean.lastIndexOf(lastPart);
      const cleanContainer = clean.slice(0, lastIdx).trim().replace(/[.,\s]+$/, "");
      return {
        publisher: pubInfo.publisher,
        place: pubInfo.place,
        cleanContainer
      };
    }
  }
  
  const partsByComma = clean.split(/,\s*/);
  if (partsByComma.length > 2) {
    const lastTwo = partsByComma.slice(-2).join(", ");
    const pubInfo = parsePublisherAndPlace(lastTwo);
    if (pubInfo.publisher && pubInfo.place) {
      const lastIdx = clean.lastIndexOf(partsByComma[partsByComma.length - 2]);
      const cleanContainer = clean.slice(0, lastIdx).trim().replace(/[.,\s]+$/, "");
      return {
        publisher: pubInfo.publisher,
        place: pubInfo.place,
        cleanContainer
      };
    }
    
    const lastOne = partsByComma[partsByComma.length - 1];
    const pubInfoLast = parsePublisherAndPlace(lastOne);
    if (pubInfoLast.publisher && !pubInfoLast.place) {
      const lastIdx = clean.lastIndexOf(lastOne);
      const cleanContainer = clean.slice(0, lastIdx).trim().replace(/[.,\s]+$/, "");
      return {
        publisher: pubInfoLast.publisher,
        place: "",
        cleanContainer
      };
    }
  }
  
  const pubInfo = parsePublisherAndPlace(clean);
  if (pubInfo.publisher) {
    return {
      publisher: pubInfo.publisher,
      place: pubInfo.place,
      cleanContainer: type === "book" ? "" : container
    };
  }
  
  return { publisher: "", place: "", cleanContainer: container };
}

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
