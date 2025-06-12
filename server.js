require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

// --- THIS IS THE FIX ---
// This is a more powerful CORS setup that will work on Vercel.
app.use(cors({
  origin: '*' // Allow any website to call this API
}));
// --------------------

app.use(express.json());

// We create a "router" for our API to work correctly on Vercel
const apiRouter = express.Router();

apiRouter.post('/create-payment-order', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'Amount is missing.' });
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
      redirect_url: 'https://gamebling-pi.vercel.app/game.html', // The live URL
      udf1: 'testuser',
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

// We tell our app to use this router for any path that starts with /api
app.use('/api', apiRouter);

// This is needed for Vercel to work
module.exports = app;
