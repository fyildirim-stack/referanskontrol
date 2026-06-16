/**
 * Metin normalizasyon ve benzerlik yardımcıları (eşleştirme için)
 *
 * Türkçe-duyarlı katlama (folding) + NFD ile diakritik soyma yapar; böylece
 * "Kâşifî" → "kasifi", "café" → "cafe", "İnönü" → "inonu" tutarlı biçimde
 * eşleşir. Ayrıca bulanık eşleştirme için Levenshtein ve Dice (bigram) benzerliği
 * sağlar.
 */

// Türkçe harfleri ASCII tabanlarına katla (büyük/küçük fark etmeksizin).
const TURKISH_FOLD = {
  İ: 'i', I: 'i', ı: 'i', i: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ç: 'c', ç: 'c',
  Ö: 'o', ö: 'o',
  Ü: 'u', ü: 'u',
};

/** Türkçe karakterleri ASCII'ye katlar (yalnızca harf eşlemesi). */
export function foldTurkish(str) {
  return String(str || '').replace(/[İIıiŞşĞğÇçÖöÜü]/g, (ch) => TURKISH_FOLD[ch]);
}

/**
 * Eşleştirme için normalize edilmiş dize:
 * Türkçe katlama → NFD diakritik soyma → küçük harf → yalnızca alnum+boşluk →
 * boşluk sıkıştırma.
 */
export function normalizeForMatch(str) {
  if (!str) return '';
  return foldTurkish(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // kalan birleşik diakritikleri sil (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Türkçe zaten ASCII'ye katlandı
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Durak sözcükler (TR + EN), normalizeForMatch çıktısıyla aynı (katlanmış) biçimde
 * tutulur ki token karşılaştırması doğru çalışsın.
 */
export const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'from', 'as', 'is', 'are', 'be', 'this', 'that', 'study', 'analysis',
  'research', 'approach', 'using', 'based', 'new', 'case',
  // Turkish (katlanmış)
  've', 'ile', 'bir', 'bu', 'de', 'da', 'icin', 'olarak', 'uzerine', 'uzerinde',
  'calisma', 'analiz', 'arastirma', 'inceleme', 'yeni', 'ornek',
]);

/**
 * Normalize edilmiş metni anlamlı kelimelere böler (durak sözcükler ve tek
 * harfler atılır).
 */
export function meaningfulTokens(normalized) {
  return normalized
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Levenshtein düzenleme mesafesi. */
export function levenshtein(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  const cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/** Levenshtein tabanlı benzerlik oranı (0-1; 1 = aynı). */
export function levenshteinRatio(a, b) {
  a = String(a || '');
  b = String(b || '');
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Karakter-bigram tabanlı Sørensen–Dice benzerliği (0-1). Kısa başlıklar için iyi. */
export function diceCoefficient(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a === b) return a.length ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s) => {
    const map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
  };

  const A = bigrams(a);
  const B = bigrams(b);
  let total = 0;
  for (const c of A.values()) total += c;
  for (const c of B.values()) total += c;

  let overlap = 0;
  for (const [bg, c] of A) {
    if (B.has(bg)) overlap += Math.min(c, B.get(bg));
  }
  return total > 0 ? (2 * overlap) / total : 0;
}
