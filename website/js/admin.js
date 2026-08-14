// ==========================================
// UTILITAS KEAMANAN (XSS PROTECTION)
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { 
            '&': '&amp;', 
            '<': '&lt;', 
            '>': '&gt;', 
            "'": '&#39;', 
            '"': '&quot;' 
        };
        return charsToReplace[tag] || tag;
    });
}

// ==========================================
// UTILITAS PENCATAT ERROR KE CCTV
// ==========================================
async function catatLogError(konteks, errorObj) {
    // 1. Cetak ke console browser (Untuk teknisi yang sedang menekan F12)
    console.error(`[SYSTEM ERROR] ${konteks}:`, errorObj);
    
    try {
        // 2. Ekstrak pesan error menjadi teks yang bisa dibaca
        let pesanError = "Unknown Error";
        if (errorObj instanceof Error) {
            pesanError = errorObj.message;
        } else if (typeof errorObj === 'object' && errorObj !== null) {
            pesanError = JSON.stringify(errorObj);
        } else {
            pesanError = String(errorObj);
        }

        const emailAdmin = document.getElementById('profilAdminEmail')?.textContent || 'Sistem';
        
        // 3. Simpan paksa ke tabel log_aktivitas
        await supabaseClient.from('log_aktivitas').insert([{
            user_email: emailAdmin,
            aksi: 'SYSTEM ERROR',
            detail: `[Gagal ${konteks}] Detail: ${pesanError}`
        }]);
    } catch (e) {
        // Jika gagal mencatat log (misal karena internet mati total), biarkan saja di console
        console.warn("Gagal menyimpan log error ke database:", e);
    }
}

// ==========================================
// 1. VERIFIKASI SESI ADMIN & ROLE-BASED UI
// ==========================================
let userRole = 'admin'; // Variabel global untuk menyimpan role

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.replace("login_page.html"); 
    } else {
        // Tampilkan email yang sedang login
        const emailElemen = document.getElementById('profilAdminEmail');
        if (emailElemen) {
            emailElemen.textContent = session.user.email;
        }
        
        // 1. Ekstrak 'role' dari token JWT Supabase (disuntikkan oleh Trigger DB Anda)
        userRole = session.user.app_metadata?.role || 'admin';
        
        // 2. Terapkan Batasan UI (Sembunyikan menu sesuai role)
        terapkanBatasAksesUI(userRole);
    }
}
checkAuth();

// Fungsi Khusus Pengatur Tampilan Berdasarkan Hak Akses
function terapkanBatasAksesUI(role) {
    // A. Ubah teks di pojok kiri atas (di bawah nama toko)
    const teksRole = document.getElementById('teksRoleAdmin');
    if (teksRole) {
        teksRole.textContent = role === 'superadmin' ? 'Super Admin' : 'Admin CS';
        if (role === 'superadmin') {
            teksRole.classList.add('text-purple-400'); // Beri warna berbeda untuk teknisi
            teksRole.classList.remove('text-gray-400');
        }
    }

    // B. Logika Eksekusi Pembatasan
    if (role !== 'superadmin') {
        // Jika bukan Superadmin, SEMBUNYIKAN menu yang tidak boleh diakses
        const menuBanner = document.getElementById('nav-pengaturanBanner');
        const menuToko = document.getElementById('nav-pengaturanToko');
        const menuLog = document.getElementById('nav-logAktivitas');
        
        if (menuBanner) menuBanner.style.display = 'none';
        if (menuToko) menuToko.style.display = 'none';
        if (menuLog) menuLog.style.display = 'none';
        
        // Catatan: Tab 'Kelola Barang' dibiarkan tetap ada karena itu tugas utama Admin CS
    }
}
checkAuth();

document.getElementById('btnLogout').addEventListener('click', async (e) => {
    e.preventDefault(); 
    await supabaseClient.auth.signOut();
    window.location.replace("login_page.html");
});

// ==========================================
// VARIABEL GLOBAL & HELPER UI
// ==========================================
let isEditing = false;
let editingKode = ''; 
let adminProductsData = []; 
let currentFilteredAdminData = []; 
let currentPageAdmin = 1;          
const itemsPerPageAdmin = 30;      
let fileYangDiunggah = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3000);
}
function formatRupiah(angka) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka); }

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-green-600', 'text-white', 'shadow-md');
        el.classList.add('text-gray-300', 'hover:bg-gray-800', 'hover:text-white');
        el.querySelector('i').classList.remove('text-white');
    });
    const activeNav = document.getElementById(`nav-${tabId}`);
    activeNav.classList.remove('text-gray-300', 'hover:bg-gray-800', 'hover:text-white');
    activeNav.classList.add('bg-green-600', 'text-white', 'shadow-md');
    activeNav.querySelector('i').classList.add('text-white');
    
    const titleMap = { 
    'kelolaBarang': 'Manajemen Barang', 
    'kelolaPesanan': 'Manajemen Pesanan', // <== TAMBAHKAN INI
    'pengaturanBanner': 'Pengaturan Banner Promosi', 
    'pengaturanToko': 'Pengaturan Toko & Kontak', 
    'logAktivitas': 'Riwayat Aktivitas (CCTV)' 
    };
    document.getElementById('pageTitle').textContent = titleMap[tabId];
}

const fileUpload = document.getElementById('file-upload');
const imagePreview = document.getElementById('image-preview');
const uploadContent = document.getElementById('upload-content');
const btnRemoveImage = document.getElementById('btn-remove-image');

fileUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        fileYangDiunggah = file;
        const reader = new FileReader();
        reader.onload = function(event) {
            imagePreview.src = event.target.result; 
            imagePreview.classList.remove('hidden');
            btnRemoveImage.classList.remove('hidden'); 
            uploadContent.classList.add('opacity-0');
        }
        reader.readAsDataURL(file);
    }
});

function resetImage() {
    fileUpload.value = '';
    fileYangDiunggah = null; 
    
    imagePreview.src = '#';
    imagePreview.classList.add('hidden');
    btnRemoveImage.classList.add('hidden');
    uploadContent.classList.remove('opacity-0');
}
btnRemoveImage.addEventListener('click', resetImage);

