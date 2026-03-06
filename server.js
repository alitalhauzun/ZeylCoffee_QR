// Deploy Test - Veri kalıcılığı testi (v2)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const app = express();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dwqrugkkn',
  api_key: process.env.CLOUDINARY_API_KEY || '311124884946796',
  api_secret: process.env.CLOUDINARY_API_SECRET || '7mUjnTCBqAYIc6YlHKYMu1z_dOY'
});

// Multer configuration - memory storage for Cloudinary upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir! (jpg, jpeg, png, gif, webp)'));
    }
  }
});

// Cloudinary'ye resim yükleme yardımcı fonksiyonu
function uploadToCloudinary(fileBuffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'zeylcoffee/' + folder, resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

// Cloudinary'den resim silme yardımcı fonksiyonu
function deleteFromCloudinary(imageUrl) {
  if (!imageUrl || !imageUrl.includes('cloudinary')) return Promise.resolve();
  // URL'den public_id çıkar
  const parts = imageUrl.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return Promise.resolve();
  const publicIdParts = parts.slice(uploadIndex + 2); // version'u atla
  const publicId = publicIdParts.join('/').replace(/\.[^/.]+$/, ''); // uzantıyı kaldır
  return cloudinary.uploader.destroy(publicId).catch(err => console.error('Cloudinary silme hatası:', err));
}

// MongoDB Bağlantısı
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zeyl-menu';

// GÜVENLİ BAŞLANGIÇ: Varsayılan olarak MOCK veritabanı ile başla.
// Böylece bağlantı başarısız olsa bile site çalışır.
let models = require('./mock-models');

console.log('🔄 Veritabanı bağlantısı deneniyor...');

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 }) // 5 saniye bekle
  .then(async () => {
    console.log('✅ MongoDB bağlantısı başarılı! Gerçek veritabanına geçiliyor.');
    try {
      // Mongoose modellerini yükle ve aktif et
      models = require('./models');

      // Admin kullanıcısı yoksa oluştur
      const adminCount = await models.Admin.countDocuments();
      if (adminCount === 0) {
        const hashedPassword = bcrypt.hashSync('zeyl2025', 10);
        await models.Admin.create({ username: 'admin', password: hashedPassword });
        console.log('👤 Admin kullanıcısı oluşturuldu (admin/zeyl2025)');
      }
    } catch (e) {
      console.error('Model yükleme hatası:', e);
      // Hata olursa mock'ta kal
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB bağlantı hatası:', err.message);
    console.log('⚠️  YEREL MOD (MOCK VERITABANI) KULLANILIYOR.');
    console.log('⚠️  Bu modda veriler "database.json" dosyasına kaydedilir.');
    // Zaten mock-models yüklü, bir şey yapmaya gerek yok.
  });

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'zeyl-coffee-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Middleware: Admin kontrolü
function isAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// ==================== PUBLIC ROUTES ====================

// Ana sayfa - Müşteri Menüsü
app.get('/', async (req, res) => {
  try {
    const categories = await models.Category.find().sort('display_order');
    const allItems = await models.MenuItem.find({ is_available: true }).sort('display_order');

    const menuData = categories.map(cat => {
      const items = allItems.filter(item => item.category_id === cat.id);
      return { category: cat, items: items };
    });

    const weeklySpecials = await models.WeeklySpecial.find({ is_active: true });
    const campaigns = await models.Campaign.find({ is_active: true });
    const instagramPosts = await models.InstagramPost.find().sort('display_order');

    res.render('menu-premium', { menuData, weeklySpecials, campaigns, instagramPosts });
  } catch (error) {
    console.error('Menü yükleme hatası:', error);
    res.status(500).send('Bir hata oluştu');
  }
});

// ==================== ADMIN AUTH ROUTES ====================

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', { error: null });
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await models.Admin.findOne({ username });

    let isPasswordValid = false;
    if (admin) {
      // Mock veritabanı için düz metin kontrolü veya bcrypt kontrolü
      // Not: Gerçek ortamda her zaman bcrypt kullanılır.
      isPasswordValid = bcrypt.compareSync(password, admin.password) || password === admin.password;
    }

    if (admin && isPasswordValid) {
      req.session.isAdmin = true;
      res.redirect('/admin/dashboard');
    } else {
      res.render('admin-login', { error: 'Kullanıcı adı veya şifre hatalı!' });
    }
  } catch (error) {
    console.error('Login hatası:', error);
    res.render('admin-login', { error: 'Sistem hatası: ' + error.message });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ==================== ADMIN DASHBOARD ====================

app.get('/admin/dashboard', isAdmin, async (req, res) => {
  try {
    const categories = await models.Category.find().sort('display_order');
    const allItems = await models.MenuItem.find().sort('display_order');

    const menuData = categories.map(cat => {
      const items = allItems.filter(item => item.category_id === cat.id);
      return { category: cat, items: items };
    });

    const weeklySpecials = await models.WeeklySpecial.find();
    const campaigns = await models.Campaign.find();
    const instagramPosts = await models.InstagramPost.find().sort('display_order');

    res.render('admin-dashboard', { menuData, categories, weeklySpecials, campaigns, instagramPosts });
  } catch (error) {
    console.error('Dashboard yükleme hatası:', error);
    res.status(500).send('Bir hata oluştu');
  }
});

// ==================== MENU ITEM ROUTES ====================

app.post('/admin/update-item', isAdmin, async (req, res) => {
  try {
    const { id, name, price, description, is_available } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description || '';

    if (price !== undefined) {
      if (price === '' || price === null) {
        updateData.price = null;
      } else {
        const numPrice = parseFloat(price);
        updateData.price = isNaN(numPrice) ? null : numPrice;
      }
    }

    if (typeof is_available !== 'undefined') {
      updateData.is_available = (is_available === true || is_available === '1' || is_available === 1);
    }

    await models.MenuItem.findOneAndUpdate({ id: parseInt(id) }, updateData);
    res.json({ success: true });
  } catch (error) {
    console.error('Ürün güncelleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/upload-image', isAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
    }

    const { itemId } = req.body;
    const item = await models.MenuItem.findOne({ id: parseInt(itemId) });

    if (item) {
      // Eski resmi Cloudinary'den sil
      if (item.image) await deleteFromCloudinary(item.image);

      // Yeni resmi Cloudinary'ye yükle
      const result = await uploadToCloudinary(req.file.buffer, 'menu-items');
      item.image = result.secure_url;
      await item.save();

      res.json({ success: true, imagePath: result.secure_url });
    } else {
      res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }
  } catch (error) {
    console.error('Resim yükleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-image', isAdmin, async (req, res) => {
  try {
    const { itemId } = req.body;
    const item = await models.MenuItem.findOne({ id: parseInt(itemId) });

    if (item) {
      if (item.image) await deleteFromCloudinary(item.image);
      item.image = null;
      await item.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }
  } catch (error) {
    console.error('Resim silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-item', isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await models.MenuItem.findOneAndDelete({ id: parseInt(id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Ürün silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/add-item', isAdmin, async (req, res) => {
  try {
    const { category_id, name, price, description } = req.body;

    const maxItem = await models.MenuItem.findOne().sort('-id');
    const newId = maxItem ? maxItem.id + 1 : 1;

    const categoryItems = await models.MenuItem.find({ category_id: parseInt(category_id) }).sort('-display_order');
    const maxOrder = categoryItems.length > 0 ? categoryItems[0].display_order : -1;

    await models.MenuItem.create({
      id: newId,
      category_id: parseInt(category_id),
      name: name,
      price: price || null,
      description: description || '',
      is_available: true,
      display_order: maxOrder + 1
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Ürün ekleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CATEGORY ROUTES ====================

app.post('/admin/add-category', isAdmin, async (req, res) => {
  try {
    const { name, price_unit } = req.body;

    const maxCategory = await models.Category.findOne().sort('-id');
    const newId = maxCategory ? maxCategory.id + 1 : 1;

    const maxOrderCat = await models.Category.findOne().sort('-display_order');
    const maxOrder = maxOrderCat ? maxOrderCat.display_order : -1;

    await models.Category.create({
      id: newId,
      name: name,
      display_order: maxOrder + 1,
      price_unit: price_unit || 'TL'
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Kategori ekleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/update-category', isAdmin, async (req, res) => {
  try {
    const { id, price_unit } = req.body;
    await models.Category.findOneAndUpdate({ id: parseInt(id) }, { price_unit });
    res.json({ success: true });
  } catch (error) {
    console.error('Kategori güncelleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-category', isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await models.MenuItem.deleteMany({ category_id: parseInt(id) });
    await models.Category.findOneAndDelete({ id: parseInt(id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Kategori silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/reorder-categories', isAdmin, async (req, res) => {
  try {
    const { categoryId, direction } = req.body;
    const categories = await models.Category.find().sort('display_order');

    const categoryIndex = categories.findIndex(cat => cat.id === parseInt(categoryId));
    if (categoryIndex === -1) {
      return res.json({ success: false, error: 'Kategori bulunamadı' });
    }

    if (direction === 'up' && categoryIndex > 0) {
      const currentCat = categories[categoryIndex];
      const prevCat = categories[categoryIndex - 1];

      const tempOrder = currentCat.display_order;
      currentCat.display_order = prevCat.display_order;
      prevCat.display_order = tempOrder;

      await currentCat.save();
      await prevCat.save();
    } else if (direction === 'down' && categoryIndex < categories.length - 1) {
      const currentCat = categories[categoryIndex];
      const nextCat = categories[categoryIndex + 1];

      const tempOrder = currentCat.display_order;
      currentCat.display_order = nextCat.display_order;
      nextCat.display_order = tempOrder;

      await currentCat.save();
      await nextCat.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Sıralama hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== WEEKLY SPECIALS ROUTES ====================

app.post('/admin/add-weekly-special', isAdmin, async (req, res) => {
  try {
    const { name, price, description } = req.body;

    const maxSpecial = await models.WeeklySpecial.findOne().sort('-id');
    const newId = maxSpecial ? maxSpecial.id + 1 : 1;

    const allSpecials = await models.WeeklySpecial.find();

    await models.WeeklySpecial.create({
      id: newId,
      name: name,
      price: price || null,
      description: description || '',
      image: null,
      is_active: true,
      display_order: allSpecials.length
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Haftalık ürün ekleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-weekly-special', isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await models.WeeklySpecial.findOneAndDelete({ id: parseInt(id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Haftalık ürün silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/update-weekly-special', isAdmin, async (req, res) => {
  try {
    const { id, name, price, description } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description || '';

    if (price !== undefined) {
      if (price === '' || price === null) {
        updateData.price = null;
      } else {
        const numPrice = parseFloat(price);
        updateData.price = isNaN(numPrice) ? null : numPrice;
      }
    }

    await models.WeeklySpecial.findOneAndUpdate({ id: parseInt(id) }, updateData);
    res.json({ success: true });
  } catch (error) {
    console.error('Haftalık ürün güncelleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/upload-weekly-image', isAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
    }

    const { specialId } = req.body;
    const special = await models.WeeklySpecial.findOne({ id: parseInt(specialId) });

    if (special) {
      if (special.image) await deleteFromCloudinary(special.image);

      const result = await uploadToCloudinary(req.file.buffer, 'weekly-specials');
      special.image = result.secure_url;
      await special.save();

      res.json({ success: true, imagePath: result.secure_url });
    } else {
      res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }
  } catch (error) {
    console.error('Resim yükleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-weekly-image', isAdmin, async (req, res) => {
  try {
    const { specialId } = req.body;
    const special = await models.WeeklySpecial.findOne({ id: parseInt(specialId) });

    if (special) {
      if (special.image) await deleteFromCloudinary(special.image);
      special.image = null;
      await special.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
    }
  } catch (error) {
    console.error('Resim silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CAMPAIGNS ROUTES ====================

app.post('/admin/add-campaign', isAdmin, async (req, res) => {
  try {
    const { name, old_price, new_price, description } = req.body;

    const maxCampaign = await models.Campaign.findOne().sort('-id');
    const newId = maxCampaign ? maxCampaign.id + 1 : 1;

    await models.Campaign.create({
      id: newId,
      title: name,
      description: description || '',
      discount: old_price && new_price ? `${old_price} TL -> ${new_price} TL` : null,
      old_price: old_price ? parseFloat(old_price) : null,
      new_price: new_price ? parseFloat(new_price) : null,
      is_active: true,
      start_date: new Date(),
      end_date: null
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Kampanya ekleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-campaign', isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await models.Campaign.findOneAndDelete({ id: parseInt(id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Kampanya silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/upload-campaign-image', isAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
    }

    const { campaignId } = req.body;
    const campaign = await models.Campaign.findOne({ id: parseInt(campaignId) });

    if (campaign) {
      if (campaign.image) await deleteFromCloudinary(campaign.image);

      const result = await uploadToCloudinary(req.file.buffer, 'campaigns');
      campaign.image = result.secure_url;
      await campaign.save();

      res.json({ success: true, image: result.secure_url });
    } else {
      res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });
    }
  } catch (error) {
    console.error('Kampanya resim yükleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-campaign-image', isAdmin, async (req, res) => {
  try {
    const { campaignId } = req.body;
    const campaign = await models.Campaign.findOne({ id: parseInt(campaignId) });

    if (campaign) {
      if (campaign.image) await deleteFromCloudinary(campaign.image);
      campaign.image = null;
      await campaign.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });
    }
  } catch (error) {
    console.error('Kampanya resim silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});




app.post('/admin/add-instagram-post', isAdmin, async (req, res) => {
  try {
    const { caption } = req.body;

    const maxPost = await models.InstagramPost.findOne().sort('-id');
    const newId = maxPost ? maxPost.id + 1 : 1;

    const allPosts = await models.InstagramPost.find();
    const maxOrder = allPosts.length > 0 ? Math.max(...allPosts.map(p => p.display_order || 0)) : -1;

    await models.InstagramPost.create({
      id: newId,
      caption: caption || '',
      image: null,
      display_order: maxOrder + 1
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Instagram post ekleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/update-instagram-post', isAdmin, async (req, res) => {
  try {
    const { id, caption } = req.body;
    await models.InstagramPost.findOneAndUpdate({ id: parseInt(id) }, { caption: caption || '' });
    res.json({ success: true });
  } catch (error) {
    console.error('Instagram post güncelleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-instagram-post', isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await models.InstagramPost.findOneAndDelete({ id: parseInt(id) });
    res.json({ success: true });
  } catch (error) {
    console.error('Instagram post silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/upload-instagram-image', isAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
    }

    const { postId } = req.body;
    const post = await models.InstagramPost.findOne({ id: parseInt(postId) });

    if (post) {
      if (post.image) await deleteFromCloudinary(post.image);

      const result = await uploadToCloudinary(req.file.buffer, 'instagram');
      post.image = result.secure_url;
      await post.save();

      res.json({ success: true, imagePath: result.secure_url });
    } else {
      res.status(404).json({ success: false, error: 'Post bulunamadı' });
    }
  } catch (error) {
    console.error('Resim yükleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/admin/delete-instagram-image', isAdmin, async (req, res) => {
  try {
    const { postId } = req.body;
    const post = await models.InstagramPost.findOne({ id: parseInt(postId) });

    if (post) {
      if (post.image) await deleteFromCloudinary(post.image);
      post.image = null;
      await post.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Post bulunamadı' });
    }
  } catch (error) {
    console.error('Resim silme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ADMIN UTILITIES ====================

app.post('/admin/change-password', isAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await models.Admin.findOne();

    if (admin && bcrypt.compareSync(currentPassword, admin.password)) {
      admin.password = bcrypt.hashSync(newPassword, 10);
      await admin.save();
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Mevcut şifre hatalı!' });
    }
  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATISTICS & EXPORT ====================

app.post('/api/track-click', async (req, res) => {
  try {
    const { categoryId, categoryName } = req.body;

    // Kategori istatistiğini güncelle
    const categoryStats = await models.CategoryStats.findOne({ categoryId: parseInt(categoryId) });

    if (categoryStats) {
      categoryStats.totalClicks += 1;
      categoryStats.lastClicked = new Date();
      await categoryStats.save();
    } else {
      await models.CategoryStats.create({
        categoryId: parseInt(categoryId),
        categoryName: categoryName,
        totalClicks: 1,
        lastClicked: new Date()
      });
    }

    // Günlük istatistik
    const today = new Date().toISOString().split('T')[0];
    let dailyStats = await models.Statistics.findOne({ date: today });

    if (dailyStats) {
      if (!dailyStats.categoryClicks) dailyStats.categoryClicks = {};
      const key = categoryId.toString();
      dailyStats.categoryClicks[key] = (dailyStats.categoryClicks[key] || 0) + 1;
      dailyStats.totalClicks = (dailyStats.totalClicks || 0) + 1;
      await dailyStats.save();
    } else {
      const clicksObj = {};
      clicksObj[categoryId.toString()] = 1;
      await models.Statistics.create({
        date: today,
        categoryClicks: clicksObj,
        totalClicks: 1
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('İstatistik kaydetme hatası:', error);
    res.json({ success: false, error: error.message });
  }
});

app.get('/admin/statistics', isAdmin, async (req, res) => {
  try {
    const categoryStats = await models.CategoryStats.find();
    const dailyStats = await models.Statistics.find().sort('-date').limit(30);

    // Kategori istatistiklerini formatla
    const categoryClicks = {};
    categoryStats.forEach(stat => {
      categoryClicks[stat.categoryId] = {
        name: stat.categoryName,
        totalClicks: stat.totalClicks,
        lastClicked: stat.lastClicked ? (typeof stat.lastClicked === 'string' ? stat.lastClicked : stat.lastClicked.toISOString()) : null
      };
    });

    // Günlük istatistikleri formatla
    const dailyClicks = {};
    dailyStats.forEach(stat => {
      dailyClicks[stat.date] = {};
      if (stat.categoryClicks && typeof stat.categoryClicks === 'object') {
        Object.entries(stat.categoryClicks).forEach(([categoryId, clicks]) => {
          const catStat = categoryStats.find(cs => cs.categoryId == parseInt(categoryId));
          dailyClicks[stat.date][categoryId] = {
            name: catStat ? catStat.categoryName : 'Bilinmiyor',
            clicks: clicks
          };
        });
      }
    });

    res.json({ categoryClicks, dailyClicks });
  } catch (error) {
    console.error('İstatistik getirme hatası:', error);
    res.json({ categoryClicks: {}, dailyClicks: {} });
  }
});

app.post('/admin/reset-statistics', isAdmin, async (req, res) => {
  try {
    await models.CategoryStats.deleteMany({});
    await models.Statistics.deleteMany({});
    res.json({ success: true, message: 'İstatistikler sıfırlandı' });
  } catch (error) {
    console.error('İstatistik sıfırlama hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/admin/export-statistics', isAdmin, async (req, res) => {
  try {
    const categories = await models.Category.find().sort('display_order');
    const items = await models.MenuItem.find().sort('display_order');
    const categoryStats = await models.CategoryStats.find();
    const dailyStats = await models.Statistics.find().sort('-date');

    const workbook = xlsx.utils.book_new();

    // Sheet 1: Kategori İstatistikleri
    const statsData = [
      ['Kategori Adı', 'Toplam Tıklama', 'Son Tıklama', 'Ürün Sayısı'],
      ...categories.map(cat => {
        const itemCount = items.filter(item => item.category_id === cat.id).length;
        const stat = categoryStats.find(s => s.categoryId === cat.id);
        return [
          cat.name,
          stat ? stat.totalClicks : 0,
          stat && stat.lastClicked ? new Date(stat.lastClicked).toLocaleString('tr-TR') : '-',
          itemCount
        ];
      })
    ];

    const worksheet1 = xlsx.utils.aoa_to_sheet(statsData);
    worksheet1['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 12 }];
    xlsx.utils.book_append_sheet(workbook, worksheet1, 'Kategori İstatistikleri');

    // Sheet 2: Günlük Detaylar
    const dailyData = [['Tarih', 'Kategori', 'Tıklama Sayısı']];

    dailyStats.forEach(dayStat => {
      if (dayStat.categoryClicks && typeof dayStat.categoryClicks === 'object') {
        Object.entries(dayStat.categoryClicks).forEach(([categoryId, clicks]) => {
          const category = categories.find(c => c.id == parseInt(categoryId));
          dailyData.push([
            dayStat.date,
            category ? category.name : 'Bilinmiyor',
            clicks
          ]);
        });
      }
    });

    const worksheet2 = xlsx.utils.aoa_to_sheet(dailyData);
    worksheet2['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 15 }];
    xlsx.utils.book_append_sheet(workbook, worksheet2, 'Günlük Detaylar');

    // Sheet 3: Ürünler
    const itemsData = [
      ['Kategori', 'Ürün Adı', 'Fiyat', 'Durum'],
      ...items.map(item => {
        const category = categories.find(cat => cat.id === item.category_id);
        return [
          category ? category.name : 'Bilinmiyor',
          item.name,
          item.price || '-',
          item.is_available ? 'Aktif' : 'Pasif'
        ];
      })
    ];

    const worksheet3 = xlsx.utils.aoa_to_sheet(itemsData);
    xlsx.utils.book_append_sheet(workbook, worksheet3, 'Ürünler');

    const today = new Date().toISOString().split('T')[0];
    const filename = `menu-rapor-${today}.xlsx`;
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Excel export hatası:', error);
    res.status(500).send('Excel oluşturulamadı');
  }
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';

  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
      }
    });
  });

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         🎉 Zeyl Coffee QR Menü Sistemi Başlatıldı            ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  📱 BİLGİSAYARDAN:                                            ║
║     http://localhost:${PORT}                                      ║
║                                                                ║
║  📱 TELEFONDAN (Aynı WiFi'de):                                ║
║     http://${localIP}:${PORT}                                ║
║                                                                ║
║  🔐 ADMIN PANELİ:                                             ║
║     http://${localIP}:${PORT}/admin/login                     ║
║                                                                ║
║  👤 Admin Kullanıcı Adı: admin                                ║
║  🔑 Admin Şifre: zeyl2025                                     ║
║                                                                ║
║  💡 MongoDB bağlantısı aktif!                                 ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
