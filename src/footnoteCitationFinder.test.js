import { describe, it, expect } from "vitest";
import { findFootnoteCitations } from "./footnoteCitationFinder.js";

describe("Footnote Citation Finder Tests", () => {
  it("should detect short APA pattern in footnote with parenthetical citation", () => {
    const footnotes = [{ id: "1", text: "(Smith, 2020)" }];
    const result = findFootnoteCitations(footnotes);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("footnote-inline");
    expect(result[0].keys).toContain("smith:2020");
  });

  it("should detect narrative APA pattern in footnote", () => {
    const footnotes = [{ id: "1", text: "Smith (2020) says..." }];
    const result = findFootnoteCitations(footnotes);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("footnote-inline");
    expect(result[0].keys).toContain("smith:2020");
  });

  it("should detect citation pattern in footnote and extract keys", () => {
    const footnotes = [
      { id: "1", text: "Yılmaz, A., Kitap Adı (2020), s. 45." },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result).toHaveLength(1);
    expect(result[0].keys.length).toBeGreaterThan(0);
    expect(result[0].keys.some((k) => k.includes("2020"))).toBe(true);
  });

  it("should resolve repeat footnote pattern (a.g.e.)", () => {
    const footnotes = [
      { id: "1", text: "(Smith, 2020)" },
      { id: "2", text: "A.g.e., s. 50." },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("footnote-inline");
    expect(result[1].kind).toBe("footnote-repeat");
    expect(result[1].keys).toEqual(result[0].keys);
    expect(result[1].resolvedFrom).toBe("1");
  });

  it("should resolve chained repeat patterns", () => {
    const footnotes = [
      { id: "1", text: "(Smith, 2020)" },
      { id: "2", text: "A.g.e., s. 50." },
      { id: "3", text: "A.g.m., s. 55." },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result[0].kind).toBe("footnote-inline");
    expect(result[1].kind).toBe("footnote-repeat");
    expect(result[1].keys).toEqual(result[0].keys);
    expect(result[2].kind).toBe("footnote-repeat");
    expect(result[2].keys).toEqual(result[0].keys);
  });

  it("should mark unresolved footnote text as unresolved", () => {
    const footnotes = [{ id: "1", text: "Burada hiçbir atıf bilgisi yok." }];
    const result = findFootnoteCitations(footnotes);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("footnote-unresolved");
    expect(result[0].keys).toEqual([]);
  });

  it("should handle ibid pattern", () => {
    const footnotes = [
      { id: "1", text: "(Doe, 2019)" },
      { id: "2", text: "Ibid." },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result[1].kind).toBe("footnote-repeat");
    expect(result[1].keys).toEqual(result[0].keys);
  });

  it("should handle op. cit. pattern", () => {
    const footnotes = [
      { id: "1", text: "Johnson, A., Title (2021)" },
      { id: "2", text: "Op. cit., p. 30." },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result[1].kind).toBe("footnote-repeat");
    expect(result[1].resolvedFrom).toBe("1");
  });

  it("should handle unresolved repeat pattern when no previous footnote", () => {
    const footnotes = [{ id: "1", text: "A.g.e., s. 10." }];
    const result = findFootnoteCitations(footnotes);
    expect(result[0].kind).toBe("footnote-unresolved");
    expect(result[0].keys).toEqual([]);
  });

  it("should extract citations with multiple authors", () => {
    const footnotes = [
      { id: "1", text: "(Smith, 2020; Doe, 2019)" },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result[0].keys.length).toBeGreaterThanOrEqual(2);
  });

  it("should ignore repeated citations with same pattern", () => {
    const footnotes = [
      { id: "1", text: "(Brown, 2018)" },
      { id: "2", text: "(Brown, 2018)" },
    ];
    const result = findFootnoteCitations(footnotes);
    expect(result[0].keys).toEqual(result[1].keys);
    expect(result[0].kind).toBe("footnote-inline");
    expect(result[1].kind).toBe("footnote-inline");
  });

  it("should resolve shortened footnote citation using references list", () => {
    const references = [
      {
        keys: ["yazıcı:2012"],
        structured: {
          title: "Bir Eğitim-Öğretim Kurumu Olarak Cami",
          authors: [{ family: "Yazıcı", given: "Nesimi", full: "Nesimi Yazıcı" }]
        }
      }
    ];
    const footnotes = [
      { id: "1", text: "Nesimi Yazıcı, “Bir Eğitim-Öğretim Kurumu Olarak Cami”" }
    ];
    const result = findFootnoteCitations(footnotes, references);
    expect(result[0].kind).toBe("footnote-shortened");
    expect(result[0].keys).toContain("yazıcı:2012");
  });

  it("should resolve shortened footnote citation without quotation marks", () => {
    const references = [
      {
        keys: ["kasifi:nodate"],
        structured: {
          title: "Reşeḥât ʿAynü’l-ḥayât",
          authors: [{ family: "Kâşifî", given: "Fahrüddîn Alî Safî", full: "Kâşifî, Fahrüddîn Alî Safî b. Hüseyn Vâiz" }]
        }
      }
    ];
    const footnotes = [
      { id: "1", text: "Kâşifî, Reşeḥât, 88." }
    ];
    const result = findFootnoteCitations(footnotes, references);
    expect(result[0].kind).toBe("footnote-shortened");
    expect(result[0].keys).toContain("kasifi:nodate");
  });

  it("should resolve footnotes containing multiple citations separated by semicolons", () => {
    const references = [
      {
        keys: ["barthold:1973"],
        structured: {
          title: "İslam Medeniyeti Tarihi",
          authors: [{ family: "Barthold", given: "W", full: "Barthold, W." }]
        }
      },
      {
        keys: ["hodgson:1995"],
        structured: {
          title: "İslam’ın Serüveni",
          authors: [{ family: "Hodgson", given: "M.G.S.", full: "Hodgson, M.G.S." }]
        }
      }
    ];
    const footnotes = [
      { id: "1", text: "Barthold, İslam Medeniyeti Tarihi, 69; Hodgson, İslam’ın Serüveni, 2/472." }
    ];
    const result = findFootnoteCitations(footnotes, references);
    expect(result[0].keys).toContain("barthold:1973");
    expect(result[0].keys).toContain("hodgson:1995");
  });
});