// --- SISTEM UI VARIASI DINAMIS ---
let variasiIndex = 0;
function mulaiVariasi() {
    document.getElementById('btnAktifkanVariasi').classList.add('hidden');
    document.getElementById('containerVariasi').classList.remove('hidden');
    document.getElementById('btnTambahVariasi').classList.remove('hidden');
    variasiIndex = 0; 
    tambahInputVariasi();
    // Pastikan sistem pintar mengecek ulang setelah kotak pertama muncul
    updatePlaceholderVariasi();
}
function tambahInputVariasi(nilai = '') {
    variasiIndex++;
    const container = document.getElementById('containerVariasi');
    
    // SANITASI NILAI DI SINI
    const amanNilai = escapeHTML(nilai);
    
    const div = document.createElement('div');
    div.className = 'variasi-item flex items-center gap-3 bg-white p-4 border border-gray-200 rounded-lg shadow-sm relative transition-all';
    div.id = `variasi_row_${variasiIndex}`;
    
    // GUNAKAN amanNilai PADA ATRIBUT value
    div.innerHTML = `
        <div class="flex-1">
            <label class="label-nomor-variasi block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Variasi 1</label>
            <input type="text" class="input-variasi focus:ring-green-500 focus:border-green-500 block w-full sm:text-sm border-gray-300 rounded-md py-2.5 px-3 border" placeholder="Cth. Warna, dll" value="${amanNilai}">
        </div>
        <button type="button" onclick="hapusVariasi('variasi_row_${variasiIndex}')" class="text-gray-400 hover:text-red-500 self-end mb-1 p-2.5 rounded-md hover:bg-red-50 transition-colors" title="Hapus Variasi ini">
            <i class="fa-solid fa-trash-can text-lg"></i>
        </button>
    `;
    container.appendChild(div);
    updateLabelVariasi();
}
function hapusVariasi(rowId) {
    document.getElementById(rowId).remove();
    updateLabelVariasi();
    
    const sisaVariasi = document.querySelectorAll('.variasi-item');
    if (sisaVariasi.length === 0) {
        resetUI_Variasi();
    }
}
function updateLabelVariasi() {
    // Arahkan langsung ke sistem pintar
    updatePlaceholderVariasi();
}
function resetUI_Variasi() {
    document.getElementById('btnAktifkanVariasi').classList.remove('hidden');
    document.getElementById('containerVariasi').classList.add('hidden');
    document.getElementById('containerVariasi').innerHTML = ''; 
    document.getElementById('btnTambahVariasi').classList.add('hidden');
    variasiIndex = 0;
}
// --- FITUR BARU: SMART LABELING (REVISI KOMBINASI) ---
function updatePlaceholderVariasi() {
    const isCincin = (kategoriAktif === 'Cincin');
    const items = document.querySelectorAll('.variasi-item');
    
    items.forEach((item, index) => {
        const labelElement = item.querySelector('.label-nomor-variasi');
        const inputElement = item.querySelector('.input-variasi');
        
        if (isCincin) {
            // Panduan khusus cincin: Gabungan Warna & Ukuran
            labelElement.textContent = `Warna & Ukuran ${index + 1}`;
            inputElement.placeholder = "Cth. Biru - Uk. 10";
        } else {
            labelElement.textContent = `Variasi ${index + 1}`;
            inputElement.placeholder = "Cth. Warna, dll";
        }
    });
    
    const btnTambah = document.getElementById('teksTambahVariasi');
    if (btnTambah) {
        btnTambah.textContent = isCincin ? `Tambah Varian ${items.length + 1}` : `Tambah Variasi ${items.length + 1}`;
    }
    
    const labelUtama = document.querySelector('#containerVariasi').previousElementSibling.previousElementSibling;
    if (labelUtama && labelUtama.tagName === 'DIV') {
        const teksLabelUtama = labelUtama.querySelector('label');
        if (teksLabelUtama) teksLabelUtama.textContent = isCincin ? 'Pilihan Varian & Ukuran' : 'Variasi';
    }
}
function getVariasiString() {
    const inputs = document.querySelectorAll('.input-variasi');
    const values = Array.from(inputs)
        .map(input => input.value.trim().replace(/,/g, ' '))
        .filter(val => val !== '');       
    return values.join(', ');
}

// --- SISTEM KATEGORI (CHIPS) ---
let kategoriAktif = '';

function renderKategoriChips() {
    const container = document.getElementById('kategoriChipsContainer');
    container.innerHTML = '';
    
    let catString = globalSettings.kategori || '';
    let catArray = catString.split(',').map(c => c.trim()).filter(c => c !== '');
    
    document.getElementById('kategori_barang_terpilih').value = kategoriAktif;

    catArray.forEach(kat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isSelected = (kat === kategoriAktif);
        
        btn.className = isSelected 
            ? "px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-full shadow-sm border border-green-600 transition-all transform scale-105"
            : "px-4 py-1.5 bg-white text-gray-600 border border-gray-300 hover:border-green-400 hover:text-green-600 text-sm font-medium rounded-full transition-all";
            
        btn.textContent = kat;
        btn.onclick = () => {
            kategoriAktif = kat; 
            renderKategoriChips(); 
            // Panggil sistem pintar agar label input otomatis berubah
            updatePlaceholderVariasi(); 
        };
        container.appendChild(btn);
    });
}

async function tambahKategoriBaru() {
    const { value: kategoriBaru } = await Swal.fire({
        title: 'Tambah Kategori',
        input: 'text',
        inputPlaceholder: 'Contoh: Pakaian',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal'
    });

    if (kategoriBaru) {
        const namaKat = kategoriBaru.trim();
        if (namaKat) {
            let catString = globalSettings.kategori || '';
            let catArray = catString.split(',').map(c => c.trim()).filter(c => c !== '');
            
            if (!catArray.includes(namaKat)) {
                catArray.push(namaKat);
                const newCatString = catArray.join(', ');
                
                Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const { error } = await supabaseClient.from('pengaturan').update({ kategori: newCatString }).eq('id', 1);
                
                if (!error) {
                    globalSettings.kategori = newCatString; 
                    document.getElementById('kategoriToko').value = newCatString;
                    renderMasterKategori();
                    kategoriAktif = namaKat; 
                    renderKategoriChips();
                    Swal.close();
                    showToast('Kategori baru ditambahkan!');
                } else {
                    Swal.fire('Gagal', 'Tidak dapat menyimpan kategori.', 'error');
                }
            } else {
                kategoriAktif = namaKat;
                renderKategoriChips();
            }
        }
    }
}

// ==========================================
// SISTEM MASTER KATEGORI (VISUAL TAG MANAGER)
// ==========================================
async function updateKategoriKeDB(stringBaru) {
    const { error } = await supabaseClient.from('pengaturan').update({ kategori: stringBaru }).eq('id', 1);
    if (error) {
        Swal.fire('Gagal', 'Tidak dapat menyimpan ke database.', 'error');
        return false;
    }
    globalSettings.kategori = stringBaru;
    document.getElementById('kategoriToko').value = stringBaru;
    renderMasterKategori(); 
    renderKategoriChips();  
    return true;
}

function renderMasterKategori() {
    const container = document.getElementById('masterKategoriVisual');
    container.innerHTML = '';
    
    let catString = document.getElementById('kategoriToko').value;
    let catArray = catString ? catString.split(',').map(c => c.trim()).filter(c => c !== '') : [];
    
    if (catArray.length === 0) {
        container.innerHTML = '<span class="text-sm text-gray-400 italic py-1 px-2">Belum ada kategori.</span>';
        return;
    }

    catArray.forEach(kat => {
        const amanKat = escapeHTML(kat);
        const jsSafeKat = kat.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        const span = document.createElement('span');
        span.className = "inline-flex items-center px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded-md border border-green-300 transition-colors shadow-sm group cursor-default";
        span.innerHTML = `
            ${amanKat}
            <div class="flex items-center gap-1.5 ml-1 border-l border-green-300 pl-2.5">
                <button type="button" onclick="editMasterKategori('${jsSafeKat}')" class="..." title="Edit Kategori">
                    <i class="fa-solid fa-pen text-[11px]"></i>
                </button>
                <button type="button" onclick="hapusMasterKategori('${jsSafeKat}')" class="..." title="Hapus Kategori">
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>
        `;
        container.appendChild(span);
    });
}

