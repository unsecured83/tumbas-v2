// Konfigurasi Kredensial Supabase
const SUPABASE_URL = 'https://hrkobgzbenvojnzdlgth.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_qbSOCG7evYhao543c676Sg_yUvV_ck2'; 

// Inisialisasi Supabase Client (Standardisasi untuk semua halaman)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: window.sessionStorage, 
        autoRefreshToken: true,
        persistSession: true
    }
});