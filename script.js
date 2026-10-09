'use strict';

/* =========================================================
 * Manajemen Proyek — Gantt Chart (vanilla JS + localStorage)
 * Tahap 1: CRUD tugas, sub-tugas, tampilan Gantt
 * Tahap 2: Predecessor (FS/SS + jeda) & Kalender Proyek
 * Tahap 3: Resource management (anggota & alokasi) + Analisis (CPM & PERT)
 * ========================================================= */

const STORAGE_KEY = 'manajemenProyek.tugas.v1';
const COLLAPSED_KEY = 'manajemenProyek.tutup.v1';
const KALENDER_KEY = 'manajemenProyek.kalender.v1';
const ANGGOTA_KEY = 'manajemenProyek.anggota.v1';
const COL_W = 34;
const ROW_H = 40;

const HARI_PENDEK = ['M', 'S', 'S', 'K', 'J', 'S', 'M'];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const PRIORITAS = { tinggi: 'Tinggi', sedang: 'Sedang', rendah: 'Rendah' };
const WARNA = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
const JENIS_KAITAN = { FS: 'Finish to Start', SS: 'Start to Start' };

/* ---------- Util tanggal ---------- */
function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function fmtISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fmtTampil(str) {
  if (!str) return '—';
  const d = parseDate(str);
  return `${String(d.getDate()).padStart(2, '0')} ${NAMA_BULAN_PENDEK[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
function diffDays(a, b) {
  return Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) -
    new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
}
function tanggalValid(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return false;
  const d = parseDate(str);
  return !isNaN(d.getTime()) && fmtISO(d) === str;
}

/* ---------- Kalender proyek ---------- */
let kalender = { nonWorkDays: [0, 6], holidays: [] };

function loadKalender() {
  let data = null;
  try {
    const raw = localStorage.getItem(KALENDER_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { data = null; }
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.nonWorkDays)) {
    const wd = data.nonWorkDays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    if (wd.length < 7) kalender.nonWorkDays = [...new Set(wd)].sort((a, b) => a - b);
  }
  if (Array.isArray(data.holidays)) {
    kalender.holidays = [...new Set(data.holidays.filter(tanggalValid))].sort();
  }
}

function simpanKalender() {
  try { localStorage.setItem(KALENDER_KEY, JSON.stringify(kalender)); }
  catch (e) { toast('Peringatan: gagal menyimpan kalender.'); }
}

/** Hari kerja = bukan hari akhir pekan & bukan hari libur khusus. */
function isKerja(date) {
  if (kalender.nonWorkDays.length >= 7) return true; // jaring pengaman
  if (kalender.nonWorkDays.includes(date.getDay())) return false;
  if (kalender.holidays.includes(fmtISO(date))) return false;
  return true;
}
/** Geser maju ke hari kerja terdekat (dipanggil dari hari apa pun). */
function keHariKerja(date) {
  let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let jaga = 0;
  while (!isKerja(d) && jaga < 3660) { d = addDays(d, 1); jaga++; }
  return d;
}
/** Maju n hari kerja dari tanggal yang sudah pasti hari kerja. */
function majuKerja(tanggal, n) {
  let d = keHariKerja(tanggal);
  for (let i = 0; i < n; i++) d = keHariKerja(addDays(d, 1));
  return d;
}
/** Tanggal selesai: durasi dihitung dalam hari kerja, mulai hari kerja pertama. */
function hitungSelesai(mulaiStr, durasi) {
  const dur = Math.max(1, Math.round(Number(durasi) || 1));
  let d = keHariKerja(parseDate(mulaiStr));
  let sisa = dur - 1;
  let jaga = 0;
  while (sisa > 0 && jaga < 36600) {
    d = addDays(d, 1);
    if (isKerja(d)) sisa--;
    jaga++;
  }
  return fmtISO(d);
}

/* ---------- Penjadwalan (predecessor) ---------- */
function rantaiMencapai(dariId, targetId) {
  let cur = dariId;
  const lihat = new Set();
  while (cur) {
    if (cur === targetId) return true;
    if (lihat.has(cur)) return false;
    lihat.add(cur);
    const t = tasks.find(x => x.id === cur);
    cur = t ? (t.predecessorId || null) : null;
  }
  return false;
}

/** Tanggal mulai terawal dari pendahulu, sesuai jenis kaitan + jeda (hari kerja). */
function hitungMulaiTerjadwal(jadwalPendahulu, jenis, jeda) {
  const dasar = jenis === 'SS'
    ? parseDate(jadwalPendahulu.start)
    : addDays(parseDate(jadwalPendahulu.end), 1);
  return fmtISO(majuKerja(dasar, Math.max(0, Math.round(Number(jeda) || 0))));
}

/**
 * Susun jadwal semua tugas: tugas tanpa pendahulu memakai tanggal mulai manual
 * (digeser ke hari kerja), tugas berpendahulu dihitung dari pendahulunya.
 * Siklus rusak dari data lama tidak menggantung — tugas tsb memakai tanggal manual.
 */
function hitungJadwal(daftar) {
  const list = daftar || tasks;
  const byId = new Map(list.map(t => [t.id, t]));
  const predOf = new Map();
  const anakOf = new Map();
  list.forEach(t => {
    const p = (t.predecessorId && t.predecessorId !== t.id && byId.has(t.predecessorId))
      ? t.predecessorId : null;
    predOf.set(t.id, p);
    if (p) {
      if (!anakOf.has(p)) anakOf.set(p, []);
      anakOf.get(p).push(t.id);
    }
  });

  // Urutan topologi (Kahn) supaya pendahulu selalu dihitung lebih dulu
  const indeg = new Map(list.map(t => [t.id, predOf.get(t.id) ? 1 : 0]));
  const antre = list.filter(t => !predOf.get(t.id)).map(t => t.id);
  const urut = [];
  while (antre.length) {
    const id = antre.shift();
    urut.push(id);
    (anakOf.get(id) || []).forEach(cid => {
      indeg.set(cid, indeg.get(cid) - 1);
      if (indeg.get(cid) <= 0) antre.push(cid);
    });
  }
  const siklus = new Set(list.filter(t => !urut.includes(t.id)).map(t => t.id));
  siklus.forEach(id => urut.push(id));

  const hasil = new Map();
  urut.forEach(id => {
    const t = byId.get(id);
    const p = predOf.get(id);
    let mulai;
    if (p && !siklus.has(id) && hasil.has(p)) {
      mulai = hitungMulaiTerjadwal(hasil.get(p), t.linkType || 'FS', t.delay);
    } else {
      mulai = fmtISO(keHariKerja(parseDate(t.start)));
    }
    hasil.set(id, { start: mulai, end: hitungSelesai(mulai, t.duration) });
  });
  return hasil;
}

/* ---------- Penyimpanan ---------- */
let tasks = [];
let anggota = [];
let collapsed = new Set();
let editingId = null;
let rangeStart = null;
let rangeEnd = null;
let jadwal = new Map();
let kritisSet = new Set();

/* ---------- Inisialisasi anggota (resource) ---------- */
function inisial(nama) {
  const bagian = String(nama || '?').trim().split(/\s+/);
  const a = bagian[0] ? bagian[0][0] : '?';
  const b = bagian.length > 1 ? bagian[bagian.length - 1][0] : '';
  return (a + b).toUpperCase();
}

const WARNA_AVATAR = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#4f46e5', '#b45309'];
function warnaAvatar(nama) {
  let h = 0;
  for (const c of String(nama || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return WARNA_AVATAR[h % WARNA_AVATAR.length];
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(tasks)) tasks = null;
  } catch (e) {
    tasks = null;
  }
  if (tasks === null) tasks = contohData();

  // Normalisasi field Tahap 3 (data lama tanpa alokasi/PERT)
  const idAnggota = new Set(anggota.map(a => a.id));
  tasks.forEach(t => {
    if (!Array.isArray(t.assignees)) t.assignees = [];
    t.assignees = t.assignees.filter(id => idAnggota.has(id));
    if (!t.pert || typeof t.pert !== 'object') t.pert = null;
  });

  try {
    const rawC = localStorage.getItem(COLLAPSED_KEY);
    if (rawC) collapsed = new Set(JSON.parse(rawC) || []);
  } catch (e) { collapsed = new Set(); }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch (e) {
    toast('Peringatan: gagal menyimpan ke localStorage.');
  }
}

/* ---------- Anggota tim (resource management) ---------- */
function contohAnggota() {
  return [
    { id: 'm1', name: 'Budi Santoso', email: 'budi.santoso@perusahaan.com', role: 'Project Manager', salary: 15000000 },
    { id: 'm2', name: 'Siti Aminah', email: 'siti.aminah@perusahaan.com', role: 'Designer', salary: 10000000 },
    { id: 'm3', name: 'Rudi Hartono', email: 'rudi.hartono@perusahaan.com', role: 'Developer', salary: 12000000 }
  ];
}

function loadAnggota() {
  let data = null;
  try {
    const raw = localStorage.getItem(ANGGOTA_KEY);
    if (raw !== null) data = JSON.parse(raw);
  } catch (e) { data = null; }
  anggota = Array.isArray(data)
    ? data.filter(a => a && a.id && a.name)
    : contohAnggota();
}

function simpanAnggota() {
  try {
    localStorage.setItem(ANGGOTA_KEY, JSON.stringify(anggota));
  } catch (e) {
    toast('Peringatan: gagal menyimpan anggota tim.');
  }
}

function gajiRupiah(n) {
  return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
}

function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function contohData() {
  const base = keHariKerja(new Date());
  const wd = (n) => fmtISO(majuKerja(base, n));
  const mk = (name, parentId, startOffset, duration, priority, color) => ({
    id: uid(), name, parentId, start: wd(startOffset), duration, priority, color,
    predecessorId: null, linkType: null, delay: 0,
    assignees: [], pert: null,
    createdAt: Date.now() + Math.random()
  });
  const p1 = mk('Perencanaan Proyek', null, 0, 5, 'tinggi', '#3b82f6');
  const p2 = mk('Desain Antarmuka', null, 5, 5, 'sedang', '#8b5cf6');
  const p3 = mk('Pengembangan', null, 10, 10, 'tinggi', '#f59e0b');
  const p4 = mk('Pengujian & Peluncuran', null, 20, 5, 'rendah', '#10b981');
  const daftar = [
    p1,
    mk('Riset & analisis kebutuhan', p1.id, 0, 3, 'tinggi', '#0ea5e9'),
    mk('Menyusun ruang lingkup', p1.id, 3, 2, 'sedang', '#0ea5e9'),
    p2,
    mk('Wireframe halaman', p2.id, 5, 2, 'sedang', '#a78bfa'),
    mk('Desain visual', p2.id, 7, 3, 'sedang', '#a78bfa'),
    p3,
    mk('Halaman utama', p3.id, 10, 4, 'tinggi', '#fb923c'),
    mk('Modul tugas & sub-tugas', p3.id, 14, 3, 'tinggi', '#fb923c'),
    mk('Grafik Gantt', p3.id, 17, 3, 'tinggi', '#fb923c'),
    p4,
    mk('Pengujian fungsi', p4.id, 20, 3, 'sedang', '#34d399'),
    mk('Perbaikan & rilis', p4.id, 23, 2, 'tinggi', '#34d399')
  ];
  const hubungkan = (nama, ke, jenis, jeda) => {
    const a = daftar.find(x => x.name === nama);
    const b = daftar.find(x => x.name === ke);
    if (a && b) { a.predecessorId = b.id; a.linkType = jenis; a.delay = jeda; }
  };
  hubungkan('Desain Antarmuka', 'Perencanaan Proyek', 'FS', 0);
  hubungkan('Pengembangan', 'Desain Antarmuka', 'FS', 0);
  hubungkan('Pengujian & Peluncuran', 'Pengembangan', 'FS', 0);
  hubungkan('Wireframe halaman', 'Riset & analisis kebutuhan', 'FS', 1);
  hubungkan('Desain visual', 'Wireframe halaman', 'SS', 2);

  // Contoh alokasi anggota (resource) & estimasi PERT
  const alokasikan = (nama, ids) => {
    const t = daftar.find(x => x.name === nama);
    if (t) t.assignees = ids.filter(id => ['m1', 'm2', 'm3'].includes(id));
  };
  alokasikan('Perencanaan Proyek', ['m1']);
  alokasikan('Riset & analisis kebutuhan', ['m1', 'm3']);
  alokasikan('Menyusun ruang lingkup', ['m1']);
  alokasikan('Desain Antarmuka', ['m2']);
  alokasikan('Wireframe halaman', ['m2']);
  alokasikan('Desain visual', ['m2']);
  alokasikan('Pengembangan', ['m3']);
  alokasikan('Halaman utama', ['m3']);
  alokasikan('Modul tugas & sub-tugas', ['m3']);
  alokasikan('Grafik Gantt', ['m3']);
  alokasikan('Pengujian & Peluncuran', ['m1']);
  alokasikan('Pengujian fungsi', ['m1']);
  alokasikan('Perbaikan & rilis', ['m3']);

  const beriPert = (nama, o, m, p) => {
    const t = daftar.find(x => x.name === nama);
    if (t) t.pert = { o, m, p };
  };
  beriPert('Riset & analisis kebutuhan', 2, 3, 5);
  beriPert('Desain visual', 2, 3, 7);
  beriPert('Halaman utama', 3, 4, 9);
  beriPert('Pengujian fungsi', 1, 3, 5);
  beriPert('Perbaikan & rilis', 1, 2, 4);
  return daftar;
}

/* ---------- Struktur pohon ---------- */
function anakDari(parentId) {
  return tasks
    .filter(t => (t.parentId || null) === parentId)
    .sort((a, b) => {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function flatten() {
  const out = [];
  function walk(parentId, depth) {
    anakDari(parentId).forEach(t => {
      const anak = tasks.some(x => x.parentId === t.id);
      out.push({ task: t, depth, hasChildren: anak });
      if (anak && !collapsed.has(t.id)) walk(t.id, depth + 1);
    });
  }
  walk(null, 0);
  return out;
}

function semuaIdAnak(id) {
  const hasil = [];
  function walk(pid) {
    tasks.filter(t => t.parentId === pid).forEach(t => {
      hasil.push(t.id);
      walk(t.id);
    });
  }
  walk(id);
  return hasil;
}

/* ---------- Range timeline ---------- */
function hitungRange() {
  const hariIni = fmtISO(new Date());
  if (!tasks.length) {
    rangeStart = addDays(parseDate(hariIni), -2);
    rangeEnd = addDays(parseDate(hariIni), 29);
    return;
  }
  let min = null, max = null;
  tasks.forEach(t => {
    const j = jadwal.get(t.id) || { start: t.start, end: hitungSelesai(t.start, t.duration) };
    const s = parseDate(j.start);
    const e = parseDate(j.end);
    if (!min || s < min) min = s;
    if (!max || e > max) max = e;
  });
  rangeStart = addDays(min, -3);
  rangeEnd = addDays(max, 4);
}

function totalHari() {
  return diffDays(rangeEnd, rangeStart) + 1;
}

/* ---------- Render ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function jadwalTugas(t) {
  return jadwal.get(t.id) || { start: t.start, end: hitungSelesai(t.start, t.duration) };
}

function geometriBar(j) {
  const s = diffDays(parseDate(j.start), rangeStart);
  const e = diffDays(parseDate(j.end), rangeStart);
  const ss = Math.max(0, s);
  return {
    left: ss * COL_W,
    width: Math.max(COL_W - 6, (e - ss + 1) * COL_W - 5)
  };
}

function render() {
  jadwal = hitungJadwal(tasks);
  hitungRange();
  hitungAnalisis();
  renderStats();
  renderHeader();
  renderRows();
}

function renderStats() {
  const total = tasks.length;
  const root = tasks.filter(t => !t.parentId).length;
  const sub = total - root;
  const berhubung = tasks.filter(t => t.predecessorId).length;
  const libur = kalender.holidays.length;
  const kritis = kritisSet.size;
  const nonKerja = kalender.nonWorkDays.length
    ? kalender.nonWorkDays.map(d => NAMA_HARI[d]).join(', ')
    : 'Tidak ada';
  let rentang = '—';
  if (total) rentang = `${fmtTampil(fmtISO(rangeStart))} – ${fmtTampil(fmtISO(rangeEnd))}`;
  document.getElementById('stats').innerHTML = `
    <div class="stat"><b>${root}</b>tugas utama</div>
    <div class="stat"><b>${sub}</b>sub-tugas</div>
    <div class="stat"><b>${berhubung}</b>berelasi</div>
    <div class="stat">Anggota: <b>${anggota.length}</b></div>
    <div class="stat">Jalur kritis: <b>${kritis}</b> tugas</div>
    <div class="stat">Hari libur: <b>${libur}</b></div>
    <div class="stat">Tidak bekerja: <b style="font-size:13px">${nonKerja}</b></div>
    <div class="stat">Rentang: <b style="font-size:13px">${rentang}</b></div>`;
}

function renderHeader() {
  const days = totalHari();
  const hariIni = fmtISO(new Date());

  const months = document.getElementById('monthHeader');
  let htmlM = '';
  let i = 0;
  while (i < days) {
    const d = addDays(rangeStart, i);
    let j = i;
    while (j < days) {
      const dj = addDays(rangeStart, j);
      if (dj.getMonth() !== d.getMonth() || dj.getFullYear() !== d.getFullYear()) break;
      j++;
    }
    const span = j - i;
    htmlM += `<div class="month-cell" style="width:${span * COL_W}px">${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}</div>`;
    i = j;
  }
  months.innerHTML = htmlM;

  const daysEl = document.getElementById('dayHeader');
  let htmlD = '';
  for (let k = 0; k < days; k++) {
    const d = addDays(rangeStart, k);
    const cls = ['day-cell'];
    if (!isKerja(d)) cls.push('weekend');
    if (kalender.holidays.includes(fmtISO(d))) cls.push('holiday');
    if (fmtISO(d) === hariIni) cls.push('today');
    htmlD += `<div class="${cls.join(' ')}"><span class="dnum">${d.getDate()}</span><span>${HARI_PENDEK[d.getDay()]}</span></div>`;
  }
  daysEl.innerHTML = htmlD;
}

function teksRelasi(t) {
  if (!t.predecessorId) return null;
  const p = tasks.find(x => x.id === t.predecessorId);
  if (!p) return null;
  const jenis = t.linkType || 'FS';
  const jeda = Math.max(0, Math.round(Number(t.delay) || 0));
  return {
    badge: jeda > 0 ? `${jenis} +${jeda}` : jenis,
    judul: `Pendahulu: ${p.name} — ${jenis} (${JENIS_KAITAN[jenis]}), jeda ${jeda} hari kerja`
  };
}

function renderRows() {
  const rows = flatten();
  const taskRows = document.getElementById('taskRows');
  const timelineRows = document.getElementById('timelineRows');
  const timelineBody = document.getElementById('timelineBody');
  const tlWidth = totalHari() * COL_W;

  timelineBody.style.width = tlWidth + 'px';

  if (!rows.length) {
    taskRows.innerHTML = `<div class="placeholder">Belum ada tugas.<br><b>Klik “＋ Tugas baru”</b> untuk menambahkan tugas pertama.</div>`;
    timelineRows.innerHTML = `<div class="milestone-note">Timeline akan muncul setelah ada tugas.</div>`;
    kosongkanRelasi(tlWidth);
    renderBg();
    return;
  }

  taskRows.innerHTML = rows.map((r, i) => {
    const t = r.task;
    const j = jadwalTugas(t);
    const indent = 6 + r.depth * 16;
    const toggle = r.hasChildren
      ? `<button class="icon-btn" data-action="toggle" data-id="${t.id}" title="Buka/tutup sub-tugas">${collapsed.has(t.id) ? '▸' : '▾'}</button>`
      : `<span class="color-chip" style="background:${esc(t.color)};margin:auto"></span>`;
    const rel = teksRelasi(t);
    const otomatis = !!rel || j.start !== t.start;
    const timIds = (t.assignees || []).filter(id => anggota.some(a => a.id === id));
    const timHtml = timIds.length
      ? timIds.slice(0, 2).map(id => {
          const a = anggota.find(x => x.id === id);
          return `<span class="avatar" style="--av:${warnaAvatar(a.name)}" title="${esc(a.name)} — ${esc(a.role || 'Tanpa peran')}">${inisial(a.name)}</span>`;
        }).join('') + (timIds.length > 2
          ? `<span class="avatar more" title="${esc(timIds.slice(2).map(id => anggota.find(a => a.id === id).name).join(', '))}">+${timIds.length - 2}</span>`
          : '')
      : '<span title="Belum dialokasikan">—</span>';
    const infoOtomatis = rel
      ? 'Dihitung otomatis dari tugas pendahulu'
      : (j.start !== t.start ? 'Tergeser ke hari kerja menurut kalender proyek' : '');
    const sel = `<span title="${esc(infoOtomatis)}">${fmtTampil(j.start)}</span>`;
    const sel2 = `<span title="Selesai ${fmtTampil(j.end)}">${fmtTampil(j.end)}</span>`;
    return `
    <div class="task-row${r.hasChildren ? ' is-parent' : ''}" data-idx="${i}" data-id="${t.id}">
      <div class="cell toggle">${toggle}</div>
      <div class="cell name-cell" style="padding-left:${indent}px" title="${esc(t.name)}">
        <span class="color-chip" style="background:${esc(t.color)}"></span>
        <span class="name-text">${esc(t.name)}</span>
      </div>
      <div class="cell"><span class="prio prio-${t.priority}">${PRIORITAS[t.priority] || 'Sedang'}</span></div>
      <div class="cell mono${otomatis ? ' auto' : ''}">${sel}</div>
      <div class="cell mono">${sel2}</div>
      <div class="cell mono">${t.duration} hr</div>
      <div class="cell tim">${timHtml}</div>
      <div class="cell pred">${rel ? `<span class="pred-badge" title="${esc(rel.judul)}">${esc(rel.badge)}</span>` : '<span title="Tanpa pendahulu">—</span>'}</div>
      <div class="cell actions">
        <button class="icon-btn" data-action="add" data-id="${t.id}" title="Tambah sub-tugas">＋</button>
        <button class="icon-btn" data-action="edit" data-id="${t.id}" title="Ubah tugas">✎</button>
        <button class="icon-btn danger" data-action="delete" data-id="${t.id}" title="Hapus tugas">🗑</button>
      </div>
    </div>`;
  }).join('');

  timelineRows.innerHTML = rows.map((r, i) => {
    const t = r.task;
    const j = jadwalTugas(t);
    const g = geometriBar(j);
    const rel = teksRelasi(t);
    const judul = rel
      ? `${t.name} • ${fmtTampil(j.start)} – ${fmtTampil(j.end)} • ${t.duration} hari kerja • ${rel.judul}`
      : `${t.name} • ${fmtTampil(j.start)} – ${fmtTampil(j.end)} • ${t.duration} hari kerja`;
    const kritis = kritisSet.has(t.id);
    const judulKritis = kritis ? judul + ' • ⚠ JALUR KRITIS (slack 0)' : judul;
    return `
    <div class="tl-row" data-idx="${i}" data-id="${t.id}">
      <div class="bar${r.depth > 0 ? ' subtask' : ''}${kritis ? ' kritis' : ''}" style="left:${g.left}px;width:${g.width}px;background:${esc(t.color)}" title="${esc(judulKritis)}">
        <span class="bar-label">${esc(t.name)}</span>
        <span class="bar-days">${t.duration} hr</span>
      </div>
    </div>`;
  }).join('');

  renderRelasi(rows, tlWidth);
  renderBg();
}

/* Panah penghubung antar bar (FS/SS) */
function renderRelasi(rows, tlWidth) {
  const svg = document.getElementById('linkSvg');
  const idx = new Map(rows.map((r, i) => [r.task.id, i]));
  const tinggi = rows.length * ROW_H;
  svg.setAttribute('width', tlWidth);
  svg.setAttribute('height', tinggi);
  svg.setAttribute('viewBox', `0 0 ${tlWidth} ${tinggi}`);

  let jalur = '';
  rows.forEach((r, i) => {
    const t = r.task;
    if (!t.predecessorId) return;
    const pi = idx.get(t.predecessorId);
    if (pi === undefined || pi === i) return;
    const pred = rows[pi].task;
    const jp = jadwalTugas(pred);
    const jc = jadwalTugas(t);
    const gp = geometriBar(jp);
    const gc = geometriBar(jc);
    const sy = pi * ROW_H + ROW_H / 2;
    const ty = i * ROW_H + ROW_H / 2;
    const sx = (t.linkType === 'SS') ? gp.left : gp.left + gp.width;
    const tx = Math.max(gc.left - 4, sx + 8);
    const mx = Math.max(sx + 10, tx - 14);
    jalur += `<path d="M ${sx} ${sy} H ${mx} V ${ty} H ${tx - 6}" marker-end="url(#panahRelasi)"/>`;
  });

  svg.innerHTML =
    `<defs><marker id="panahRelasi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path class="panah" d="M0,0 L10,5 L0,10 z"/></marker></defs>` + jalur;
}

