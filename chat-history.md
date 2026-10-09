# Riwayat Chat — Aplikasi Manajemen Proyek (Gantt Chart)

Proyek: **Manajemen Proyek berbasis Gantt Chart**
Lokasi: `C:\Users\Asus\project-tugas`
Teknologi: website statis murni **HTML + CSS + JavaScript** (tanpa framework, tanpa backend), data di **localStorage**, seluruh antarmuka berbahasa Indonesia.

---

## File aplikasi

| File | Isi |
|---|---|
| `index.html` | Struktur halaman: header, statistik, panel tugas + timeline Gantt, modal tugas, modal kalender, modal tim, modal analisis |
| `style.css` | Tata letak, panel kiri sticky, bar Gantt, modal, toast, relasi predecessor, strip libur, avatar, diagram PERT, responsif |
| `script.js` | Logika: CRUD, pohon parent-child, kalender kerja, penjadwalan otomatis (CPM), resource management, PERT, localStorage |
| `pratinjau.png` | Cuplikan tampilan hasil render headless Chrome |

---

## Tahap 1 — Task Management & tampilan Gantt Chart

**Permintaan:** tambah/edit/hapus tugas (nama, durasi hari kerja, tanggal mulai, prioritas, warna indikator), sub-tugas parent-child bertingkat, tampilan Gantt Chart visual.

**Yang dibuat:**
- CRUD tugas lewat modal form; tanggal selesai dihitung otomatis (Sabtu–Minggu dilewati).
- Sub-tugas dengan indentasi, tombol ▾/▸ buka-tutup, tombol ＋ tambah sub-tugas, "Buka/Tutup semua"; hapus induk menghapus seluruh sub-tugas (dengan konfirmasi).
- Gantt: header bulan + tanggal, bar berwarna, strip akhir pekan, garis merah "Hari ini", scroll horizontal/vertikal, panel kiri selaras dengan timeline.

**Pengujian:** 41 pemeriksaan otomatis di headless Chrome → **41 PASS, 0 GAGAL**, tanpa error konsol.
**Bug diperbaiki:** lebar panel kiri 671 px vs header 672 px (`border-right` → diganti `box-shadow`); listener hover menumpuk tiap render (dipindah ke pemasangan sekali); tinggi header hari kurang 1 px.

---

## Tahap 2 — Predecessors (FS/SS + delay) & Kalender Proyek

**Permintaan:** hubungan antar tugas Finish-to-Start dan Start-to-Start dengan jeda hari; tanggal menyesuaikan di Gantt; pengaturan hari akhir pekan & hari libur khusus.

**Yang dibuat:**
- Form tugas: **Tugas pendahulu**, **Jenis kaitan** (FS/SS), **Jeda (hari kerja)**; jika ada pendahulu, tanggal mulai terkunci & dihitung otomatis (pratinjau langsung saat field berubah).
- Kolom **Pendahulu** (badge `FS +1`), tanggal otomatis ditandai, **panah penghubung** antar bar + tooltip detail relasi.
- Penjadwalan berantai (A→B→C) dengan urutan topologi; pengaman siklus (opsi tersaring, guard saat simpan, data rusak tidak menggantung); hapus tugas pendahulu melepas relasi pengguna.
- **🗓 Kalender proyek**: centang hari tidak bekerja (default Sabtu/Minggu) + daftar hari libur khusus; durasi, jeda, dan penjadwalan melewati hari non-kerja; strip berpola di timeline + penanda di header; validasi "minimal satu hari kerja".

**Pengujian:** 77 pemeriksaan → **77 PASS, 0 GAGAL**; ditambah 2 sesi Chrome profil persisten (`SESI1_TULIS_OK` / `SESI2_BACA_OK`) menutup keterbatasan persistensi.
**Bug/ekspektasi:** 2 FAIL awal ternyata salah hitung hari kerja pada **skrip uji** (bukan bug aplikasi) — koreksi pada ekspektasi uji, tanpa melonggarkan asersi. Satu bug aplikasi: penanda tanggal otomatis (flag `auto`) untuk tugas tergeser kalender.

---

