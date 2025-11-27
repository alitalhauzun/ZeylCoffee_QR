const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
require('dotenv').config();
const mongoose = require('mongoose');
const models = require('./models');

const app = express();

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'item-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// MongoDB Bağlantısı
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zeyl-menu';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB bağlantısı başarılı!');
  })
  .catch((err) => {
    console.error('❌ MongoDB bağlantı hatası:', err.message);
    process.exit(1);
  });

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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


// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'zeyl-coffee-secret-2025-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: false, // Render.com için false yapıldı
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

// ROUTES

// Ana sayfa - Müşteri Menüsü (Premium)
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
    console.error('Hata:', error);
    res.status(500).send('Bir hata oluştu');
  }
});

// Admin giriş sayfası
app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', { error: null });
});

// Admin giriş işlemi
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await models.Admin.findOne({ username });
    
    if (admin && bcrypt.compareSync(password, admin.password)) {
      req.session.isAdmin = true;
      res.redirect('/admin/dashboard');
    } else {
      res.render('admin-login', { error: 'Kullanıcı adı veya şifre hatalı!' });
    }
  } catch (error) {
    console.error('Login hatası:', error);
    res.render('admin-login', { error: 'Bir hata oluştu' });
  }
});
// Admin çıkış
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin panel - Dashboard
app.get('/admin/dashboard', isAdmin, (req, res) => {
  db = loadDatabase();
  const menuData = db.categories.map(cat => {
    const items = db.menuItems.filter(item => item.category_id === cat.id)
      .sort((a, b) => a.display_order - b.display_order);
    return { category: cat, items: items };
  });
  res.render('admin-dashboard', { 
    menuData, 
    categories: db.categories, 
    weeklySpecials: db.weeklySpecials || [], 
    campaigns: db.campaigns || [],
    instagramPosts: db.instagramPosts || [] 
  });
});

// Ürün güncelle
app.post('/admin/update-item', isAdmin, (req, res) => {
  const { id, name, price, description, is_available } = req.body;
  db = loadDatabase();

  const itemIndex = db.menuItems.findIndex(item => item.id === parseInt(id));
  if (itemIndex !== -1) {
    const item = db.menuItems[itemIndex];

    // Sadece gönderilen alanları güncelle (partial update)
    if (name !== undefined) {
      item.name = name;
    }

    if (price !== undefined) {
      if (price === '' || price === null) {
        item.price = null;
      } else {
        const numPrice = parseFloat(price);
        item.price = isNaN(numPrice) ? null : numPrice;
      }
    }

    if (description !== undefined) {
      item.description = description || '';
    }

    if (typeof is_available !== 'undefined') {
      // Hem boolean hem "1"/"0" string değerlerini destekle
      item.is_available = (is_available === true || is_available === '1' || is_available === 1) ? 1 : 0;
    }

    saveDatabase(db);
  }

  res.json({ success: true });
});

// Resim yükle
app.post('/admin/upload-image', isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
  }

  const { itemId } = req.body;
  db = loadDatabase();
  
  const itemIndex = db.menuItems.findIndex(item => item.id === parseInt(itemId));
  if (itemIndex !== -1) {
    // Eski resmi sil
    if (db.menuItems[itemIndex].image && db.menuItems[itemIndex].image.startsWith('uploads/')) {
      const oldImagePath = path.join(__dirname, 'public', db.menuItems[itemIndex].image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    // Yeni resmi kaydet
    db.menuItems[itemIndex].image = 'uploads/' + req.file.filename;
    saveDatabase(db);
    
    res.json({ 
      success: true, 
      imagePath: 'uploads/' + req.file.filename 
    });
  } else {
    res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
  }
});

