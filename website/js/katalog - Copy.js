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
// VARIABEL GLOBAL KATALOG & KERANJANG
// ==========================================
let currentProducts = [];
let currentSearch = '';
let globalSettings = {};

let currentCategory = 'Semua';
let shoppingCart = JSON.parse(localStorage.getItem('tokoku_cart')) || [];

let currentPage = 1;
const ITEMS_PER_PAGE = 20;

const formatRupiah = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

// ==========================================
// 1. RENDER KATEGORI DINAMIS
// ==========================================
function renderKategori() {
    const container = document.getElementById('categoryContainer');
    container.innerHTML = ''; 
    
    const btnSemua = document.createElement('button');
    btnSemua.onclick = function() { filterCategory('Semua', this); };
    btnSemua.className = "category-btn whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium bg-green-600 text-white shadow-sm transition-colors";
    btnSemua.textContent = 'Semua';
    container.appendChild(btnSemua);

    if (globalSettings.kategori) {
        const kategoriArray = globalSettings.kategori.split(',').map(k => k.trim()).filter(k => k);
        kategoriArray.forEach(kat => {
            const btn = document.createElement('button');
            btn.onclick = function() { filterCategory(kat, this); };
            btn.className = "category-btn whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors";
            btn.textContent = kat;
            container.appendChild(btn);
        });
    }
}

// ==========================================
// 2. AMBIL DATA PENGATURAN TOKO (SUPABASE)
// ==========================================
async function fetchSettings() {
    try {
        const { data: pengaturanData, error } = await supabaseClient
            .from('pengaturan')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        globalSettings = pengaturanData || {};
        
        const namaToko = globalSettings.nama_toko || "TokoKu";
        document.getElementById('pageTitleDisplay').textContent = namaToko + " - Katalog";
        document.getElementById('storeNameDisplay').textContent = namaToko;
        document.getElementById('footerStoreName').textContent = namaToko;
        
        const waNumber = globalSettings.wa_admin || "6281234567890";
        document.getElementById('headerWaLink').href = `https://wa.me/${waNumber}`;

        if (globalSettings.logo_url) {
            document.getElementById('headerLogoImg').src = globalSettings.logo_url;
            document.getElementById('headerLogoImg').classList.remove('hidden');
            document.getElementById('headerIcon').style.display = 'none';
            
            let favicon = document.querySelector("link[rel~='icon']");
            if (!favicon) {
                favicon = document.createElement('link');
                favicon.rel = 'icon';
                document.head.appendChild(favicon);
            }
            favicon.href = globalSettings.logo_url;
        }

        if (globalSettings.link_ig) { 
            document.getElementById('footerIgLink').href = globalSettings.link_ig; 
            document.getElementById('footerIgLink').classList.remove('hidden'); 
        }
        if (globalSettings.link_fb) { 
            document.getElementById('footerFbLink').href = globalSettings.link_fb; 
            document.getElementById('footerFbLink').classList.remove('hidden'); 
        }

        if (globalSettings.banner_aktif) {
            document.getElementById('bannerSection').classList.remove('hidden');
            document.getElementById('bannerTitleDisplay').textContent = globalSettings.banner_title;
            document.getElementById('bannerSubtitleDisplay').textContent = globalSettings.banner_subtitle;
        }

        if (!globalSettings.status_buka) {
            document.getElementById('tokoTutupWarning').classList.remove('hidden');
        }
        
        renderKategori(); 
        fetchProducts();
    } catch (err) { 
        console.error("Gagal load pengaturan", err); 
        fetchProducts(); 
    }
}

