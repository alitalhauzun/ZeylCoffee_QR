// Yeni MongoDB cluster'a veri aktarma scripti
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
console.log('Connection:', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

// Database.json'dan veriyi oku
const dbFile = path.join(__dirname, 'database.json');
const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

console.log('\n📋 Aktarılacak veriler:');
console.log(`   Kategoriler: ${data.categories?.length || 0}`);
console.log(`   Menü Ürünleri: ${data.menuItems?.length || 0}`);
console.log(`   Haftalık Özel: ${data.weeklySpecials?.length || 0}`);
console.log(`   Kampanyalar: ${data.campaigns?.length || 0}`);
console.log(`   Instagram: ${data.instagramPosts?.length || 0}`);

async function seedDB() {
  try {
    console.log('\n🔄 MongoDB\'ye bağlanılıyor...');
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Bağlantı başarılı!\n');

    // Schema tanımları
    const categorySchema = new mongoose.Schema({
      id: { type: Number, required: true, unique: true },
      name: { type: String, required: true },
      display_order: { type: Number, required: true },
      price_unit: { type: String, default: 'TL' }
    }, { timestamps: true });

    const menuItemSchema = new mongoose.Schema({
      id: { type: Number, required: true, unique: true },
      category_id: { type: Number, required: true },
      name: { type: String, required: true },
      description: { type: String },
      price: { type: Number, default: null },
      image: { type: String },
      is_available: { type: Boolean, default: true },
      display_order: { type: Number, default: 0 }
    }, { timestamps: true });

    const weeklySpecialSchema = new mongoose.Schema({
      id: { type: Number, required: true, unique: true },
      name: { type: String, required: true },
      description: { type: String },
      price: { type: Number },
      image: { type: String },
      is_active: { type: Boolean, default: true },
      display_order: { type: Number, default: 0 }
    }, { timestamps: true });

    const campaignSchema = new mongoose.Schema({
      id: { type: Number, required: true, unique: true },
      title: { type: String, required: true },
      description: { type: String },
      discount: { type: String },
      old_price: { type: Number, default: null },
      new_price: { type: Number, default: null },
      image: { type: String },
      is_active: { type: Boolean, default: true },
      start_date: { type: Date },
      end_date: { type: Date }
    }, { timestamps: true });

    const instagramPostSchema = new mongoose.Schema({
      id: { type: Number, required: true, unique: true },
      image: { type: String, default: null },
      caption: { type: String },
      display_order: { type: Number, default: 0 }
    }, { timestamps: true });

    const adminSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      password: { type: String, required: true }
    }, { timestamps: true });

    // Model'leri oluştur
    const Category = mongoose.model('Category', categorySchema);
    const MenuItem = mongoose.model('MenuItem', menuItemSchema);
    const WeeklySpecial = mongoose.model('WeeklySpecial', weeklySpecialSchema);
    const Campaign = mongoose.model('Campaign', campaignSchema);
    const InstagramPost = mongoose.model('InstagramPost', instagramPostSchema);
    const Admin = mongoose.model('Admin', adminSchema);

    // Mevcut verileri temizle
    console.log('🗑️  Mevcut veriler temizleniyor...');
    await Category.deleteMany({});
    await MenuItem.deleteMany({});
    await WeeklySpecial.deleteMany({});
    await Campaign.deleteMany({});
    await InstagramPost.deleteMany({});
    await Admin.deleteMany({});

    // Kategorileri ekle
    if (data.categories && data.categories.length > 0) {
      const cats = data.categories.map(c => ({
        ...c,
        price_unit: c.price_unit || 'TL'
      }));
      await Category.insertMany(cats);
      console.log(`✅ ${cats.length} kategori eklendi`);
    }

    // Menü ürünlerini ekle
    if (data.menuItems && data.menuItems.length > 0) {
      const items = data.menuItems.map(item => ({
        ...item,
        price: item.price ? parseFloat(item.price) : null,
        display_order: item.display_order || 0
      }));
      await MenuItem.insertMany(items);
      console.log(`✅ ${items.length} menü ürünü eklendi`);
    }

    // Haftalık özel ürünleri ekle
    if (data.weeklySpecials && data.weeklySpecials.length > 0) {
      const specials = data.weeklySpecials.map(s => ({
        ...s,
        price: s.price ? parseFloat(s.price) : null
      }));
      await WeeklySpecial.insertMany(specials);
      console.log(`✅ ${specials.length} haftalık özel eklendi`);
    }

    // Kampanyaları ekle
    if (data.campaigns && data.campaigns.length > 0) {
      await Campaign.insertMany(data.campaigns);
      console.log(`✅ ${data.campaigns.length} kampanya eklendi`);
    }

    // Instagram postlarını ekle
    if (data.instagramPosts && data.instagramPosts.length > 0) {
      await InstagramPost.insertMany(data.instagramPosts);
      console.log(`✅ ${data.instagramPosts.length} instagram post eklendi`);
    }

    // Admin kullanıcısı oluştur
    const hashedPassword = bcrypt.hashSync('zeyl2025', 10);
    await Admin.create({ username: 'admin', password: hashedPassword });
    console.log('✅ Admin kullanıcısı oluşturuldu (admin/zeyl2025)');

    console.log('\n🎉 Veri aktarımı tamamlandı!');

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Bağlantı kapatıldı.');
  }
}

seedDB();