// Resmi sil
app.post('/admin/delete-image', isAdmin, (req, res) => {
  const { itemId } = req.body;
  db = loadDatabase();
  
  const itemIndex = db.menuItems.findIndex(item => item.id === parseInt(itemId));
  if (itemIndex !== -1) {
    if (db.menuItems[itemIndex].image && db.menuItems[itemIndex].image.startsWith('uploads/')) {
      const imagePath = path.join(__dirname, 'public', db.menuItems[itemIndex].image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    db.menuItems[itemIndex].image = null;
    saveDatabase(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
  }
});

// Haftanın ürünü için resim yükle
app.post('/admin/upload-weekly-image', isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
  }
  
  const { specialId } = req.body;
  db = loadDatabase();
  
  const specialIndex = db.weeklySpecials.findIndex(s => s.id === parseInt(specialId));
  if (specialIndex !== -1) {
    // Eski resmi sil
    if (db.weeklySpecials[specialIndex].image && db.weeklySpecials[specialIndex].image.startsWith('uploads/')) {
      const oldImagePath = path.join(__dirname, 'public', db.weeklySpecials[specialIndex].image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    // Yeni resmi kaydet
    db.weeklySpecials[specialIndex].image = 'uploads/' + req.file.filename;
    saveDatabase(db);
    
    res.json({ 
      success: true, 
      imagePath: 'uploads/' + req.file.filename 
    });
  } else {
    res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
  }
});

// Haftanın ürünü resmini sil
app.post('/admin/delete-weekly-image', isAdmin, (req, res) => {
  const { specialId } = req.body;
  db = loadDatabase();
  
  const specialIndex = db.weeklySpecials.findIndex(s => s.id === parseInt(specialId));
  if (specialIndex !== -1) {
    if (db.weeklySpecials[specialIndex].image && db.weeklySpecials[specialIndex].image.startsWith('uploads/')) {
      const imagePath = path.join(__dirname, 'public', db.weeklySpecials[specialIndex].image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    db.weeklySpecials[specialIndex].image = null;
    saveDatabase(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Ürün bulunamadı' });
  }
});


// Ürün sil
app.post('/admin/delete-item', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();
  
  db.menuItems = db.menuItems.filter(item => item.id !== parseInt(id));
  saveDatabase(db);
  
  res.json({ success: true });
});

// Yeni ürün ekle
app.post('/admin/add-item', isAdmin, (req, res) => {
  const { category_id, name, price, description } = req.body;
  db = loadDatabase();
  
  const maxId = Math.max(...db.menuItems.map(item => item.id), 0);
  const categoryItems = db.menuItems.filter(item => item.category_id === parseInt(category_id));
  const maxOrder = Math.max(...categoryItems.map(item => item.display_order), -1);
  
  db.menuItems.push({
    id: maxId + 1,
    category_id: parseInt(category_id),
    name: name,
    price: price || null,
    description: description || '',
    is_available: 1,
    display_order: maxOrder + 1
  });
  
  saveDatabase(db);
  res.json({ success: true });
});

// Yeni kategori ekle
app.post('/admin/add-category', isAdmin, (req, res) => {
  const { name } = req.body;
  db = loadDatabase();
  
  const maxId = Math.max(...db.categories.map(cat => cat.id), 0);
  const maxOrder = Math.max(...db.categories.map(cat => cat.display_order), -1);
  
  db.categories.push({
    id: maxId + 1,
    name: name,
    display_order: maxOrder + 1
  });
  
  saveDatabase(db);
  res.json({ success: true });
});

// Kategori sil
app.post('/admin/delete-category', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();
  
  // Kategorideki tüm ürünleri de sil
  db.menuItems = db.menuItems.filter(item => item.category_id !== parseInt(id));
  db.categories = db.categories.filter(cat => cat.id !== parseInt(id));
  
  saveDatabase(db);
  res.json({ success: true });
});

// İstatistik kaydet (Müşteri menüsünden)
app.post('/api/track-click', (req, res) => {
  const { categoryId, categoryName } = req.body;
  db = loadDatabase();
  
  // İstatistik yapısı yoksa oluştur
  if (!db.statistics) {
    db.statistics = {
      categoryClicks: {},
      dailyClicks: {}
    };
  }
  
  // Kategori tıklama sayısını artır
  if (!db.statistics.categoryClicks[categoryId]) {
    db.statistics.categoryClicks[categoryId] = {
      name: categoryName,
      totalClicks: 0,
      lastClicked: null
    };
  }
  db.statistics.categoryClicks[categoryId].totalClicks++;
  db.statistics.categoryClicks[categoryId].lastClicked = new Date().toISOString();
  
  // Günlük istatistik
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  if (!db.statistics.dailyClicks[today]) {
    db.statistics.dailyClicks[today] = {};
  }
  if (!db.statistics.dailyClicks[today][categoryId]) {
    db.statistics.dailyClicks[today][categoryId] = {
      name: categoryName,
      clicks: 0
    };
  }
  db.statistics.dailyClicks[today][categoryId].clicks++;
  
  saveDatabase(db);
  res.json({ success: true });
});

// İstatistikleri getir (Admin paneli için)
app.get('/admin/statistics', isAdmin, (req, res) => {
  db = loadDatabase();
  
  if (!db.statistics) {
    db.statistics = {
      categoryClicks: {},
      dailyClicks: {}
    };
  }
  
  res.json(db.statistics);
});

// İstatistikleri sıfırla
app.post('/admin/reset-statistics', isAdmin, (req, res) => {
  db = loadDatabase();
  
  db.statistics = {
    categoryClicks: {},
    dailyClicks: {}
  };
  
  saveDatabase(db);
  res.json({ success: true, message: 'İstatistikler sıfırlandı' });
});

// İstatistikleri Excel olarak indir (.xlsx formatında)
app.get('/admin/export-statistics', isAdmin, (req, res) => {
  db = loadDatabase();
  
  if (!db.statistics || !db.statistics.categoryClicks) {
    return res.status(404).send('İstatistik bulunamadı');
  }

  // Workbook oluştur
  const workbook = xlsx.utils.book_new();

  // Sheet 1: Toplam İstatistikler
  const statsData = [
    [''], // 1. satır boş
    ['Kategori Adı', 'Toplam Tıklama', 'Son Tıklama'] // 2. satır başlıklar
  ];

  // Verileri sırala (en çok tıklanandan en az tıklanana)
  const sortedStats = Object.entries(db.statistics.categoryClicks)
    .sort((a, b) => b[1].totalClicks - a[1].totalClicks);

  sortedStats.forEach(([categoryId, data]) => {
    const lastClicked = data.lastClicked 
      ? new Date(data.lastClicked).toLocaleString('tr-TR')
      : 'Hiç tıklanmadı';
    statsData.push([data.name, data.totalClicks, lastClicked]);
  });

  const worksheet1 = xlsx.utils.aoa_to_sheet(statsData);
  
  // Sütun genişlikleri
  worksheet1['!cols'] = [
    { wch: 25 }, // A sütunu (Kategori Adı)
    { wch: 15 }, // B sütunu (Toplam Tıklama)
    { wch: 25 }  // C sütunu (Son Tıklama)
  ];

  xlsx.utils.book_append_sheet(workbook, worksheet1, 'Toplam İstatistikler');

  // Sheet 2: Günlük Detaylar
  const dailyData = [
    [''], // 1. satır boş
    ['Tarih', 'Kategori', 'Tıklama Sayısı'] // 2. satır başlıklar
  ];

  // Tarihleri sırala (en yeniden en eskiye)
  const sortedDates = Object.entries(db.statistics.dailyClicks)
    .sort((a, b) => b[0].localeCompare(a[0]));

  sortedDates.forEach(([date, categories]) => {
    Object.entries(categories).forEach(([categoryId, data]) => {
      dailyData.push([date, data.name, data.clicks]);
    });
  });

  const worksheet2 = xlsx.utils.aoa_to_sheet(dailyData);
  
  // Sütun genişlikleri
  worksheet2['!cols'] = [
    { wch: 15 }, // A sütunu (Tarih)
    { wch: 25 }, // B sütunu (Kategori)
    { wch: 15 }  // C sütunu (Tıklama Sayısı)
  ];

  xlsx.utils.book_append_sheet(workbook, worksheet2, 'Günlük Detaylar');

  // Dosya oluştur
  const today = new Date().toISOString().split('T')[0];
  const filename = `istatistikler-${today}.xlsx`;
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});


// Haftanın ürünü ekle
app.post('/admin/add-weekly-special', isAdmin, (req, res) => {
  const { name, price, description } = req.body;
  db = loadDatabase();
  
  const maxId = db.weeklySpecials.length > 0 ? Math.max(...db.weeklySpecials.map(s => s.id)) : 0;
  
  db.weeklySpecials.push({
    id: maxId + 1,
    name: name,
    price: price || null,
    description: description || '',
    image: null,
    display_order: db.weeklySpecials.length
  });
  
  saveDatabase(db);
  res.json({ success: true });
});

// Haftanın ürünü sil
app.post('/admin/delete-weekly-special', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();
  
  db.weeklySpecials = db.weeklySpecials.filter(s => s.id !== parseInt(id));
  saveDatabase(db);
  
  res.json({ success: true });
});

// Haftanın ürünü güncelle
app.post('/admin/update-weekly-special', isAdmin, (req, res) => {
  const { id, name, price, description } = req.body;
  db = loadDatabase();

  const specialIndex = db.weeklySpecials.findIndex(s => s.id === parseInt(id));
  if (specialIndex !== -1) {
    const special = db.weeklySpecials[specialIndex];

    if (name !== undefined) {
      special.name = name;
    }

    if (price !== undefined) {
      if (price === '' || price === null) {
        special.price = null;
      } else {
        const numPrice = parseFloat(price);
        special.price = isNaN(numPrice) ? null : numPrice;
      }
    }

    if (description !== undefined) {
      special.description = description || '';
    }

    saveDatabase(db);
  }

  res.json({ success: true });
});


// ============= KAMPANYALAR İŞLEMLERİ =============

// Kampanya ekle
app.post('/admin/add-campaign', isAdmin, (req, res) => {
  const { name, old_price, new_price, description } = req.body;
  db = loadDatabase();
  
  if (!db.campaigns) {
    db.campaigns = [];
  }
  
  const maxId = db.campaigns.length > 0 ? Math.max(...db.campaigns.map(c => c.id)) : 0;
  
  db.campaigns.push({
    id: maxId + 1,
    name: name,
    old_price: old_price || null,
    new_price: new_price || null,
    description: description || '',
    image: null,
    display_order: db.campaigns.length
  });
  
  saveDatabase(db);
  res.json({ success: true });
});

// Kampanya sil
app.post('/admin/delete-campaign', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();
  
  if (!db.campaigns) {
    db.campaigns = [];
  }
  
  // Resmi sil
  const campaign = db.campaigns.find(c => c.id === parseInt(id));
  if (campaign && campaign.image && campaign.image.startsWith('uploads/')) {
    const imagePath = path.join(__dirname, 'public', campaign.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
  
  db.campaigns = db.campaigns.filter(c => c.id !== parseInt(id));
  saveDatabase(db);
  
  res.json({ success: true });
});

// Kampanya güncelle
app.post('/admin/update-campaign', isAdmin, (req, res) => {
  const { id, name, old_price, new_price, description } = req.body;
  db = loadDatabase();

  if (!db.campaigns) {
    db.campaigns = [];
  }

  const campaignIndex = db.campaigns.findIndex(c => c.id === parseInt(id));
  if (campaignIndex !== -1) {
    const campaign = db.campaigns[campaignIndex];

    if (name !== undefined) {
      campaign.name = name;
    }

    if (old_price !== undefined) {
      if (old_price === '' || old_price === null) {
        campaign.old_price = null;
      } else {
        const numPrice = parseFloat(old_price);
        campaign.old_price = isNaN(numPrice) ? null : numPrice;
      }
    }

    if (new_price !== undefined) {
      if (new_price === '' || new_price === null) {
        campaign.new_price = null;
      } else {
        const numPrice = parseFloat(new_price);
        campaign.new_price = isNaN(numPrice) ? null : numPrice;
      }
    }

    if (description !== undefined) {
      campaign.description = description || '';
    }

    saveDatabase(db);
  }

  res.json({ success: true });
});

// Kampanya resmi yükle
app.post('/admin/upload-campaign-image', isAdmin, upload.single('image'), (req, res) => {
  const campaignId = req.body.campaignId;
  
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Resim yüklenemedi.' });
  }

  db = loadDatabase();
  
  if (!db.campaigns) {
    db.campaigns = [];
  }

  const campaignIndex = db.campaigns.findIndex(c => c.id === parseInt(campaignId));

  if (campaignIndex === -1) {
    return res.status(404).json({ success: false, error: 'Kampanya bulunamadı.' });
  }

  // Eski resmi sil
  if (db.campaigns[campaignIndex].image && db.campaigns[campaignIndex].image.startsWith('uploads/')) {
    const oldImagePath = path.join(__dirname, 'public', db.campaigns[campaignIndex].image);
    if (fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
    }
  }

  // Yeni resmi kaydet
  db.campaigns[campaignIndex].image = 'uploads/' + req.file.filename;
  saveDatabase(db);

  res.json({ 
    success: true, 
    image: 'uploads/' + req.file.filename 
  });
});

// Kampanya resmini sil
app.post('/admin/delete-campaign-image', isAdmin, (req, res) => {
  const { campaignId } = req.body;
  db = loadDatabase();

  if (!db.campaigns) {
    db.campaigns = [];
  }

  const campaignIndex = db.campaigns.findIndex(c => c.id === parseInt(campaignId));
  if (campaignIndex !== -1) {
    if (db.campaigns[campaignIndex].image && db.campaigns[campaignIndex].image.startsWith('uploads/')) {
      const imagePath = path.join(__dirname, 'public', db.campaigns[campaignIndex].image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    db.campaigns[campaignIndex].image = null;
    saveDatabase(db);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });
  }
});


// Instagram fotoğrafı ekle
app.post('/admin/add-instagram-post', isAdmin, (req, res) => {
  const { caption } = req.body;
  db = loadDatabase();

  if (!db.instagramPosts) {
    db.instagramPosts = [];
  }

  const maxId = db.instagramPosts.length > 0 ? Math.max(...db.instagramPosts.map(p => p.id)) : 0;

  db.instagramPosts.push({
    id: maxId + 1,
    caption: caption || '',
    image: null,
    display_order: db.instagramPosts.length
  });

  saveDatabase(db);
  res.json({ success: true });
});

// Instagram fotoğrafını güncelle
app.post('/admin/update-instagram-post', isAdmin, (req, res) => {
  const { id, caption } = req.body;
  db = loadDatabase();

  const index = db.instagramPosts.findIndex(p => p.id === parseInt(id));
  if (index !== -1) {
    if (typeof caption !== 'undefined') {
      db.instagramPosts[index].caption = caption;
    }
    saveDatabase(db);
  }

  res.json({ success: true });
});

// Instagram fotoğrafını sil
app.post('/admin/delete-instagram-post', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();

  const index = db.instagramPosts.findIndex(p => p.id === parseInt(id));
  if (index !== -1) {
    const post = db.instagramPosts[index];
    if (post.image && post.image.startsWith('uploads/')) {
      const imagePath = path.join(__dirname, 'public', post.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    db.instagramPosts.splice(index, 1);
    // display_order'ı yeniden sırala
    db.instagramPosts.forEach((p, idx) => {
      p.display_order = idx;
    });
    saveDatabase(db);
  }

  res.json({ success: true });
});

// Instagram fotoğrafını sil
app.post('/admin/delete-instagram-post', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();

  const index = db.instagramPosts.findIndex(p => p.id === parseInt(id));
  if (index !== -1) {
    const post = db.instagramPosts[index];
    if (post.image && post.image.startsWith('uploads/')) {
      const imagePath = path.join(__dirname, 'public', post.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    db.instagramPosts.splice(index, 1);
    // display_order'ı yeniden sırala
    db.instagramPosts.forEach((p, idx) => {
      p.display_order = idx;
    });
    saveDatabase(db);
  }

  res.json({ success: true });
});


// Instagram fotoğrafının sadece resmini sil
app.post('/admin/delete-instagram-image', isAdmin, (req, res) => {
  const { id } = req.body;
  db = loadDatabase();

  const index = db.instagramPosts.findIndex(p => p.id === parseInt(id));
  if (index !== -1) {
    const post = db.instagramPosts[index];
    if (post.image && post.image.startsWith('uploads/')) {
      const imagePath = path.join(__dirname, 'public', post.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    db.instagramPosts[index].image = null;
    saveDatabase(db);
  }

  res.json({ success: true });
});

// Instagram fotoğrafı resmi yükle
app.post('/admin/upload-instagram-image', isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
  }

  const { postId } = req.body;
  db = loadDatabase();

  const index = db.instagramPosts.findIndex(p => p.id === parseInt(postId));
  if (index !== -1) {
    // Eski resmi sil
    if (db.instagramPosts[index].image && db.instagramPosts[index].image.startsWith('uploads/')) {
      const oldImagePath = path.join(__dirname, 'public', db.instagramPosts[index].image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    db.instagramPosts[index].image = 'uploads/' + req.file.filename;
    saveDatabase(db);

    return res.json({
      success: true,
      imagePath: 'uploads/' + req.file.filename
    });
  }

  res.status(404).json({ success: false, error: 'Instagram postu bulunamadı' });
});

// Şifre değiştir
app.post('/admin/change-password', isAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  db = loadDatabase();
  
  if (bcrypt.compareSync(currentPassword, db.admin.password)) {
    db.admin.password = bcrypt.hashSync(newPassword, 10);
    saveDatabase(db);
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Mevcut şifre hatalı!' });
  }
});

// Kategori sıralamasını güncelle
app.post('/admin/reorder-categories', isAdmin, (req, res) => {
  const { categoryId, direction } = req.body;
  db = loadDatabase();
  
  const categoryIndex = db.categories.findIndex(cat => cat.id === parseInt(categoryId));
  if (categoryIndex === -1) {
    return res.json({ success: false, error: 'Kategori bulunamadı' });
  }
  
  const currentOrder = db.categories[categoryIndex].display_order;
  
  if (direction === 'up' && categoryIndex > 0) {
    // Yukarı taşı
    const prevCategory = db.categories[categoryIndex - 1];
    db.categories[categoryIndex].display_order = prevCategory.display_order;
    prevCategory.display_order = currentOrder;
    
    // Array'i yeniden sırala
    db.categories.sort((a, b) => a.display_order - b.display_order);
  } else if (direction === 'down' && categoryIndex < db.categories.length - 1) {
    // Aşağı taşı
    const nextCategory = db.categories[categoryIndex + 1];
    db.categories[categoryIndex].display_order = nextCategory.display_order;
    nextCategory.display_order = currentOrder;
    
    // Array'i yeniden sırala
    db.categories.sort((a, b) => a.display_order - b.display_order);
  }
  
  saveDatabase(db);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(interface => {
      if (interface.family === 'IPv4' && !interface.internal) {
        localIP = interface.address;
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
║  💡 NOT: Telefon ve bilgisayar aynı WiFi'de olmalı!          ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
