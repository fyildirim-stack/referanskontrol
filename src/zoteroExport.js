export function buildVerificationRecords(references) {
  return references.map((reference, index) => {
    const csl = toCslJson(reference, index);
    const query = buildLookupQuery(reference);
    const target = buildVerificationTarget(reference, query);
    return {
      id: `src-${index + 1}`,
      display: reference.display,
      title: reference.structured?.title || reference.display,
      author: reference.structured?.authorText || "",
      year: reference.structured?.year || "",
      type: reference.structured?.type || "web",
      doi: extractDoi(reference),
      url: reference.structured?.url || "",
      scholarUrl: target.url,
      verificationUrl: target.url,
      verificationLabel: target.label,
      verificationKind: target.kind,
      query,
      status: inferVerificationStatus(reference),
      csl,
      ris: toRis(reference, csl),
      bibtex: toBibtex(reference, csl),
    };
  });
}

export function exportCslJson(records) {
  return JSON.stringify(records.map((record) => record.csl), null, 2);
}

export function exportRis(records) {
  return records.map((record) => record.ris).join("\n");
}

export function exportBibtex(records) {
  return records.map((record) => record.bibtex).join("\n\n");
}

function toCslJson(reference, index) {
  const item = reference.structured || {};
  return {
    id: `apato-${index + 1}`,
    type: mapCslType(item.type),
    title: item.title || reference.display,
    author: (item.authors || []).map((author) => ({
      family: author.family || author.full,
      given: author.given || "",
    })),
    issued: buildIssuedDate(item.year),
    accessed: { "date-parts": [todayParts()] },
    URL: item.url || undefined,
    DOI: extractDoi(reference) || undefined,
    "container-title": item.container || undefined,
    publisher: item.publisher || undefined,
    "publisher-place": item.place || undefined,
    note: reference.display,
  };
}

function toRis(reference, csl) {
  const lines = [`TY  - ${mapRisType(csl.type)}`];
  (csl.author || []).forEach((author) => lines.push(`AU  - ${[author.family, author.given].filter(Boolean).join(", ")}`));
  lines.push(`TI  - ${csl.title}`);
  if (csl["container-title"]) lines.push(`T2  - ${csl["container-title"]}`);
  if (csl.publisher) lines.push(`PB  - ${csl.publisher}`);
  if (csl["publisher-place"]) lines.push(`CY  - ${csl["publisher-place"]}`);
  if (getIssuedYear(csl)) lines.push(`PY  - ${getIssuedYear(csl)}`);
  if (csl.DOI) lines.push(`DO  - ${csl.DOI}`);
  if (csl.URL) lines.push(`UR  - ${csl.URL}`);
  lines.push(`N1  - Original: ${reference.display}`);
  lines.push("ER  -");
  return lines.join("\n");
}

function toBibtex(reference, csl) {
  const key = makeBibKey(csl);
  let type = "book";
  if (csl.type === "article-journal") type = "article";
  else if (csl.type === "webpage") type = "online";
  else if (csl.type === "chapter") type = "incollection";
  
  const fields = [
    ["title", csl.title],
    ["author", (csl.author || []).map((author) => [author.given, author.family].filter(Boolean).join(" ")).join(" and ")],
    ["year", getIssuedYear(csl)],
    ["journal", csl.type === "article-journal" ? csl["container-title"] : ""],
    ["booktitle", csl.type === "chapter" ? csl["container-title"] : ""],
    ["publisher", csl.publisher || ""],
    ["address", csl["publisher-place"] || ""],
    ["doi", csl.DOI],
    ["url", csl.URL],
    ["note", `Original: ${reference.display}`],
  ].filter(([, value]) => value);
  return `@${type}{${key},\n${fields.map(([name, value]) => `  ${name} = {${escapeBibtex(String(value))}}`).join(",\n")}\n}`;
}

function buildLookupQuery(reference) {
  const item = reference.structured || {};
  return [item.title, item.authorText, item.year].filter(Boolean).join(" ");
}

function buildVerificationTarget(reference, query) {
  const item = reference.structured || {};
  if (item.type === "web" && item.url) {
    return { kind: "web", label: "Web", url: item.url };
  }
  if (item.type === "article") {
    return { kind: "scholar", label: "Scholar", url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}` };
  }
  if (item.type === "book") {
    return { kind: "google", label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(query)}` };
  }
  return { kind: "scholar", label: "Scholar", url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}` };
}

function inferVerificationStatus(reference) {
  if (extractDoi(reference)) return "doi-ready";
  if (reference.structured?.url) return "url-ready";
  return "scholar-needed";
}

function extractDoi(reference) {
  const text = `${reference.display} ${reference.structured?.doi || ""}`;
  return text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0]?.replace(/[).,]+$/g, "") || "";
}

function mapCslType(type) {
  if (type === "article") return "article-journal";
  if (type === "web") return "webpage";
  if (type === "chapter") return "chapter";
  return "book";
}

function mapRisType(type) {
  if (type === "article-journal") return "JOUR";
  if (type === "webpage") return "WEB";
  if (type === "chapter") return "CHAP";
  return "BOOK";
}

function makeBibKey(csl) {
  const family = csl.author?.[0]?.family || "source";
  const year = getIssuedYear(csl) || "nodate";
  const title = csl.title || "item";
  return `${slug(family)}${year}${slug(title).slice(0, 18)}`;
}

function slug(value) {
  return String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]+/g, "");
}

function escapeBibtex(value) {
  return value.replace(/[{}]/g, "");
}

function todayParts() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
}

function buildIssuedDate(year) {
  const numericYear = parseInt(year, 10);
  if (Number.isFinite(numericYear)) return { "date-parts": [[numericYear]] };
  if (year) return { literal: year };
  return undefined;
}

function getIssuedYear(csl) {
  return csl.issued?.["date-parts"]?.[0]?.[0] || csl.issued?.literal || "";
}
