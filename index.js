const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://financialmodelingprep.com/api/v3';
const BASE_URL_V4 = 'https://financialmodelingprep.com/api/v4';
const GNEWS_API_URL = 'https://gnews.io/api/v4/search';

const API_KEY = process.env.FMP_API_KEY;
const GNEWS_KEY = process.env.GNEWS_API_KEY;

// ----------------- Endpoint 1: /fmp/:ticker -----------------
app.get('/fmp/:ticker', async (req, res) => {
  const { ticker } = req.params;
  if (!API_KEY) return res.status(500).json({ error: 'API key no configurada' });

  const endpoints = {
    general_profile: [`/profile/${ticker}`, `/quote/${ticker}`],
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
      `/earning_calendar`,
      `/stock_peers/${ticker}`
    ]
  };

  const results = {};
  for (const [category, endpointList] of Object.entries(endpoints)) {
    results[category] = {};
    for (const endpoint of endpointList) {
      const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${API_KEY}`;
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

// ----------------- Endpoint 2: /sentiment-data -----------------
app.get('/sentiment-data', async (req, res) => {
  const { ticker, empresa } = req.query;
  if (!ticker || !empresa) return res.status(400).json({ error: 'ticker y empresa requeridos' });
  if (!API_KEY || !GNEWS_KEY) return res.status(500).json({ error: 'Claves API no configuradas' });

  function clasificarTitular(titulo) {
    const positivo = ['récord', 'acuerdo', 'expansión', 'ganancia', 'crecimiento', 'aprobado', 'premio', 'mejora', 'autonomía', 'liderazgo'];
    const negativo = ['pánico', 'demanda', 'problemas', 'escándalo', 'caída', 'riesgo', 'regulación', 'fraude', 'protesta', 'violación'];
    const t = titulo.toLowerCase();
    if (negativo.some(w => t.includes(w))) return 'negativo';
    if (positivo.some(w => t.includes(w))) return 'positivo';
    return 'neutral';
  }

  function palabrasFrecuentes(titulares) {
    const stopwords = ['de', 'la', 'el', 'en', 'por', 'con', 'y', 'a', 'para', 'un', 'del'];
    const tokens = titulares
      .flatMap(t => t.toLowerCase().split(/\s+/))
      .filter(w => w.length > 4 && !stopwords.includes(w));
    const freq = {};
    for (const word of tokens) {
      freq[word] = (freq[word] || 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);
  }

  try {
    const newsResp = await axios.get(`${GNEWS_API_URL}?q=${encodeURIComponent(empresa)}&lang=es&max=10&token=${GNEWS_KEY}`);
    const titulares = newsResp.data.articles.map(a => a.title);
    const positivas = [], negativas = [], neutrales = [];

    for (const t of titulares) {
      const clasificacion = clasificarTitular(t);
      if (clasificacion === 'positivo') positivas.push(t);
      else if (clasificacion === 'negativo') negativas.push(t);
      else neutrales.push(t);
    }

    const noticias = {
      positivas, negativas, neutrales,
      resumen: {
        positivas: positivas.length,
        negativas: negativas.length,
        neutrales: neutrales.length,
        palabras_frecuentes: palabrasFrecuentes(titulares)
      }
    };

    const analystResp = await axios.get(`${BASE_URL}/analyst-estimates/${ticker}?apikey=${API_KEY}`);
    const analistas = analystResp.data?.analystRating || { buy: 0, hold: 0, sell: 0 };

    const priceResp = await axios.get(`${BASE_URL}/historical-price-full/${ticker}?timeseries=250&apikey=${API_KEY}`);
    const precios = priceResp.data.historical || [];
    const precio_actual = precios[0]?.close || null;
    const media_200 = precios.slice(0, 200).reduce((s, p) => s + p.close, 0) / 200;
    const variacion_7 = (((precio_actual - precios[6]?.close) / precios[6]?.close) * 100).toFixed(2);
    const variacion_30 = (((precio_actual - precios[29]?.close) / precios[29]?.close) * 100).toFixed(2);

    const tecnica = {
      precio_actual,
      media_200: Number(media_200.toFixed(2)),
      tendencia: precio_actual > media_200 ? 'por encima' : 'por debajo',
      variacion_7dias: Number(variacion_7),
      variacion_30dias: Number(variacion_30)
    };

    res.json({
      empresa,
      ticker,
      noticias,
      analistas,
      tecnica,
      redes: 'No se encontraron suficientes menciones recientes relevantes'
    });

  } catch (err) {
    console.error("❌ Error en /sentiment-data:", err.message);
    res.status(500).json({ error: "Error procesando análisis de sentimiento" });
  }
});

// ----------------- Endpoint 3: /moat-check -----------------
app.get('/moat-check', async (req, res) => {
  const { ticker } = req.query;
  if (!ticker || !API_KEY) return res.status(400).json({ error: 'ticker requerido' });

  try {
    const [
      profileResp,
      ratiosResp,
      keyMetricsResp,
      ownershipResp,
      esgResp
    ] = await Promise.all([
      axios.get(`${BASE_URL}/profile/${ticker}?apikey=${API_KEY}`),
      axios.get(`${BASE_URL}/ratios-ttm/${ticker}?apikey=${API_KEY}`),
      axios.get(`${BASE_URL}/key-metrics/${ticker}?limit=1&apikey=${API_KEY}`),
      axios.get(`${BASE_URL_V4}/ownership/${ticker}?apikey=${API_KEY}`),
      axios.get(`${BASE_URL}/esg-environmental-social-governance-data/${ticker}?apikey=${API_KEY}`)
    ]);

    const profile = profileResp.data[0] || {};
    const ratios = ratiosResp.data[0] || {};
    const metrics = keyMetricsResp.data[0] || {};
    const ownership = ownershipResp.data || [];
    const esg = esgResp.data[0] || {};

    const moat = /leader|competitive advantage/i.test(profile.description) ? "probable" : "no claro";
    const pricing_power = /premium|pricing/i.test(profile.description) ? "posible" : "limitado";
    const revenue_model = /Software|Technology/i.test(profile.industry || '') ? "recurrente o diversificado" : "poco claro";
    const client_dependency = /main customer/i.test(profile.description) ? "alto" : "no";
    const switching_costs = /platform|ecosystem/i.test(profile.description) ? "moderados" : "bajos";
    const economies_of_scale = /scale/i.test(profile.description) ? "sí" : "no detectado";
    const roe = Number(ratios.returnOnEquity) || null;
    const roic = Number(ratios.returnOnCapitalEmployed) || null;
    const capital_allocation = roe > 15 && roic > 10 ? "eficiente" : "dudosa";
    const buybacks = metrics.buybackYield < 0 ? "activos y disciplinados" : "inactivos o no detectados";

    const insiderShares = ownership.filter(h => h.type === 'Insider').reduce((sum, h) => sum + (h.shares || 0), 0);
    const institutionalShares = ownership.filter(h => h.type === 'Institutional').reduce((sum, h) => sum + (h.shares || 0), 0);
    const sharesOutstanding = Number(metrics.sharesOutstanding || 0);

    const insider_ownership = sharesOutstanding ? `${((insiderShares / sharesOutstanding) * 100).toFixed(2)}%` : "Dato no disponible";
    const institutional_ownership = sharesOutstanding ? `${((institutionalShares / sharesOutstanding) * 100).toFixed(2)}%` : "Dato no disponible";

    res.json({
      ticker,
      moat,
      pricing_power,
      revenue_model,
      client_dependency,
      switching_costs,
      economies_of_scale,
      capital_allocation,
      insider_ownership,
      institutional_ownership,
      buybacks,
      roe,
      roic,
      esg_score: esg.totalEsgScore || "No disponible"
    });

  } catch (err) {
    console.error("❌ Error en /moat-check:", err.message);
    res.status(500).json({ error: "Error en análisis de calidad del negocio" });
  }
});

// ----------------- Launch server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Microservicio FMP extendido corriendo en puerto ${PORT}`);
});
