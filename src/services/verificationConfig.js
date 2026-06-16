/**
 * Verification configuration
 *
 * Tüm çevrimiçi doğrulama parametreleri tek yerde. Eşik/ağırlık/retry değerleri
 * burada toplanır ki kod düzenlemeden ince ayar yapılabilsin (A/B test, rate-limit
 * uyumu vb.).
 */

/** Skorlama ağırlıkları (toplam 100). */
export const SCORING_WEIGHTS = { title: 50, author: 25, year: 15, journal: 10 };

/** Bir sonucun aday kabul edilmesi için minimum skor (altı → eşleşme yok). */
export const MIN_MATCH_SCORE = 30;

/** Bir kaynağın "doğrulandı" sayılması için gereken skor. */
export const FOUND_THRESHOLD = 40;

/** Güven seviyesi eşikleri. */
export const CONFIDENCE = { high: 80, medium: 60 };

/** Yazar soyadı bulanık eşleşme oranı eşiği (Levenshtein benzerliği, 0-1). */
export const AUTHOR_SIM_THRESHOLD = 0.85;

/** Yıl toleransı (±N yıl yarı puan alır). */
export const YEAR_TOLERANCE = 1;

/** Tek API isteği zaman aşımı (ms). */
export const API_TIMEOUT_MS = 12000;

/** Aynı anda işlenecek maksimum kaynak (referans) sayısı. */
export const CONCURRENCY = 3;

/** Batch'ler arası gecikme (ms) — kibar rate-limit. */
export const BATCH_DELAY_MS = 300;

/** Retry/backoff ayarları. */
export const RETRY = { maxAttempts: 3, baseDelayMs: 500 };

/**
 * Etkin API kaynakları. Sıralama önemlidir; Semantic Scholar agresif rate-limit
 * uyguladığı için en sona konur (retry/backoff ile yumuşatılır).
 */
export const ENABLED_APIS = [
  'openalex',
  'crossref',
  'openLibrary',
  'googleBooks',
  'semanticScholar',
];
