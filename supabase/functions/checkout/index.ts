import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// Konfigurasi CORS agar frontend Anda bisa memanggil API ini
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Tangani Preflight Request dari Browser (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Tangkap data yang dikirim dari Frontend (TokoKu)
    const { customer, items } = await req.json()
    
    // Inisialisasi Admin Supabase Client di dalam backend
    // (Menggunakan SERVICE_ROLE agar memiliki akses penuh ke database tanpa terhalang RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' 
    )

    // 2. Buat Nomor Pesanan (Order ID) Unik
    const orderId = `INV-${new Date().getTime()}`;

    // 3. Format Data untuk Midtrans
    let grossAmount = 0;
    const itemDetails = items.map((item: any) => {
       grossAmount += (item.harga * item.qty);
       return {
         id: item.id.toString(),
         price: item.harga,
         quantity: item.qty,
         name: item.nama.substring(0, 50) // Midtrans membatasi nama item maks 50 karakter
       }
    });

    const midtransServerKey = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';
    // Encode Server Key ke Base64 (Format otorisasi standar Midtrans)
    const encodedKey = btoa(midtransServerKey + ':');

    const midtransPayload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount
      },
      customer_details: {
        first_name: customer.nama,
        phone: customer.phone,
        billing_address: { address: customer.alamat }
      },
      item_details: itemDetails,
      custom_expiry: {
         expiry_duration: 180, // Waktu hitung mundur: 180 Menit (3 Jam)
         unit: "minute"
      }
    };

    // 4. Kirim Request (Tembak API) ke Midtrans Sandbox
    const midtransRes = await fetch('https://app.sandbox.midtrans.com/snap/v1/transactions', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedKey}`
      },
      body: JSON.stringify(midtransPayload)
    });

    const midtransData = await midtransRes.json();

    if (!midtransRes.ok) {
      throw new Error(JSON.stringify(midtransData));
    }

    // 5. Simpan jejak pesanan ke Database Supabase kita
    const { error: dbError } = await supabase
      .from('transaksi')
      .insert({
        order_id: orderId,
        detail_pembeli: customer,
        detail_pesanan: items,
        total_harga: grossAmount,
        status_pembayaran: 'pending',
        snap_token: midtransData.token
      });

    if (dbError) throw dbError;

    // 6. Kembalikan Token Midtrans ke Frontend HTML
    return new Response(JSON.stringify({ 
       token: midtransData.token, 
       order_id: orderId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // Tangkap error jika terjadi kegagalan
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})