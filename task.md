# Task Notes

## Sudah Dikerjakan

- Migrasi jalur CRUD utama di frontend ke Supabase pada area `nodes`, `notices`, dan auth.
- Perbaikan bug sisa migrasi:
  - `seedDatabase()` tidak lagi memakai jalur Firebase lama.
  - hapus notice admin tidak lagi memakai helper Firebase.
  - ganti password tidak lagi memanggil state yang sudah tidak ada.
  - delete person kembali recursive agar sesuai warning UI.
  - notice usulan tambah anak sudah memakai `fatherId` yang benar.
- Workflow usulan publik:
  - visitor dapat mengusulkan tambah anak.
  - visitor dapat mengusulkan perubahan nama.
  - usulan tampil langsung di tree sebagai status pending.
  - pending diberi glow merah dan label verifikasi admin.
  - visitor dapat edit / batalkan usulan pending.
  - admin dapat approve / reject usulan.
- Notice:
  - notice data final tetap ada.
  - notice usulan baru untuk `proposal_add_child`.
  - notice usulan baru untuk `proposal_name_change`.
  - daftar notice diberi label yang membedakan data final vs usulan.
- Admin verification flow:
  - admin fokus ke pending node.
  - ada urutan prioritas pending berdasarkan hierarki.
  - ditambahkan tombol `Skip` untuk pindah ke pending berikutnya.
  - ditambahkan bantuan teks untuk admin di panel pending.
- Popup person:
  - tombol delete disembunyikan jika person masih punya keturunan.
  - delete hanya untuk leaf node.
  - delete leaf node memakai konfirmasi.
- UI/UX:
  - login admin sekarang menutup modal setelah sukses.
  - perubahan lokal dipantulkan lebih cepat tanpa menunggu refresh pada beberapa alur pending / approve / reject.
  - warna teks panel pending dibuat lebih gelap agar terbaca.
- i18n:
  - banyak string hardcoded sudah dipindahkan ke `i18n.js`.
  - default bahasa tetap Inggris.
  - dukungan bahasa Inggris, Arab, dan Indonesia dipertahankan.
- Security / config:
  - `migrateToSupabase.js` dihapus.
  - client Supabase frontend dipindahkan ke env.
  - `.env.example` diubah ke format Supabase.
- dibuat file `supabase_guest_policies.sql`.
- model admin sekarang diarahkan ke tabel `admin_users`, bukan hardcoded email di policy.

## Yang Masih Perlu Dilakukan

- Jalankan ulang SQL terbaru dari `supabase_guest_policies.sql` di Supabase SQL Editor jika belum memakai versi paling baru.
- Uji manual end-to-end setelah SQL terbaru aktif:
  - guest usulan tambah anak.
  - guest usulan perubahan nama.
  - notice usulan muncul.
  - admin login.
  - admin approve / reject.
  - tombol skip admin.
- Audit i18n satu putaran lagi untuk mencari string hardcoded yang masih tersisa di seluruh folder `src/`.
- Verifikasi realtime Supabase:
  - pastikan perubahan dari guest/admin selalu tampil langsung tanpa refresh.
  - jika masih telat, tambahkan fallback optimistic update pada jalur yang belum tertutup.
- Review policy Supabase lebih ketat:
  - pastikan guest hanya bisa menulis data pending.
  - pastikan final CRUD hanya admin.
  - pastikan delete notice hanya admin.
- Review schema database live:
  - cek constraint foreign key `father_id`.
  - cek struktur kolom `moderation` dan kecocokannya dengan frontend.
- Cleanup sisa jejak Firebase:
  - dependensi `firebase` di `package.json` kemungkinan sudah tidak diperlukan.
  - file konfigurasi / dokumentasi lama yang masih menyebut Firebase perlu dibersihkan.
- Dokumentasi:
  - update `README.md` agar menjelaskan Supabase, auth admin, notice, dan workflow usulan publik.

## Catatan Penting

- Auth anonymous sudah diaktifkan dari sisi Supabase, tetapi perilaku live tetap bergantung pada policy RLS yang sedang aktif.
- Admin awal yang di-seed ke tabel `admin_users` adalah:
  - `dillahbaraja@gmail.com`
- Untuk menambah admin berikutnya, cukup insert email baru ke tabel `admin_users` tanpa mengubah policy lagi.
