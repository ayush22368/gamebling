// This line must be at the very top to load our secret keys
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
// We need two types of body parsers: one for JSON and one for form data from the webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Supabase Client Initialization ---
// We create the Supabase client here so the server can talk to the database.
const supabaseUrl = 'https://lxelktvserqkjxhaturp.supabase.co';
// IMPORTANT: We need the Supabase SERVICE_ROLE_KEY for the server to have admin rights
// to update any user's balance. We will add this to the .env file.
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


// --- Endpoint 1: Create a Payment Order (Unchanged) ---
app.post('/create-payment-order', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'A valid amount is required.' });
    }

    const merchId = process.env.FASTZIX_MERCH_ID;
    const secretKey = process.env.FASTZIX_SECRET_KEY;

    if (!merchId || !secretKey) {
      return res.status(500).json({ error: 'API keys are not configured.' });
    }
    
    const orderId = `GHub${Date.now()}`;
    const postData = {
      customer_mobile: '9999999999',
      merch_id: merchId,
      amount: amount,
      order_id: orderId,
      currency: 'INR',
      redirect_url: 'https://gamebling-git-main-ayushs-projects-8d1b3920.vercel.app/game.html',
      udf1: `user${Date.now()}`.slice(0, 20), // Create a valid, short, alphanumeric ID // Placeholder user ID for now
      udf2: 'test', udf3: 'test', udf4: 'test', udf5: 'test',
    };

    const sortedKeys = Object.keys(postData).sort();
    const dataString = sortedKeys.map(key => `${key}=${postData[key]}`).join('|');
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(dataString);
    const xVerify = hmac.digest('hex');

    const fastzixResponse = await fetch('https://fastzix.in/api/v1/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify },
      body: JSON.stringify(postData)
    });
    
    const responseData = await fastzixResponse.json();
    if (!responseData.status) {
      throw new Error(responseData.message || 'Payment gateway returned an error.');
    }
    
    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- Endpoint 2: The New Webhook Receiver ---
app.post('/payment-webhook', async (req, res) => {
  console.log('Webhook received!');
  // The webhook data comes as form data, so it's in req.body
  const webhookData = req.body;
  console.log('Data:', webhookData);

  const { status, amount, udf1: userId } = webhookData;

  // 1. Check if the payment was successful
  if (status && status.toLowerCase() === 'success') {
    try {
      // 2. Get the user's current balance from Supabase
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (fetchError) {
        throw new Error(`Could not fetch profile for user ${userId}: ${fetchError.message}`);
      }

      // 3. Calculate the new balance
      const currentBalance = parseFloat(profile.balance);
      const depositAmount = parseFloat(amount);
      const newBalance = currentBalance + depositAmount;

      // 4. Update the user's balance in the database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Failed to update balance for user ${userId}: ${updateError.message}`);
      }

      console.log(`Successfully updated balance for user ${userId}. New balance: ${newBalance}`);
      // Send a success response back to Fastzix
      res.status(200).send('Webhook processed successfully.');

    } catch (error) {
      console.error('Error processing webhook:', error.message);
      // Send an error response back to Fastzix
      res.status(500).send('Error processing webhook.');
    }
  } else {
    // If status is not "success", just acknowledge receipt.
    console.log('Webhook received for non-successful payment. Ignoring.');
    res.status(200).send('Webhook received.');
  }
});


const PORT = 3000;
app.listen(PORT, () => {
  console.log(`SUCCESS: Payment server is running on http://localhost:${PORT}`);
});
