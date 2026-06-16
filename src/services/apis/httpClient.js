/**
 * Paylaşılan HTTP istemcisi (retry + backoff)
 *
 * Tüm API istemcilerinin ortak fetch kalıbını tek noktada toplar: zaman aşımı,
 * geçici hatalarda (429 / 5xx / timeout) üstel backoff ile yeniden deneme ve
 * `Retry-After` başlığına saygı. Başarısızlıkta (kalıcı hata veya tükenen deneme)
 * `null` döner — mevcut çağıranlar zaten null'ı "sonuç yok" olarak ele alıyor.
 */

import { API_TIMEOUT_MS, RETRY } from '../verificationConfig.js';

/** Yeniden denenebilir HTTP durum kodları. */
export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `Retry-After` başlığını ms'ye çevir (saniye sayısı veya HTTP tarih biçimi). */
function parseRetryAfter(header) {
  if (!header) return NaN;
  const secs = Number(header);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return NaN;
}

/** Backoff süresi: Retry-After varsa ona uy, yoksa jitter'lı üstel artış. */
function backoffDelay(attempt, retryAfterMs, baseDelayMs) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
  const base = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * baseDelayMs;
  return base + jitter;
}

/**
 * JSON döndüren bir uç noktayı retry/backoff ile çağırır.
 * @param {string} url
 * @param {{ headers?: object, timeoutMs?: number, retry?: {maxAttempts:number,baseDelayMs:number}, label?: string }} [options]
 * @returns {Promise<any|null>} Ayrıştırılmış JSON veya başarısızlıkta null.
 */
export async function fetchJsonWithRetry(url, options = {}) {
  const {
    headers,
    timeoutMs = API_TIMEOUT_MS,
    retry = RETRY,
    label = 'API',
  } = options;
  const maxAttempts = retry?.maxAttempts ?? RETRY.maxAttempts;
  const baseDelayMs = retry?.baseDelayMs ?? RETRY.baseDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return await response.json();

      if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
        const wait = backoffDelay(
          attempt,
          parseRetryAfter(response.headers.get('Retry-After')),
          baseDelayMs
        );
        console.warn(
          `[${label}] ${response.status}; ${Math.round(wait)}ms sonra yeniden deneniyor (deneme ${attempt}/${maxAttempts})`
        );
        await delay(wait);
        continue;
      }

      return null; // kalıcı hata (4xx) veya yeniden denenebilir ama deneme tükendi
    } catch (err) {
      // AbortError (zaman aşımı) veya ağ hatası → yeniden dene
      if (attempt < maxAttempts) {
        const wait = backoffDelay(attempt, NaN, baseDelayMs);
        console.warn(
          `[${label}] ${err.name || 'Hata'}: ${err.message}; ${Math.round(wait)}ms sonra yeniden deneniyor (deneme ${attempt}/${maxAttempts})`
        );
        await delay(wait);
        continue;
      }
      console.warn(`[${label}] Başarısız (deneme ${attempt}/${maxAttempts}):`, err.message);
      return null;
    }
  }

  return null;
}
