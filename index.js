
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://financialmodelingprep.com/api/v3';
const BASE_URL_V4 = 'https://financialmodelingprep.com/api/v4';

app.get('/fmp/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const apiKey = req.query.apiKey;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  console.log('[INFO] Received request for ticker: ' + ticker);

  const endpoints = {
    profile: '/profile/' + ticker,
    quote: '/quote/' + ticker,
    income_statement: '/income-statement/' + ticker + '?limit=5',
    balance_sheet: '/balance-sheet-statement/' + ticker + '?limit=5',
    cash_flow: '/cash-flow-statement/' + ticker + '?limit=5',
    financial_growth: '/financial-growth/' + ticker,
    ratios: '/ratios/' + ticker + '?limit=5',
    key_metrics: '/key-metrics/' + ticker + '?limit=5',
    dcf: '/discounted-cash-flow/' + ticker,
    enterprise: '/enterprise-values/' + ticker + '?limit=5',
    market_cap_history: '/historical-market-capitalization/' + ticker,
    insider: '/insider-trading/' + ticker,
    institutional: '/institutional-ownership/' + ticker,
    float: '/shares-float/' + ticker,
    analyst: '/analyst-estimates/' + ticker,
    esg: '/esg-environmental-social-governance-data/' + ticker,
    rating: '/rating/' + ticker,
    earnings: '/earning_calendar/' + ticker,
    strategic_risks: '/strategic-risks/' + ticker
  };

  async function fetch(endpoint, isV4) {
    const baseUrl = isV4 ? BASE_URL_V4 : BASE_URL;
    const url = baseUrl + endpoint + (endpoint.includes('?') ? '&' : '?') + 'apikey=' + apiKey;
    try {
      const response = await axios.get(url);
      console.log('[SUCCESS] ' + endpoint);
      return response.data;
    } catch (error) {
      console.error('[ERROR] ' + endpoint, {
        url: url,
        message: error.message,
        code: error.code || null,
        responseData: error.response?.data || null
      });
      return {
        error: true,
        message: error.message,
        code: error.code || null,
        status: error.response?.status || null,
        data: error.response?.data || null,
        endpoint: endpoint
      };
    }
  }

  const data = {};
  for (const key in endpoints) {
    const endpoint = endpoints[key];
    const isV4 = endpoint.startsWith('/strategic-risks');
    data[key] = await fetch(endpoint, isV4);
  }

  res.json({ ticker: ticker, data: data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('[INFO] FMP microservice running on port ' + PORT);
});
