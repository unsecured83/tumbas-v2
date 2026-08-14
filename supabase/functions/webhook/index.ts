import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

serve(async (req) => {
  try {
    // 1. Tangkap notifikasi dari Midtrans
    const payload = await req.json()
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = payload
    
    const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY') ?? ''

    // 2. VERIFIKASI KEAMANAN (Mencegah Hacker Memalsukan Pembayaran)
    // Rumus Midtrans: SHA512(order_id + status_code + gross_amount + serverKey)
    const dataString = `${order_id}${status_code}${gross_amount}${serverKey}`
    const msgBuffer = new TextEncoder().encode(dataString)
    const hashBuffer = await crypto.subtle.digest("SHA-512", msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    if (expectedSignature !== signature_key) {
      console.error("Akses Ditolak: Tanda Tangan Tidak Valid!")
      return new Response('Invalid Signature', { status: 401 })
    }

    // 3. Inisialisasi Database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' 
    )

    // 4. Tentukan Status Berdasarkan Laporan Midtrans
    let statusPembayaran = 'pending'
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      statusPembayaran = 'lunas'
    } else if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
      statusPembayaran = 'batal'
    }

    // 5. Update Status di Tabel Transaksi
    const { data: txData, error: txError } = await supabase
      .from('transaksi')
      .update({ status_pembayaran: statusPembayaran })
      .eq('order_id', order_id)
      .select('detail_pesanan, status_pembayaran')
      .single()

    if (txError) throw txError

    // 6. JIKA LUNAS -> POTONG STOK DI KATALOG
    if (statusPembayaran === 'lunas' && txData) {
      const pesanan = txData.detail_pesanan
      
      for (const item of pesanan) {
        // Ambil stok saat ini
        const { data: prodData } = await supabase
          .from('produk')
          .select('stok')
          .eq('kode', item.id)
          .single()

        if (prodData) {
          // Kurangi stok (mencegah minus)
          const sisaStok = Math.max(0, prodData.stok - item.qty)
          
          await supabase
            .from('produk')
            .update({ stok: sisaStok })
            .eq('kode', item.id)
        }
      }
    }

    // 7. Berikan respons OK (200) ke Midtrans agar mereka berhenti mengirim notifikasi berulang
    return new Response('OK', { status: 200 })

  } catch (error) {
    console.error("Webhook Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})