async function tambahMasterKategori() {
    const input = document.getElementById('inputTambahMaster');
    const namaBaru = input.value.trim().replace(/,/g, ' '); 
    
    if (namaBaru === '') return;

    let catString = document.getElementById('kategoriToko').value;
    let catArray = catString ? catString.split(',').map(c => c.trim()) : [];
    
    if (!catArray.includes(namaBaru)) {
        catArray.push(namaBaru);
        
        Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const sukses = await updateKategoriKeDB(catArray.join(', '));
        
        if (sukses) {
            input.value = ''; 
            Swal.close();
            showToast('Kategori baru tersimpan!');
        }
    } else {
        Swal.fire('Info', 'Kategori tersebut sudah ada!', 'info');
    }
}

async function hapusMasterKategori(kategoriHapus) {
    Swal.fire({ title: 'Memeriksa database...', text: 'Mengecek penggunaan kategori ini', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const { count, error } = await supabaseClient
            .from('produk')
            .select('*', { count: 'exact', head: true })
            .eq('kategori', kategoriHapus);
            
        Swal.close();
        if (error) throw error;
        
        let pesanPeringatan = `Anda yakin ingin menghapus kategori <b>"${kategoriHapus}"</b>?`;
        
        if (count > 0) {
            pesanPeringatan = `<b>PERINGATAN!</b><br><br>Ada <b>${count} barang</b> yang saat ini menggunakan kategori "${kategoriHapus}".<br><br>Jika Anda melanjutkan, barang-barang tersebut akan kehilangan kategorinya (menjadi yatim). Tetap hapus?`;
        }

        const result = await Swal.fire({
            title: count > 0 ? 'Data Terancam Yatim!' : 'Hapus Kategori?',
            html: pesanPeringatan,
            icon: count > 0 ? 'warning' : 'question',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Ya, Hapus Saja'
        });

        if (result.isConfirmed) {
            let catString = document.getElementById('kategoriToko').value;
            let catArray = catString.split(',').map(c => c.trim()).filter(c => c !== kategoriHapus);
            
            Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const sukses = await updateKategoriKeDB(catArray.join(', '));
            if(sukses) {
                Swal.fire('Terhapus!', 'Kategori berhasil dihapus secara permanen.', 'success');
            }
        }
    } catch (err) {
        Swal.fire('Error', 'Gagal terhubung ke database.', 'error');
    }
}

async function editMasterKategori(kategoriLama) {
    const { value: kategoriBaru } = await Swal.fire({
        title: 'Edit Nama Kategori',
        input: 'text',
        inputValue: kategoriLama,
        showCancelButton: true,
        confirmButtonText: 'Simpan Perubahan',
        cancelButtonText: 'Batal',
        inputValidator: (value) => {
            if (!value || value.trim() === '') return 'Nama kategori tidak boleh kosong!';
            if (value.trim() === kategoriLama) return 'Nama kategori tidak berubah.';
        }
    });

    if (kategoriBaru) {
        const namaBaru = kategoriBaru.trim().replace(/,/g, ' ');
        
        Swal.fire({ title: 'Menyelaraskan Data...', text: `Mengubah kategori & menyesuaikan barang berekategori "${kategoriLama}"`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        const { error } = await supabaseClient
            .from('produk')
            .update({ kategori: namaBaru })
            .eq('kategori', kategoriLama);
            
        if (error) {
            Swal.fire('Error', 'Gagal memperbarui barang-barang lama di database.', 'error');
            return;
        }

        let catString = document.getElementById('kategoriToko').value;
        let catArray = catString.split(',').map(c => c.trim());
        const index = catArray.indexOf(kategoriLama);
        if (index !== -1) catArray[index] = namaBaru;
        
        const sukses = await updateKategoriKeDB(catArray.join(', '));
        if (sukses) {
            Swal.fire('Berhasil!', 'Kategori & seluruh barang terkait berhasil diperbarui!', 'success');
        }
    }
}

function resetFormLengkap() {
    document.getElementById('formTambahBarang').reset();
    resetImage();
    resetUI_Variasi(); 
    
    kategoriAktif = '';
    document.getElementById('kategori_barang_terpilih').value = '';
    renderKategoriChips();
    
    isEditing = false;
    editingKode = '';
    document.getElementById('kode_barang').disabled = false;
    const submitBtn = document.querySelector('#formTambahBarang button[type="submit"]');
    submitBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Simpan Barang';
    submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
    submitBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');

    // Reset visual peringatan kode barang
    document.getElementById('peringatanKode').classList.add('hidden');
    document.getElementById('kode_barang').classList.remove('border-red-500', 'focus:ring-red-500');
}
document.getElementById('btnReset').addEventListener('click', resetFormLengkap);

let currentAdminCategoryFilter = 'Semua';

function renderAdminTableFilters() {
    const container = document.getElementById('adminTableCategoryFilter');
    if (!container) return;
    container.innerHTML = '';
    
    let catString = globalSettings.kategori || '';
    let catArray = catString.split(',').map(c => c.trim()).filter(c => c !== '');
    
    const allCategories = ['Semua', ...catArray, 'Belum Dikategorikan'];

    allCategories.forEach(kat => {
        const btn = document.createElement('button');
        const isSelected = (kat === currentAdminCategoryFilter);
        
        btn.className = isSelected 
            ? "whitespace-nowrap px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-full shadow-sm border border-blue-600 transition-all"
            : "whitespace-nowrap px-4 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 text-sm font-medium rounded-full transition-all";
            
        btn.textContent = kat;
        btn.onclick = () => {
            currentAdminCategoryFilter = kat;
            renderAdminTableFilters(); 
            applyAdminFilters(); 
        };
        container.appendChild(btn);
    });
}

// ==========================================
// 2. READ: MEMUAT DATA KATALOG DARI SUPABASE
// ==========================================
function applyAdminFilters() {
    const kataKunci = document.getElementById('searchAdminBarang').value.toLowerCase();
    
    currentFilteredAdminData = adminProductsData.filter(item => {
        const matchSearch = item.nama.toLowerCase().includes(kataKunci) || item.kode.toLowerCase().includes(kataKunci);
        
        let matchCategory = true;
        if (currentAdminCategoryFilter !== 'Semua') {
            if (currentAdminCategoryFilter === 'Belum Dikategorikan') {
                matchCategory = !item.kategori || item.kategori.trim() === ''; 
            } else {
                matchCategory = item.kategori === currentAdminCategoryFilter;
            }
        }
        
        return matchSearch && matchCategory;
    });
    
    currentPageAdmin = 1; 
    renderAdminTablePage();
}

function renderAdminTablePage() {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';

    if (currentFilteredAdminData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-gray-500">Tidak ada barang yang ditemukan.</td></tr>`;
        document.getElementById('adminPaginationInfo').textContent = 'Menampilkan 0 barang';
        document.getElementById('adminPaginationButtons').innerHTML = '';
        return;
    }

    const totalItems = currentFilteredAdminData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPageAdmin);
    
    if (currentPageAdmin > totalPages) currentPageAdmin = totalPages;
    if (currentPageAdmin < 1) currentPageAdmin = 1;

    const startIndex = (currentPageAdmin - 1) * itemsPerPageAdmin;
    const endIndex = Math.min(startIndex + itemsPerPageAdmin, totalItems);
    const currentData = currentFilteredAdminData.slice(startIndex, endIndex);

    currentData.forEach(item => {
        const isHabis = item.status === 'habis';
        const statusBadge = isHabis
        ? '<span class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-semibold">Habis</span>'
        : '<span class="text-xs bg-green-100 text-green-600 px-2 py-1 rounded font-semibold">Tersedia</span>';

        const amanKode = escapeHTML(item.kode);
        const jsSafeKode = item.kode.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const amanNama = escapeHTML(item.nama);
        const amanGambar = escapeHTML(item.gambar);
        const variasiTeks = item.varian ? escapeHTML(item.varian) : '<span class="text-gray-400 italic">Tidak ada</span>';

        tableBody.innerHTML += `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="h-14 w-14 rounded-lg bg-gray-100 border flex items-center justify-center overflow-hidden">
                    <img src="${amanGambar}" class="w-full h-full object-cover"> <!-- UBAH DI SINI -->
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">${amanKode}</td> <!-- UBAH DI SINI -->
            <td class="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">${amanNama}</td> <!-- UBAH DI SINI -->
            <td class="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">${variasiTeks}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">${formatRupiah(item.harga)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">${statusBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                <button onclick="toggleStatusBarang('${jsSafeKode}', ${isHabis})" class="text-yellow-500 hover:text-yellow-700" title="Ubah Status">
                    <i class="fa-solid ${isHabis ? 'fa-box' : 'fa-box-open'} text-lg"></i>
                </button>
                <button onclick="siapkanEditBarang('${jsSafeKode}')" class="text-blue-500 hover:text-blue-700" title="Edit Data">
                    <i class="fa-solid fa-pen-to-square text-lg"></i>
                </button>
                <button onclick="hapusBarang('${jsSafeKode}')" class="text-red-500 hover:text-red-700" title="Hapus Data">
                    <i class="fa-solid fa-trash text-lg"></i>
                </button>
            </td>
        </tr>`;
    });

    document.getElementById('adminPaginationInfo').textContent = `Menampilkan ${startIndex + 1} - ${endIndex} dari ${totalItems} barang`;
    renderAdminPaginationButtons(totalPages);
}

function renderAdminPaginationButtons(totalPages) {
    const container = document.getElementById('adminPaginationButtons');
    container.innerHTML = '';

    const btnPrev = document.createElement('button');
    btnPrev.className = `px-3 py-1.5 rounded-md text-sm font-medium border transition-colors flex items-center justify-center h-8 w-8 ${currentPageAdmin === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'}`;
    btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    btnPrev.disabled = currentPageAdmin === 1;
    btnPrev.onclick = () => {
        if (currentPageAdmin > 1) {
            currentPageAdmin--;
            renderAdminTablePage();
        }
    };
    container.appendChild(btnPrev);

    const pageInfo = document.createElement('span');
    pageInfo.className = 'text-sm font-semibold text-gray-700 px-3 bg-white border border-gray-200 py-1.5 rounded-md shadow-sm';
    pageInfo.textContent = `Hal ${currentPageAdmin} / ${totalPages}`;
    container.appendChild(pageInfo);

    const btnNext = document.createElement('button');
    btnNext.className = `px-3 py-1.5 rounded-md text-sm font-medium border transition-colors flex items-center justify-center h-8 w-8 ${currentPageAdmin === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'}`;
    btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    btnNext.disabled = currentPageAdmin === totalPages;
    btnNext.onclick = () => {
        if (currentPageAdmin < totalPages) {
            currentPageAdmin++;
            renderAdminTablePage();
        }
    };
    container.appendChild(btnNext);
}

async function loadAdminProducts() {
    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-gray-500"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-green-500"></i><p class="text-sm font-medium">Memuat data...</p></td></tr>`;

    try {
        const { data, error } = await supabaseClient.from('produk').select('*').order('urutan', { ascending: true }).order('created_at', { ascending: false });
        if (error) throw error;
        
        adminProductsData = data;
        applyAdminFilters();
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-red-500">Gagal memuat tabel dari Supabase.</td></tr>`;
        console.error(error);
    }
}

document.getElementById('searchAdminBarang').addEventListener('input', applyAdminFilters);

// ==========================================
// 3. PENGATURAN TOKO (READ & UPDATE)
// ==========================================
async function loadSettings() {
    try {
        const { data, error } = await supabaseClient.from('pengaturan').select('*').eq('id', 1).single();
        if (error) throw error;
        
        if (data) {
            document.getElementById('storeName').value = data.nama_toko || "";
            
            if (document.getElementById('adminStoreNameDisplay')) document.getElementById('adminStoreNameDisplay').textContent = data.nama_toko || "TokoKu";
            if (document.getElementById('profilTokoName')) document.getElementById('profilTokoName').textContent = data.nama_toko || "TokoKu";
            
            document.getElementById('waNumber').value = data.wa_admin || "";
            document.getElementById('igLink').value = data.link_ig || "";
            document.getElementById('fbLink').value = data.link_fb || "";
            document.getElementById('kategoriToko').value = data.kategori || "Cincin, Gelang, Kalung, Tasbih, Minyak";
            document.getElementById('toggleStatusBuka').checked = data.status_buka;
            
            document.getElementById('bannerTitle').value = data.banner_title || "";
            document.getElementById('bannerSubtitle').value = data.banner_subtitle || "";
            document.getElementById('toggleBanner').checked = data.banner_aktif;
            
            document.getElementById('previewBannerTitle').textContent = data.banner_title || "Preview";
            document.getElementById('previewBannerSubtitle').textContent = data.banner_subtitle || "Preview";
            
            if (data.logo_url) {
                document.getElementById('sidebarLogo').src = data.logo_url;
                document.getElementById('previewLogoPengaturan').src = data.logo_url;
                if (document.getElementById('profilLogo')) document.getElementById('profilLogo').src = data.logo_url;
                
                let favicon = document.querySelector("link[rel~='icon']");
                if (!favicon) {
                    favicon = document.createElement('link');
                    favicon.rel = 'icon';
                    document.head.appendChild(favicon);
                }
                favicon.href = data.logo_url;
            }

            globalSettings = data; 
            renderKategoriChips();
            renderMasterKategori();
            renderAdminTableFilters();
        }
    } catch (error) { console.error("Gagal memuat pengaturan", error); }
}

loadAdminProducts();
loadSettings();

document.getElementById('bannerTitle').addEventListener('input', (e) => document.getElementById('previewBannerTitle').textContent = e.target.value);
document.getElementById('bannerSubtitle').addEventListener('input', (e) => document.getElementById('previewBannerSubtitle').textContent = e.target.value);

async function saveSettings(e, buttonText) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...`;
    btnSubmit.disabled = true;

    let finalLogoUrl = document.getElementById('previewLogoPengaturan').src;
    const logoFile = document.getElementById('logoUpload') ? document.getElementById('logoUpload').files[0] : null;

    if (logoFile) {
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah Logo...`;
        try {
            const logoBlob = await kompresGambarToBlob(logoFile, 400, 400, 0.8);
            const isPngLogo = logoFile.type.toLowerCase().includes('png') || logoFile.name.toLowerCase().endsWith('.png');
            const ext = isPngLogo ? 'png' : 'jpg';
            const fileName = `logo_${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabaseClient.storage.from('katalog-gambar').upload(fileName, logoBlob, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: publicUrlData } = supabaseClient.storage.from('katalog-gambar').getPublicUrl(fileName);

            // --- MODIFIKASI URL PROKSI UNTUK LOGO ---
            let proxyLogoUrl = publicUrlData.publicUrl.replace(
                'https://hrkobgzbenvojnzdlgth.supabase.co/storage/v1/object/public',
                'https://asmakwagean.my.id/cdn'
            );
            finalLogoUrl = proxyLogoUrl + "?t=" + Date.now();
        } catch (err) {
            alert("Gagal mengunggah logo: " + err.message);
            btnSubmit.innerHTML = originalText; btnSubmit.disabled = false;
            return;
        }
    }

    const updateData = {
        nama_toko: document.getElementById('storeName').value,
        wa_admin: document.getElementById('waNumber').value,
        link_ig: document.getElementById('igLink').value,
        link_fb: document.getElementById('fbLink').value,
        status_buka: document.getElementById('toggleStatusBuka').checked,
        banner_title: document.getElementById('bannerTitle').value,
        banner_subtitle: document.getElementById('bannerSubtitle').value,
        banner_aktif: document.getElementById('toggleBanner').checked,
        kategori: document.getElementById('kategoriToko').value,
        logo_url: finalLogoUrl, 
        updated_at: new Date()
    };
    
    try {
        const { error } = await supabaseClient.from('pengaturan').update(updateData).eq('id', 1);
        if(error) throw error;
        showToast(buttonText + ' Berhasil Disimpan!');
    } catch (error) { 
        alert("Gagal menyimpan pengaturan: " + error.message); 
    } finally { 
        btnSubmit.innerHTML = originalText; btnSubmit.disabled = false; 
    }
}

document.getElementById('formEditBanner').addEventListener('submit', (e) => saveSettings(e, "Pengaturan Banner"));
document.getElementById('formPengaturanToko').addEventListener('submit', (e) => saveSettings(e, "Pengaturan Toko"));

// ==========================================
// 4. UPLOAD GAMBAR KE SUPABASE STORAGE
// ==========================================
const kompresGambarToBlob = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) { if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; } } 
                else { if (height > maxHeight) { width = Math.round((width *= maxHeight / height)); height = maxHeight; } }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                const isPNG = file.type.toLowerCase().includes('png') || file.name.toLowerCase().endsWith('.png');
                if (!isPNG) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                const outputFormat = isPNG ? 'image/png' : 'image/jpeg';
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, outputFormat, quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
};

// Fungsi pembantu mengecek duplikasi kode
function isKodeDuplikat(kode) {
    const kodeBersih = kode.trim().toLowerCase();
    if (!kodeBersih) return false;
    
    // Cari di data yang sudah di-load dari Supabase
    const ketemu = adminProductsData.find(p => p.kode.toLowerCase() === kodeBersih);
    
    // Pengecualian: Jika sedang ngedit, dan kodenya sama dengan kode aslinya, maka BUKAN duplikat
    if (isEditing && ketemu && ketemu.kode === editingKode) {
        return false;
    }
    return !!ketemu;
}

// Pantau ketikan admin secara langsung
document.getElementById('kode_barang').addEventListener('input', function(e) {
    const isDuplikat = isKodeDuplikat(e.target.value);
    const peringatan = document.getElementById('peringatanKode');
    
    if (isDuplikat) {
        peringatan.classList.remove('hidden');
        e.target.classList.add('border-red-500', 'focus:ring-red-500');
    } else {
        peringatan.classList.add('hidden');
        e.target.classList.remove('border-red-500', 'focus:ring-red-500');
    }
});

// FUNGSI TAMBAH / EDIT BARANG
document.getElementById('formTambahBarang').addEventListener('submit', async function(e) {
    e.preventDefault();

    // 1. CEK KATEGORI
    const cekKategori = document.getElementById('kategori_barang_terpilih').value;
    if (!cekKategori) {
        Swal.fire('Perhatian!', 'Silahkan pilih kategori barang terlebih dahulu.', 'warning');
        return; 
    }

    // 2. CEGAT KODE DUPLIKAT (VALIDASI FAIL-FAST)
    const kodeInputElem = document.getElementById('kode_barang');
    const kodeInput = kodeInputElem.value;

    if (isKodeDuplikat(kodeInput)) {
        document.getElementById('peringatanKode').classList.remove('hidden');
        kodeInputElem.classList.add('animate-shake', 'border-red-500');
        kodeInputElem.focus();
        setTimeout(() => { kodeInputElem.classList.remove('animate-shake'); }, 400);
        return; 
    }

    // 3. JIKA AMAN, LANJUTKAN PROSES SIMPAN
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML; 
    btnSubmit.disabled = true;

    const file = fileYangDiunggah;
    let finalImageUrl = isEditing ? document.getElementById('image-preview').src : "https://placehold.co/400x400/1f2937/ffffff?text=No+Image";

    if (file) {
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Mengunggah gambar...`;
        try {
            const imageBlob = await kompresGambarToBlob(file, 800, 800, 0.7);
            const isPngFile = file.type.toLowerCase().includes('png') || file.name.toLowerCase().endsWith('.png');
            const ext = isPngFile ? 'png' : 'jpg';
            const kodeAman = kodeInput.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${kodeAman}_${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('katalog-gambar')
                .upload(fileName, imageBlob, { cacheControl: '3600', upsert: true });
            
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabaseClient.storage
                .from('katalog-gambar')
                .getPublicUrl(fileName);
            
            let proxyImageUrl = publicUrlData.publicUrl.replace(
                'https://hrkobgzbenvojnzdlgth.supabase.co/storage/v1/object/public',
                'https://asmakwagean.my.id/cdn'
            );
            finalImageUrl = proxyImageUrl + "?t=" + Date.now();

        } catch (err) {
            // --- MODIFIKASI LOG ERROR ---
            catatLogError("Upload Gambar", err);
            Swal.fire('Upload Gagal!', `Terjadi kesalahan jaringan atau sesi habis. Detail: ${err.message || 'Unknown'}`, 'error');
            // ----------------------------
            btnSubmit.innerHTML = originalText; 
            btnSubmit.disabled = false;
            return;
        }
    }
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan data...`;
    
    const produkData = {
        kode: kodeInput,
        nama: document.getElementById('nama_barang').value,
        harga: document.getElementById('harga').value,
        gambar: finalImageUrl,
        varian: getVariasiString(),
        kategori: cekKategori
    };

    try {
        if (isEditing) {
            const oldItem = adminProductsData.find(p => p.kode === editingKode);
            const oldImageUrl = oldItem ? oldItem.gambar : null;
            const isNewImageUploaded = !!file; 

            const { error: dbError } = await supabaseClient.from('produk').update(produkData).eq('kode', editingKode);
            if (dbError) throw dbError;
            
            if (isNewImageUploaded && oldImageUrl) {
                const oldFileNameDenganQuery = oldImageUrl.split('/').pop();
                const oldFileNameAsli = oldFileNameDenganQuery.split('?')[0];
                
                supabaseClient.storage.from('katalog-gambar').remove([oldFileNameAsli])
                    .catch(err => console.warn("Peringatan: Gagal membersihkan gambar lama:", err));
            }
            Swal.fire('Berhasil!', 'Barang berhasil diperbarui!', 'success');
        } else {
            const { error: dbError } = await supabaseClient.from('produk').insert([produkData]);
            if (dbError) {
                if (dbError.code === '23505') throw new Error("Kode barang sudah digunakan!");
                throw dbError;
            }
            Swal.fire('Berhasil!', 'Barang tersimpan!', 'success');
        }
        
        resetFormLengkap();
        loadAdminProducts(); 
    } catch (error) { 
        // --- MODIFIKASI LOG ERROR ---
        catatLogError("Simpan Database", error);
        Swal.fire('Penyimpanan Gagal!', `Detail: ${error.message || 'Gagal menyimpan barang ke database.'}`, 'error');
        // ----------------------------
    } finally { 
        btnSubmit.innerHTML = originalText; 
        btnSubmit.disabled = false; 
    }
});

// ==========================================
// 5. FUNGSI HAPUS DAN UBAH STATUS
// ==========================================
async function hapusBarang(kode) {
    const result = await Swal.fire({
        title: 'Hapus Barang?',
        text: `Anda yakin ingin menghapus barang dengan kode ${kode}? File gambar fisik juga akan dihapus secara permanen.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Ya, Hapus!'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const item = adminProductsData.find(p => p.kode === kode);
            
            if (item && item.gambar) {
                const namaFileDenganQuery = item.gambar.split('/').pop();
                const namaFileAsli = namaFileDenganQuery.split('?')[0];
                
                const { error: storageError } = await supabaseClient.storage
                    .from('katalog-gambar')
                    .remove([namaFileAsli]);
                    
                if (storageError) console.warn("Peringatan: Gagal menghapus gambar fisik:", storageError);
            }

            const { error: dbError } = await supabaseClient.from('produk').delete().eq('kode', kode);
            if (dbError) throw dbError;
            
            Swal.fire('Terhapus!', 'Barang beserta gambarnya berhasil dihapus.', 'success');
            loadAdminProducts(); 
        } catch (error) {
            Swal.fire('Gagal!', error.message || 'Terjadi kesalahan sistem.', 'error');
        }
    }
}

