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

const upload = multer({
  storage: storage,
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

// MongoDB Bağlantısı
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zeyl-menu';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB bağlantısı başarılı!'))
  .catch((err) => {
    console.error('❌ MongoDB bağlantı hatası:', err.message);
    process.exit(1);
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
      if (item.image && item.image.startsWith('uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', item.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      item.image = 'uploads/' + req.file.filename;
      await item.save();
      
      res.json({ success: true, imagePath: 'uploads/' + req.file.filename });
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
      if (item.image && item.image.startsWith('uploads/')) {
        const imagePath = path.join(__dirname, 'public', item.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
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
    const { name } = req.body;
    
    const maxCategory = await models.Category.findOne().sort('-id');
    const newId = maxCategory ? maxCategory.id + 1 : 1;
    
    const maxOrderCat = await models.Category.findOne().sort('-display_order');
    const maxOrder = maxOrderCat ? maxOrderCat.display_order : -1;
    
    await models.Category.create({
      id: newId,
      name: name,
      display_order: maxOrder + 1
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Kategori ekleme hatası:', error);
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
      if (special.image && special.image.startsWith('uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', special.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      special.image = 'uploads/' + req.file.filename;
      await special.save();
      
      res.json({ success: true, imagePath: 'uploads/' + req.file.filename });
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
      if (special.image && special.image.startsWith('uploads/')) {
        const imagePath = path.join(__dirname, 'public', special.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
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
    
    const allCampaigns = await models.Campaign.find();
    
    await models.Campaign.create({
      id: newId,
      title: name,
      description: description || '',
      discount: old_price && new_price ? `${old_price} TL -> ${new_price} TL` : null,
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

app.post('/admin/update-campaign', isAdmin, async (req, res) => {
  try {
    const { id, name, old_price, new_price, description } = req.body;
    const updateData = {};
    
    if (name !== undefined) updateData.title = name;
    if (description !== undefined) updateData.description = description || '';
    if (old_price !== undefined && new_price !== undefined) {
      updateData.discount = `${old_price} TL -> ${new_price} TL`;
    }
    
    await models.Campaign.findOneAndUpdate({ id: parseInt(id) }, updateData);
    res.json({ success: true });
  } catch (error) {
    console.error('Kampanya güncelleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ← BURAYA EKLEYIN ↓

app.post('/admin/upload-campaign-image', isAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Resim yüklenemedi' });
    }
    
    const { campaignId } = req.body;
    const campaign = await models.Campaign.findOne({ id: parseInt(campaignId) });
    
    if (campaign) {
      // Eski resmi sil
      if (campaign.image && campaign.image.startsWith('uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', campaign.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      // Yeni resmi kaydet
      campaign.image = 'uploads/' + req.file.filename;
      await campaign.save();
      
      res.json({ success: true, image: 'uploads/' + req.file.filename });
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
      if (campaign.image && campaign.image.startsWith('uploads/')) {
        const imagePath = path.join(__dirname, 'public', campaign.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
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

// ==================== INSTAGRAM POSTS ROUTES ====================

app.post('/admin/add-instagram-post', isAdmin, async (req, res) => {
  try {
    const { caption } = req.body;
    
    const maxPost = await models.InstagramPost.findOne().sort('-id');
    const newId = maxPost ? maxPost.id + 1 : 1;
    
    const allPosts = await models.InstagramPost.find();
    
    await models.InstagramPost.create({
      id: newId,
      image: null,
      caption: caption || '',
      display_order: allPosts.length
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
      if (post.image && post.image.startsWith('uploads/')) {
        const oldImagePath = path.join(__dirname, 'public', post.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      
      post.image = 'uploads/' + req.file.filename;
      await post.save();
      
      res.json({ success: true, imagePath: 'uploads/' + req.file.filename });
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
      if (post.image && post.image.startsWith('uploads/')) {
        const imagePath = path.join(__dirname, 'public', post.image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
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
      const clicks = dailyStats.categoryClicks.get(categoryId.toString()) || 0;
      dailyStats.categoryClicks.set(categoryId.toString(), clicks + 1);
      dailyStats.totalClicks += 1;
      await dailyStats.save();
    } else {
      const clicksMap = new Map();
      clicksMap.set(categoryId.toString(), 1);
      await models.Statistics.create({
        date: today,
        categoryClicks: clicksMap,
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
        lastClicked: stat.lastClicked ? stat.lastClicked.toISOString() : null
      };
    });
    
    // Günlük istatistikleri formatla
    const dailyClicks = {};
    dailyStats.forEach(stat => {
      dailyClicks[stat.date] = {};
      stat.categoryClicks.forEach((clicks, categoryId) => {
        const catStat = categoryStats.find(cs => cs.categoryId === parseInt(categoryId));
        dailyClicks[stat.date][categoryId] = {
          name: catStat ? catStat.categoryName : 'Bilinmiyor',
          clicks: clicks
        };
      });
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
      dayStat.categoryClicks.forEach((clicks, categoryId) => {
        const category = categories.find(c => c.id === parseInt(categoryId));
        dailyData.push([
          dayStat.date,
          category ? category.name : 'Bilinmiyor',
          clicks
        ]);
      });
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