function kosongkanRelasi(tlWidth) {
  const svg = document.getElementById('linkSvg');
  svg.setAttribute('width', tlWidth);
  svg.setAttribute('height', 0);
  svg.innerHTML = '';
}

function renderBg() {
  const bg = document.getElementById('timelineBg');
  const hariIni = fmtISO(new Date());
  const days = totalHari();
  let html = '';
  for (let k = 0; k < days; k++) {
    const d = addDays(rangeStart, k);
    if (!isKerja(d) && !kalender.holidays.includes(fmtISO(d))) {
      html += `<div class="weekend-strip" style="left:${k * COL_W}px;width:${COL_W}px" title="${NAMA_HARI[d.getDay()]} — tidak bekerja"></div>`;
    }
  }
  kalender.holidays.forEach(h => {
    const k = diffDays(parseDate(h), rangeStart);
    if (k >= 0 && k < days) {
      html += `<div class="holiday-strip" style="left:${k * COL_W}px;width:${COL_W}px" title="Hari libur: ${fmtTampil(h)}"></div>`;
    }
  });
  const idxHariIni = diffDays(parseDate(hariIni), rangeStart);
  if (idxHariIni >= 0 && idxHariIni < days) {
    html += `<div class="today-line" style="left:${idxHariIni * COL_W + COL_W - 1}px"></div>`;
  }
  bg.innerHTML = html;
}

