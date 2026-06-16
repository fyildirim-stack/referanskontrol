import { describe, it, expect } from 'vitest';
import { parseReferences } from './referenceParser.js';

describe('referenceParser - parseAuthors (virgül-bölme düzeltmesi)', () => {
  it('"Soyadı, A." ikilisini tek yazar olarak korur ("&" ile ayrılan iki yazar)', () => {
    const refs = parseReferences('Yılmaz, A., & Demir, B. (2020). Test başlığı. Dergi Adı.');
    expect(refs).toHaveLength(1);
    expect(refs[0].authors).toEqual(['Yılmaz, A.', 'Demir, B.']);
  });

  it('tek yazarı baş harflerinden ayırmaz', () => {
    const refs = parseReferences('Kaya, C. (2019). Başka bir başlık. Yayınevi.');
    expect(refs[0].authors).toEqual(['Kaya, C.']);
  });

  it('virgülle ayrılan çok yazarlı APA listesini doğru böler', () => {
    const refs = parseReferences('Ak, A., Bal, B., & Can, C. (2021). Bir başlık. Bir Dergi.');
    expect(refs[0].authors).toEqual(['Ak, A.', 'Bal, B.', 'Can, C.']);
  });
});

describe('referenceParser - başlık çıkarımı (yıldan sonra nokta YOK stili)', () => {
  it('"Yazar (Yıl) “Başlık”, Dergi, cilt(sayı), sayfa" stilinde başlığı doğru çıkarır', () => {
    const refs = parseReferences(
      'Botezat, A. ve Ramos, R. (2020) “Physicians’ brain drain – a gravity model of migration flows”, Global Health , 16(7), 1-13.'
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].authors).toEqual(['Botezat, A.', 'Ramos, R.']);
    expect(refs[0].year).toBe(2020);
    expect(refs[0].title).toBe('Physicians’ brain drain – a gravity model of migration flows');
    expect(refs[0].journal).toBe('Global Health');
  });

  it('tırnaksız kitap başlığını ("Yazar (Yıl) Kitap Adı , Yer: Yayınevi") doğru çıkarır', () => {
    const refs = parseReferences(
      'Yılmaz, V. (2017) The Politics of Healthcare Reform in Turkey , London: Palgrave Macmillan.'
    );
    expect(refs[0].title).toBe('The Politics of Healthcare Reform in Turkey');
    expect(refs[0].authors).toEqual(['Yılmaz, V.']);
  });

  it('birleşmiş iki referansı ayırıp her ikisinin başlığını doğru çıkarır', () => {
    const refs = parseReferences(
      'Kopetsch, T. (2008) “The migration of doctors”, Journal of Public Health , 7(1), 33–39. ' +
      'Labonté, R. ve Schrecker, T. (2007) “Globalization and Health”, Global Health , 3(6).'
    );
    expect(refs).toHaveLength(2);
    expect(refs[0].title).toBe('The migration of doctors');
    expect(refs[1].title).toBe('Globalization and Health');
  });
});