async function toggleStatusBarang(kode, isCurrentlyHabis) {
    const newStatus = isCurrentlyHabis ? 'tersedia' : 'habis';
    const statusText = isCurrentlyHabis ? 'Tersedia' : 'Habis';

    const result = await Swal.fire({
        title: 'Ubah Status?',
        text: `Ubah status barang ${kode} menjadi ${statusText}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Ya, Ubah!'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { error } = await supabaseClient.from('produk').update({ status: newStatus }).eq('kode', kode);
            if (error) throw error;

            Swal.close();
            showToast(`Status ${kode} diubah menjadi ${statusText}`);
            loadAdminProducts();
        } catch (error) {
            Swal.fire('Gagal!', 'Terjadi kesalahan sistem.', 'error');
        }
    }
}

function formatTanggalWaktu(isoString) {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', { 
        day: '2-digit', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    }).format(date);
}

// ==========================================
// 6. FUNGSI MEMUAT LOG AKTIVITAS (CCTV)
// ==========================================
async function loadLogAktivitas() {
    const tableBody = document.getElementById('table-log-body');
    tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-purple-500"></i><p class="text-sm font-medium">Memuat riwayat aktivitas...</p></td></tr>`;

    try {
        const { data, error } = await supabaseClient
            .from('log_aktivitas')
            .select('*')
            .order('waktu', { ascending: false })
            .limit(100);

        if (error) throw error;
        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-gray-500">Belum ada riwayat aktivitas.</td></tr>`;
            return;
        }

        data.forEach(log => {
            let badgeColor = 'bg-gray-100 text-gray-600';
            if (log.aksi.includes('TAMBAH')) badgeColor = 'bg-green-100 text-green-600';
            else if (log.aksi.includes('EDIT') || log.aksi.includes('UBAH')) badgeColor = 'bg-blue-100 text-blue-600';
            else if (log.aksi.includes('HAPUS')) badgeColor = 'bg-red-100 text-red-600';

            const amanEmail = escapeHTML(log.user_email);
            const amanAksi = escapeHTML(log.aksi);
            const amanDetail = escapeHTML(log.detail);

            tableBody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatTanggalWaktu(log.waktu)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">${amanEmail}</td> <!-- UBAH DI SINI -->
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <span class="px-2 py-1 rounded-sm text-xs font-bold ${badgeColor}">${amanAksi}</span> <!-- UBAH DI SINI -->
                </td>
                <td class="px-6 py-4 text-sm text-gray-600">${amanDetail}</td> <!-- UBAH DI SINI -->
            </tr>`;
        });
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-red-500">Gagal memuat log aktivitas.</td></tr>`;
        console.error(error);
    }
}

loadLogAktivitas();

// --- HELPER UNTUK SIAPKAN EDIT BARANG ---
function siapkanEditBarang(kode) {
    const item = adminProductsData.find(p => p.kode === kode);
    if (item) editBarang(item);
}

function editBarang(item) {
    document.getElementById('tab-kelolaBarang').scrollIntoView({ behavior: 'smooth' });
    isEditing = true;
    editingKode = item.kode;

    document.getElementById('kode_barang').value = item.kode;
    document.getElementById('kode_barang').disabled = false; 
    document.getElementById('nama_barang').value = item.nama;
    document.getElementById('harga').value = item.harga;

    if (item.kategori) {
    kategoriAktif = item.kategori;
    renderKategoriChips();
}

    resetUI_Variasi(); 
    if (item.varian && item.varian.trim() !== '') {
        document.getElementById('btnAktifkanVariasi').classList.add('hidden');
        document.getElementById('containerVariasi').classList.remove('hidden');
        document.getElementById('btnTambahVariasi').classList.remove('hidden');
        
        const variasiArray = item.varian.split(',').map(v => v.trim()).filter(v => v !== '');
        variasiArray.forEach(val => tambahInputVariasi(val));
    }

    const imagePreview = document.getElementById('image-preview');
    const uploadContent = document.getElementById('upload-content');
    const btnRemoveImage = document.getElementById('btn-remove-image');

    imagePreview.src = item.gambar;
    imagePreview.classList.remove('hidden');
    uploadContent.classList.add('opacity-0');
    btnRemoveImage.classList.remove('hidden');

    const submitBtn = document.querySelector('#formTambahBarang button[type="submit"]');
    submitBtn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Update Barang';
    submitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    submitBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
    updatePlaceholderVariasi();
}

document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('w-64')) {
        sidebar.classList.remove('w-64'); sidebar.classList.add('w-0');
    } else {
        sidebar.classList.remove('w-0'); sidebar.classList.add('w-64');
    }
});

