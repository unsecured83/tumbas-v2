// ==========================================
// LOGIKA AUTENTIKASI & UI LOGIN
// ==========================================

// 1. FUNGSI PENJAGA TERBALIK: Cek apakah user sudah login
async function cegahLoginUlang() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        // Jika ternyata sudah ada sesi aktif, langsung lempar ke admin panel
        window.location.replace("admin_panel.html"); // Disesuaikan dengan nama file baru Anda
    }
}
// Jalankan saat halaman login dibuka
cegahLoginUlang();

// 2. Mengambil logo dari pengaturan publik
async function loadPublicLogo() {
    try {
        const { data } = await supabaseClient.from('pengaturan').select('logo_url').eq('id', 1).single();
        if (data && data.logo_url) {
            document.getElementById('loginLogoImg').src = data.logo_url;
            document.getElementById('loginLogoImg').classList.remove('hidden');
            document.getElementById('loginIcon').style.display = 'none';
            
            let favicon = document.querySelector("link[rel~='icon']");
            if (!favicon) {
                favicon = document.createElement('link');
                favicon.rel = 'icon';
                document.head.appendChild(favicon);
            }
            favicon.href = data.logo_url;
        }
    } catch (e) {
        console.log("Logo gagal dimuat, menggunakan ikon default.");
    }
}
loadPublicLogo();

// 3. FITUR TOGGLE PASSWORD
const togglePasswordBtn = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const eyeIcon = document.getElementById('eyeIcon');

togglePasswordBtn.addEventListener('click', function () {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    if (isPassword) {
        eyeIcon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        eyeIcon.classList.replace('fa-eye-slash', 'fa-eye');
    }
});

// 4. LOGIKA LOGIN DENGAN SUPABASE AUTH
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const pesan = document.getElementById('pesanError');
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Memproses...';
    btn.disabled = true;
    pesan.classList.add('hidden');

    const emailVal = document.getElementById('email').value;
    const passwordVal = passwordInput.value;

    try {
        // Memanggil fungsi login bawaan Supabase
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailVal,
            password: passwordVal,
        });

        if (error) {
            pesan.textContent = "Gagal: Email atau password salah!";
            pesan.classList.remove('hidden');
        } else {
            // Supabase otomatis mengelola token di SessionStorage.
            // Kita bisa langsung arahkan ke panel admin.
            window.location.replace("admin_panel.html"); // Disesuaikan dengan nama file baru Anda
        }
    } catch (err) {
        pesan.textContent = "Terjadi kesalahan pada jaringan.";
        pesan.classList.remove('hidden');
    } finally {
        btn.innerHTML = "Masuk";
        btn.disabled = false;
    }
});

// Cek apakah user ditendang karena AFK
const pesanAFK = sessionStorage.getItem('pesan_logout');
if (pesanAFK) {
    const pesanElemen = document.getElementById('pesanError');
    pesanElemen.textContent = pesanAFK;
    pesanElemen.classList.remove('hidden');
    // Hapus pesan agar tidak muncul terus saat di-refresh
    sessionStorage.removeItem('pesan_logout'); 
}