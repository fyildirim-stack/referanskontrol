import { describe, it, expect } from "vitest";
import { findCitations, looksLikeCitation, makeKey } from "./citationFinder.js";
import { parseReference, formatIsnadFootnote, formatIsnadBibliography } from "./isnadFormatter.js";
import { analyzePdf } from "./wordProcessor.js";

describe("Citation Finder Tests", () => {
  it("should detect looksLikeCitation correctly", () => {
    expect(looksLikeCitation("Smith, 2020")).toBe(true);
    expect(looksLikeCitation("2020")).toBe(false);
    expect(looksLikeCitation("Smith")).toBe(false);
  });

  it("should generate keys properly", () => {
    expect(makeKey("Smith", "2020")).toBe("smith:2020");
    expect(makeKey("Yılmaz", "t.y.")).toBe("yılmaz:nodate");
  });

  it("should extract parenthetical and narrative citations", () => {
    const text = "Metinde bir atıf var (Smith, 2020) ve bir de anlatı atfı var: Yılmaz (2019) makalesinde.";
    const citations = findCitations(text, 0);
    expect(citations.length).toBe(2);
    expect(citations[0].display).toBe("Smith, 2020");
    expect(citations[0].kind).toBe("parenthetical");
    expect(citations[1].display).toBe("Yılmaz (2019)");
    expect(citations[1].kind).toBe("narrative");
  });
});

describe("ISNAD Formatter Tests", () => {
  it("should parse references correctly", () => {
    const refText = "Smith, J., & Doe, A. (2020). Modern Web Development. Publishing Press.";
    const ref = parseReference(refText, 0);
    expect(ref).not.toBeNull();
    expect(ref.structured.year).toBe("2020");
    expect(ref.structured.title).toBe("Modern Web Development");
    expect(ref.structured.publisher).toBe("Publishing Press");
  });

  it("should format isnad footnote properly", () => {
    const structured = {
      authorText: "J. Smith - A. Doe",
      title: "Modern Web Development",
      container: "Publishing Press",
      year: "2020",
      dateText: "2020",
      type: "book",
      url: ""
    };
    const footnote = formatIsnadFootnote(structured);
    expect(footnote).toBe("J. Smith - A. Doe, Modern Web Development (Publishing Press, 2020).");
  });

  it("should format isnad bibliography properly", () => {
    const structured = {
      bibliographyAuthorText: "Smith, J. - A. Doe",
      title: "Modern Web Development",
      container: "Publishing Press",
      year: "2020",
      dateText: "2020",
      type: "book",
      url: ""
    };
    const bib = formatIsnadBibliography(structured);
    expect(bib).toBe("Smith, J. - A. Doe. Modern Web Development. Publishing Press. 2020.");
  });

  it("should parse chapter references with İçinde and extract publisher/place correctly", () => {
    const text = "Akdemir, E. (2012). Avrupa Bütünleşmesinin Tarihçesi, Avrupa Birliği Tarihçe, Teoriler, Kurumlar ve Politikalar İçinde Akçay, B. ve Göçmen, İ. (Editörler), (s. 37-63). Seçkin Yayınları, Ankara.";
    const ref = parseReference(text, 0);
    expect(ref).not.toBeNull();
    expect(ref.structured.title).toBe("Avrupa Bütünleşmesinin Tarihçesi");
    expect(ref.structured.container).toBe("Avrupa Birliği Tarihçe, Teoriler, Kurumlar ve Politikalar İçinde Akçay, B. ve Göçmen, İ. (Editörler), (s. 37-63)");
    expect(ref.structured.publisher).toBe("Seçkin Yayınları");
    expect(ref.structured.place).toBe("Ankara");
    expect(ref.structured.authors).toHaveLength(1);
    expect(ref.structured.authors[0].family).toBe("Akdemir");
    expect(ref.structured.authors[0].given).toBe("E.");
    
    expect(ref.isnadBibliography).toBe("Akdemir, E. Avrupa Bütünleşmesinin Tarihçesi. Avrupa Birliği Tarihçe, Teoriler, Kurumlar ve Politikalar İçinde Akçay, B. ve Göçmen, İ. (Editörler), (s. 37-63). Ankara: Seçkin Yayınları, 2012.");
    expect(ref.isnadFootnote).toBe("E. Akdemir, Avrupa Bütünleşmesinin Tarihçesi (Avrupa Birliği Tarihçe, Teoriler, Kurumlar ve Politikalar İçinde Akçay, B. ve Göçmen, İ. (Editörler), (s. 37-63), Ankara: Seçkin Yayınları, 2012).");
  });

  it("should parse corporate web references with AccessDate correctly", () => {
    const text = "European Commission. (2024a). “Ninth report on the state of the energy union.” https://energy.ec.europa.eu/strategy/energy-union/ninth-report-state-energy-union_en. (Erişim Tarihi: 15.01.2025).";
    const ref = parseReference(text, 0);
    expect(ref).not.toBeNull();
    expect(ref.structured.title).toBe("Ninth report on the state of the energy union");
    expect(ref.structured.url).toBe("https://energy.ec.europa.eu/strategy/energy-union/ninth-report-state-energy-union_en");
    expect(ref.structured.accessDate).toBe("Erişim Tarihi: 15.01.2025");
    expect(ref.structured.authors).toHaveLength(1);
    expect(ref.structured.authors[0].family).toBe("European Commission");
    expect(ref.structured.authors[0].given).toBe("");
    
    expect(ref.isnadBibliography).toBe("European Commission. “Ninth report on the state of the energy union”. 2024a. https://energy.ec.europa.eu/strategy/energy-union/ninth-report-state-energy-union_en (Erişim Tarihi: 15.01.2025).");
    expect(ref.isnadFootnote).toBe("European Commission, “Ninth report on the state of the energy union” (2024a), https://energy.ec.europa.eu/strategy/energy-union/ninth-report-state-energy-union_en (Erişim Tarihi: 15.01.2025).");
  });
});

describe("PDF Analysis Tests", () => {
  it("should export analyzePdf function", () => {
    expect(typeof analyzePdf).toBe("function");
  });
});