// ==========================================
// 3. AMBIL DATA KATALOG BARANG (SUPABASE)
// ==========================================
async function fetchProducts(page = 1, append = false, keyword = '') {
    try {
        if (page === 1 && !append) {
            document.getElementById('productCount').textContent = "Memuat data...";
            document.getElementById('productGrid').innerHTML = ''; 
        }

        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE - 1;

        let query = supabaseClient
            .from('produk')
            .select('*', { count: 'exact' })
            .order('urutan', { ascending: true })
            .order('created_at', { ascending: false })
            .range(startIndex, endIndex);

        if (keyword) {
            query = query.or(`nama.ilike.%${keyword}%,kode.ilike.%${keyword}%`);
        }
        
        if (currentCategory !== 'Semua') {
            query = query.eq('kategori', currentCategory);
        }

        const { data, count, error } = await query;
        if (error) throw error;
        
        const fetchedProducts = data.map(item => ({
            id: item.kode, 
            name: item.nama, 
            price: parseInt(item.harga) || 0,
            image: item.gambar || "https://placehold.co/400",
            status: item.status,
            varian: item.varian || "",
            kategori: item.kategori
        }));

        if (append) { currentProducts = [...currentProducts, ...fetchedProducts]; } 
        else { currentProducts = fetchedProducts; }
        
        const meta = { totalItems: count, totalPages: Math.ceil(count / ITEMS_PER_PAGE), currentPage: page };
        renderProducts(currentProducts, meta);
    } catch (error) { 
        console.error("Gagal fetch produk:", error);
        document.getElementById('productGrid').innerHTML = '<p class="text-red-500 col-span-full text-center">Gagal terhubung ke database.</p>'; 
    }
}

// ==========================================
// 4. RENDER UI & LOGIKA SEARCH/LOAD MORE
// ==========================================
const renderProducts = (products, meta) => {
    const grid = document.getElementById('productGrid');
    const emptyState = document.getElementById('emptyState');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    
    grid.innerHTML = ''; 
    
    if (products.length === 0) {
        grid.classList.add('hidden'); 
        emptyState.classList.remove('hidden');
        loadMoreContainer.classList.add('hidden');
        document.getElementById('productCount').textContent = `0 barang`;
        return;
    } else {
        grid.classList.remove('hidden'); 
        emptyState.classList.add('hidden');
    }
    
    const isTokoBuka = (globalSettings.status_buka === true || globalSettings.status_buka === undefined);
    
    products.forEach(product => {
        const card = document.createElement('div');
        const isHabis = product.status === 'habis'; 
        const cardOpacity = isHabis ? 'opacity-60' : 'opacity-100';
        card.className = `product-card bg-white border border-gray-200 overflow-hidden flex flex-col h-full ${cardOpacity}`;

        const amanId = escapeHTML(product.id);
        const amanName = escapeHTML(product.name);
        const amanImage = escapeHTML(product.image);
        const amanVarian = escapeHTML(product.varian);
        
        const jsSafeName = product.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const jsSafeVarian = product.varian.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const jsSafeId = String(product.id).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const jsSafeImage = String(product.image).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const jsSafeKategori = String(product.kategori).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        let btnPesan = '';
        if (!isTokoBuka) {
            btnPesan = `<button disabled class="w-full bg-gray-300 text-gray-500 cursor-not-allowed text-xs sm:text-sm font-medium py-1.5 px-2 rounded-sm flex items-center justify-center gap-1.5">Toko Tutup</button>`;
        } else if (isHabis) {
            btnPesan = `<button disabled class="w-full bg-red-100 text-red-600 cursor-not-allowed text-xs sm:text-sm font-medium py-1.5 px-2 rounded-sm flex items-center justify-center gap-1.5">Stok Habis</button>`;
        } else {
            if (product.varian && product.varian.trim() !== '') {
                btnPesan = `<button onclick="openVariantModal('${jsSafeId}', '${jsSafeName}', ${product.price}, '${jsSafeImage}', '${jsSafeVarian}', '${jsSafeKategori}')" class="w-full bg-green-100 hover:bg-green-600 hover:text-white text-green-700 text-xs sm:text-sm font-bold py-2 px-2 rounded-sm flex items-center justify-center gap-1.5 transition-colors"><i class="fa-solid fa-cart-plus"></i> +Keranjang</button>`;
            } else {
                btnPesan = `<button onclick="addToCart('${jsSafeId}', '${jsSafeName}', ${product.price}, '${jsSafeImage}', '', '${jsSafeKategori}')" class="w-full bg-green-100 hover:bg-green-600 hover:text-white text-green-700 text-xs sm:text-sm font-bold py-2 px-2 rounded-sm flex items-center justify-center gap-1.5 transition-colors"><i class="fa-solid fa-cart-plus"></i> +Keranjang</button>`;
            }
        }

        const badgeHabis = isHabis ? `<div class="absolute inset-0 bg-white/40 flex items-center justify-center z-10"><span class="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-sm uppercase tracking-wider">Habis</span></div>` : '';

        card.innerHTML = `
            <div class="w-full overflow-hidden bg-gray-100 border-b relative" style="aspect-ratio: 1 / 1;">
                ${badgeHabis}
                <img src="${amanImage}" alt="${amanName}" loading="lazy" class="w-full h-full object-cover object-center transition-transform duration-300 hover:scale-105">
            </div>
            <div class="p-2 sm:p-3 flex flex-col flex-1">
                <p class="text-[10px] sm:text-xs font-mono text-gray-500 mb-0.5">${amanId}</p>
                <h3 class="text-xs sm:text-sm text-gray-800 line-clamp-2 mb-1 flex-1">${amanName}</h3>
                <p class="text-sm sm:text-base font-bold text-green-600 mb-3">${formatRupiah(product.price)}</p>
                ${btnPesan}
            </div>
        `;
        grid.appendChild(card);
    });
    
    document.getElementById('productCount').textContent = `Menampilkan ${products.length} dari ${meta.totalItems} barang`;
    
    if (meta.currentPage < meta.totalPages) {
        loadMoreContainer.classList.remove('hidden');
        document.getElementById('btnLoadMore').innerHTML = 'Tampilkan Lebih Banyak'; 
    } else {
        loadMoreContainer.classList.add('hidden');
    }
};

