# Referans Kontrol - Hızlı Başlangıç

## 🚀 5 Dakika İçinde Başla

### 1. Klonla
```bash
git clone https://github.com/fyildirim-stack/referanskontrol.git
cd referanskontrol
```

### 2. Yükle
```bash
npm install
```

### 3. Çalıştır
```bash
npm run dev
```

→ Tarayıcıyı aç: **http://127.0.0.1:5173**

---

## 📝 Kullanım

1. **Word Dosyası Seç**: DOCX belgesini yükle
2. **Analiz Et**: Otomatik olarak:
   - ✅ Metin içi atıfları tarar
   - ✅ Dipnot atıflarını okur
   - ✅ Kaynakçayla karşılaştırır
3. **Sonuçlar Gör**: 
   - Eksik kaynaklar
   - Çözümlenemeyen dipnotlar
   - Zotero export seçeneği
4. **Rapor İndir**: Metin veya Word formatında

---

## 🧪 Test Et

```bash
npm run test
```

**Sonuç**: ✅ 17/17 test geçer

---

## 🏗️ Build

```bash
npm run build
```

**Çıkış**: `dist/` dizininde

---

## 📚 Daha Fazla Bilgi

- **Özellikleri**: [README.md](README.md)
- **Sürüm Geçmişi**: [CHANGELOG.md](CHANGELOG.md)
- **Dağıtım**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Geçiş Rehberi**: [MIGRATION.md](MIGRATION.md)

---

## ⚡ Kısa Referans

| Komut | İşlem |
|-------|-------|
| `npm run dev` | Geliştirme sunucusu (5173) |
| `npm run build` | Üretime hazırla |
| `npm run preview` | Derlenmiş sürümü görüntüle |
| `npm run test` | Testleri çalıştır |

---

## 🎯 Desteklenen Formatlar

**Giriş**: `.docx` (Word belgesi)

**Kontrol Edilen**:
- ✅ Metin içi APA atıfları: `(Yazar, Yıl)`
- ✅ Dipnot atıfları: Tüm formatlar
- ✅ Tekrar atıfları: `a.g.e.`, `ibid`, `op. cit.`

**Çıkış**:
- 📝 Metin rapor
- 📄 İSNAD dipnotlu Word
- 📊 Zotero (JSON, RIS, BibTeX)

---

## ❓ Sorunlar?

- **Build hatası**: `npm install` tekrar çalıştır
- **Port 5173 meşgul**: Başka port kullan: `npm run dev -- --port 3000`
- **Test başarısız**: `npm install` ve `npm run test` tekrar çalıştır

---

## 📞 İletişim

**E-mail**: fyildirim@gmail.com  
**GitHub**: github.com/fyildirim-stack/referanskontrol

---

**Versiyon**: v0.3.0 | **Durum**: ✅ Aktif
