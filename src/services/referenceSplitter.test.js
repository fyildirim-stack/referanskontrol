import { describe, it, expect } from 'vitest';
import { splitConcatenatedReferences } from './referenceSplitter.js';

describe('splitConcatenatedReferences', () => {
  it('tek bloğa birleşmiş 3 referansı ayırır', () => {
    const t =
      'Kopetsch, T. (2008) “The migration of doctors”, Journal of Public Health , 7(1), 33–39. ' +
      'Labonté, R. ve Schrecker, T. (2007) “Globalization and Social Determinants Of Health”, Global Health , 3(6). ' +
      'Leitão, C. A. vd. (2024) “Drivers of Global Health Care Worker Migration”, Journal of the American College of Radiology , 21, 1188–1193.';
    const parts = splitConcatenatedReferences(t);
    expect(parts).toHaveLength(3);
    expect(parts[0].startsWith('Kopetsch')).toBe(true);
    expect(parts[1].startsWith('Labonté')).toBe(true);
    expect(parts[2].startsWith('Leitão')).toBe(true);
  });

  it('erişim tarihinden sonraki yeni referansı ayırır', () => {
    const t =
      'İnternethaber (2011) “İthal Doktor Yasası tamamlandı”, https://x.htm, (Son Erişim Tarihi, 23/08/2025). ' +
      'Kablay, S. (2021) “Neoliberal Transformation”, London: Pluto Press.';
    const parts = splitConcatenatedReferences(t);
    expect(parts).toHaveLength(2);
    expect(parts[1].startsWith('Kablay')).toBe(true);
  });

  it('kurumsal yazarı (parantezli) doğru ayırır', () => {
    const t =
      'OECD (Organisation for Economic Co-operation and Development) (2023) Health at a Glance 2023 , Paris: OECD Publishing. ' +
      'OECD (Organisation for Economic Co-operation and Development) (2025) International Migration Outlook 2025 , Paris: OECD Publishing.';
    expect(splitConcatenatedReferences(t)).toHaveLength(2);
  });

  it('yazar baş harflerinde ("Maier, C. B.") BÖLMEZ', () => {
    const t =
      'Ognyanova, D., Young, R., Maier, C. B. ve Busse, R. (2014) “Why do health professionals leave Germany”, içinde, 203–233.';
    expect(splitConcatenatedReferences(t)).toHaveLength(1);
  });

  it('"vd." kısaltmasından sonra BÖLMEZ', () => {
    const t =
      'Aretz, B. vd. Frey, S. ve Weltermann, B. (2024) “Regional socioeconomic characteristics”, Public Health , 236, 338–346.';
    expect(splitConcatenatedReferences(t)).toHaveLength(1);
  });

  it('harf-harf boşluklu URL içinde BÖLMEZ', () => {
    const t =
      'Deutsche Welle (2019) “Başlık”, h t t p s : / / w w w . d w . c o m / a-50174083, (Son Erişim Tarihi, 15/08/2025).';
    expect(splitConcatenatedReferences(t)).toHaveLength(1);
  });

  it('tek referansı olduğu gibi döndürür', () => {
    const t = 'Yılmaz, V. (2017) The Politics of Healthcare Reform in Turkey , London: Palgrave Macmillan.';
    expect(splitConcatenatedReferences(t)).toEqual([t]);
  });
});
