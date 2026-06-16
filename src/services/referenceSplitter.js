/**
 * Ardışık (concatenated) referansları ayırma
 *
 * PDF metni satır/paragraf sınırlarını güvenilir biçimde korumadığından, birden
 * çok kaynakça girdisi tek bir bloğa birleşebiliyor; örneğin:
 *   "... 33–39. Labonté, R. ve Schrecker, T. (2007) ... Global Health, 3(6).
 *    Leitão, C. A. vd. (2024) ..."
 * Bu fonksiyon, bir cümle-sonu noktalamasından (".", ")", "]", kapanış tırnağı)
 * sonra gelen "Yazar ... (YYYY)" desenini yeni bir referans başlangıcı olarak
 * algılayıp böler.
 *
 * Yanlış bölmeyi önlemek için bir noktadan (".") sonra YALNIZCA güvenli bir
 * referans-sonu varsa böleriz: nokta öncesi tek harf (baş harf, örn. "C.") veya
 * bilinen bir kısaltma (vd., al., ed., Der. ...) ise ya da URL içindeysek bölmeyiz.
 */

// Cümle-sonu noktalaması + boşluk; ardından büyük harfle başlayıp ~90 karakter
// içinde "(YYYY)" (1900-2099) gelen bir segment (yeni referans başlangıcı).
const BOUNDARY =
  /([.)\]"”»])\s+(?=[A-ZÇĞİÖŞÜ][^\n]{0,90}?\((?:19|20)\d{2}[a-z]?\))/gu;

const HAS_YEAR = /\b(?:19|20)\d{2}[a-z]?\b/;

// Noktayla biten ve referans sonu OLMAYAN kısaltmalar (ayrım yapılmaz, küçük harfe indirilir)
const ABBREVIATIONS = new Set([
  'vd', 'al', 'vb', 'vs', 'ed', 'eds', 'der', 'ders', 'bkz', 'cev', 'haz',
  'no', 'vol', 'nr', 'jr', 'sr', 'dr', 'prof', 'pp', 'ss', 'bs', 'c',
]);

/**
 * @param {string} text - Olası birden çok referans içeren ham metin
 * @returns {string[]} Ayrılmış referans metinleri (tek referansta tek elemanlı dizi)
 */
export function splitConcatenatedReferences(text) {
  const t = String(text || '').trim();
  if (!t) return [];

  const cutPoints = [];
  let m;
  BOUNDARY.lastIndex = 0;
  while ((m = BOUNDARY.exec(t)) !== null) {
    const punct = m[1];
    const cutAfter = m.index + m[0].length;

    // Yalnızca "." için doğrulama yap; ")", "]", kapanış tırnağı güçlü sınırlardır.
    if (punct === '.') {
      const before = t.slice(Math.max(0, m.index - 15), m.index);
      // URL bağlamında (normal veya harf-harf boşluklu) bölme
      if (/\/\/|www|https?/i.test(before)) {
        if (BOUNDARY.lastIndex <= m.index) BOUNDARY.lastIndex = m.index + 1;
        continue;
      }
      const wordMatch = before.match(/([\p{L}]+)$/u);
      const word = wordMatch ? wordMatch[1] : '';
      // Tek harf (baş harf / boşluklu URL karakteri) veya bilinen kısaltma → bölme
      if (word.length === 1 || ABBREVIATIONS.has(word.toLowerCase())) {
        if (BOUNDARY.lastIndex <= m.index) BOUNDARY.lastIndex = m.index + 1;
        continue;
      }
    }

    cutPoints.push(cutAfter);
    if (BOUNDARY.lastIndex <= m.index) BOUNDARY.lastIndex = m.index + 1;
  }

  if (cutPoints.length === 0) return [t];

  const rawParts = [];
  let start = 0;
  for (const idx of cutPoints) {
    rawParts.push(t.slice(start, idx).trim());
    start = idx;
  }
  rawParts.push(t.slice(start).trim());

  // Yıl içermeyen parçaları (yanlış bölme) önceki parçaya geri ekle
  const merged = [];
  for (const part of rawParts) {
    if (!part) continue;
    if (merged.length > 0 && !HAS_YEAR.test(part)) {
      merged[merged.length - 1] += ' ' + part;
    } else {
      merged.push(part);
    }
  }

  return merged.filter((p) => p.length > 5);
}
