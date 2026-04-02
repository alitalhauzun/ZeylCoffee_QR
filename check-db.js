// MongoDB veritabanı durumu kontrol scripti
require('dotenv').config();
const mongoose = require('mongoose');

async function checkDB() {
  try {
    console.log('🔄 MongoDB\'ye bağlanılıyor...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB bağlantısı başarılı!\n');

    const db = mongoose.connection.db;
    
    // Veritabanı adını göster
    console.log('📦 Veritabanı:', db.databaseName);
    
    // Tüm collection'ları listele
    const collections = await db.listCollections().toArray();
    console.log('📋 Collection\'lar:', collections.map(c => c.name).join(', '));
    console.log('');

    // Her collection'daki verileri göster
    for (const col of collections) {
      const collection = db.collection(col.name);
      const count = await collection.countDocuments();
      console.log(`\n===== ${col.name} (${count} kayıt) =====`);
      
      const docs = await collection.find({}).toArray();
      docs.forEach(doc => {
        const { __v, ...cleanDoc } = doc;
        // Uzun verileri kısalt
        const summary = {};
        for (const [key, value] of Object.entries(cleanDoc)) {
          if (typeof value === 'string' && value.length > 100) {
            summary[key] = value.substring(0, 100) + '...';
          } else {
            summary[key] = value;
          }
        }
        console.log(JSON.stringify(summary, null, 2));
      });
    }

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Bağlantı kapatıldı.');
  }
}

checkDB();
