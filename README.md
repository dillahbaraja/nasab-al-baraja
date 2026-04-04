# 🌳 Nasab Al-Baraja (شَجَرَةُ آلِ بَارَجَاء)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Framework: React](https://img.shields.io/badge/Framework-React-blue?logo=react)](https://reactjs.org/)
[![Database: Firebase](https://img.shields.io/badge/Database-Firebase-orange?logo=firebase)](https://firebase.google.com/)
[![Platform: Web & Android](https://img.shields.io/badge/Platform-Web%20%26%20Android-green)](https://capacitorjs.com/)

**Nasab Al-Baraja** adalah aplikasi silsilah keluarga modern dan interaktif yang dirancang untuk memvisualisasikan serta mengelola garis keturunan keluarga dengan cara yang elegan. Aplikasi ini mendukung multibahasa (Indonesia, Inggris, dan Arab) serta tersedia untuk platform Web dan Android.

![Project Mockup](public/assets/mockup.png)

---

## ✨ Fitur Utama

- **📊 Grafik Silsilah Interaktif**: Visualisasi otomatis garis keturunan menggunakan engine @xyflow/react dan Dagre.
- **🔍 Pencarian Cerdas**: Cari anggota keluarga berdasarkan urutan nasab (Anak, Ayah, Kakek) dalam teks Latin maupun Arab.
- **🌍 Dukungan Multi-bahasa**: Terjemahan lengkap untuk Bahasa Indonesia (ID), English (EN), dan العربية (AR).
- **☁️ Sinkronisasi Cloud**: Data tersimpan secara real-time di Firebase Firestore untuk akses lintas perangkat.
- **🔐 Manajemen Admin**: Panel khusus bagi pengelola untuk menambahkan, mengubah, atau menghapus data anggota keluarga secara aman.
- **🎨 Tema Dinamis**: Pilihan tema Light (Terang), Dark (Gelap), dan Warm (Hangat) dengan estetika glassmorphism.
- **📱 Dukungan Android**: Integrasi native menggunakan Capacitor untuk pengalaman mobile yang mulus.
- **🔔 Sistem Notifikasi**: Pemberitahuan real-time untuk penambahan anggota baru dalam silsilah.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **State Management**: React Hooks (useState, useEffect, context-driven)
- **Styling**: Vanilla CSS dengan sistem variabel tema kustom
- **Icons**: [Lucide React](https://lucide.dev/)

### Visualization & Graph
- **Graph Engine**: [@xyflow/react](https://reactflow.dev/) (React Flow)
- **Layouting**: [Dagre](https://github.com/dagrejs/dagre)

### Backend & Infrastructure
- **Cloud Database**: [Firebase Firestore](https://firebase.google.com/docs/firestore)
- **Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth)

### Mobile Integration
- **Platform**: [Capacitor](https://capacitorjs.com/) (Android)

---

## 🚀 Cara Menjalankan

### Pra-syarat
- [Node.js](https://nodejs.org/) (versi 18+)
- [npm](https://www.npmjs.com/)

### Langkah Instalasi

1. **Clone repository ini**:
   ```bash
   git clone https://github.com/your-repo/nasab-al-baraja.git
   cd nasab-al-baraja
   ```

2. **Instal dependensi**:
   ```bash
   npm install
   ```

3. **Konfigurasi Environment**:
   Salin `.env.example` menjadi `.env.local` dan isi dengan kredensial Firebase Anda:
   ```bash
   cp .env.example .env.local
   ```

4. **Jalankan mode pengembangan**:
   ```bash
   npm run dev
   ```

5. **Build untuk produksi**:
   ```bash
   npm run build
   ```

### Menjalankan di Android
Pastikan [Android Studio](https://developer.android.com/studio) sudah terinstal:
```bash
npx cap sync
npx cap open android
```

---

## 👥 Kontributor

- **Abdillah** - *Initial Work & Core Development* - [dillahbaraja@gmail.com](mailto:dillahbaraja@gmail.com)

---

## 📄 Lisensi

Project ini dilisensikan di bawah Lisensi MIT - lihat file [LICENSE](LICENSE) untuk detail lebih lanjut.

---

<p align="center">
  Dibuat dengan ❤️ untuk keluarga Al-Baraja
</p>
