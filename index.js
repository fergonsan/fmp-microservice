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
    general_profile: [
      `/profile/${ticker}`,
      `/quote/${ticker}`
    ],
    financial_statements: [
      `/income-statement/${ticker}`,
      `/balance-sheet-statement/${ticker}`,
      `/cash-flow-statement/${ticker}`,
      `/financial-growth/${ticker}`
    ],
    ratios_and_metrics: [
      `/ratios/${ticker}`,
      `/ratios-ttm/${ticker}`,
      `/key-metrics/${ticker}`
    ],
    valuation: [
      `/discounted-cash-flow/${ticker}`,
      `/enterprise-values/${ticker}`,
      `/historical-market-capitalization/${ticker}`
    ],
    share_structure: [
      `/insider-trading/${ticker}`,
      `/institutional-ownership/${ticker}`,
      `/shares-float/${ticker}`
    ],
    additional_insights: [
      `/analyst-estimates/${ticker}`,
      `/esg-environmental-social-governance-data/${ticker}`,
      `/rating/${ticker}`,
      `/earning_calendar`  // No requiere ticker
    ]
  };

  const results = {};
  for (const [category, endpointList] of Object.entries(endpoints)) {
    results[category] = {};
    for (const endpoint of endpointList) {
      const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${apiKey}`;
      try {
        const { data } = await axios.get(url);
        results[category][endpoint] = data;
      } catch (err) {
        results[category][endpoint] = { error: true, message: err.message };
      }
    }
  }

  res.json({ ticker, data: results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FMP microservice running on port ${PORT}`);
});