/* Sorot baris yang sedang di-hover (panel kiri ↔ timeline) */
function sinkronHover() {
  const taskRows = document.getElementById('taskRows');
  const timelineRows = document.getElementById('timelineRows');
  function setHover(idx, on) {
    const a = taskRows.querySelector(`[data-idx="${idx}"]`);
    const b = timelineRows.querySelector(`[data-idx="${idx}"]`);
    if (a) a.classList.toggle('hovered', on);
    if (b) b.classList.toggle('hovered', on);
  }
  [taskRows, timelineRows].forEach(container => {
    container.addEventListener('mouseover', ev => {
      const row = ev.target.closest('[data-idx]');
      if (row) setHover(row.dataset.idx, true);
    });
    container.addEventListener('mouseout', ev => {
      const row = ev.target.closest('[data-idx]');
      if (row) setHover(row.dataset.idx, false);
    });
  });
}

/* ---------- Analisis proyek: Critical Path (CPM) & PERT ---------- */
let analisis = null; // { urut, es, ef, ls, lf, slack, proyekAkhir, proyekMulai, pert }

/**
 * Hitung forward/backward pass CPM dalam satuan indeks hari kerja.
 * ES/EF diambil dari jadwal (hasil penjadwalan predecessor + kalender).
 * LF = min atas penerus: FS → LS(penerus) − 1 − jeda; SS → LS(penerus) − jeda + durasi − 1;
 * tugas tanpa penerus LF-nya = akhir proyek. Slack = LS − ES; slack 0 = jalur kritis.
 */
