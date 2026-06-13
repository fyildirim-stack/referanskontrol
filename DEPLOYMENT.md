# Referans Kontrol - Dağıtım ve Release Rehberi

## Genel Bilgiler

**Proje Adı**: Referans Kontrol  
**Proje Türü**: Akademik Atıf Kontrol Aracı  
**Teknoloji**: React 19 + Vite + Node.js  
**Versiyon**: v0.3.0  
**Durum**: ✅ Canlı  

## GitHub Deposu

```
Repository: referanskontrol
URL: https://github.com/fyildirim-stack/referanskontrol.git
Owner: fyildirim-stack
Access: Public
Backup: ✅ Yedekli
```

### Repository Özellikleri

- ✅ Tüm eski sürümler saklanmıştır
- ✅ Tam geçmiş korunmuştur
- ✅ Release tags ile işaretlenmiştir
- ✅ CHANGELOG ve MIGRATION rehberleri bulunur

## Sürüm Yönetimi

### Geçerli Sürümler

| Versiyon | Tarih | Durum | Notlar |
|----------|-------|-------|--------|
| **v0.3.0** | 2024-06-13 | ✅ **Aktif** | Dipnot desteği + Referans Kontrol rebranding |
| v0.2.0 | 2024 | 📦 Arşivlenmiş | Orijinal Apatochicago |
| v0.1.0 | 2024 | 📦 Arşivlenmiş | İlk sürüm |

### Sürüme Erişim

```bash
# Ana sürümü klonla (v0.3.0)
git clone https://github.com/fyildirim-stack/referanskontrol.git
cd referanskontrol

# Belirli sürümü kontrol et
git checkout v0.3.0     # Güncel sürüm
git checkout v0.2.0     # Eski sürüm

# Tags listesi
git tag
```

## Kurulum ve Dağıtım

### Yerel Kurulum

```bash
# Depoyu klonla
git clone https://github.com/fyildirim-stack/referanskontrol.git
cd referanskontrol

# Bağımlılıkları yükle
npm install

# Geliştirme sunucusu
npm run dev

# Üretime hazırla (build)
npm run build

# Ürün önizlemesi
npm run preview
```

### Test

```bash
# Tüm testleri çalıştır
npm run test

# Coverage ile
npm run test -- --coverage
```

## CI/CD Pipeline

### GitHub Actions

`.github/workflows/deploy.yml` dosyasında dağıtım yapılandırılmıştır.

- ✅ Push'ta otomatik test
- ✅ Build doğrulama
- ✅ GitHub Pages dağıtımı

### Deployment Endpoints

| Ortam | URL | Durum |
|--------|-----|-------|
| Production | https://fyildirim-stack.github.io/referanskontrol | ✅ Aktif |
| Development | localhost:5173 | 🏠 Yerel |

## Yedekleme Stratejisi

### GitHub Yedekleme

✅ **Otomatik**: Tüm commits GitHub'a gönderilir

```bash
# Push et
git push origin main

# Tüm branches'ı pusla
git push origin --all

# Tüm tags'ları pusla
git push origin --tags
```

### Yerel Yedekleme

📁 **Konum**: `C:\Dev\backups\apatochicago-archive\`

- Eski Apatochicago sürümü referansı
- Migrasyon rehberi
- Proje özeti

## Release Süreci

### Yeni Sürüm Yayınlanması

1. **Kodu güncelle**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **package.json sürümünü güncelle**
   ```json
   {
     "version": "0.X.Y"
   }
   ```

3. **CHANGELOG.md güncelle**
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   ### Yeni Özellikler
   ...
   ```

4. **Commit et**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: bump version to X.Y.Z"
   ```

5. **Tag oluştur**
   ```bash
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```

6. **GitHub Release oluştur** (web'de)
   - Tag seç
   - Release notes ekle
   - Yayınla

## Güvenlik

### Kimlik Doğrulama

- ✅ SSH key ile git erişimi
- ✅ Personal Access Token (PAT) kullanılabilir
- ✅ 2FA etkin olması önerilir

### Gizli Bilgiler

- `.env` dosyası yok (statik site)
- `.gitignore` yapılandırılı
- Şifre veya token saklanmıyor

## Monitoring

### Build Status

- GitHub Actions otomatik test yapıyor
- Deploy workflow `deploy.yml`'de tanımlanmış

### Performance

- Vite ile hızlı build
- Optimized bundle boyutu: ~100KB gzip

## Support ve İletişim

| Kanal | Bilgi |
|--------|-------|
| E-mail | fyildirim@gmail.com |
| GitHub | https://github.com/fyildirim-stack |
| Issues | GitHub Issues (depo içinde) |

## Sık Sorulan Sorular

**S: Eski Apatochicago dosyalarına nereden ulaşabilirim?**  
C: GitHub deposunda `git checkout v0.2.0` ile erişebilirsiniz.

**S: Projeyi fork'layabilir miyim?**  
C: Evet, GitHub'da "Fork" butonunu kullanın.

**S: Katkı nasıl yapabilirim?**  
C: Pull request gönderin veya bir issue açın.

**S: Eski versiyona dönebilir miyim?**  
C: Evet, `git checkout <version-tag>` kullanın.

---

**Son Güncelleme**: 13.06.2026  
**Durum**: ✅ Tüm sistemler aktif ve yedekli
