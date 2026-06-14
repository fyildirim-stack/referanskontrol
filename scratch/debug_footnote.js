import { findYearInReference, getActualAuthorSegment } from '../src/isnadFormatter.js';
import { extractReferenceAuthors, extractReferenceAliases } from '../src/isnadFormatter.js';
import { makeKey } from '../src/citationFinder.js';

const text = `Ahmet Emir Yılmaz, “Görsel Öğrenme Aracı Olarak İnfografikler: Eğitimdeki Rolü ve Önemi”, The Journal of Open Learning and Distance Education 3 (2024), 14; Furkan Atan - Hüseyin Kocasaraç, “Dijital Öğrenme-Öğretme Araçları”, Medeniyet Eğitim Araştırmaları Dergisi 6/2 (Aralık 2022), 1; İnci Pürlüsoy- Gülçin Cankız Elibol, “İlkokul Eğitim Mekânlarında Mekânsal İhtiyaçların Eğitim Yaklaşımları Açısından Araştırılması”, Mimarlık Bilimleri ve Uygulamaları Dergisi 7/1 (Temmuz 2022), 190; Serhat Anıktar, Yeni Nesil İlkokullarda Öğrenme Ortamları Tasarım Destek Kılavuzu (İstanbul: Yıldız Teknik Üniversitesi, Fen Bilimleri Enstitüsü, Doktora Tezi, 2017), 17.`;

const parts = text.split(';').map(p => p.trim()).filter(Boolean);

parts.forEach((part, idx) => {
  console.log(`\nPart ${idx + 1}: "${part}"`);
  const yearMatch = findYearInReference(part);
  console.log(`YearMatch:`, yearMatch);
  if (yearMatch && yearMatch.index < 280) {
    const authorSegment = getActualAuthorSegment(part, yearMatch);
    console.log(`AuthorSegment: "${authorSegment}"`);
    if (authorSegment && /[\p{L}]/u.test(authorSegment)) {
      const authors = extractReferenceAuthors(authorSegment);
      console.log(`Authors:`, authors);
      if (authors.length > 0) {
        const year = yearMatch[1];
        const aliases = extractReferenceAliases(authorSegment, year);
        const keys = [...new Set([...authors.map((author) => makeKey(author, year)), ...aliases])];
        console.log(`Generated Keys:`, keys);
      }
    }
  }
});
