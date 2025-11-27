require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const models = require('./models');

// MongoDB Bağlantısı
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zeyl-menu';

async function migrateData() {
  try {
    console.log('🔄 MongoDB bağlantısı kuruluyor...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB bağlantısı başarılı!');

    // Mevcut database.json dosyasını oku
    const dbFile = path.join(__dirname, 'database.json');
    
    if (!fs.existsSync(dbFile)) {
      console.log('⚠️  database.json bulunamadı. Varsayılan veriler oluşturuluyor...');
      await createDefaultData();
      return;
    }

    const oldData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    console.log('📂 Mevcut database.json okundu');

    // Tüm koleksiyonları temizle
    console.log('🗑️  Eski veriler temizleniyor...');
    await models.Admin.deleteMany({});
    await models.Category.deleteMany({});
    await models.MenuItem.deleteMany({});
    await models.WeeklySpecial.deleteMany({});
    await models.Campaign.deleteMany({});
    await models.InstagramPost.deleteMany({});

    // Admin bilgisini aktar
    if (oldData.admin) {
      await models.Admin.create({
        username: oldData.admin.username,
        password: oldData.admin.password
      });
      console.log('✅ Admin bilgisi aktarıldı');
    } else {
      // Varsayılan admin oluştur
      await models.Admin.create({
        username: 'admin',
        password: bcrypt.hashSync('zeyl2025', 10)
      });
      console.log('✅ Varsayılan admin oluşturuldu');
    }

    // Kategorileri aktar
    if (oldData.categories && oldData.categories.length > 0) {
      await models.Category.insertMany(oldData.categories);
      console.log(`✅ ${oldData.categories.length} kategori aktarıldı`);
    }

    // Menü öğelerini aktar
    if (oldData.menuItems && oldData.menuItems.length > 0) {
      // Geçerli olmayan verileri filtrele (name alanı olmayanları atla)
      const validMenuItems = oldData.menuItems.filter(item => {
        if (!item.name || item.name.trim() === '') {
          console.log(`⚠️  Atlanan ürün: ${JSON.stringify(item)}`);
          return false;
        }
        return true;
      });
  
      if (validMenuItems.length > 0) {
        await models.MenuItem.insertMany(validMenuItems);
        console.log(`✅ ${validMenuItems.length} menü öğesi aktarıldı`);
      }
    }
    // Haftalık özel ürünleri aktar
    if (oldData.weeklySpecials && oldData.weeklySpecials.length > 0) {
      await models.WeeklySpecial.insertMany(oldData.weeklySpecials);
      console.log(`✅ ${oldData.weeklySpecials.length} haftalık özel ürün aktarıldı`);
    }

    // Kampanyaları aktar
    if (oldData.campaigns && oldData.campaigns.length > 0) {
      await models.Campaign.insertMany(oldData.campaigns);
      console.log(`✅ ${oldData.campaigns.length} kampanya aktarıldı`);
    }

    // Instagram gönderilerini aktar
    if (oldData.instagramPosts && oldData.instagramPosts.length > 0) {
      await models.InstagramPost.insertMany(oldData.instagramPosts);
      console.log(`✅ ${oldData.instagramPosts.length} Instagram gönderi aktarıldı`);
    }

    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║  🎉 VERİ AKTARIMI BAŞARIYLA TAMAMLANDI!      ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  ✅ Tüm verileriniz MongoDB\'ye aktarıldı     ║');
    console.log('║  🚀 Artık server.js\'i başlatabilirsiniz      ║');
    console.log('╚════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('❌ Hata:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB bağlantısı kapatıldı');
  }
}

async function createDefaultData() {
  try {
    // Varsayılan admin oluştur
    await models.Admin.create({
      username: 'admin',
      password: bcrypt.hashSync('zeyl2025', 10)
    });

    // Varsayılan kategoriler
    const categories = [
      { id: 1, name: 'Sıcak İçecekler', display_order: 0 },
      { id: 2, name: 'Soğuk İçecekler', display_order: 1 },
      { id: 3, name: 'Yaz Serinliği', display_order: 2 },
      { id: 4, name: 'Çay Yanı Lezzetler', display_order: 3 },
      { id: 5, name: 'Kış Vazgeçilmezi', display_order: 4 }
    ];
    await models.Category.insertMany(categories);

    console.log('✅ Varsayılan veriler oluşturuldu');
    console.log('🚀 Server.js\'i başlatabilirsiniz');
  } catch (error) {
    console.error('❌ Varsayılan veri oluşturma hatası:', error.message);
  }
}

// Scripti çalıştır
migrateData();