function hitungAnalisis() {
  kritisSet = new Set();
  analisis = null;
  if (!tasks.length) return;

  // Peta tanggal → indeks hari kerja (rentang lebar supaya aman)
  const idx = new Map();
  const tgl = [];
  let d = addDays(rangeStart, -30);
  const akhirKal = addDays(rangeEnd, 30);
  let n = 0;
  while (d <= akhirKal) {
    if (isKerja(d)) { idx.set(fmtISO(d), n); tgl.push(fmtISO(d)); n++; }
    d = addDays(d, 1);
  }

  const byId = new Map(tasks.map(t => [t.id, t]));
  const predOf = new Map();
  const penerusOf = new Map();
  tasks.forEach(t => {
    const p = (t.predecessorId && t.predecessorId !== t.id && byId.has(t.predecessorId))
      ? t.predecessorId : null;
    predOf.set(t.id, p);
    if (p) {
      if (!penerusOf.has(p)) penerusOf.set(p, []);
      penerusOf.get(p).push(t.id);
    }
  });

  // Urutan topologi (Kahn)
  const indeg = new Map(tasks.map(t => [t.id, predOf.get(t.id) ? 1 : 0]));
  const antre = tasks.filter(t => !predOf.get(t.id)).map(t => t.id);
  const urut = [];
  while (antre.length) {
    const id = antre.shift();
    urut.push(id);
    (penerusOf.get(id) || []).forEach(cid => {
      indeg.set(cid, indeg.get(cid) - 1);
      if (indeg.get(cid) <= 0) antre.push(cid);
    });
  }
  const siklus = new Set(tasks.filter(t => !urut.includes(t.id)).map(t => t.id));
  siklus.forEach(id => urut.push(id));

  // Forward pass (ES/EF) dari jadwal hasil hitungJadwal
  const es = new Map();
  const ef = new Map();
  let proyekAkhirIdx = 0;
  let proyekMulaiIdx = Infinity;
  urut.forEach(id => {
    const j = jadwal.get(id) || { start: byId.get(id).start, end: hitungSelesai(byId.get(id).start, byId.get(id).duration) };
    const a = idx.get(j.start);
    const b = idx.get(j.end);
    es.set(id, a);
    ef.set(id, b);
    if (b !== undefined && b > proyekAkhirIdx) proyekAkhirIdx = b;
    if (a !== undefined && a < proyekMulaiIdx) proyekMulaiIdx = a;
  });
  if (proyekMulaiIdx === Infinity) return;

  // Backward pass (LF/LS)
  const ls = new Map();
  const lf = new Map();
  for (let i = urut.length - 1; i >= 0; i--) {
    const id = urut[i];
    const t = byId.get(id);
    const dur = Math.max(1, Math.round(Number(t.duration)) || 1);
    let lfIdx = proyekAkhirIdx;
    (penerusOf.get(id) || []).forEach(sid => {
      const s = byId.get(sid);
      if (!s || ls.get(sid) === undefined) return;
      const jenis = s.linkType === 'SS' ? 'SS' : 'FS';
      const jeda = Math.max(0, Math.round(Number(s.delay) || 0));
      const cand = jenis === 'SS'
        ? ls.get(sid) - jeda + dur - 1
        : ls.get(sid) - 1 - jeda;
      if (cand < lfIdx) lfIdx = cand;
    });
    lf.set(id, lfIdx);
    ls.set(id, lfIdx - dur + 1);
  }

  const slack = new Map();
  urut.forEach(id => {
    const s = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    slack.set(id, s);
    if (s <= 0 && !siklus.has(id)) kritisSet.add(id);
  });

  analisis = {
    urut, es, ef, ls, lf, slack, siklus,
    proyekMulai: tgl[proyekMulaiIdx] || null,
    proyekAkhir: tgl[proyekAkhirIdx] || null,
    durasiKerja: proyekAkhirIdx - proyekMulaiIdx + 1
  };
}

/** Waktu harapan PERT: TE = (O + 4M + P)/6, simpangan σ = (P − O)/6. */
function hitungTE(t) {
  const p = t.pert;
  if (!p) return { te: t.duration, sigma: 0, pakai: false };
  const o = Number(p.o), m = Number(p.m), ps = Number(p.p);
  if (![o, m, ps].every(Number.isFinite)) return { te: t.duration, sigma: 0, pakai: false };
  return { te: (o + 4 * m + ps) / 6, sigma: (ps - o) / 6, pakai: true };
}

function fmtDes(x) {
  return (Math.round(x * 100) / 100).toLocaleString('id-ID');
}

/* ---------- Modal tugas ---------- */
const overlay = document.getElementById('modalOverlay');
const form = document.getElementById('taskForm');
const elNama = document.getElementById('fNama');
const elInduk = document.getElementById('fInduk');
const elPendahulu = document.getElementById('fPendahulu');
const elLink = document.getElementById('fLink');
const elJeda = document.getElementById('fJeda');
const elMulai = document.getElementById('fMulai');
const elDurasi = document.getElementById('fDurasi');
const elPrioritas = document.getElementById('fPrioritas');
const elWarna = document.getElementById('fWarna');
const elSelesai = document.getElementById('fSelesai');
const elError = document.getElementById('formError');
const hintMulai = document.getElementById('hintMulai');
const elOpt = document.getElementById('fOpt');
const elMost = document.getElementById('fMost');
const elPes = document.getElementById('fPes');
const elAlokasi = document.getElementById('alokasiList');