// ==========================================
// 7. FITUR AUTO-LOGOUT (AFK PROTECTION)
// ==========================================
let inactivityTimer;
const WAKTU_TUNGGU = 15 * 60 * 1000; // 15 menit
let isThrottled = false; // Bendera (flag) untuk throttling

async function eksekusiAutoLogout() {
    // 1. Hapus sesi di Supabase
    await supabaseClient.auth.signOut();
    
    // 2. Simpan pesan ke sessionStorage untuk ditampilkan di halaman login
    sessionStorage.setItem('pesan_logout', 'Sesi Anda telah berakhir karena tidak ada aktivitas selama 15 menit. Silakan login kembali.');
    
    // 3. Tendang ke halaman login tanpa jeda (lebih aman daripada menggunakan alert)
    window.location.replace("login_page.html");
}

function resetInactivityTimer() {
    // THROTTLING: Jika belum 1 detik sejak reset terakhir, abaikan pergerakan mouse/scroll
    if (isThrottled) return;
    
    // Kunci eksekusi selama 1 detik ke depan
    isThrottled = true;
    setTimeout(() => { isThrottled = false; }, 1000);

    // Reset timer utama
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(eksekusiAutoLogout, WAKTU_TUNGGU);
}

// Pantau berbagai jenis aktivitas admin
const userEvents = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
userEvents.forEach(event => {
    // Tambahkan passive: true untuk meningkatkan performa scroll peramban
    window.addEventListener(event, resetInactivityTimer, { capture: true, passive: true });
});

