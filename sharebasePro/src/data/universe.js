// Curated stock universe — tagged for filtering by strategy profile.
// market:    'US' | 'UK' | 'ETF'
// sector:    matches interview sector values
// marketCap: 'large' | 'mid' | 'small'
// minRisk:   minimum risk tolerance to show ('conservative' | 'moderate' | 'aggressive')

const UNIVERSE = [
  // ── US Large Cap ──────────────────────────────────────────────
  // Technology
  { ticker: 'AAPL',  name: 'Apple',           market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'MSFT',  name: 'Microsoft',        market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'GOOGL', name: 'Alphabet',         market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'NVDA',  name: 'NVIDIA',           market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'META',  name: 'Meta Platforms',   market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'ORCL',  name: 'Oracle',           market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'ADBE',  name: 'Adobe',            market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'CRM',   name: 'Salesforce',       market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'INTC',  name: 'Intel',            market: 'US', sector: 'Technology', marketCap: 'large', minRisk: 'conservative' },
  // Finance
  { ticker: 'JPM',   name: 'JPMorgan Chase',   market: 'US', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'BAC',   name: 'Bank of America',  market: 'US', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'GS',    name: 'Goldman Sachs',    market: 'US', sector: 'Finance',    marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'V',     name: 'Visa',             market: 'US', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'MA',    name: 'Mastercard',       market: 'US', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  // Healthcare
  { ticker: 'JNJ',   name: 'Johnson & Johnson',market: 'US', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'UNH',   name: 'UnitedHealth',     market: 'US', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'PFE',   name: 'Pfizer',           market: 'US', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'ABBV',  name: 'AbbVie',           market: 'US', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'LLY',   name: 'Eli Lilly',        market: 'US', sector: 'Healthcare', marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'MRK',   name: 'Merck',            market: 'US', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  // Energy
  { ticker: 'XOM',   name: 'ExxonMobil',       market: 'US', sector: 'Energy',     marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'CVX',   name: 'Chevron',          market: 'US', sector: 'Energy',     marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'COP',   name: 'ConocoPhillips',   market: 'US', sector: 'Energy',     marketCap: 'large', minRisk: 'moderate'     },
  // Consumer
  { ticker: 'PG',    name: 'Procter & Gamble', market: 'US', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'KO',    name: 'Coca-Cola',        market: 'US', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'PEP',   name: 'PepsiCo',          market: 'US', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'WMT',   name: 'Walmart',          market: 'US', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'MCD',   name: "McDonald's",       market: 'US', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'AMZN',  name: 'Amazon',           market: 'US', sector: 'Consumer',   marketCap: 'large', minRisk: 'moderate'     },
  // Industrials
  { ticker: 'CAT',   name: 'Caterpillar',      market: 'US', sector: 'Industrials',marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'HON',   name: 'Honeywell',        market: 'US', sector: 'Industrials',marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'RTX',   name: 'RTX Corp',         market: 'US', sector: 'Industrials',marketCap: 'large', minRisk: 'conservative' },
  // Utilities
  { ticker: 'NEE',   name: 'NextEra Energy',   market: 'US', sector: 'Utilities',  marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'DUK',   name: 'Duke Energy',      market: 'US', sector: 'Utilities',  marketCap: 'large', minRisk: 'conservative' },
  // Real Estate
  { ticker: 'AMT',   name: 'American Tower',   market: 'US', sector: 'RealEstate', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'PLD',   name: 'Prologis',         market: 'US', sector: 'RealEstate', marketCap: 'large', minRisk: 'conservative' },
  // Materials
  { ticker: 'LIN',   name: 'Linde',            market: 'US', sector: 'Materials',  marketCap: 'large', minRisk: 'conservative' },

  // ── US Mid Cap ────────────────────────────────────────────────
  { ticker: 'CRWD',  name: 'CrowdStrike',      market: 'US', sector: 'Technology', marketCap: 'mid',   minRisk: 'aggressive'   },
  { ticker: 'DDOG',  name: 'Datadog',          market: 'US', sector: 'Technology', marketCap: 'mid',   minRisk: 'aggressive'   },
  { ticker: 'NET',   name: 'Cloudflare',       market: 'US', sector: 'Technology', marketCap: 'mid',   minRisk: 'aggressive'   },
  { ticker: 'SNOW',  name: 'Snowflake',        market: 'US', sector: 'Technology', marketCap: 'mid',   minRisk: 'aggressive'   },
  { ticker: 'LULU',  name: 'Lululemon',        market: 'US', sector: 'Consumer',   marketCap: 'mid',   minRisk: 'moderate'     },
  { ticker: 'MNST',  name: 'Monster Beverage', market: 'US', sector: 'Consumer',   marketCap: 'mid',   minRisk: 'moderate'     },
  { ticker: 'PODD',  name: 'Insulet',          market: 'US', sector: 'Healthcare', marketCap: 'mid',   minRisk: 'aggressive'   },

  // ── UK Large Cap ─────────────────────────────────────────────
  // Finance
  { ticker: 'HSBA.L', name: 'HSBC',            market: 'UK', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'BARC.L', name: 'Barclays',        market: 'UK', sector: 'Finance',    marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'LLOY.L', name: 'Lloyds Banking',  market: 'UK', sector: 'Finance',    marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'NWG.L',  name: 'NatWest Group',   market: 'UK', sector: 'Finance',    marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'LGEN.L', name: 'Legal & General', market: 'UK', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'AV.L',   name: 'Aviva',           market: 'UK', sector: 'Finance',    marketCap: 'large', minRisk: 'conservative' },
  // Energy
  { ticker: 'BP.L',   name: 'BP',              market: 'UK', sector: 'Energy',     marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'SHEL.L', name: 'Shell',           market: 'UK', sector: 'Energy',     marketCap: 'large', minRisk: 'conservative' },
  // Consumer / Staples
  { ticker: 'ULVR.L', name: 'Unilever',        market: 'UK', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'DGE.L',  name: 'Diageo',          market: 'UK', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'TSCO.L', name: 'Tesco',           market: 'UK', sector: 'Consumer',   marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'MKS.L',  name: 'Marks & Spencer', market: 'UK', sector: 'Consumer',   marketCap: 'large', minRisk: 'moderate'     },
  // Healthcare
  { ticker: 'AZN.L',  name: 'AstraZeneca',     market: 'UK', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'GSK.L',  name: 'GSK',             market: 'UK', sector: 'Healthcare', marketCap: 'large', minRisk: 'conservative' },
  // Industrials
  { ticker: 'RR.L',   name: 'Rolls-Royce',     market: 'UK', sector: 'Industrials',marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'BA.L',   name: 'BAE Systems',     market: 'UK', sector: 'Industrials',marketCap: 'large', minRisk: 'conservative' },
  // Materials / Mining
  { ticker: 'RIO.L',  name: 'Rio Tinto',       market: 'UK', sector: 'Materials',  marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'GLEN.L', name: 'Glencore',        market: 'UK', sector: 'Materials',  marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'BHP.L',  name: 'BHP Group',       market: 'UK', sector: 'Materials',  marketCap: 'large', minRisk: 'moderate'     },
  // Media / Tech
  { ticker: 'REL.L',  name: 'RELX',            market: 'UK', sector: 'Technology', marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'VOD.L',  name: 'Vodafone',        market: 'UK', sector: 'Technology', marketCap: 'large', minRisk: 'moderate'     },

  // ── ETFs ──────────────────────────────────────────────────────
  { ticker: 'SPY',    name: 'SPDR S&P 500 ETF',    market: 'ETF', sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'QQQ',    name: 'Invesco Nasdaq-100',   market: 'ETF', sector: null, marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'VTI',    name: 'Vanguard Total Market',market: 'ETF', sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'IWM',    name: 'iShares Russell 2000', market: 'ETF', sector: null, marketCap: 'mid',   minRisk: 'moderate'     },
  { ticker: 'XLF',    name: 'Financial Select SPDR',market: 'ETF', sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'XLK',    name: 'Technology Select SPDR',market:'ETF', sector: null, marketCap: 'large', minRisk: 'moderate'     },
  { ticker: 'XLV',    name: 'Health Care Select SPDR',market:'ETF',sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'XLE',    name: 'Energy Select SPDR',   market: 'ETF', sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'VWRL.L', name: 'Vanguard FTSE All-World',market:'ETF',sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'ISF.L',  name: 'iShares FTSE 100',     market: 'ETF', sector: null, marketCap: 'large', minRisk: 'conservative' },
  { ticker: 'CSPX.L', name: 'iShares Core S&P 500', market: 'ETF', sector: null, marketCap: 'large', minRisk: 'conservative' },
];

const RISK_ORDER = { conservative: 0, moderate: 1, aggressive: 2 };

function filterForStrategy(strategy) {
  const userRisk = RISK_ORDER[strategy.risk] ?? 1;
  return UNIVERSE.filter(s => {
    if (!strategy.markets.includes(s.market)) return false;
    if (strategy.sectors?.length > 0 && s.sector && !strategy.sectors.includes(s.sector)) return false;
    if (strategy.marketCap && strategy.marketCap !== 'any' && s.marketCap !== strategy.marketCap) return false;
    if (RISK_ORDER[s.minRisk] > userRisk) return false;
    return true;
  });
}

module.exports = { UNIVERSE, filterForStrategy };
