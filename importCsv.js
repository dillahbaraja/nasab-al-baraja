import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// 1. Baca konfigurasi env dan parse secara manual supaya script ini bersifat standalone
console.log('Membaca kredensial dari .env.local...');
const envFilePath = path.resolve(process.cwd(), '.env.local');
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

// 2. Fungsi untuk parsing CSV (Sangat sederhana, pisah berdasarkan koma)
const parseCSV = (csvContent) => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Asumsi tidak ada tanda koma (,) di dalam teks nama/tulisan
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] || '';
    });
    results.push(obj);
  }

  return results;
};

// 3. Baca dan Ekspor File
const args = process.argv.slice(2);
const csvFile = args[0] || 'data.csv';

if (!fs.existsSync(csvFile)) {
  console.error(`[Error] File CSV tidak ditemukan: ${csvFile}`);
  console.log('Gunakan perintah: node importCsv.js nama_file.csv');
  process.exit(1);
}

console.log(`Membaca isi file ${csvFile}...`);
const fileData = fs.readFileSync(csvFile, 'utf8');
let parsedData = parseCSV(fileData);

const runImport = async () => {
  let count = 0;
  console.log(`Ditemukan ${parsedData.length} baris data yang siap diunggah.`);

  for (const person of parsedData) {
    // Pastikan DocumentID ada di tabel
    const id = person.DocumentID || person.id; 
    
    if (!id) {
       console.warn(`[Skip] Baris dilewati karena DocumentID tidak ada:`, person);
       continue;
    }

    try {
      const docRef = doc(db, 'familyNodes', id);
      
      const firestoreData = {
        nameArab: person.nameArab || '',
        nameLatin: person.nameLatin || '',
        fatherId: person.fatherId || '',
        info: person.info || ''
      };

      await setDoc(docRef, firestoreData);
      process.stdout.write(`\rBerhasil unggah data ID: ${id}        `);
      count++;
    } catch (err) {
      console.error(`\n[Gagal] Gagal unggah data DocumentID: ${id}`, err);
    }
  }

  console.log(`\nSelesai! Berhasil mengimpor ${count} baris data ke database.`);
  process.exit(0);
};

runImport();