let searchTimeout;
const executeSearch = (keyword) => {
    currentSearch = keyword.trim(); 
    
    if (currentSearch === '') {
        document.getElementById('searchIndicatorContainer').classList.add('hidden');
    } else {
        document.getElementById('searchKeywordText').textContent = currentSearch;
        document.getElementById('searchIndicatorContainer').classList.remove('hidden');
    }

    currentPage = 1; 
    clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
        fetchProducts(currentPage, false, currentSearch);
    }, 500); 
};

// Pastikan event listener dipasang dengan benar
const btnLoadMore = document.getElementById('btnLoadMore');
const newBtnLoadMore = btnLoadMore.cloneNode(true);
btnLoadMore.parentNode.replaceChild(newBtnLoadMore, btnLoadMore);
newBtnLoadMore.addEventListener('click', function() {
    this.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Memuat...';
    currentPage++;
    fetchProducts(currentPage, true, currentSearch); 
});

document.getElementById('searchInput').addEventListener('input', (e) => executeSearch(e.target.value));

window.filterCategory = (kategori, btnElement) => {
    currentCategory = kategori;
    currentPage = 1;
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('bg-green-600', 'text-white', 'shadow-sm');
        btn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
    });
    btnElement.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
    btnElement.classList.add('bg-green-600', 'text-white', 'shadow-sm');

    fetchProducts(currentPage, false, currentSearch);
};

// ==========================================
// 5. LOGIKA KERANJANG & CHECKOUT
// ==========================================
function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.qty, 0);
    if(totalItems > 0) {
        badge.textContent = totalItems;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
    localStorage.setItem('tokoku_cart', JSON.stringify(shoppingCart));
}

// --- FITUR BARU: Animasi Toast ala Shopee ---
let cartToastTimeout;
function showCartToast() {
    const toast = document.getElementById('shopeeToast');
    if (!toast) return;
    
    // Reset timer jika pembeli mengeklik tambah secara brutal/berulang-ulang
    clearTimeout(cartToastTimeout);
    
    // Munculkan pop-up (Animasi membesar dan jelas)
    toast.classList.remove('opacity-0', 'scale-90');
    toast.classList.add('opacity-100', 'scale-100');
    
    // Sembunyikan otomatis setelah 1.5 detik
    cartToastTimeout = setTimeout(() => {
        toast.classList.remove('opacity-100', 'scale-100');
        toast.classList.add('opacity-0', 'scale-90');
    }, 1500);
}

