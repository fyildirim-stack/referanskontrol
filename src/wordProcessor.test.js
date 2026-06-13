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
    expect(ref.structured.container).toBe("Publishing Press");
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
});

describe("PDF Analysis Tests", () => {
  it("should export analyzePdf function", () => {
    expect(typeof analyzePdf).toBe("function");
  });
});
