import { describe, it, expect } from 'vitest';
import { calculateMatchScore, findBestMatch } from './matchScorer.js';

describe('matchScorer - DOI/ISBN kesin eşleşme', () => {
  it('DOI birebir eşleşince (büyük/küçük ve prefix fark etmeksizin) 100 döner', () => {
    const ref = { title: 'A', authors: [], year: 2000, doi: '10.1234/abc' };
    const res = {
      title: 'Tamamen farklı başlık',
      authors: ['X'],
      year: 1990,
      doi: 'https://doi.org/10.1234/ABC',
    };
    expect(calculateMatchScore(ref, res)).toBe(100);
  });

  it('ISBN birebir eşleşince (tire/boşluk fark etmeksizin) 100 döner', () => {
    const ref = { title: 'A', authors: [], isbn: '978-3-16-148410-0' };
    const res = { title: 'Farklı', authors: [], isbn: '9783161484100' };
    expect(calculateMatchScore(ref, res)).toBe(100);
  });
});

describe('matchScorer - yazar eşleştirme', () => {
  const base = { title: 'Kuantum Dolanıklık Kuramı', year: 2020 };

  it('aynı soyadı tam puan; "Smithson" substring eşleşmez', () => {
    const ref = { ...base, authors: ['Smith, J.'] };
    const exact = calculateMatchScore(ref, { ...base, authors: ['Smith, J.'] });
    const wrong = calculateMatchScore(ref, { ...base, authors: ['Smithson, J.'] });
    // Yalnızca yazar ağırlığı (25) kadar fark olmalı (substring eşleşmesi olsaydı fark 0 olurdu)
    expect(exact - wrong).toBe(25);
  });

  it('"Yılmaz, A." ile "A. Yılmaz" eşleşir (soyadı + Türkçe katlama)', () => {
    const ref = { ...base, authors: ['Yılmaz, A.'] };
    const score = calculateMatchScore(ref, { ...base, authors: ['A. Yılmaz'] });
    expect(score).toBeGreaterThanOrEqual(90); // 50 başlık + 25 yazar + 15 yıl
  });
});

describe('matchScorer - başlık normalizasyonu', () => {
  it('diakritik farkını yok sayar ("Café" ~ "Cafe")', () => {
    const ref = { title: 'Café Society Dergisi', authors: [], year: 2010 };
    const res = { title: 'Cafe Society Dergisi', authors: [], year: 2010 };
    expect(calculateMatchScore(ref, res)).toBeGreaterThanOrEqual(60);
  });

  it('durak-sözcük ağırlıklı farklı başlıkları ayırt eder', () => {
    const ref = { title: 'The Study of Water', authors: [], year: 2010 };
    const res = { title: 'The Study of Oil', authors: [], year: 2010 };
    // Anlamlı kelimeler "water" vs "oil" → benzerlik ~0; yalnızca yıl puanı kalır → eşik altı
    expect(calculateMatchScore(ref, res)).toBeLessThan(40);
  });
});

describe('findBestMatch - eşik', () => {
  it('eşik altındaki en iyi adayı eler (null döner)', () => {
    const ref = { title: 'Tamamen alakasız bir başlık', authors: ['Ünlü, K.'], year: 2021 };
    const results = [{ title: 'Bambaşka şeyler', authors: ['Zeta, Q.'], year: 1980 }];
    expect(findBestMatch(ref, results)).toBeNull();
  });

  it('güçlü eşleşmeyi skoruyla döndürür', () => {
    const ref = { title: 'Makine Öğrenmesine Giriş', authors: ['Demir, A.'], year: 2018 };
    const results = [
      { title: 'Alakasız', authors: ['X, Y.'], year: 1900 },
      { title: 'Makine Öğrenmesine Giriş', authors: ['Demir, A.'], year: 2018 },
    ];
    const best = findBestMatch(ref, results);
    expect(best).not.toBeNull();
    expect(best.score).toBeGreaterThanOrEqual(90);
    expect(best.match.title).toBe('Makine Öğrenmesine Giriş');
  });
});
