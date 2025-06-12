// This is the correct, final code for the swift-api function.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function generateXVerify(data, secretKey) {
  const sortedKeys = Object.keys(data).sort();
  const dataString = sortedKeys.map(key => `${key}=${data[key]}`).join('|');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataString));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { amount } = await req.json();
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('A valid amount is required.');
    }
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('You must be logged in to make a deposit.');
    }
    const merchId = Deno.env.get('FASTZIX_MERCH_ID');
    const secretKey = Deno.env.get('FASTZIX_SECRET_KEY');
    if (!merchId || !secretKey) {
        throw new Error('API keys are not configured on the server.');
    }
    const orderId = `ORD-${user.id.slice(0, 8)}-${Date.now()}`;
    const postData = {
      customer_mobile: '9999999999',
      merch_id: merchId,
      amount: amount,
      order_id: orderId,
      currency: 'INR',
      redirect_url: 'http://127.0.0.1:5500/game.html',
      udf1: user.id,
      udf2: '',
      udf3: '',
      udf4: '',
      udf5: '',
    };
    const xVerify = await generateXVerify(postData, secretKey);
    const response = await fetch('https://fastzix.in/api/v1/order', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify }, body: JSON.stringify(postData) });
    const responseData = await response.json();
    if (!response.ok || !responseData.status) {
        throw new Error(responseData.message || 'Payment gateway returned an error.');
    }
    return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200, });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400, });
  }
});