// --- MODIFIKASI: Menambahkan pemanggilan showCartToast() ---
window.addToCart = (id, nama, harga, gambar, varian = '', kategori = 'Lainnya') => {
    const cartItemId = varian ? `${id}-${varian}` : id;
    
    const existingItem = shoppingCart.find(item => (item.cartItemId || item.id) === cartItemId);
    if (existingItem) {
        existingItem.qty += 1;
    } else {
        // Simpan kategori ke dalam data keranjang
        shoppingCart.push({ cartItemId, id, nama, harga, gambar, qty: 1, varian, kategori });
    }
    updateCartBadge();
    renderCartUI();
    
    const badge = document.getElementById('cartBadge');
    badge.classList.add('scale-150');
    setTimeout(() => badge.classList.remove('scale-150'), 200);

    // Panggil notifikasi layar tengah di sini
    showCartToast();
};

window.removeFromCart = (cartItemId) => {
    shoppingCart = shoppingCart.filter(item => item.cartItemId !== cartItemId);
    updateCartBadge();
    renderCartUI();
};

window.changeQty = (cartItemId, delta) => {
    const item = shoppingCart.find(item => item.cartItemId === cartItemId);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) window.removeFromCart(cartItemId);
        else { updateCartBadge(); renderCartUI(); }
    }
};

window.openVariantModal = (id, nama, harga, gambar, varianString, kategori = 'Lainnya') => {
    const isCincin = (kategori === 'Cincin');
    
    // SMART LABELING: Ubah teks modal jika itu cincin
    document.getElementById('modalVariantTitle').textContent = isCincin ? 'Pilih Ukuran Cincin' : 'Pilih Varian';
    document.getElementById('modalVariantSubtitle').textContent = isCincin ? 'Ukuran Tersedia:' : 'Varian Tersedia:';

    document.getElementById('varModalName').textContent = nama;
    document.getElementById('varModalPrice').textContent = formatRupiah(harga);
    document.getElementById('varModalImg').src = gambar;
    
    const container = document.getElementById('variantButtonsContainer');
    container.innerHTML = ''; 
    
    const varianArray = varianString.split(',').map(v => v.trim()).filter(v => v);
    
    varianArray.forEach(varian => {
        const btn = document.createElement('button');
        btn.className = "px-4 py-2 border border-green-500 text-green-600 rounded-md text-sm font-medium hover:bg-green-50 focus:ring-2 focus:ring-green-300 transition-colors";
        btn.textContent = varian;
        btn.onclick = () => {
            addToCart(id, nama, harga, gambar, varian, kategori); // Bawa kategori ke cart
            closeVariantModal();
        };
        container.appendChild(btn);
    });

    const modal = document.getElementById('variantModal');
    const panel = document.getElementById('variantPanel');
    modal.classList.remove('hidden');
    setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); }, 10);
};

window.closeVariantModal = () => {
    const modal = document.getElementById('variantModal');
    const panel = document.getElementById('variantPanel');
    panel.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); }, 200);
};