// Mulai perhitungan mundur saat halaman pertama kali dimuat
resetInactivityTimer();

// ==========================================
// 8. FITUR DRAG & DROP URUTAN BARANG
// ==========================================
let sortableInstance = null;

function bukaModalUrutan() {
    const modal = document.getElementById('modalUrutan');
    const listContainer = document.getElementById('listUrutanBarang');
    listContainer.innerHTML = '';

    if (currentFilteredAdminData.length === 0) {
        Swal.fire('Info', 'Tidak ada barang yang tampil untuk diurutkan.', 'info');
        return;
    }

    currentFilteredAdminData.forEach(item => {
        const amanKode = escapeHTML(item.kode);
        const amanNama = escapeHTML(item.nama);
        const amanGambar = escapeHTML(item.gambar);
        
        const div = document.createElement('div');
        div.className = 'bg-white rounded-lg overflow-hidden transition-transform duration-200 group flex flex-col relative hover:-translate-y-1';
        div.dataset.kode = item.kode;
        
        div.style.border = '2px solid #22c55e'; 
        div.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.4)'; 
        
        div.innerHTML = `
            <!-- Area Gambar Utama -->
            <div class="relative w-full bg-gray-50 overflow-hidden border-b border-green-200" style="padding-top: 100%;">
                
                <!-- BROWSER DRAG DIMATIKAN: draggable="false" mencegah browser menarik gambar biasa -->
                <img src="${amanGambar}" draggable="false" class="absolute inset-0 w-full h-full object-cover select-none">
                
                <div class="absolute inset-0 bg-green-900 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none"></div>
                
                <!-- TOMBOL DRAG HANDLE (Menggunakan style inline agar dijamin 100% muncul) -->
                <div class="handle-drag absolute flex items-center justify-center cursor-grab active:cursor-grabbing z-20 transition-colors" 
                     style="top: 8px; right: 8px; width: 30px; height: 30px; background-color: #ffffff; border-radius: 6px; border: 1px solid #22c55e; color: #16a34a; box-shadow: 0 2px 4px rgba(0,0,0,0.15);" 
                     title="Tahan dan Geser">
                    <i class="fa-solid fa-grip-vertical text-sm"></i>
                </div>
            </div>
            
            <!-- Area Teks -->
            <div class="p-2.5 bg-white flex-1 flex flex-col pointer-events-none">
                <p class="text-[9px] font-bold text-green-600 tracking-wider uppercase mb-0.5">${amanKode}</p>
                <p class="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight" title="${amanNama}">${amanNama}</p>
            </div>
        `;
        listContainer.appendChild(div);
    });

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 

    // Inisialisasi library SortableJS
    if (sortableInstance) { sortableInstance.destroy(); }
    sortableInstance = new Sortable(listContainer, {
        handle: '.handle-drag', // Sistem HANYA akan menarik kartu jika tombol pojok ditekan
        animation: 250,
        ghostClass: 'opacity-40', 
        chosenClass: 'scale-105', 
        dragClass: 'shadow-2xl',  
        
        scroll: document.getElementById('modalUrutan'), 
        scrollSensitivity: 80,   
        scrollSpeed: 20,         
        bubbleScroll: true
        // PASTIKAN: forceFallback: true sudah DIHAPUS agar bisa digeser-geser.
    });
}