## Tahap 3 — Resource Management & Analisis Proyek (Critical Path + PERT)

**Permintaan:** pendaftaran anggota tim (nama, email, peran, gaji) + alokasi ke tugas; tampilkan Critical Path dan diagram PERT; uji semua fitur Tahap 1–3.

**Yang dibuat:**
- **Modal 👥 Tim**: daftar anggota + form (nama, email, peran, gaji Rp/bulan). Validasi: wajib isi, format email, email ganda ditolak, gaji ≥ 0; ubah ✎ / hapus 🗑 (hapus melepas alokasi). Simpan di `manajemenProyek.anggota.v1`.
- **Alokasi anggota**: field "Alokasi anggota tim" (chip checkbox + avatar) di form tugas; kolom **Tim** baru di tabel Gantt (avatar maks 2 + "+n", tooltip nama–peran).
- **Critical Path (CPM)**: forward/backward pass berbasis hari kerja dengan relasi FS/SS + jeda + kalender. LF = min atas penerus (FS → LS−1−jeda; SS → LS−jeda+durasi−1), tugas tanpa penerus LF = akhir proyek; slack 0 = kritis. Bar kritis tersorot merah di Gantt.
- **Diagram PERT**: SVG node per tugas (TE = (O+4M+P)/6, σ = (P−O)/6), layout per level dependency, panah FS penuh vs SS putus-putus ungu, node & edge kritis merah; ringkasan total TE jalur kritis, simpangan σ, batas atas 99%.
- **Estimasi PERT di form** (Optimistik/Paling mungkin/Pesimis): wajib lengkap atau kosong semua, harus nol-ke-atas dan berurutan (O ≤ M ≤ P).
- **Tabel beban sumber daya**: per anggota — jumlah tugas, total hari kerja, gaji/bulan, estimasi biaya proyek, jumlah tugas belum dialokasikan.

**Pengujian:**
- Putaran utama headless Chrome: **42/42 PASS, 0 GAGAL** (regresi Tahap 1–2 + seluruh fitur Tahap 3), tanpa error konsol.
- Konsistensi numerik terverifikasi: durasi proyek 25 hari kerja = rantai FS 5+5+10+5 (4 node kritis); TE Riset O2/M3/P5 = 3,17 (19/6).
- **Uji sesi 2** (profil persisten, browser ditutup lalu dibuka): **10/10 PASS** — tugas/alokasi/PERT/anggota/kalender terbaca kembali, analisis & PERT ter-render ulang.
- **Bug diperbaiki saat pengujian:** daftar anggota tidak di-refresh sebelum modal ditutup setelah simpan; guard `hitungAnalisis` saat jadwal belum terbentuk. Tidak ada asersi yang dilonggarkan.
- Skrip uji dihapus setelahnya; verifikasi render final dengan file bersih: exit 0, 13 baris, 14 avatar, 5 bar kritis, tanpa error konsol, `node --check script.js` lulus.

---

## Cara membuka aplikasi

1. Buka folder `C:\Users\Asus\project-tugas`.
2. **Double-click `index.html`** — langsung terbuka di browser (Chrome/Edge/Firefox), tanpa server dan instalasi.
3. Saat pertama dibuka tersedia data contoh proyek; semua perubahan tersimpan otomatis di `localStorage`.

Coba Tahap 3: **👥 Tim** → tambah anggota → ✎ tugas → centang alokasi / isi estimasi PERT → **📊 Analisis** untuk jalur kritis, diagram PERT, dan beban sumber daya. Bar merah di Gantt = tugas jalur kritis.

---

## Catatan & keterbatasan

- Pengujian memakai evaluasi terprogram via DOM di headless Chrome (bukan klik mouse manual) dan hanya di Chrome — belum diuji di Firefox/Safari.
- Persistensi lintas-sesi sudah diuji dengan profil Chrome persisten.
- Estimasi PERT bersifat analisis tampilan — jadwal Gantt tetap memakai durasi hari kerja, bukan TE.
- Jika browser memblokir localStorage untuk `file://` (jarang), aplikasi tetap jalan tanpa penyimpanan antar-sesi; alternatif: sajikan lewat `python -m http.server`.
