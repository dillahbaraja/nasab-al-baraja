import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// 1. Baca konfigurasi env dan parse secara manual supaya script ini bersifat standalone
console.log('Membaca kredensial dari .env.local...');
const envFilePath = path.resolve(process.cwd(), '.env.local');

if (!fs.existsSync(envFilePath)) {
  console.error('[Error] File .env.local tidak ditemukan');
  process.exit(1);
}

const envFile = fs.readFileSync(envFilePath, 'utf8');
const envMap = {};

envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([^=:]+?)\s*=\s*(.*?)\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    envMap[key] = value;
  }
});

const firebaseConfig = {
  apiKey: envMap['VITE_FIREBASE_API_KEY'],
  authDomain: envMap['VITE_FIREBASE_AUTH_DOMAIN'],
  projectId: envMap['VITE_FIREBASE_PROJECT_ID'],
  storageBucket: envMap['VITE_FIREBASE_STORAGE_BUCKET'],
  messagingSenderId: envMap['VITE_FIREBASE_MESSAGING_SENDER_ID'],
  appId: envMap['VITE_FIREBASE_APP_ID']
};

if (!firebaseConfig.apiKey) {
  console.error('[Error] Gagal menemukan VITE_FIREBASE_API_KEY di .env.local');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fungsi untuk escape CSV (handle koma dan double quotes dalam teks)
const escapeCSV = (str) => {
  if (str === null || str === undefined) return '';
  const strVal = String(str);
  if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
    return `"${strVal.replace(/"/g, '""')}"`;
  }
  return strVal;
};

// 2. Fungsi utama untuk export
const runExport = async () => {
  const args = process.argv.slice(2);
  const outputFile = args[0] || 'database_export.csv';

  console.log('Mengunduh data dari koleksi "familyNodes"...');
  
  try {
    const querySnapshot = await getDocs(collection(db, 'familyNodes'));
    const rows = [];
    
    // Header CSV
    rows.push(['id', 'fatherId', 'arabicName', 'englishName', 'info'].join(','));
    
    let count = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const row = [
        escapeCSV(doc.id),
        escapeCSV(data.fatherId || ''),
        escapeCSV(data.arabicName || ''),
        escapeCSV(data.englishName || ''),
        escapeCSV(data.info || '')
      ].join(',');
      
      rows.push(row);
      count++;
    });

    console.log(`Berhasil mengunduh ${count} baris data.`);
    
    fs.writeFileSync(outputFile, rows.join('\n'), 'utf8');
    console.log(`\nSelesai! Data berhasil disimpan ke ${outputFile}`);
    process.exit(0);
    
  } catch (error) {
    console.error('\n[Gagal] Terjadi kesalahan saat mengunduh data:', error);
    process.exit(1);
  }
};

runExport();
