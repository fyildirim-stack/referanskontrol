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
    .replace(/(?:Erişim(?:\s+Tarihi)?|Accessed(?:\s+Date)?)[\s:]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, "")
    .replace(/(?:Erişim(?:\s+Tarihi)?|Accessed(?:\s+Date)?)[\s:]*\d{1,2}\s+\p{L}+\s+\d{2,4}/giu, "");

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

export function cleanUrlsInText(text) {
  if (!text) return "";
  let normalized = text.replace(/(https?:\/\/)\s+/gi, "$1");
  let result = "";
  let i = 0;
  while (i < normalized.length) {
    if (normalized.slice(i).match(/^(https?:\/\/|www\.)/i)) {
      const match = normalized.slice(i).match(/^(https?:\/\/|www\.)/i);
      let urlStr = match[0];
      i += match[0].length;
      let tempIdx = i;
      while (tempIdx < normalized.length) {
        const char = normalized[tempIdx];
        if (/\s/.test(char)) {
          const rest = normalized.slice(tempIdx).trim();
          if (
            rest.startsWith("(Erişim") ||
            rest.startsWith("(Access") ||
            rest.startsWith("(accessed") ||
            rest.startsWith("Erişim") ||
            rest.startsWith("Access") ||
            /^\((?:19|20)\d{2}\)/.test(rest) ||
            /^[A-Z]/.test(rest.replace(/^\.\s*/, ""))
          ) {
            break;
          }
          tempIdx++;
          continue;
        }
        if (char === '.' || char === ',' || char === ')') {
          const rest = normalized.slice(tempIdx + 1).trim();
          if (
            rest.startsWith("(Erişim") ||
            rest.startsWith("(Access") ||
            rest.startsWith("(accessed") ||
            rest.startsWith("Erişim") ||
            rest.startsWith("Access") ||
            char === ')' ||
            /^[A-Z]/.test(rest)
          ) {
            break;
          }
        }
        urlStr += char;
        tempIdx++;
      }
      result += urlStr;
      i = tempIdx;
    } else {
      result += normalized[i];
      i++;
    }
  }
  return result;
}

