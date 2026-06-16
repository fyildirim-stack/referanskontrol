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