function daftarTugasBerjenjang(banned) {
  const out = [];
  (function walk(parentId, level) {
    anakDari(parentId).forEach(t => {
      if (banned.includes(t.id)) return;
      out.push({ t, level });
      walk(t.id, level + 1);
    });
  })(null, 0);
  return out;
}

function isiSelectInduk(kecualiId) {
  const banned = kecualiId ? [kecualiId, ...semuaIdAnak(kecualiId)] : [];
  const opsi = ['<option value="">— Tugas utama (tanpa induk) —</option>'];
  daftarTugasBerjenjang(banned).forEach(({ t, level }) => {
    opsi.push(`<option value="${t.id}">${'— '.repeat(level)}${esc(t.name)}</option>`);
  });
  elInduk.innerHTML = opsi.join('');
}

function isiSelectPendahulu(task) {
  const banned = [];
  if (task) {
    banned.push(task.id);
    tasks.forEach(t => { if (rantaiMencapai(t.id, task.id)) banned.push(t.id); });
  }
  const opsi = ['<option value="">— Tidak ada —</option>'];
  daftarTugasBerjenjang(banned).forEach(({ t, level }) => {
    opsi.push(`<option value="${t.id}">${'— '.repeat(level)}${esc(t.name)} (${fmtTampil(t.start)})</option>`);
  });
  elPendahulu.innerHTML = opsi.join('');
}

function isiSwatches() {
  document.getElementById('swatches').innerHTML = WARNA.map(w =>
    `<button type="button" class="swatch" data-warna="${w}" style="background:${w}" title="${w}"></button>`
  ).join('');
}

/** Kumpulkan nilai form menjadi objek kandidat tugas (untuk pratinjau jadwal). */
function kandidatTugas() {
  const asli = editingId ? tasks.find(t => t.id === editingId) : null;
  const dur = Math.round(Number(elDurasi.value));
  const jeda = Math.round(Number(elJeda.value));
  return Object.assign({}, asli || { id: 'pratinjau-baru', parentId: null }, {
    name: elNama.value.trim() || 'Pratinjau',
    parentId: elInduk.value || null,
    start: elMulai.value || fmtISO(new Date()),
    duration: Number.isFinite(dur) && dur >= 1 ? dur : 1,
    priority: elPrioritas.value,
    color: elWarna.value,
    predecessorId: elPendahulu.value || null,
    linkType: elLink.value,
    delay: Number.isFinite(jeda) ? jeda : 0
  });
}

function jadwalDengan(kandidat) {
  const ada = tasks.some(t => t.id === kandidat.id);
  const daftar = ada
    ? tasks.map(t => (t.id === kandidat.id ? kandidat : t))
    : tasks.concat([kandidat]);
  return hitungJadwal(daftar);
}

/** Perbarui tanggal mulai (otomatis) & tanggal selesai pada form. */
function perbaruiPratinjau() {
  const kandidat = kandidatTugas();
  const adaPred = !!kandidat.predecessorId;
  elMulai.disabled = adaPred;
  hintMulai.textContent = adaPred
    ? 'Dihitung otomatis dari tugas pendahulu (tidak bisa diubah manual).'
    : 'Digeser otomatis ke hari kerja sesuai kalender proyek.';
  const j = jadwalDengan(kandidat).get(kandidat.id);
  if (j) {
    elMulai.value = j.start;
    elSelesai.textContent = fmtTampil(j.end);
  } else {
    elSelesai.textContent = '—';
  }
}

function bukaModal(task, indukId) {
  editingId = task ? task.id : null;
  document.getElementById('modalTitle').textContent = task ? 'Ubah tugas' : (indukId ? 'Tambah sub-tugas' : 'Tambah tugas');
  isiSelectInduk(task ? task.id : null);
  isiSelectPendahulu(task);
  elError.hidden = true;
  elNama.classList.remove('invalid');

  if (task) {
    elNama.value = task.name;
    elInduk.value = task.parentId || '';
    elPendahulu.value = task.predecessorId || '';
    elLink.value = task.linkType || 'FS';
    elJeda.value = Math.max(0, Math.round(Number(task.delay) || 0));
    elMulai.value = task.start;
    elDurasi.value = task.duration;
    elPrioritas.value = task.priority;
    elWarna.value = task.color;
    elOpt.value = task.pert ? task.pert.o : '';
    elMost.value = task.pert ? task.pert.m : '';
    elPes.value = task.pert ? task.pert.p : '';
    renderAlokasiChips(task.assignees || []);
  } else {
    elNama.value = '';
    elInduk.value = indukId || '';
    elPendahulu.value = '';
    elLink.value = 'FS';
    elJeda.value = 0;
    elMulai.value = fmtISO(keHariKerja(new Date()));
    elDurasi.value = 3;
    elPrioritas.value = 'sedang';
    elWarna.value = WARNA[3];
    elOpt.value = '';
    elMost.value = '';
    elPes.value = '';
    renderAlokasiChips([]);
  }
  perbaruiPratinjau();
  tandaiSwatchAktif(elWarna.value);
  overlay.hidden = false;
  setTimeout(() => elNama.focus(), 30);
}

function tutupModal() {
  overlay.hidden = true;
  editingId = null;
}

function tandaiSwatchAktif(warna) {
  document.querySelectorAll('.swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.warna.toLowerCase() === String(warna).toLowerCase()));
}

/** Render pilihan alokasi anggota (checkbox) pada form tugas. */
function renderAlokasiChips(dipilih) {
  const set = new Set(dipilih || []);
  if (!anggota.length) {
    elAlokasi.innerHTML = '<span class="chip-kosong">Belum ada anggota tim. Daftarkan lewat tombol “👥 Tim”.</span>';
    return;
  }
  elAlokasi.innerHTML = anggota.map(a =>
    `<label class="chip-anggota"><input type="checkbox" data-anggota="${a.id}"${set.has(a.id) ? ' checked' : ''}>` +
    `<span class="avatar" style="--av:${warnaAvatar(a.name)}">${inisial(a.name)}</span>${esc(a.name)}</label>`
  ).join('');
}

/** Baca estimasi PERT dari form: null jika kosong semua, atau {o,m,p}. */
function bacaPert() {
  const o = elOpt.value.trim(), m = elMost.value.trim(), p = elPes.value.trim();
  if (!o && !m && !p) return { status: 'kosong' };
  if (!o || !m || !p) return { status: 'parsial' };
  const no = Number(o), nm = Number(m), np = Number(p);
  if (![no, nm, np].every(v => Number.isFinite(v) && v >= 0)) return { status: 'buruk' };
  if (no > nm || nm > np) return { status: 'urutan' };
  return { status: 'ok', pert: { o: no, m: nm, p: np } };
}

function tampilkanError(pesan) {
  elError.textContent = pesan;
  elError.hidden = false;
}

form.addEventListener('submit', ev => {
  ev.preventDefault();
  const nama = elNama.value.trim();
  const predId = elPendahulu.value || null;
  const durasi = Math.round(Number(elDurasi.value));
  const jeda = Math.round(Number(elJeda.value));

  elError.hidden = true;
  elNama.classList.remove('invalid');

  if (!nama) {
    elNama.classList.add('invalid');
    tampilkanError('Nama tugas wajib diisi.');
    elNama.focus();
    return;
  }
  if (!predId && !elMulai.value) {
    tampilkanError('Tanggal mulai wajib diisi.');
    elMulai.focus();
    return;
  }
  if (predId && !tasks.some(t => t.id === predId)) {
    tampilkanError('Tugas pendahulu tidak ditemukan.');
    return;
  }
  if (predId && editingId && rantaiMencapai(predId, editingId)) {
    tampilkanError('Kaitan itu akan membentuk siklus (tugas saling bergantung). Pilih pendahulu lain.');
    return;
  }
  if (!Number.isFinite(durasi) || durasi < 1) {
    tampilkanError('Durasi minimal 1 hari kerja.');
    elDurasi.focus();
    return;
  }
  if (!Number.isFinite(jeda) || jeda < 0 || jeda > 365) {
    tampilkanError('Jeda harus berupa angka 0–365 hari kerja.');
    elJeda.focus();
    return;
  }

  const hasilPert = bacaPert();
  if (hasilPert.status === 'parsial') {
    tampilkanError('Estimasi PERT harus diisi lengkap (optimistik, paling mungkin, pesimis) atau dikosongkan semua.');
    return;
  }
  if (hasilPert.status === 'buruk') {
    tampilkanError('Estimasi PERT harus berupa angka nol atau lebih.');
    return;
  }
  if (hasilPert.status === 'urutan') {
    tampilkanError('Estimasi PERT harus berurutan: optimistik ≤ paling mungkin ≤ pesimis.');
    return;
  }

  const kandidat = kandidatTugas();
  const jr = jadwalDengan(kandidat).get(kandidat.id);
  if (!jr) {
    tampilkanError('Gagal menghitung jadwal tugas.');
    return;
  }

  const data = {
    name: nama,
    parentId: elInduk.value || null,
    start: jr.start,
    duration: durasi,
    priority: elPrioritas.value,
    color: elWarna.value,
    predecessorId: predId,
    linkType: predId ? (elLink.value === 'SS' ? 'SS' : 'FS') : null,
    delay: predId ? jeda : 0,
    pert: hasilPert.status === 'ok' ? hasilPert.pert : null,
    assignees: [...elAlokasi.querySelectorAll('input:checked')].map(i => i.dataset.anggota)
  };

  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    if (t) Object.assign(t, data);
    toast('Tugas diperbarui.');
  } else {
    tasks.push(Object.assign({ id: uid(), createdAt: Date.now() }, data));
    toast('Tugas ditambahkan.');
  }

  // Buka induknya agar tugas baru langsung terlihat
  if (data.parentId) {
    let p = tasks.find(x => x.id === data.parentId);
    while (p) { collapsed.delete(p.id); p = p.parentId ? tasks.find(x => x.id === p.parentId) : null; }
  }

  save();
  tutupModal();
  render();
});

