const mongoose = require('mongoose');

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });

// Category Schema
const categorySchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  display_order: { type: Number, required: true }
}, { timestamps: true });

// MenuItem Schema
// MenuItem Schema
const menuItemSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  category_id: { type: Number, required: true },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: false, default: null },  // ← DEĞİŞTİRİLDİ
  image: { type: String },
  is_available: { type: Boolean, default: true },
  display_order: { type: Number, default: 0 }
}, { timestamps: true });

// WeeklySpecial Schema
const weeklySpecialSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  image: { type: String },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

// Campaign Schema
const campaignSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  discount: { type: String },
  is_active: { type: Boolean, default: true },
  start_date: { type: Date },
  end_date: { type: Date }
}, { timestamps: true });

// InstagramPost Schema
const instagramPostSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  image: { type: String, required: true },
  caption: { type: String },
  display_order: { type: Number, default: 0 }
}, { timestamps: true });

// Export Models
module.exports = {
  Admin: mongoose.model('Admin', adminSchema),
  Category: mongoose.model('Category', categorySchema),
  MenuItem: mongoose.model('MenuItem', menuItemSchema),
  WeeklySpecial: mongoose.model('WeeklySpecial', weeklySpecialSchema),
  Campaign: mongoose.model('Campaign', campaignSchema),
  InstagramPost: mongoose.model('InstagramPost', instagramPostSchema)
};
