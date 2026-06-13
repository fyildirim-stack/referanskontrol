# Changelog

Tüm önemli değişiklikler bu dosyada belgelenmiştir.

## [0.3.0] - 2024 (Dipnot Desteği Sürümü)

### Yeni Özellikler
- **Dipnot Atıf Okuma**: Word belgelerindeki `word/footnotes.xml` dosyasından dipnot atıfları çıkarma
- **Dipnot Atıf Kontrol**: Dipnot içindeki kaynakların kaynakçada olup olmadığını kontrol etme
- **Tekrar Atıf Çözümlemesi**: "a.g.e.", "a.g.m.", "ibid", "op. cit.", "loc. cit." kısaltmalarını önceki dipnota göre çözümleme
- **Çok Formatlu Atıf Desteği**:
  - Kısa APA: `(Yazar, Yıl)` ve `Yazar (Yıl)`
  - Tam Chicago/İSNAD: `Yazar, Başlık (Yıl), s. X`
  - Tekrar atıflar (ibid, a.g.e., vb.)
- **UI Panelleri**:
  - "Kaynakçada Yer Almayan Tekil Dipnot Kaynakları" paneli
  - "Çözümlenemeyen Dipnot Atıfları" paneli
- **Raporlama**: Metin raporuna dipnot istatistikleri ekleme
- **Testler**: 11 yeni birim test

### Değişiklikler
- Proje adı `apatochicago` → `referanskontrol` olarak değiştirildi
- Versiyon numarası `0.2.0` → `0.3.0`
- UI başlığı güncelendi
- Metriler grid'i responsive yapıldı
- Sonuç panelleri responsive layout'a geçtirildi

### Teknik Detaylar
- Yeni dosya: `src/footnoteCitationFinder.js` - Dipnot atıf ayrıştırıcı
- Yeni dosya: `src/footnoteCitationFinder.test.js` - Birim testler
- `src/docxParser.js`'ye `extractFootnotes()` fonksiyonu eklendi
- `src/wordProcessor.js` dipnot işleme mantığıyla genişletildi
- `src/main.jsx` yeni UI bileşenleri ve metrikler eklendi
- `src/styles.css` responsive CSS güncellemeler

## [0.2.0] - 2024 (Temel Sürüm)

### Özellikler
- Metin içi APA atıfları tarama ve kontrol
- Kaynakça girdilerini ayrıştırma
- Eksik kaynakları raporlama
- İSNAD tarzı dipnot üretimi
- Google Scholar entegrasyonu
- Zotero export (CSL-JSON, RIS, BibTeX)
- Metin rapor indirme

### Yapı
- React 19 + Vite
- DOCX parsing (JSZip + XML DOM)
- Regex tabanlı atıf tespiti
- Birim testler (Vitest)

## [0.1.0] - 2024 (İlk Sürüm)

### Özellikler
- Proje başlatıldı
- Temel DOCX okuma
- İlk atıf kontrol mantığı

---

## Eski Proje: Apatochicago

Bu proje orijinal olarak `apatochicago` adıyla başlatılmıştır. İsim, içeriğini daha iyi yansıtacak şekilde `referanskontrol` olarak değiştirilmiş ve dipnot desteği eklenmiştir.

Tüm eski versiyonlar GitHub deposunda saklanmaktadır:
- `https://github.com/fyildirim-stack/referanskontrol.git` - Geçerli depo (tüm versiyonlar)

### Sürüm Bağlantıları
- Tüm sürümler: `git tag` ile listelenebilir
- Eski sürüme dönmek: `git checkout <version-tag>`