export function parseReference(text, paragraphIndex) {
  const cleanedText = cleanUrlsInText(text);
  const yearMatch = findYearInReference(cleanedText);
  let year = "nodate";
  let dateText = "t.y.";
  let yearIndex = cleanedText.length;
  let yearMatchText = "";

  if (yearMatch) {
    year = yearMatch[1];
    dateText = yearMatch[0].replace(/[()]/g, "");
    yearIndex = yearMatch.index;
    yearMatchText = yearMatch[0];
  }

  const authorSegment = getActualAuthorSegment(cleanedText, yearMatch || { index: yearIndex });
  const authors = parseAuthorNames(authorSegment);
  if (!authors.length) return null;

  let title = "";
  let container = "";

  const quoteRegex = /[“"‘«']([^”"’»']+)[”"’»']/;
  const quoteMatch = cleanedText.match(quoteRegex);
  const isApasque = yearMatch && yearMatch[0] && yearMatch[0].startsWith("(") && yearMatch.index < 250;

  const cleanRegex1 = /(?:Erişim(?:\s+Tarihi)?|Accessed(?:\s+Date)?)[\s:]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi;
  const cleanRegex2 = /(?:Erişim(?:\s+Tarihi)?|Accessed(?:\s+Date)?)[\s:]*\d{1,2}\s+\p{L}+\s+\d{2,4}/giu;
  const accessMatch = cleanedText.match(cleanRegex1) || cleanedText.match(cleanRegex2);
  const accessDate = accessMatch ? accessMatch[0].trim() : "";

  if (quoteMatch) {
    title = quoteMatch[1].trim();
    const afterQuote = cleanedText.slice(quoteMatch.index + quoteMatch[0].length).trim();
    container = afterQuote
      .replace(yearMatchText, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(cleanRegex1, "")
      .replace(cleanRegex2, "")
      .replace(/\(\s*\)/g, "")
      .replace(/[.,\s]+$/, "")
      .trim();
  } else {
    if (isApasque) {
      const afterDate = String(cleanedText.slice(yearMatch.index + yearMatch[0].length)).replace(/[ \t\r\n]+/g, " ").trim().replace(/^\.\s*/, "");
      const withoutUrl = String(afterDate.replace(/https?:\/\/\S+/gi, ""))
        .replace(cleanRegex1, "")
        .replace(cleanRegex2, "")
        .replace(/\(\s*\)/g, "")
        .replace(/[ \t\r\n]+/g, " ")
        .trim()
        .replace(/[.]+$/g, "");
      const titleSplit = splitTitleAndContainer(withoutUrl);
      title = titleSplit.title;
      container = titleSplit.container;
    } else {
      const afterAuthor = cleanedText.slice(authorSegment.length).trim().replace(/^\.\s*/, "");
      const cleanAfterAuthor = afterAuthor
        .replace(yearMatchText, "")
        .replace(cleanRegex1, "")
        .replace(cleanRegex2, "")
        .replace(/\(\s*\)/g, "")
        .trim()
        .replace(/[.,\s]+$/, "");
      const parts = cleanAfterAuthor.split(/\s*\.\s+/);
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

  const url = cleanedText.match(/https?:\/\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const doi = cleanedText.match(/https?:\/\/doi\.org\/\S+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
  const isChapter = /\b(?:İçinde|In)\b/i.test(cleanedText) && !doi && !url;
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
    raw: cleanedText,
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
    accessDate,
  };

  const keys = [];
  authors.forEach((author) => {
    const familyKey = makeKey(author.family, year);
    if (!keys.includes(familyKey)) keys.push(familyKey);

    const authorAliases = getAuthorAliases(author.full, year);
    authorAliases.forEach((alias) => {
      if (!keys.includes(alias)) keys.push(alias);
    });

    const corporateKeywords = /\b(?:commission|union|organization|bakanl[ıi][gğ][ıi]|m[üu]d[üu]rl[üu][gğ][üu]|kurum|enstit[üu]|vak[fıi]|dernek|t\.?c\.?|united nations|world bank|oecd|imf|who|unicef|eurostat|council|agency|office|department|society|association|university|universite|grup|group|committee|assembly|parliament|goverment|hükümet|türk|turk|mill[ıi]|milli|devlet|bakanlar|birli[gğ][iı]|ajans[ıi]?|bundesamt)\b/i;
    if (!corporateKeywords.test(author.family)) {
      const words = author.family.replace(/[^\p{L}'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        const lastWord = words[words.length - 1];
        const lastWordKey = makeKey(lastWord, year);
        if (!keys.includes(lastWordKey)) keys.push(lastWordKey);
      }
    }
  });

  return {
    display: cleanedText,
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
    accessDate: "",
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

  const rawParts = text.split(/(?<!\b[sp]|pp|ed|eds|vol|no|çev|trans|haz)\.\s+(?=\p{Lu}|\d)/iu).map((part) => part.trim()).filter(Boolean);
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

export function normalizeInitials(given) {
  if (!given) return "";
  return given
    .split(/\s+/)
    .map(w => {
      const cleanWord = w.replace(/[.]/g, "");
      if (cleanWord.length === 1 && cleanWord === cleanWord.toUpperCase()) {
        return cleanWord + ".";
      }
      return w;
    })
    .join(" ");
}

export function parseAuthorNames(authorSegment) {
  const cleanSegment = authorSegment.replace(/[.,\s]+$/, "");
  
  // Protect ve/and/& inside parentheses from being used as split points
  const protectedSegment = cleanSegment.replace(/\([^)]*\)/g, (match) =>
    match.replace(/\bve\b/gi, '\x00VE\x00').replace(/\band\b/gi, '\x00AND\x00').replace(/&/g, '\x00AMP\x00')
  );
  const blocks = protectedSegment
    .split(/\s*(?:,\s*&|,\s*\band\b|,\s*\bve\b|\b&\b|\band\b|\bve\b|[\u2013\u2014]|\s+-\s*|\s*-\s+)\s*/iu)
    .map(b => b.replace(/\x00VE\x00/g, 've').replace(/\x00AND\x00/g, 'and').replace(/\x00AMP\x00/g, '&'))
    .map(b => b.trim())
    .filter(Boolean);

  const corporateKeywords = /\b(?:commission|union|organization|bakanl[ıi][gğ][ıi]|m[üu]d[üu]rl[üu][gğ][üu]|kurum|enstit[üu]|vak[fıi]|dernek|t\.?c\.?|united nations|world bank|oecd|imf|who|unicef|eurostat|council|agency|office|department|society|association|university|universite|grup|group|committee|assembly|parliament|goverment|hükümet|türk|turk|mill[ıi]|milli|devlet|bakanlar|birli[gğ][iı]|ajans[ıi]?|bundesamt)\b/i;

  const authors = [];
  for (const block of blocks) {
    const parts = block.split(/\s*,\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const isCorporate = corporateKeywords.test(block);

    if (parts.length === 1) {
      const part = parts[0];
      if (isCorporate) {
        authors.push({ family: part, given: "", full: part });
      } else {
        const words = part.split(/\s+/).filter(Boolean);
        if (words.length > 1) {
          const family = words[words.length - 1].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
          let given = words.slice(0, -1).join(" ").replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
          given = normalizeInitials(given);
          authors.push({
            family,
            given,
            full: part
          });
        } else {
          authors.push({ family: part, given: "", full: part });
        }
      }
    } else {
      if (isCorporate) {
        authors.push({ family: block, given: "", full: block });
      } else {
        for (let i = 0; i < parts.length; i += 2) {
          if (i + 1 < parts.length) {
            const family = parts[i].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
            let given = parts[i + 1].replace(/[()]/g, "").replace(/\b(?:et al|vd)\.?/giu, "").trim();
            given = normalizeInitials(given);
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

export function getAuthorAliases(authorName, year) {
  const aliases = [];
  const explicitAcronyms = [...authorName.matchAll(/\(([A-ZÇĞİÖŞÜ&.\s-]{2,})\)/gu)].map((match) => match[1].replace(/[\s.]/g, ""));
  explicitAcronyms.forEach((alias) => {
    if (alias.length >= 2) aliases.push(makeKey(alias, year));
  });

  const withoutParentheses = authorName.replace(/\([^)]*\)/g, "").replace(/[.]+$/g, "").trim();
  if (/^[A-ZÇĞİÖŞÜ]{2,10}$/u.test(withoutParentheses)) {
    aliases.push(makeKey(withoutParentheses, year));
  }

  if (!withoutParentheses.includes(",")) {
    const acronym = withoutParentheses
      .split(/\s+/)
      .map((word) => word.match(/^\p{Lu}/u)?.[0] || "")
      .join("");
    if (acronym.length >= 2) aliases.push(makeKey(acronym, year));
  }
  return aliases;
}

export function extractReferenceAliases(authorSegment, year) {
  const parts = authorSegment
    .split(/\s*(?:,\s*&|,\s*\band\b|,\s*\bve\b|\b&\b|\band\b|\bve\b|[\u2013\u2014]|\s+-\s*|\s*-\s+)\s*/iu)
    .flatMap(p => p.split(/\s*,\s*/))
    .map(p => p.trim())
    .filter(Boolean);

  const aliases = [];
  parts.forEach(part => {
    getAuthorAliases(part, year).forEach(alias => {
      if (!aliases.includes(alias)) aliases.push(alias);
    });
  });
  return aliases;
}

export function formatIsnadFootnote(item) {
  if (!item) return "";
  const rawAuthor = item.authorText || "Yazar belirtilmemiş";
  const author = rawAuthor.replace(/[.]+$/g, "");
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const url = item.url ? `, ${item.url}` : "";
  const accessInfo = item.accessDate ? ` (${item.accessDate})` : "";

  if (item.type === "article" || item.type === "web") {
    const container = item.container ? `, ${item.container}` : "";
    const date = item.dateText ? ` (${formatDateText(item.dateText)})` : "";
    return `${author}, ${title}${container}${date}${url}${accessInfo}.`;
  }

  const pubPlace = [item.place, item.publisher].filter(Boolean).join(": ");
  const pubInfo = [pubPlace, item.year].filter(Boolean).join(", ");
  const parenContent = item.container ? `${item.container}, ${pubInfo}` : pubInfo;
  return `${author}, ${item.title || "Başlık belirtilmemiş"} (${parenContent})${url}${accessInfo}.`;
}

export function formatIsnadBibliography(item) {
  if (!item) return "";
  const rawAuthor = item.bibliographyAuthorText || item.authorText || "Yazar belirtilmemiş";
  const author = rawAuthor.replace(/[.]+$/g, "");
  const title = item.title ? `“${item.title}”` : "Başlık belirtilmemiş";
  const container = item.container ? `. ${item.container}` : "";
  const url = item.url ? `. ${item.url}` : "";
  const accessInfo = item.accessDate ? ` (${item.accessDate})` : "";

  if (item.type === "article" || item.type === "web") {
    const date = item.dateText ? `. ${formatDateText(item.dateText)}` : "";
    return `${author}. ${title}${container}${date}${url}${accessInfo}.`;
  }

  const pubPlace = [item.place, item.publisher].filter(Boolean).join(": ");
  const pubInfo = [pubPlace, item.year].filter(Boolean).join(", ");
  return `${author}. ${item.title || "Başlık belirtilmemiş"}${container ? `. ${item.container}` : ""}. ${pubInfo}${url}${accessInfo}.`;
}

export function buildIsnadBibliography(references) {
  return [...references]
    .map((reference) => reference.isnadBibliography || formatIsnadBibliography(reference.structured))
    .filter(Boolean);
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
  
  const partsByDot = clean.split(/(?<!\b[sp]|pp|ed|eds|vol|no|çev|trans|haz)\.\s+/iu);
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