window.toggleCart = () => {
    const modal = document.getElementById('cartModal');
    const panel = document.getElementById('cartPanel');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => panel.classList.remove('translate-x-full'), 10);
        renderCartUI();
    } else {
        panel.classList.add('translate-x-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

// REVISI UNTUK FUNGSI renderCartUI()
function renderCartUI() {
    const container = document.getElementById('cartItemsContainer');
    const totalDisplay = document.getElementById('cartTotalDisplay');
    const btnCheckout = document.getElementById('btnCheckout');

    container.innerHTML = '';
    let totalHarga = 0;

    if (shoppingCart.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 py-10"><i class="fa-solid fa-basket-shopping text-4xl mb-3 text-gray-300"></i><br>Keranjang masih kosong.</div>`;
        totalDisplay.textContent = 'Rp 0';
        btnCheckout.disabled = true;
        btnCheckout.classList.replace('bg-wa', 'bg-gray-400');
        btnCheckout.classList.remove('hover:bg-wa-dark');
        return;
    }

    btnCheckout.disabled = false;
    btnCheckout.classList.replace('bg-gray-400', 'bg-wa');
    btnCheckout.classList.add('hover:bg-wa-dark');

    shoppingCart.forEach(item => {
        const subtotal = item.harga * item.qty;
        totalHarga += subtotal;
        
        // PINDAHKAN SANITASI KE SINI DAN GUNAKAN 'item'
        const amanId = escapeHTML(item.id);
        const amanNama = escapeHTML(item.nama);
        const amanGambar = escapeHTML(item.gambar);
        const amanVarian = escapeHTML(item.varian);
        
        const labelTipe = (item.kategori === 'Cincin') ? 'Ukuran' : 'Varian';
        const textVarian = amanVarian ? `<span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded ml-2">${labelTipe}: ${amanVarian}</span>` : '';
        const idUnik = item.cartItemId || item.id;
        const jsSafeIdUnik = String(idUnik).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        // GUNAKAN VARIABEL AMAN DI DALAM TEMPLATE HTML INI
        container.innerHTML += `
        <div class="flex gap-3 bg-white p-3 border rounded-lg shadow-sm">
            <img src="${amanGambar}" class="w-16 h-16 object-cover rounded-md border">
            <div class="flex-1 flex flex-col justify-between">
                <div class="flex justify-between items-start">
                    <h4 class="text-sm font-semibold text-gray-800 line-clamp-2">${amanNama} ${textVarian}</h4>
                    <button onclick="removeFromCart('${jsSafeIdUnik}')" class="text-red-400 hover:text-red-600 p-1"><i class="fa-solid fa-trash-can text-sm"></i></button>
                </div>
                <div class="text-xs font-mono text-gray-500">${amanId}</div>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-sm font-bold text-green-600">${formatRupiah(item.harga)}</span>
                    <div class="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                        <button onclick="changeQty('${jsSafeIdUnik}', -1)" class="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 font-bold">-</button>
                        <span class="text-sm font-bold w-4 text-center">${item.qty}</span>
                        <button onclick="changeQty('${jsSafeIdUnik}', 1)" class="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-gray-600 font-bold">+</button>
                    </div>
                </div>
            </div>
        </div>`;
    });
    totalDisplay.textContent = formatRupiah(totalHarga);
}

// ==========================================
// LOGIKA FORMULIR & CHECKOUT WHATSAPP
// ==========================================

// Membuka Pop-up Formulir
window.openCheckoutForm = () => {
    if(shoppingCart.length === 0) return;
    
    // 1. Tutup panel keranjang yang di samping
    window.toggleCart(); 
    
    // 2. Isi otomatis jika sebelumnya sudah pernah belanja
    const savedCust = JSON.parse(localStorage.getItem('tokoku_customer'));
    if (savedCust) {
        if (document.getElementById('custName')) document.getElementById('custName').value = savedCust.nama || '';
        if (document.getElementById('custPhone')) document.getElementById('custPhone').value = savedCust.phone || '';
        if (document.getElementById('custAddress')) document.getElementById('custAddress').value = savedCust.alamat || '';
    }

    // 3. Tampilkan Pop-up Formulir (dengan animasi)
    const modal = document.getElementById('checkoutFormModal');
    const panel = document.getElementById('checkoutFormPanel');
    modal.classList.remove('hidden');
    setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); }, 10);
};

// Menutup Pop-up Formulir
window.closeCheckoutForm = () => {
    const modal = document.getElementById('checkoutFormModal');
    const panel = document.getElementById('checkoutFormPanel');
    panel.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); }, 200);
};

