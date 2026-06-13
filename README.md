# Referans Kontrol

Akademik yazılar için metin içi ve dipnot atıflarını kaynakçayla karşılaştıran, kontrolü sağlayan web uygulaması.

## Özellikler

- **Metin İçi Atıf Kontrolü**: APA tarzı `(Yazar, Yıl)` ve `Yazar (Yıl)` deseni atıfları tarar
- **Dipnot Atıf Kontrolü**: Word dipnotlarından atıfları çıkarır, kısa ve tam format destekler
- **Tekrar Atıf Çözümlemesi**: "a.g.e.", "a.g.m.", "ibid", "op. cit.", "loc. cit." gibi kısaltmaları önceki dipnota göre çözer
- **Eksik Kaynak Raporlaması**: Kaynakçada yer almayan metin içi ve dipnot atıflarını listeler
- **İSNAD Dipnot Üretimi**: Metin içi APA atıflarını İSNAD tarzı dipnotlara dönüştürür
- **Zotero Export**: Onaylanan kaynakları CSL-JSON, RIS, BibTeX formatlarında indirir
- **Google Scholar Entegrasyonu**: Kaynaklar için Scholar doğrulama bağlantıları

## Desteklenen Formatlar

- **Giriş**: DOCX (Word) belgeleri
- **Çıkış**: 
  - İSNAD dipnotlu Word belgeleri
  - Metin rapor (atıf özeti)
  - Zotero kayıt dosyaları (CSL-JSON, RIS, BibTeX)

## Kurulum

```bash
npm install
```

## Geliştirme

```bash
npm run dev
```

Uygulama `http://127.0.0.1:5173` adresinde çalışacaktır.

## Test

```bash
npm run test
```

## Derleme

```bash
npm run build
```

## Sürüm Tarihi

### v0.3.0 (Dipnot Desteği)
- Dipnot atıfı okuma ve kontrol desteği eklendi
- Tekrar atıf çözümlemesi (ibid, a.g.e., vb.)
- Dipnot atıf panelleri UI'a eklendi
- Kapsamlı birim testler

### v0.2.0
- Temel metin içi atıf kontrol
- İSNAD dipnot üretimi
- Zotero export

### v0.1.0
- İlk sürüm

## Katkıda Bulunma

Bu proje eğitim ve akademik araştırma amaçlı geliştirilmektedir.

## Lisans

MIT
