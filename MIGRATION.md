# Apatochicago → Referans Kontrol Geçiş Rehberi

## Proje Yeniden Adlandırması

`apatochicago` projesi **Referans Kontrol** olarak yeniden markalaştırılmıştır.

### Ne Değişti?

| Öğe | Eski | Yeni |
|-----|-----|-----|
| Proje Adı | apatochicago | referanskontrol |
| Paket Adı | apatochicago | referanskontrol |
| Versiyon | 0.2.0 | 0.3.0 |
| GitHub Repo | apatochicago-stack | referanskontrol |
| Başlık | APA Dipnot Denetçisi | Referans Kontrol |
| Açıklama | APA atıflarını denetler | Metin içi ve dipnot atıflarını kontrol eder |

### Yeni Özellikler (v0.3.0)

Dipnot desteği eklendi:
- ✅ Word dipnotlarından atıf okuma
- ✅ Dipnot atıflarını kaynakçayla karşılaştırma
- ✅ "a.g.e.", "ibid", "op. cit." gibi tekrar atıfları çözümleme
- ✅ Dipnot kontrol panelleri
- ✅ Çözümlenemeyen atıfları raporlama

### GitHub Depoları

Tüm versiyonlar **tek bir depo** altında tutulmaktadır:

```
https://github.com/fyildirim-stack/referanskontrol.git
```

#### Sürüm Geçmişi
```bash
# Tüm sürümleri listele
git tag

# Eski sürüme dön (örn: v0.2.0)
git checkout v0.2.0

# Tekrar son sürüme dön
git checkout main
```

### Kurulum (Eski Sürüm)

Eğer eski `Apatochicago` yapısını kullanmak istiyorsanız:

```bash
git clone https://github.com/fyildirim-stack/referanskontrol.git
cd referanskontrol
git checkout v0.2.0  # Eski sürüme git
npm install
npm run dev
```

### Yükseltme (eski → yeni)

```bash
# Depoyu güncelle
git pull origin main

# Bağımlılıkları yenile
npm install

# Yeni özellikleri kullan
npm run dev
```

### Dosya Değişiklikleri

#### Yeni Dosyalar
- `src/footnoteCitationFinder.js` - Dipnot atıf işlemci
- `src/footnoteCitationFinder.test.js` - Testler
- `CHANGELOG.md` - Sürüm geçmişi
- `MIGRATION.md` - Bu dosya

#### Güncellenmiş Dosyalar
- `package.json` - Proje adı ve versiyon
- `index.html` - Başlık
- `src/main.jsx` - UI güncellemeler
- `src/wordProcessor.js` - Dipnot işleme
- `src/docxParser.js` - `extractFootnotes()` eklendi
- `src/styles.css` - Responsive iyileştirmeler
- `README.md` - Yeni açıklamalar

#### Silinmiş Dosyalar
- Yok (tüm dosyalar korunmuş)

### Geri Uyumluluk

✅ **Evet, geri uyumlu**: v0.3.0, v0.2.0'daki tüm özellikleri destekler.

- Metin içi atıf kontrolü çalışıyor
- İSNAD dipnot üretimi çalışıyor
- Zotero export çalışıyor
- Eski formatlar destekleniyor

### İletişim

Sorunlar veya geri bildirim: fyildirim@gmail.com

---

**Not**: Proje GitHub'da **tek bir depo** altında tutulmakta, tüm geçmiş saklanmaktadır.
