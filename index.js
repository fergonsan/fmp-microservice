const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://financialmodelingprep.com/api/v3';
const GNEWS_API_URL = 'https://gnews.io/api/v4/search';
const FMP_API_KEY = process.env.FMP_API_KEY;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;

// --- NUEVO ENDPOINT: /sentiment-data ---
app.get('/sentiment-data', async (req, res) => {
  const { ticker, empresa } = req.query;

  if (!ticker || !empresa) {
    return res.status(400).json({ error: 'ticker y empresa son requeridos' });
  }
  if (!FMP_API_KEY || !GNEWS_API_KEY) {
    return res.status(500).json({ error: 'API Keys no configuradas en el entorno' });
  }

  // Clasificador de titulares
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
    // 1. Noticias
    const newsResp = await axios.get(`${GNEWS_API_URL}?q=${encodeURIComponent(empresa)}&lang=es&max=10&token=${GNEWS_API_KEY}`);
    const noticiasBrutas = newsResp.data.articles.map(a => a.title);
    const positivas = [], negativas = [], neutrales = [];

    for (const titulo of noticiasBrutas) {
      const clasificacion = clasificarTitular(titulo);
      if (clasificacion === 'positivo') positivas.push(titulo);
      else if (clasificacion === 'negativo') negativas.push(titulo);
      else neutrales.push(titulo);
    }

    const noticias = {
      positivas,
      negativas,
      neutrales,
      resumen: {
        positivas: positivas.length,
        negativas: negativas.length,
        neutrales: neutrales.length,
        palabras_frecuentes: palabrasFrecuentes(noticiasBrutas)
      }
    };

    // 2. Analistas
    let analistas = { buy: 0, hold: 0, sell: 0, nota: "No disponible" };
    try {
      const analystResp = await axios.get(`${BASE_URL}/analyst-estimates/${ticker}?apikey=${FMP_API_KEY}`);
      const analystData = analystResp.data;
      if (analystData?.analystRating) {
        analistas = {
          buy: analystData.analystRating.buy || 0,
          hold: analystData.analystRating.hold || 0,
          sell: analystData.analystRating.sell || 0
        };
      }
    } catch (_) {}

    // 3. Técnica
    const priceResp = await axios.get(`${BASE_URL}/historical-price-full/${ticker}?timeseries=250&apikey=${FMP_API_KEY}`);
    const precios = priceResp.data.historical;
    const precio_actual = precios[0]?.close || null;
    const media_200 = precios.slice(0, 200).reduce((sum, p) => sum + p.close, 0) / 200;
    const variacion_7dias = (((precio_actual - precios[6]?.close) / precios[6]?.close) * 100).toFixed(2);
    const variacion_30dias = (((precio_actual - precios[29]?.close) / precios[29]?.close) * 100).toFixed(2);

    const tecnica = {
      precio_actual,
      media_200: Number(media_200.toFixed(2)),
      tendencia: precio_actual > media_200 ? 'por encima' : 'por debajo',
      variacion_7dias: Number(variacion_7dias),
      variacion_30dias: Number(variacion_30dias)
    };

    res.json({
      empresa,
      ticker,
      noticias,
      analistas,
      tecnica,
      redes: 'No se encontraron suficientes menciones recientes relevantes'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error procesando datos de sentimiento' });
  }
});

// --- ENDPOINT ORIGINAL INTACTO ---
app.get('/fmp/:ticker', async (req, res) => {
  const { ticker } = req.params;
  if (!FMP_API_KEY) return res.status(500).json({ error: 'API key no configurada' });

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
      `/earning_calendar`
    ]
  };

  const results = {};
  for (const [category, endpointList] of Object.entries(endpoints)) {
    results[category] = {};
    for (const endpoint of endpointList) {
      const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${FMP_API_KEY}`;
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
  console.log(`✅ Microservicio FMP + Sentiment corriendo en puerto ${PORT}`);
});
