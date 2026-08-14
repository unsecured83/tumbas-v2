// ==========================================
// UTILITAS KEAMANAN (XSS PROTECTION)
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

const formatRupiah = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

// ==========================================
// LOGIKA HALAMAN STATUS
// ==========================================
let currentSnapToken = '';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Ambil Order ID dari URL Parameter (Misal: ?id=INV-123456)
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('id');

    if (!orderId) {
        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('errorState').classList.remove('hidden');
        return;
    }

    try {
        // 2. Tarik Data Pesanan dari Supabase
        const { data, error } = await supabaseClient
            .from('transaksi')
            .select('*')
            .eq('order_id', orderId)
            .single();

        if (error || !data) throw error;

        // 3. Render Data ke Layar
        renderStatusPesanan(data);

    } catch (err) {
        console.error("Gagal memuat pesanan:", err);
        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('errorState').classList.remove('hidden');
    }
});

function renderStatusPesanan(data) {
    // Sembunyikan loading, tampilkan konten
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('statusContent').classList.remove('hidden');

    document.getElementById('orderIdDisplay').textContent = `No. Invoice: ${escapeHTML(data.order_id)}`;
    
    // --- Atur Tema Kartu Status ---
    const iconEl = document.getElementById('statusIcon');
    const titleEl = document.getElementById('statusTitle');
    const btnBayar = document.getElementById('btnLanjutBayar');
    
    currentSnapToken = data.snap_token; // Simpan token untuk tombol Lanjut Bayar

    if (data.status_pembayaran === 'pending') {
        iconEl.innerHTML = '<i class="fa-solid fa-clock text-yellow-500"></i>';
        titleEl.textContent = 'Menunggu Pembayaran';
        titleEl.classList.add('text-yellow-600');
        btnBayar.classList.remove('hidden');
    } 
    else if (data.status_pembayaran === 'lunas') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-check text-green-500"></i>';
        titleEl.textContent = 'Pembayaran Berhasil';
        titleEl.classList.add('text-green-600');
    } 
    else if (data.status_pembayaran === 'batal' || data.status_pembayaran === 'expire') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-500"></i>';
        titleEl.textContent = 'Pesanan Dibatalkan / Kedaluwarsa';
        titleEl.classList.add('text-red-600');
    }

    // --- Atur Informasi Pengiriman ---
    // GANTI .textContent menjadi .innerHTML
    document.getElementById('shippingStatus').innerHTML = escapeHTML(data.status_pengiriman);
    
    let teksResi = 'Belum diproses';
    if (data.nomor_resi) {
        teksResi = `${escapeHTML(data.kurir || 'Kurir')} - ${escapeHTML(data.nomor_resi)}`;
    }
    // GANTI .textContent menjadi .innerHTML
    document.getElementById('shippingResi').innerHTML = teksResi;
    
    // Format Nama dan Alamat dari JSONB
    const pembeli = data.detail_pembeli;
    document.getElementById('shippingAddress').innerHTML = `
        <b>${escapeHTML(pembeli.nama)}</b> (${escapeHTML(pembeli.phone)})<br>
        ${escapeHTML(pembeli.alamat)}
    `;

    // --- Atur Rincian Barang ---
    const itemsContainer = document.getElementById('orderItemsContainer');
    itemsContainer.innerHTML = '';
    const pesanan = data.detail_pesanan;

    pesanan.forEach(item => {
        const textVarian = item.varian ? `<span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded ml-2">${escapeHTML(item.varian)}</span>` : '';
        
        itemsContainer.innerHTML += `
        <div class="flex gap-3">
            <img src="${escapeHTML(item.gambar)}" class="w-16 h-16 object-cover rounded-md border border-gray-200">
            <div class="flex-1">
                <h4 class="text-sm font-semibold text-gray-800">${escapeHTML(item.nama)} ${textVarian}</h4>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-xs text-gray-500">${item.qty} x ${formatRupiah(item.harga)}</span>
                    <span class="text-sm font-bold text-gray-800">${formatRupiah(item.harga * item.qty)}</span>
                </div>
            </div>
        </div>`;
    });

    document.getElementById('orderTotal').textContent = formatRupiah(data.total_harga);
}

// Fungsi jika pembeli mengklik "Lanjutkan Pembayaran"
window.lanjutkanPembayaran = () => {
    if (!currentSnapToken) return;
    
    window.snap.pay(currentSnapToken, {
        onSuccess: function(result){ window.location.reload(); },
        onPending: function(result){ window.location.reload(); },
        onError: function(result){ alert("Pembayaran gagal!"); window.location.reload(); },
        onClose: function(){ /* Biarkan saja di halaman status */ }
    });
};