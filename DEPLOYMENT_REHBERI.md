# Zeyl Coffee & Levent Börek QR Menü - Render.com Deployment

## 🚀 RENDER.COM'A DEPLOYMENT ADIMLARI

### Adım 1: GitHub Hesabı Oluşturun (Yoksa)
1. https://github.com adresine gidin
2. "Sign up" ile ücretsiz hesap oluşturun

### Adım 2: Projeyi GitHub'a Yükleyin

#### Yöntem A: GitHub Web Arayüzünden (EN KOLAY)
1. GitHub'da oturum açın
2. Sağ üstte **"+" işaretine** tıklayın → **"New repository"** seçin
3. Repository adı: `qr-menu` (veya istediğiniz bir isim)
4. **Public** seçin (ücretsiz için)
5. **"Create repository"** tıklayın
6. Açılan sayfada **"uploading an existing file"** linkine tıklayın
7. Bu ZIP dosyasını açın ve TÜM dosyaları sürükleyip bırakın
   - server.js
   - package.json
   - render.yaml
   - database.json
   - views/ klasörü
   - public/ klasörü
   - vs...
8. **"Commit changes"** tıklayın

#### Yöntem B: Git ile (Terminal biliyorsanız)
```bash
cd qr-menu-klasoru
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/qr-menu.git
git push -u origin main
```

### Adım 3: Render.com'a Deploy Edin

1. **https://render.com** adresine gidin
2. **"Get Started for Free"** tıklayın
3. GitHub hesabınızla giriş yapın
4. **"New +"** → **"Web Service"** seçin
5. GitHub reponuzu bulun ve **"Connect"** tıklayın
6. Ayarları doldurun:
   - **Name:** qr-menu (veya istediğiniz isim)
   - **Region:** Frankfurt (Türkiye'ye en yakın)
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
7. **"Create Web Service"** tıklayın
8. Deploy işlemi 2-3 dakika sürer

### Adım 4: Siteniz Hazır! 🎉

Deploy bitince size bir URL verilir:
```
https://qr-menu-XXXXXX.onrender.com
```

Bu URL'yi:
- ✅ Müşterilerinize gösterebilirsiniz
- ✅ QR kod oluşturabilirsiniz (https://qr-code-generator.com)
- ✅ Admin paneline erişebilirsiniz: https://qr-menu-XXXXXX.onrender.com/admin/login

## 🔐 ADMIN BİLGİLERİ

- **Kullanıcı Adı:** admin
- **Şifre:** zeyl2025

⚠️ **ÖNEMLİ:** İlk girişte şifrenizi değiştirin!

## 📱 QR KOD OLUŞTURMA

1. https://qr-code-generator.com adresine gidin
2. Render.com'dan aldığınız URL'yi yapıştırın
3. QR kodu indirin ve yazdırın
4. Masalara koyun!

## ⚠️ ÖNEMLİ NOTLAR

1. **Ücretsiz Plan Limitleri:**
   - Site 15 dakika kullanılmazsa uyur
   - İlk açılış biraz yavaş olabilir (30 saniye)
   - Ayda 750 saat çalışma süresi (genelde yeterli)

2. **Dosya Yükleme:**
   - Render.com'da yüklenen resimler kalıcıdır
   - Her deploy'da resimler SILINIR
   - Çözüm: Cloudinary gibi ücretsiz resim hosting kullanın (gerekirse yapabilirim)

3. **Database Güncellemeleri:**
   - Admin panelinden yaptığınız değişiklikler kalıcıdır
   - Yeni deploy yaparsanız eski veriler gider
   - Düzenli backup yapın!

## 🆙 UPGRADE

Daha hızlı ve sınırsız kullanım için:
- Render.com Starter Plan: $7/ay
- Hiç uyumaz, her zaman hızlı

## 🆘 SORUN YAŞARSANIZ

1. Render.com dashboard'da "Logs" sekmesini kontrol edin
2. Hata mesajlarını okuyun
3. Gerekirse bana ulaşın!

---

## 🎯 HIZLI BAŞLANGIÇ ÖZETİ

1. ✅ GitHub hesabı aç
2. ✅ Projeyi GitHub'a yükle
3. ✅ Render.com'a kaydol
4. ✅ GitHub repo'yu bağla
5. ✅ Deploy et
6. ✅ URL'i al
7. ✅ QR kod oluştur
8. ✅ Masalara koy!

**Tamamı 10 dakika sürer!**
