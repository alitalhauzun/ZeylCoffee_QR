const fs = require('fs');
const path = require('path');

// Basit dosya tabanlı veritabanı simülasyonu
const DB_FILE = path.join(__dirname, 'database.json');

// Varsayılan veriler (Eğer dosya yoksa)
const defaultData = {
  categories: [
    { id: 1, name: 'Sıcak Kahveler', display_order: 1, price_unit: 'TL' },
    { id: 2, name: 'Soğuk Kahveler', display_order: 2, price_unit: 'TL' },
    { id: 3, name: 'Tatlılar', display_order: 3, price_unit: 'TL' }
  ],
  menuItems: [
    { id: 1, category_id: 1, name: 'Espresso', price: 40, description: 'Tek shot espresso', is_available: true, image: null },
    { id: 2, category_id: 1, name: 'Latte', price: 55, description: 'Sütlü kahve', is_available: true, image: null },
    { id: 3, category_id: 2, name: 'Ice Latte', price: 60, description: 'Soğuk sütlü kahve', is_available: true, image: null },
    { id: 4, category_id: 3, name: 'Cheesecake', price: 85, description: 'Limonlu', is_available: true, image: null }
  ],
  weeklySpecials: [],
  campaigns: [],
  instagramPosts: [
    { id: 1, caption: 'Zengin kahvaltı tabağımızla gününüze güzel bir başlangıç yapın 🍳🧀', image: null, display_order: 1 },
    { id: 2, caption: 'En taze kahve çekirdekleri ile hazırlanan filtre kahvemiz ☕', image: null, display_order: 2 },
    { id: 3, caption: 'Levent Börek lezzeti şimdi Zeyl Coffee\'de! 🥐', image: null, display_order: 3 },
    { id: 4, caption: 'Tatlı krizine en iyi çözüm: Cheesecake 🍰', image: null, display_order: 4 },
    { id: 5, caption: 'Takeaway kahve keyfi 🏃‍♂️', image: null, display_order: 5 }
  ],
  admins: [{ username: 'admin', password: 'password' }]
};

// Veriyi yükle
function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Veriyi kaydet
function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Mock Model Oluşturucu
function createMockModel(collectionName) {
  return {
    find: (query = {}) => {
      const data = loadData();
      let results = data[collectionName] || [];

      // Basit filtreleme
      if (Object.keys(query).length > 0) {
        results = results.filter(item => {
          return Object.keys(query).every(key => item[key] == query[key]);
        });
      }

      // Sort ve limit zincirleme desteği
      function createChainable(arr) {
        const p = Promise.resolve(arr);
        p.sort = (field) => {
          if (typeof field === 'string') {
            const desc = field.startsWith('-');
            const fieldName = desc ? field.substring(1) : field;
            arr.sort((a, b) => {
              if (desc) return (b[fieldName] > a[fieldName] ? 1 : b[fieldName] < a[fieldName] ? -1 : 0);
              return (a[fieldName] > b[fieldName] ? 1 : a[fieldName] < b[fieldName] ? -1 : 0);
            });
          }
          return createChainable(arr);
        };
        p.limit = (n) => {
          return Promise.resolve(arr.slice(0, n));
        };
        return p;
      }

      return createChainable(results);
    },

    findOne: (query = {}) => {
      const data = loadData();
      let results = data[collectionName] || [];

      // Filtreleme
      let filtered = results.filter(item => {
        return Object.keys(query).every(key => item[key] == query[key]);
      });

      // Sonuç bul fonksiyonu (sort sonrası çağrılacak)
      function getResult(sortedList) {
        const item = sortedList.length > 0 ? sortedList[0] : undefined;

        // Objeye save() metodu ekle (Mongoose uyumluluğu için)
        if (item) {
          item.save = () => {
            const freshData = loadData();
            const list = freshData[collectionName] || [];
            // item'ın id'sine göre bul (daha güvenilir)
            const idx = list.findIndex(i => i.id !== undefined ? i.id == item.id : Object.keys(query).every(key => i[key] == query[key]));
            if (idx !== -1) {
              const { save, ...itemData } = item;
              list[idx] = itemData;
              saveData(freshData);
            }
            return Promise.resolve(item);
          };
        }
        return item;
      }

      const item = getResult(filtered);
      const resObj = Promise.resolve(item);

      // Sort desteği: findOne().sort('-id') gibi kullanımlar için
      resObj.sort = (field) => {
        if (typeof field === 'string') {
          const desc = field.startsWith('-');
          const fieldName = desc ? field.substring(1) : field;
          filtered.sort((a, b) => {
            if (desc) return (b[fieldName] || 0) - (a[fieldName] || 0);
            return (a[fieldName] || 0) - (b[fieldName] || 0);
          });
        }
        return Promise.resolve(getResult(filtered));
      };

      return resObj;
    },

    create: (newItem) => {
      const data = loadData();
      if (!data[collectionName]) data[collectionName] = [];
      data[collectionName].push(newItem);
      saveData(data);
      return Promise.resolve(newItem);
    },

    findOneAndUpdate: (query, update) => {
      const data = loadData();
      const list = data[collectionName] || [];
      const index = list.findIndex(item => Object.keys(query).every(key => item[key] == query[key]));

      if (index !== -1) {
        list[index] = { ...list[index], ...update };
        saveData(data);
        return Promise.resolve(list[index]);
      }
      return Promise.resolve(null);
    },

    findOneAndDelete: (query) => {
      const data = loadData();
      const list = data[collectionName] || [];
      const index = list.findIndex(item => Object.keys(query).every(key => item[key] == query[key]));

      if (index !== -1) {
        const deleted = list.splice(index, 1);
        saveData(data);
        return Promise.resolve(deleted[0]);
      }
      return Promise.resolve(null);
    },

    deleteMany: (query) => {
      const data = loadData();
      let list = data[collectionName] || [];
      const initialLength = list.length;

      list = list.filter(item => !Object.keys(query).every(key => item[key] == query[key]));
      data[collectionName] = list;

      saveData(data);
      return Promise.resolve({ deletedCount: initialLength - list.length });
    }
  };
}

module.exports = {
  Category: createMockModel('categories'),
  MenuItem: createMockModel('menuItems'),
  WeeklySpecial: createMockModel('weeklySpecials'),
  Campaign: createMockModel('campaigns'),
  InstagramPost: createMockModel('instagramPosts'),
  Admin: createMockModel('admins'),
  Statistics: createMockModel('statistics'),
  CategoryStats: createMockModel('categoryStats')
};