/* ---------- Aksi baris ---------- */
function aksiBaris(action, id) {
  const t = tasks.find(x => x.id === id);
  if (action !== 'add' && !t) return;

  if (action === 'toggle') {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    save();
    render();
    return;
  }
  if (action === 'add') {
    bukaModal(null, id);
    return;
  }
  if (action === 'edit') {
    bukaModal(t);
    return;
  }
  if (action === 'delete') {
    const anak = semuaIdAnak(id);
    const pewaris = tasks.filter(x => x.predecessorId === id && !anak.includes(x.id)).length;
    let pesan = anak.length
      ? `Hapus "${t.name}" beserta ${anak.length} sub-tugas di dalamnya?`
      : `Hapus tugas "${t.name}"?`;
    if (pewaris) pesan += ` ${pewaris} tugas yang bergantung padanya akan berubah menjadi tanpa pendahulu.`;
    if (!confirm(pesan)) return;
    const buang = [id, ...anak];
    tasks = tasks.filter(x => !buang.includes(x.id));
    collapsed = new Set([...collapsed].filter(c => !buang.includes(c)));
    tasks.forEach(x => { if (x.predecessorId && buang.includes(x.predecessorId)) x.predecessorId = null; });
    save();
    render();
    toast('Tugas dihapus.');
  }
}

document.getElementById('taskRows').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  aksiBaris(btn.dataset.action, btn.dataset.id);
});

/* ---------- Modal kalender proyek ---------- */
const kalOverlay = document.getElementById('kalOverlay');
const kalForm = document.getElementById('kalForm');
const elDayToggles = document.getElementById('dayToggles');
const elDaftarLibur = document.getElementById('daftarLibur');
const elTanggalLibur = document.getElementById('fTanggalLibur');
const elKalError = document.getElementById('kalError');
let kalSementara = null;

function bukaKalender() {
  kalSementara = {
    nonWorkDays: [...kalender.nonWorkDays],
    holidays: [...kalender.holidays]
  };
  renderDayToggles();
  renderDaftarLibur();
  elKalError.hidden = true;
  elTanggalLibur.value = '';
  kalOverlay.hidden = false;
}

function tutupKalender() {
  kalOverlay.hidden = true;
  kalSementara = null;
}

function renderDayToggles() {
  const urut = [1, 2, 3, 4, 5, 6, 0];
  elDayToggles.innerHTML = urut.map(d =>
    `<label class="day-toggle"><input type="checkbox" data-hari="${d}"${kalSementara.nonWorkDays.includes(d) ? ' checked' : ''}>${NAMA_HARI[d]}</label>`
  ).join('');
}

function renderDaftarLibur() {
  if (!kalSementara.holidays.length) {
    elDaftarLibur.innerHTML = '<li><span class="kosong">Belum ada hari libur khusus.</span></li>';
    return;
  }
  elDaftarLibur.innerHTML = kalSementara.holidays.map(h =>
    `<li><span>📅 ${fmtTampil(h)} <small>(${NAMA_HARI[parseDate(h).getDay()]})</small></span>` +
    `<button type="button" class="icon-btn danger" data-action="hapus" data-tgl="${h}" title="Hapus hari libur">✕</button></li>`
  ).join('');
}

function kalError(pesan) {
  elKalError.textContent = pesan;
  elKalError.hidden = false;
}

elDayToggles.addEventListener('change', () => {
  const terpilih = [...elDayToggles.querySelectorAll('input:checked')]
    .map(i => Number(i.dataset.hari))
    .sort((a, b) => a - b);
  kalSementara.nonWorkDays = terpilih;
  if (terpilih.length >= 7) kalError('Minimal satu hari harus tetap menjadi hari kerja.');
  else elKalError.hidden = true;
});

document.getElementById('btnTambahLibur').addEventListener('click', () => {
  const v = elTanggalLibur.value;
  if (!v) { kalError('Pilih tanggal libur terlebih dahulu.'); return; }
  if (!tanggalValid(v)) { kalError('Tanggal libur tidak valid.'); return; }
  if (kalSementara.holidays.includes(v)) { kalError('Tanggal tersebut sudah ada di daftar.'); return; }
  kalSementara.holidays.push(v);
  kalSementara.holidays.sort();
  elTanggalLibur.value = '';
  elKalError.hidden = true;
  renderDaftarLibur();
});

elDaftarLibur.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-action="hapus"]');
  if (!btn) return;
  kalSementara.holidays = kalSementara.holidays.filter(h => h !== btn.dataset.tgl);
  renderDaftarLibur();
});

kalForm.addEventListener('submit', ev => {
  ev.preventDefault();
  if (kalSementara.nonWorkDays.length >= 7) {
    kalError('Minimal satu hari harus tetap menjadi hari kerja.');
    return;
  }
  kalender = {
    nonWorkDays: [...kalSementara.nonWorkDays],
    holidays: [...kalSementara.holidays]
  };
  simpanKalender();
  tutupKalender();
  render();
  toast('Kalender proyek diperbarui — jadwal tugas disesuaikan.');
});

document.getElementById('btnKalender').addEventListener('click', bukaKalender);
document.getElementById('btnTutupKal').addEventListener('click', tutupKalender);
document.getElementById('btnBatalKal').addEventListener('click', tutupKalender);
kalOverlay.addEventListener('mousedown', ev => { if (ev.target === kalOverlay) tutupKalender(); });

/* ---------- Modal anggota tim ---------- */
const timOverlay = document.getElementById('timOverlay');
const timForm = document.getElementById('timForm');
const elGNama = document.getElementById('gNama');
const elGEmail = document.getElementById('gEmail');
const elGPeran = document.getElementById('gPeran');
const elGGaji = document.getElementById('gGaji');
const elTimError = document.getElementById('timError');
const elJumlahAnggota = document.getElementById('jumlahAnggota');
const elDaftarAnggota = document.getElementById('daftarAnggota');
let editingAnggotaId = null;

function bukaTim() {
  editingAnggotaId = null;
  document.getElementById('timJudul').textContent = 'Tambah anggota tim';
  elGNama.value = '';
  elGEmail.value = '';
  elGPeran.value = '';
  elGGaji.value = '';
  elTimError.hidden = true;
  renderDaftarAnggota();
  timOverlay.hidden = false;
  setTimeout(() => elGNama.focus(), 30);
}

function tutupTim() {
  timOverlay.hidden = true;
  editingAnggotaId = null;
}

function timPesan(pesan) {
  elTimError.textContent = pesan;
  elTimError.hidden = false;
}

