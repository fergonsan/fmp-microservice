const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://financialmodelingprep.com/api/v3';

app.get('/fmp/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const apiKey = req.query.apiKey;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  const endpoints = {
    profile: `/profile/${ticker}`,
    quote: `/quote/${ticker}`,
    income: `/income-statement/${ticker}?limit=5`,
    balance: `/balance-sheet-statement/${ticker}?limit=5`,
    cashflow: `/cash-flow-statement/${ticker}?limit=5`,
    ratios: `/ratios/${ticker}?limit=5`,
    metrics: `/key-metrics/${ticker}?limit=5`,
    dcf: `/discounted-cash-flow/${ticker}`,
  };

  const results = {};
  for (const [key, endpoint] of Object.entries(endpoints)) {
    try {
      const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${apiKey}`;
      const { data } = await axios.get(url);
      results[key] = data;
    } catch (err) {
      results[key] = { error: true, message: err.message };
    }
  }

  res.json({ ticker, data: results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FMP microservice running on port ${PORT}`);
});