function tutupModalUrutan() {
    document.getElementById('modalUrutan').classList.add('hidden');
    // Mengembalikan fungsi scroll halaman utama
    document.body.style.overflow = ''; 
}

async function simpanUrutanBarang() {
    const listItems = document.querySelectorAll('#listUrutanBarang > div');
    const btn = document.getElementById('btnSimpanUrutan');
    const originalText = btn.innerHTML;

    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...`;
    btn.disabled = true;

    try {
        // MODIFIKASI: Menambahkan 'async' dan 'throw error' agar kegagalan terdeteksi
        const promises = Array.from(listItems).map(async (li, index) => {
            const kode = li.dataset.kode;
            const { error } = await supabaseClient.from('produk')
                .update({ urutan: index + 1 })
                .eq('kode', kode);
            
            // Wajib dilempar agar tertangkap oleh 'catch' di bawah jika SQL gagal
            if (error) throw error; 
        });

        await Promise.all(promises);
        
        Swal.fire('Tersimpan!', 'Urutan etalase berhasil dirapikan.', 'success');
        tutupModalUrutan();
        loadAdminProducts(); 
    } catch (error) {
        catatLogError("Simpan Urutan Barang", error);
        Swal.fire('Penyimpanan Gagal', 'Kemungkinan kolom "urutan" belum dibuat di database. Detail: ' + (error.message || error), 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
// ==========================================
// 9. FITUR MANAJEMEN PESANAN & RESI PENGIRIMAN
// ==========================================

async function loadAdminPesanan() {
    const tableBody = document.getElementById('table-pesanan-body');
    if(!tableBody) return;
    
    tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500"><i class="fa-solid fa-spinner fa-spin text-3xl mb-3 text-orange-500"></i><p class="text-sm font-medium">Memuat pesanan dari database...</p></td></tr>`;

    try {
        const { data, error } = await supabaseClient
            .from('transaksi')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        tableBody.innerHTML = '';

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">Belum ada pesanan masuk.</td></tr>`;
            return;
        }

        data.forEach(order => {
            // 1. Badge Pembayaran
            let badgeBayar = `<span class="bg-yellow-100 text-yellow-600 px-2 py-1 rounded text-xs font-bold uppercase">Pending</span>`;
            if (order.status_pembayaran === 'lunas') badgeBayar = `<span class="bg-green-100 text-green-600 px-2 py-1 rounded text-xs font-bold uppercase">Lunas</span>`;
            else if (order.status_pembayaran === 'batal' || order.status_pembayaran === 'expire') badgeBayar = `<span class="bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold uppercase">Batal</span>`;

            // 2. Badge Pengiriman
            let badgeKirim = `<span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold uppercase">${escapeHTML(order.status_pengiriman)}</span>`;
            if (order.status_pengiriman === 'dikirim' || order.status_pengiriman === 'selesai') {
                badgeKirim = `<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-bold uppercase">${escapeHTML(order.status_pengiriman)}</span>
                              <br><span class="text-[10px] font-mono text-gray-500 mt-1 block">${escapeHTML(order.kurir)}: ${escapeHTML(order.nomor_resi)}</span>`;
            }

            const tgl = formatTanggalWaktu(order.created_at);
            const pembeli = order.detail_pembeli;
            const jsSafeOrderId = String(order.order_id).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            // 3. Tombol Aksi (Hanya bisa klik Proses jika Lunas)
            let actionBtn = `<button onclick="prosesPesanan('${jsSafeOrderId}')" class="text-white bg-blue-600 hover:bg-blue-700 shadow-sm px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ml-auto" title="Masukkan Resi Pengiriman"><i class="fa-solid fa-truck-fast"></i> Proses</button>`;
            
            if (order.status_pembayaran !== 'lunas') {
                actionBtn = `<button disabled class="text-gray-400 bg-gray-100 px-4 py-2 rounded-lg text-sm font-semibold cursor-not-allowed flex items-center gap-2 ml-auto"><i class="fa-solid fa-ban"></i> Proses</button>`;
            }

            tableBody.innerHTML += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-500 mb-1"><i class="fa-regular fa-calendar mr-1"></i>${tgl}</div>
                    <div class="text-sm font-mono font-bold text-gray-800">${escapeHTML(order.order_id)}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-gray-800">${escapeHTML(pembeli.nama)}</div>
                    <div class="text-xs text-gray-500 mt-0.5"><i class="fa-brands fa-whatsapp text-green-500 mr-1"></i>${escapeHTML(pembeli.phone)}</div>
                    <div class="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-tight" title="${escapeHTML(pembeli.alamat)}">${escapeHTML(pembeli.alamat)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">${formatRupiah(order.total_harga)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center">${badgeBayar}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center">${badgeKirim}</td>
                <td class="px-6 py-4 whitespace-nowrap">${actionBtn}</td>
            </tr>`;
        });
    } catch (error) {
        catatLogError("Load Pesanan Admin", error);
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-500">Gagal memuat pesanan.</td></tr>`;
    }
}

// Panggil fungsi ini agar otomatis dimuat saat admin baru login
loadAdminPesanan();

async function prosesPesanan(orderId) {
    const { value: formValues } = await Swal.fire({
        title: 'Proses Pengiriman',
        html:
            `<p class="text-sm text-gray-600 mb-4">Masukkan Resi untuk Invoice: <br><span class="font-mono font-bold text-blue-600">${orderId}</span></p>` +
            `<div class="space-y-3 text-left">
                <label class="text-xs font-bold text-gray-500 uppercase tracking-wide">Pilih Ekspedisi / Kurir</label>
                <select id="swal-kurir" class="w-full text-base p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">-- Pilih Kurir --</option>
                    <option value="J&T">J&T Express</option>
                    <option value="JNE">JNE</option>
                    <option value="SPX">Shopee Xpress (SPX)</option>
                    <option value="Sicepat">Sicepat</option>
                    <option value="AnterAja">AnterAja</option>
                    <option value="Lainnya">Lainnya...</option>
                </select>
                <label class="text-xs font-bold text-gray-500 uppercase tracking-wide block mt-3">Nomor Resi</label>
                <input id="swal-resi" class="w-full text-base p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Cth: JX1234567890">
            </div>`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-paper-plane mr-2"></i>Kirim Resi',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#2563eb',
        preConfirm: () => {
            const kurir = document.getElementById('swal-kurir').value;
            const resi = document.getElementById('swal-resi').value.trim();
            if (!kurir || !resi) {
                Swal.showValidationMessage('Ekspedisi dan Nomor Resi wajib diisi!');
                return false;
            }
            return { kurir: kurir, resi: resi };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            // Update database transaksi
            // Update database transaksi
            const { data, error } = await supabaseClient
                .from('transaksi')
                .update({ 
                    kurir: formValues.kurir, 
                    nomor_resi: formValues.resi, 
                    status_pengiriman: 'dikirim' 
                })
                .eq('order_id', orderId)
                .select(); // WAJIB TAMBAHKAN INI agar database mengembalikan data yang terubah

            if (error) throw error;
            
            // Jika array kosong, berarti RLS memblokir aksi ini
            if (!data || data.length === 0) {
                throw new Error("Akses ditolak oleh database (RLS) atau pesanan tidak ditemukan.");
            }
            
            // Catat ke CCTV Audit
            const emailAdmin = document.getElementById('profilAdminEmail')?.textContent || 'Admin';
            await supabaseClient.from('log_aktivitas').insert([{
                user_email: emailAdmin,
                aksi: 'INPUT RESI',
                detail: `Input resi pesanan ${orderId} (Kurir: ${formValues.kurir}, Resi: ${formValues.resi})`
            }]);

            Swal.fire('Berhasil!', 'Nomor resi tersimpan. Pembeli kini bisa melihatnya di halaman status.', 'success');
            loadAdminPesanan(); // Segarkan tabel pesanan
        } catch (err) {
            catatLogError("Input Resi", err);
            Swal.fire('Gagal!', 'Terjadi kesalahan saat menyimpan resi.', 'error');
        }
    }
}