function renderDaftarAnggota() {
  elJumlahAnggota.textContent = anggota.length;
  if (!anggota.length) {
    elDaftarAnggota.innerHTML = '<li><span class="kosong-list">Belum ada anggota tim.</span></li>';
    return;
  }
  elDaftarAnggota.innerHTML = anggota.map(a => {
    const beban = tasks.filter(t => (t.assignees || []).includes(a.id)).length;
    return `<li>
      <span class="avatar" style="--av:${warnaAvatar(a.name)}">${inisial(a.name)}</span>
      <span class="anggota-info">
        <b>${esc(a.name)}</b>
        <small>${esc(a.role || 'Tanpa peran')} • ${esc(a.email || 'Tanpa email')} • ${gajiRupiah(a.salary)}/bulan • ${beban} tugas</small>
      </span>
      <button type="button" class="icon-btn" data-act="ubah" data-id="${a.id}" title="Ubah anggota">✎</button>
      <button type="button" class="icon-btn danger" data-act="hapus" data-id="${a.id}" title="Hapus anggota">🗑</button>
    </li>`;
  }).join('');
}

elDaftarAnggota.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const a = anggota.find(x => x.id === btn.dataset.id);
  if (!a) return;
  if (btn.dataset.act === 'ubah') {
    editingAnggotaId = a.id;
    document.getElementById('timJudul').textContent = 'Ubah anggota tim';
    elGNama.value = a.name;
    elGEmail.value = a.email || '';
    elGPeran.value = a.role || '';
    elGGaji.value = a.salary != null ? a.salary : '';
    elTimError.hidden = true;
    elGNama.focus();
    return;
  }
  const beban = tasks.filter(t => (t.assignees || []).includes(a.id)).length;
  let pesan = `Hapus anggota "${a.name}"?`;
  if (beban) pesan += ` ${beban} tugas yang dialokasikan kepadanya akan dikosongkan alokasinya.`;
  if (!confirm(pesan)) return;
  anggota = anggota.filter(x => x.id !== a.id);
  tasks.forEach(t => {
    if (t.assignees && t.assignees.includes(a.id)) {
      t.assignees = t.assignees.filter(id => id !== a.id);
    }
  });
  if (editingAnggotaId === a.id) {
    editingAnggotaId = null;
    document.getElementById('timJudul').textContent = 'Tambah anggota tim';
    elGNama.value = ''; elGEmail.value = ''; elGPeran.value = ''; elGGaji.value = '';
  }
  simpanAnggota();
  save();
  renderDaftarAnggota();
  render();
  toast('Anggota tim dihapus.');
});