// Eksekusi Final Checkout (Midtrans Otomatis)
window.prosesCheckoutOtomatis = async () => {
    // --- VALIDASI FORMULIR ---
    const custName = document.getElementById('custName').value.trim();
    const custPhone = document.getElementById('custPhone').value.trim();
    const custAddress = document.getElementById('custAddress').value.trim();

    if (!custName || !custPhone || !custAddress) {
        alert('Mohon lengkapi Nama, No. WhatsApp, dan Alamat Anda terlebih dahulu.');
        return; 
    }

    // Simpan data pembeli ke memori browser agar besok tidak usah ngetik lagi
    localStorage.setItem('tokoku_customer', JSON.stringify({ nama: custName, phone: custPhone, alamat: custAddress }));

    const btnFinal = document.getElementById('btnFinalCheckout');
    const originalText = btnFinal.innerHTML;
    btnFinal.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyiapkan Pembayaran...';
    btnFinal.disabled = true;

    try {
        // 1. Siapkan data (Payload) untuk dikirim ke Backend Edge Function
        const payload = {
            customer: {
                nama: custName,
                phone: custPhone,
                alamat: custAddress
            },
            items: shoppingCart // Array keranjang langsung dikirim
        };

        // 2. Tembak URL Edge Function 'checkout' Anda
        const functionUrl = 'https://hrkobgzbenvojnzdlgth.supabase.co/functions/v1/checkout';
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Gagal memproses pembayaran dari server');
        }

        // 3. Tutup Modal Form Pengiriman karena token sudah didapat
        window.closeCheckoutForm();

        // 4. Panggil Popup Pembayaran Midtrans Snap
        window.snap.pay(data.token, {
            onSuccess: function(result){
                shoppingCart = []; // Kosongkan keranjang
                updateCartBadge();
                
                // TAMBAHKAN BARIS INI: Simpan ID terakhir untuk auto-fill pelacakan
                localStorage.setItem('tokoku_last_order', data.order_id);
                
                window.location.href = `status.html?id=${data.order_id}`;
            },
            onPending: function(result){
                shoppingCart = []; 
                updateCartBadge();
                
                // TAMBAHKAN BARIS INI JUGA: Simpan ID terakhir untuk auto-fill pelacakan
                localStorage.setItem('tokoku_last_order', data.order_id);
                
                window.location.href = `status.html?id=${data.order_id}`;
            },
            onError: function(result){
                alert("Pembayaran gagal atau kadaluarsa! Silakan coba lagi.");
            },
            onClose: function(){
                // Jika pembeli iseng menekan tanda (X) untuk menutup popup
                alert('Anda menutup popup pembayaran. Pesanan Anda belum dibayar!');
                window.location.href = `status.html?id=${data.order_id}`;
            }
        });

    } catch (err) {
        console.error("Gagal checkout:", err);
        alert("Terjadi kesalahan saat memproses pembayaran. Pastikan koneksi internet stabil.");
    } finally {
        btnFinal.innerHTML = originalText;
        btnFinal.disabled = false;
    }
};

// ==========================================
// INISIALISASI SAAT HALAMAN DIMUAT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchSettings();
    updateCartBadge();
    
    // --- FITUR AUTO-FILL FORMULIR PELANGGAN ---
    const savedCust = JSON.parse(localStorage.getItem('tokoku_customer'));
    if (savedCust) {
        if (document.getElementById('custName')) document.getElementById('custName').value = savedCust.nama || '';
        if (document.getElementById('custPhone')) document.getElementById('custPhone').value = savedCust.phone || '';
        if (document.getElementById('custAddress')) document.getElementById('custAddress').value = savedCust.alamat || '';
    }
});
// ==========================================
// FITUR LACAK PESANAN (TRACKING)
// ==========================================
window.openTrackModal = () => {
    // 1. Tutup keranjang jika sedang terbuka
    const cartModal = document.getElementById('cartModal');
    if (!cartModal.classList.contains('hidden')) {
        window.toggleCart();
    }

    // 2. Munculkan Modal Lacak
    const modal = document.getElementById('trackOrderModal');
    const panel = document.getElementById('trackOrderPanel');
    modal.classList.remove('hidden');
    setTimeout(() => { panel.classList.remove('scale-95', 'opacity-0'); }, 10);
    
    // 3. Auto-fill jika pembeli baru saja belanja di perangkat ini
    const lastOrder = localStorage.getItem('tokoku_last_order');
    if (lastOrder) {
        document.getElementById('inputTrackOrderId').value = lastOrder;
    }
    
    // 4. Fokuskan kursor ke dalam kotak input otomatis
    setTimeout(() => { document.getElementById('inputTrackOrderId').focus(); }, 200);
};

window.closeTrackModal = () => {
    const modal = document.getElementById('trackOrderModal');
    const panel = document.getElementById('trackOrderPanel');
    panel.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); }, 200);
};

window.cariPesanan = () => {
    const orderId = document.getElementById('inputTrackOrderId').value.trim();
    if (!orderId) {
        alert("Silakan masukkan Nomor Invoice terlebih dahulu!");
        return;
    }
    // Langsung arahkan ke halaman status. Jika invoice salah, halaman status akan memunculkan pesan error-nya.
    window.location.href = `status.html?id=${encodeURIComponent(orderId)}`;
};