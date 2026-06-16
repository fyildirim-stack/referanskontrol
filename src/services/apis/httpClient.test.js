import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJsonWithRetry } from './httpClient.js';

function makeResp(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k in headers ? headers[k] : null) },
    json: async () => body,
  };
}

// Testleri hızlı tutmak için küçük baseDelayMs geçilir.
const FAST = { maxAttempts: 3, baseDelayMs: 1 };

describe('httpClient - fetchJsonWithRetry', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('başarılı yanıtı tek denemede döndürür', async () => {
    globalThis.fetch.mockResolvedValueOnce(makeResp(200, { ok: true }));
    const data = await fetchJsonWithRetry('http://x', { label: 'T', retry: FAST });
    expect(data).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('429 (Retry-After ile) sonrası yeniden dener ve başarıyı döndürür', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(makeResp(429, {}, { 'Retry-After': '0' }))
      .mockResolvedValueOnce(makeResp(200, { ok: true }));
    const data = await fetchJsonWithRetry('http://x', { label: 'T', retry: FAST });
    expect(data).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('kalıcı 404 için yeniden denemez ve null döner', async () => {
    globalThis.fetch.mockResolvedValue(makeResp(404));
    const data = await fetchJsonWithRetry('http://x', { label: 'T', retry: FAST });
    expect(data).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('kalıcı 500 için maxAttempts kez dener ve null döner', async () => {
    globalThis.fetch.mockResolvedValue(makeResp(500));
    const data = await fetchJsonWithRetry('http://x', { label: 'T', retry: FAST });
    expect(data).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('ağ hatası (fetch reject) sonrası yeniden dener', async () => {
    globalThis.fetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(makeResp(200, { ok: true }));
    const data = await fetchJsonWithRetry('http://x', { label: 'T', retry: FAST });
    expect(data).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