timForm.addEventListener('submit', ev => {
  ev.preventDefault();
  const name = elGNama.value.trim();
  const email = elGEmail.value.trim();
  const role = elGPeran.value.trim();
  const gajiRaw = elGGaji.value.trim();
  elTimError.hidden = true;

  if (!name) { timPesan('Nama lengkap wajib diisi.'); elGNama.focus(); return; }
  if (!email) { timPesan('Email wajib diisi.'); elGEmail.focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { timPesan('Format email tidak valid.'); elGEmail.focus(); return; }
  const kembar = anggota.some(a => a.email && a.email.toLowerCase() === email.toLowerCase() && a.id !== editingAnggotaId);
  if (kembar) { timPesan('Email tersebut sudah terdaftar.'); elGEmail.focus(); return; }
  if (!role) { timPesan('Peran wajib diisi.'); elGPeran.focus(); return; }
  const gaji = gajiRaw === '' ? 0 : Number(gajiRaw);
  if (!Number.isFinite(gaji) || gaji < 0) { timPesan('Gaji harus berupa angka nol atau lebih.'); elGGaji.focus(); return; }

  const data = { name, email, role, salary: Math.round(gaji) };
  if (editingAnggotaId) {
    const a = anggota.find(x => x.id === editingAnggotaId);
    if (a) Object.assign(a, data);
    toast('Anggota tim diperbarui.');
  } else {
    anggota.push(Object.assign({ id: uid() }, data));
    toast('Anggota tim ditambahkan.');
  }
  simpanAnggota();
  renderDaftarAnggota();
  tutupTim();
  render();
});

document.getElementById('btnTim').addEventListener('click', bukaTim);
document.getElementById('btnTutupTim').addEventListener('click', tutupTim);
document.getElementById('btnBatalTim').addEventListener('click', tutupTim);
timOverlay.addEventListener('mousedown', ev => { if (ev.target === timOverlay) tutupTim(); });

/* ---------- Modal analisis (Critical Path & PERT) ---------- */
const anaOverlay = document.getElementById('analisisOverlay');

function bukaAnalisis() {
  renderAnalisis();
  anaOverlay.hidden = false;
}

function tutupAnalisis() {
  anaOverlay.hidden = true;
}

function renderAnalisis() {
  const ring = document.getElementById('ringkasanAnalisis');
  const jalurEl = document.getElementById('jalurKritis');
  const pertEl = document.getElementById('pertScroll');
  const bebanEl = document.getElementById('bebanSumberDaya');

  if (!tasks.length) {
    ring.innerHTML = '<div class="ringkas"><div class="lbl">Proyek</div><div class="val">Belum ada tugas</div></div>';
    jalurEl.innerHTML = '<span class="chip-kosong">Belum ada tugas untuk dianalisis.</span>';
    pertEl.innerHTML = '<p class="pert-kosong">Belum ada tugas untuk dianalisis.</p>';
    bebanEl.innerHTML = '<p class="pert-kosong">Belum ada data beban.</p>';
    return;
  }

  if (!analisis) hitungAnalisis();
  if (!analisis) {
    ring.innerHTML = '<div class="ringkas"><div class="lbl">Proyek</div><div class="val">Data tidak cukup</div></div>';
    jalurEl.innerHTML = '<span class="chip-kosong">Jadwal belum bisa dianalisis.</span>';
    pertEl.innerHTML = '<p class="pert-kosong">Jadwal belum bisa dianalisis.</p>';
    bebanEl.innerHTML = '<p class="pert-kosong">Jadwal belum bisa dianalisis.</p>';
    return;
  }
  const a = analisis;
  const byId = new Map(tasks.map(t => [t.id, t]));

  // Ringkasan
  const totalPert = tasks.filter(t => t.pert).length;
  let teTotal = 0, sigTotal = 0;
  a.urut.forEach(id => {
    if (!kritisSet.has(id)) return;
    const te = hitungTE(byId.get(id));
    teTotal += te.te;
    sigTotal += te.sigma * te.sigma;
  });
  const sigJalur = Math.sqrt(sigTotal);
  const batasAtas = teTotal + sigJalur;
  const rentang = `${fmtTampil(a.proyekMulai)} – ${fmtTampil(a.proyekAkhir)}`;
  const biayaGaji = anggota.reduce((s, x) => s + (Number(x.salary) || 0), 0);
  ring.innerHTML = `
    <div class="ringkas"><div class="lbl">Durasi proyek</div><div class="val">${a.durasiKerja} hari kerja</div><div class="ket">${rentang}</div></div>
    <div class="ringkas"><div class="lbl">Jalur kritis</div><div class="val">${kritisSet.size} tugas</div><div class="ket">Slack 0 — telat sedikit, proyek telat</div></div>
    <div class="ringkas"><div class="lbl">Estimasi PERT jalur kritis</div><div class="val">${fmtDes(teTotal)} hari</div><div class="ket">σ ${fmtDes(sigJalur)} • batas atas ${fmtDes(batasAtas)} hari (99%)</div></div>
    <div class="ringkas"><div class="lbl">Tugas ber-estimasi PERT</div><div class="val">${totalPert} / ${tasks.length}</div><div class="ket">TE = (O + 4M + P) / 6</div></div>
    <div class="ringkas"><div class="lbl">Anggota tim</div><div class="val">${anggota.length} orang</div><div class="ket">Beban gaji ${gajiRupiah(biayaGaji)}/bulan</div></div>`;

  // Jalur kritis (urut berdasarkan ES)
  const kritisUrut = a.urut.filter(id => kritisSet.has(id))
    .sort((x, y) => (a.es.get(x) ?? 0) - (a.es.get(y) ?? 0));
  jalurEl.innerHTML = kritisUrut.length
    ? kritisUrut.map((id, i) => {
        const t = byId.get(id);
        const te = hitungTE(t);
        return `${i ? '<span class="kritis-panah">→</span>' : ''}` +
          `<span class="kritis-node">${esc(t.name)}<small>${t.duration} hr${te.pakai ? ` • TE ${fmtDes(te.te)}` : ''} • slack ${a.slack.get(id)}</small></span>`;
      }).join('')
    : '<span class="chip-kosong">Tidak ada jalur kritis (periksa relasi antar tugas).</span>';

  // Diagram PERT
  pertEl.innerHTML = gambarPert(a, byId);

  // Beban sumber daya
  bebanEl.innerHTML = tabelBeban();
}

/** Susun diagram PERT: node per tugas, panah FS/SS, jalur kritis merah. */
function gambarPert(a, byId) {
  const W = 176, H = 64, GX = 84, GY = 22, PAD = 24;
  const predOf = new Map();
  const penerusOf = new Map();
  tasks.forEach(t => {
    const p = (t.predecessorId && t.predecessorId !== t.id && byId.has(t.predecessorId)) ? t.predecessorId : null;
    predOf.set(t.id, p);
    if (p) {
      if (!penerusOf.has(p)) penerusOf.set(p, []);
      penerusOf.get(p).push(t.id);
    }
  });

  // Level = jarak terpanjang dari akar (supaya node selaras horizontal)
  const level = new Map();
  a.urut.forEach(id => {
    const p = predOf.get(id);
    level.set(id, p && level.has(p) ? level.get(p) + 1 : 0);
  });
  const kolom = new Map();
  a.urut.forEach(id => {
    const l = level.get(id) || 0;
    if (!kolom.has(l)) kolom.set(l, []);
    kolom.get(l).push(id);
  });
  const maksLvl = Math.max(0, ...kolom.keys());

  // Posisi: urutkan isi kolom berdasarkan ES supaya silangnya minim
  const pos = new Map();
  let barisMaks = 1;
  for (let l = 0; l <= maksLvl; l++) {
    const isi = (kolom.get(l) || []).sort((x, y) => (a.es.get(x) ?? 0) - (a.es.get(y) ?? 0));
    barisMaks = Math.max(barisMaks, isi.length);
    isi.forEach((id, r) => pos.set(id, { x: PAD + l * (W + GX), y: PAD + r * (H + GY) }));
  }

  const lebar = PAD * 2 + (maksLvl + 1) * W + maksLvl * GX;
  const tinggi = PAD * 2 + barisMaks * H + (barisMaks - 1) * GY;

  let edges = '';
  tasks.forEach(t => {
    const p = predOf.get(t.id);
    if (!p || !pos.has(p) || !pos.has(t.id)) return;
    const from = pos.get(p);
    const to = pos.get(t.id);
    const x1 = from.x + W, y1 = from.y + H / 2;
    const x2 = to.x, y2 = to.y + H / 2;
    const mx = x1 + GX / 2;
    const kritis = kritisSet.has(p) && kritisSet.has(t.id);
    const jenis = t.linkType === 'SS' ? 'SS' : 'FS';
    const jeda = Math.max(0, Math.round(Number(t.delay) || 0));
    const cls = jenis === 'SS' ? ' ss' : '';
    const d = `M ${x1} ${y1} H ${mx} V ${y2} H ${x2 - 8}`;
    edges += `<path class="pert-edge${cls}"${kritis ? ' stroke="#dc2626" stroke-width="2.2"' : ''} d="${d}" marker-end="url(#panahPert${cls ? 'SS' : 'FS'})"/>`;
    edges += `<text class="pert-label" x="${mx + 5}" y="${(y1 + y2) / 2 - 5}"${kritis ? ' fill="#dc2626"' : ''}>${jenis}${jeda ? ' +' + jeda : ''}</text>`;
  });

  let nodes = '';
  a.urut.forEach(id => {
    const t = byId.get(id);
    const p = pos.get(id);
    if (!p) return;
    const te = hitungTE(t);
    const kritis = kritisSet.has(id);
    const nama = t.name.length > 22 ? t.name.slice(0, 21) + '…' : t.name;
    const info = te.pakai
      ? `TE ${fmtDes(te.te)} hr • σ ${fmtDes(te.sigma)}`
      : `${t.duration} hr${kritis ? ' • kritis' : ''}`;
    nodes += `<g class="pert-node${kritis ? ' kritis' : ''}">` +
      `<rect class="n-rect" x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="10"/>` +
      `<text class="n-nama" x="${p.x + 12}" y="${p.y + 25}">${esc(nama)}</text>` +
      `<text class="n-info" x="${p.x + 12}" y="${p.y + 45}">${esc(info)}</text>` +
      `</g>`;
  });

  return `<svg class="pert-svg" width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<marker id="panahPertFS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="pert-panah" d="M0,0 L10,5 L0,10 z"/></marker>` +
    `<marker id="panahPertSS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="pert-panah ss" d="M0,0 L10,5 L0,10 z"/></marker>` +
    `</defs>` + edges + nodes + `</svg>`;
}

/** Tabel beban per anggota: jumlah tugas, total hari kerja, biaya proyek. */
function tabelBeban() {
  if (!anggota.length) {
    return '<p class="pert-kosong">Belum ada anggota tim. Daftarkan lewat tombol “👥 Tim”.</p>';
  }
  const baris = anggota.map(a => {
    const daftar = tasks.filter(t => (t.assignees || []).includes(a.id));
    const hari = daftar.reduce((s, t) => s + (Math.max(1, Math.round(Number(t.duration)) || 1)), 0);
    const kerjaBulan = kalender.nonWorkDays.length ? (30 - kalender.nonWorkDays.length * 4.33) : 30;
    const bulanProyek = analisis ? analisis.durasiKerja / Math.max(1, kerjaBulan) : 0;
    const biaya = Math.round((Number(a.salary) || 0) * Math.max(bulanProyek, 0));
    return `<tr>
      <td><span class="avatar" style="--av:${warnaAvatar(a.name)}">${inisial(a.name)}</span> ${esc(a.name)}</td>
      <td>${esc(a.role || '—')}</td>
      <td class="num">${daftar.length}</td>
      <td class="num">${hari} hr</td>
      <td class="num">${gajiRupiah(a.salary)}</td>
      <td class="num">${gajiRupiah(biaya)}</td>
    </tr>`;
  }).join('');
  const tanpaAlokasi = tasks.filter(t => !(t.assignees || []).length).length;
  return `<table>
    <thead><tr><th>Anggota</th><th>Peran</th><th class="num">Tugas</th><th class="num">Total hari</th><th class="num">Gaji/bulan</th><th class="num">Biaya proyek</th></tr></thead>
    <tbody>${baris}</tbody>
  </table>
  <p class="hint">${tanpaAlokasi} tugas belum dialokasikan anggota. Biaya proyek = gaji × lama proyek (bulanan).</p>`;
}

document.getElementById('btnAnalisis').addEventListener('click', bukaAnalisis);
document.getElementById('btnTutupAnalisis').addEventListener('click', tutupAnalisis);
document.getElementById('btnTutupAnalisis2').addEventListener('click', tutupAnalisis);
anaOverlay.addEventListener('mousedown', ev => { if (ev.target === anaOverlay) tutupAnalisis(); });

/* ---------- Kontrol header & form ---------- */
document.getElementById('btnTambahTugas').addEventListener('click', () => bukaModal(null, null));
document.getElementById('btnBatal').addEventListener('click', tutupModal);
document.getElementById('btnTutupModal').addEventListener('click', tutupModal);
overlay.addEventListener('mousedown', ev => { if (ev.target === overlay) tutupModal(); });
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if (!overlay.hidden) tutupModal();
  else if (!kalOverlay.hidden) tutupKalender();
  else if (!timOverlay.hidden) tutupTim();
  else if (!anaOverlay.hidden) tutupAnalisis();
});

document.getElementById('btnBukaSemua').addEventListener('click', () => {
  collapsed.clear(); save(); render(); toast('Semua sub-tugas dibuka.');
});
document.getElementById('btnTutupSemua').addEventListener('click', () => {
  tasks.filter(t => tasks.some(x => x.parentId === t.id)).forEach(t => collapsed.add(t.id));
  save(); render(); toast('Semua sub-tugas ditutup.');
});

elMulai.addEventListener('change', perbaruiPratinjau);
elDurasi.addEventListener('input', perbaruiPratinjau);
elPendahulu.addEventListener('change', perbaruiPratinjau);
elLink.addEventListener('change', perbaruiPratinjau);
elJeda.addEventListener('input', perbaruiPratinjau);
elWarna.addEventListener('input', () => tandaiSwatchAktif(elWarna.value));
document.getElementById('swatches').addEventListener('click', ev => {
  const s = ev.target.closest('.swatch');
  if (!s) return;
  elWarna.value = s.dataset.warna;
  tandaiSwatchAktif(s.dataset.warna);
});

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(pesan) {
  const el = document.getElementById('toast');
  el.textContent = pesan;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- Mulai ---------- */
isiSwatches();
sinkronHover();
loadKalender();
loadAnggota();
load();
render();
