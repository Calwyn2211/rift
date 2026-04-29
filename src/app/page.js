'use client';
import { useState, useEffect, useRef } from 'react';

// --- PERSISTENCE LAYER (KV with localStorage fallback) ---
const STORAGE_KEYS = {
  marketValues: 'rift_market_values',
  liquidCashUSD: 'rift_liquid_cash',
  wealthHistory: 'rift_wealth_history',
  currency: 'rift_currency',
  soldAssets: 'rift_sold_assets',
  simFlips: 'rift_sim_flips',
  hiddenItems: 'rift_hidden_items',
};

const DEFAULT_STATE = {
  marketValues: {},
  liquidCashUSD: 0,
  wealthHistory: {},
  currency: 'USD',
  soldAssets: {},
  simFlips: [],
  hiddenItems: [],
};

function readLocalState() {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  const out = { ...DEFAULT_STATE };
  const json = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  out.marketValues = json(STORAGE_KEYS.marketValues, {});
  out.wealthHistory = json(STORAGE_KEYS.wealthHistory, {});
  out.soldAssets = json(STORAGE_KEYS.soldAssets, {});
  out.simFlips = json(STORAGE_KEYS.simFlips, []);
  out.hiddenItems = json(STORAGE_KEYS.hiddenItems, []);
  try { const v = localStorage.getItem(STORAGE_KEYS.liquidCashUSD); if (v) out.liquidCashUSD = parseFloat(v) || 0; } catch {}
  try { const v = localStorage.getItem(STORAGE_KEYS.currency); if (v) out.currency = v; } catch {}
  return out;
}

function writeLocalKey(key, value) {
  if (typeof window === 'undefined') return;
  const k = STORAGE_KEYS[key];
  if (!k) return;
  try {
    if (typeof value === 'number') localStorage.setItem(k, String(value));
    else if (typeof value === 'string') localStorage.setItem(k, value);
    else localStorage.setItem(k, JSON.stringify(value));
  } catch {}
}

function isEmptyState(s) {
  if (!s) return true;
  return Object.keys(s.marketValues || {}).length === 0
    && Object.keys(s.soldAssets || {}).length === 0
    && (s.simFlips || []).length === 0
    && Object.keys(s.wealthHistory || {}).length === 0
    && !(s.liquidCashUSD || 0)
    && (s.hiddenItems || []).length === 0;
}

// --- FORMAT MONEY WITH SECURE CURRENCY LOGIC ---
const formatMoney = (amount, currency = 'USD', exchangeRate = 1) => {
  const rate = currency === 'ZAR' ? exchangeRate : 1;
  const value = (amount || 0) * rate; 
  return new Intl.NumberFormat(currency === 'ZAR' ? 'en-ZA' : 'en-US', { 
      style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value);
};

// --- HELPERS ---
const groupReleasesByWeek = (releases) => {
    if (!releases) return {};
    const sortedReleases = [...releases].sort((a, b) => (a.timestamp || 9999999999999) - (b.timestamp || 9999999999999));
    return sortedReleases.reduce((acc, release) => {
      let weekLabel = "TBA / COMING SOON";
      const ts = release.timestamp || 9999999999999;
      if (ts !== 9999999999999) {
        const d = new Date(ts);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        const month = monday.toLocaleString('en-US', { month: 'long' }).toUpperCase();
        weekLabel = `WEEK OF ${month} ${monday.getDate()}`;
      }
      if (!acc[weekLabel]) acc[weekLabel] = [];
      acc[weekLabel].push(release);
      return acc;
    }, {});
};

// --- COMPONENTS ---
const DashboardSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="grid grid-cols-2 gap-3"><div className="bg-[#151515] h-20 rounded-2xl border border-white/5"></div><div className="bg-[#151515] h-20 rounded-2xl border border-white/5"></div></div>
    <div className="grid grid-cols-2 gap-3"><div className="bg-[#151515] h-24 rounded-2xl border border-white/5"></div><div className="bg-[#151515] h-24 rounded-2xl border border-white/5"></div></div>
    <div className="space-y-4">{[1, 2, 3].map((i) => (<div key={i} className="bg-[#151515] h-32 rounded-2xl border border-white/5"></div>))}</div>
  </div>
);

const SwipeableRow = ({ children, onAction, text="HIDE", colorClass="bg-red-600 border-red-600", Icon }) => (
    <div className="relative w-full overflow-hidden rounded-xl h-[88px] shadow-lg">
      <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
        <div className="w-full flex-shrink-0 snap-center">{children}</div>
        <button onClick={onAction} className={`w-20 flex-shrink-0 snap-center flex flex-col items-center justify-center text-white border-y border-r rounded-r-xl transition-colors ${colorClass}`}>
          {Icon ? Icon : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
          )}
          <span className="text-[10px] font-bold">{text}</span>
        </button>
      </div>
    </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [data, setData] = useState(null);
  const [calendarData, setCalendarData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- CURRENCY & BANK STATE ---
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [thirtyDayAvgZAR, setThirtyDayAvgZAR] = useState(1);
  const [liquidCashUSD, setLiquidCashUSD] = useState(0);
  const [marketValues, setMarketValues] = useState({});
  const [soldAssets, setSoldAssets] = useState({});
  const [wealthHistory, setWealthHistory] = useState({});

  // --- NEW: SIMULATOR STATE ---
  const [simFlips, setSimFlips] = useState([]);
  const [simName, setSimName] = useState('');
  const [simCost, setSimCost] = useState('');
  const [simResell, setSimResell] = useState('');
  const [simQty, setSimQty] = useState(1);
  const [simStep, setSimStep] = useState(1);

  // --- UI STATE ---
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [showCards, setShowCards] = useState(false); 
  const [showAddresses, setShowAddresses] = useState(false); 
  const [trackingModal, setTrackingModal] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [search, setSearch] = useState('');
  const [hiddenItems, setHiddenItems] = useState([]);
  
  // --- SELL MODAL STATE ---
  const [sellModalDrop, setSellModalDrop] = useState(null);
  const [sellQty, setSellQty] = useState(1);
  const [sellPrice, setSellPrice] = useState('');

  // --- PERSISTENCE REFS ---
  const pendingPatchRef = useRef({});
  const flushTimerRef = useRef(null);
  const hydratedRef = useRef(false);

  const persistState = (patch) => {
    Object.assign(pendingPatchRef.current, patch);
    Object.entries(patch).forEach(([k, v]) => writeLocalKey(k, v));
    if (!hydratedRef.current) return;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      const toSend = pendingPatchRef.current;
      pendingPatchRef.current = {};
      flushTimerRef.current = null;
      fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSend),
      }).catch(() => {});
    }, 700);
  };

  // --- FETCH EXCHANGE RATE & ORDERS ---
  const fetchData = async ({ live = false } = {}) => {
    setLoading(true);
    try {
      fetch('https://open.er-api.com/v6/latest/USD')
        .then(res => res.json())
        .then(async (fxData) => {
            if (fxData?.rates?.ZAR) {
                const liveRate = parseFloat(fxData.rates.ZAR);
                setExchangeRate(liveRate);

                const today = new Date();
                const past = new Date(); past.setDate(today.getDate() - 30);
                const tStr = today.toISOString().split('T')[0];
                const pStr = past.toISOString().split('T')[0];
                try {
                    const histRes = await fetch(`https://api.frankfurter.app/${pStr}..${tStr}?to=ZAR&from=USD`);
                    const histData = await histRes.json();
                    const rates = Object.values(histData.rates).map(r => r.ZAR);
                    const avg = rates.reduce((a,b) => a+b, 0) / rates.length;
                    setThirtyDayAvgZAR(isNaN(avg) ? liveRate * 0.98 : avg);
                } catch(e) {
                    setThirtyDayAvgZAR(liveRate * 0.98);
                }
            }
        })
        .catch(e => console.log('Forex API error', e));

      const calPromise = fetch('/api/calendar').then(r => r.json()).catch(() => ({ releases: [] }));
      let ordersData = null;

      if (!live) {
        try {
          const cacheRes = await fetch('/api/orders');
          if (cacheRes.ok) {
            const cacheJson = await cacheRes.json();
            if (cacheJson.cache) ordersData = cacheJson.cache;
          }
        } catch {}
      }

      if (!ordersData) {
        const liveRes = await fetch('/api/check-orders');
        ordersData = await liveRes.json();
      }

      setData(ordersData);
      const calJson = await calPromise;
      setCalendarData(calJson.releases || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      let nextState = null;
      let kvOk = false;

      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const json = await res.json();
          nextState = json.state;
          kvOk = !!json.kvConfigured;
        }
      } catch {}

      if (cancelled) return;

      if (!kvOk || !nextState) {
        nextState = readLocalState();
      } else if (isEmptyState(nextState)) {
        const local = readLocalState();
        if (!isEmptyState(local)) {
          nextState = local;
          fetch('/api/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(local),
          }).catch(() => {});
        }
      }

      if (cancelled) return;
      setMarketValues(nextState.marketValues || {});
      setLiquidCashUSD(nextState.liquidCashUSD || 0);
      setWealthHistory(nextState.wealthHistory || {});
      setCurrency(nextState.currency || 'USD');
      setSoldAssets(nextState.soldAssets || {});
      setSimFlips(nextState.simFlips || []);
      setHiddenItems(nextState.hiddenItems || []);
      hydratedRef.current = true;

      await fetchData();
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // --- DATA INPUT HANDLERS ---
  const handleMarketValueChange = (productName, value) => {
    const newVals = { ...marketValues };
    if (value === '') { delete newVals[productName]; } 
    else { newVals[productName] = currency === 'ZAR' ? parseFloat(value) / exchangeRate : parseFloat(value); }
    setMarketValues(newVals);
    persistState({ marketValues: newVals });
  };

  const handleCashChange = (value) => {
      const num = parseFloat(value);
      const usdValue = isNaN(num) ? 0 : (currency === 'ZAR' ? num / exchangeRate : num);
      setLiquidCashUSD(usdValue);
      persistState({ liquidCashUSD: usdValue });
  };

  const toggleCurrency = () => {
      const newCur = currency === 'USD' ? 'ZAR' : 'USD';
      setCurrency(newCur);
      persistState({ currency: newCur });
  };

  const maskEmail = (email) => {
    if (!privacyMode) return email;
    const parts = email.split('@');
    return parts.length > 1 ? `${parts[0].substring(0, 4)}***@${parts[1]}` : email;
  };

  // --- SIMULATOR LOGIC ---
  const handleAddSim = () => {
      const costUSD = currency === 'ZAR' ? parseFloat(simCost) / exchangeRate : parseFloat(simCost);
      const resellUSD = currency === 'ZAR' ? parseFloat(simResell) / exchangeRate : parseFloat(simResell);
      const qty = parseInt(simQty);
      const step = parseInt(simStep) || 1;

      if (isNaN(costUSD) || isNaN(resellUSD) || isNaN(qty) || qty <= 0) return;

      const newSim = {
          id: Date.now(),
          name: simName || `Hypothetical Drop #${simFlips.length + 1}`,
          cost: costUSD,
          resell: resellUSD,
          qty: qty,
          step: step
      };

      const updated = [...simFlips, newSim];
      setSimFlips(updated);
      persistState({ simFlips: updated });

      setSimName(''); setSimCost(''); setSimResell(''); setSimQty(1);
  };

  const handleRemoveSim = (id) => {
      const updated = simFlips.filter(s => s.id !== id);
      setSimFlips(updated);
      persistState({ simFlips: updated });
  };

  // --- EXPORTS ---
  const handleAccountantCSV = () => {
    if (!data || !data.rawOrders) return;
    let csvContent = "Date Exported,Order ID,Store/Platform,Product Name,Status,Fulfillment Status,Email/Alias,Qty,Unit Cost (USD),Total Spend (USD),Tracking Number,Carrier\n";
    const today = new Date().toLocaleDateString('en-ZA'); 
    data.rawOrders.forEach(order => {
        const safeName = `"${order.productName.replace(/"/g, '""')}"`;
        const totalSpend = order.price || 0;
        const unitCost = order.qty > 0 ? totalSpend / order.qty : totalSpend;
        const tracking = order.tracking || "N/A";
        const carrier = order.carrier || "N/A";
        csvContent += `${today},${order.id},${order.store},${safeName},${order.status},${order.deliveryStatus},${order.email},${order.qty},${unitCost.toFixed(2)},${totalSpend.toFixed(2)},${tracking},${carrier}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SARS_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEmployeeExport = () => {
    if (!selectedDrop) return;
    let content = `RIFT INBOUND MANIFEST - ${new Date().toLocaleDateString()}\n================================================\n\n`;
    let totalPackages = 0;
    selectedDrop.breakdown.forEach(item => {
        const confirmedCount = item.count - item.canceled;
        if (confirmedCount <= 0) return;
        const trackingList = item.packages ||[];
        if (trackingList.length > 0) {
            trackingList.forEach(t => { content += `${selectedDrop.name} - Qty ${item.latestQty} - Status: ${t.status} - ${t.tracking || 'No Tracking'} - ${t.carrier || 'Unknown'}\n`; totalPackages++; });
        } else {
            content += `${selectedDrop.name} - Qty ${item.latestQty} - UNFULFILLED - No Tracking\n`;
        }
    });
    content += `\n================================================\nTotal Incoming: ${totalPackages} Packages\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RIFT_Receiving_${selectedDrop.store}.txt`;
    a.click();
  };

  // --- SELL LOGIC ---
  const openSellModal = (drop) => {
      const soldData = soldAssets[drop.name] || { qty: 0 };
      const activeQty = drop.totalItems - soldData.qty;
      if (activeQty <= 0) return;
      
      const avgCost = drop.totalItems > 0 ? drop.totalSpend / drop.totalItems : 0;
      const mktVal = marketValues[drop.name] || avgCost;
      
      setSellModalDrop(drop);
      setSellQty(activeQty);
      setSellPrice((mktVal * (currency === 'ZAR' ? exchangeRate : 1)).toFixed(2)); 
  };

  const confirmSale = () => {
      const unitPriceInput = parseFloat(sellPrice);
      if (isNaN(unitPriceInput) || sellQty <= 0) return;

      const unitPriceUSD = currency === 'ZAR' ? unitPriceInput / exchangeRate : unitPriceInput;
      const totalRevenueUSD = unitPriceUSD * sellQty;

      const currentSold = soldAssets[sellModalDrop.name] || { qty: 0, revenueUSD: 0 };
      const newSoldAssets = {
          ...soldAssets,
          [sellModalDrop.name]: {
              qty: currentSold.qty + sellQty,
              revenueUSD: currentSold.revenueUSD + totalRevenueUSD
          }
      };
      setSoldAssets(newSoldAssets);
      const newBalanceUSD = liquidCashUSD + totalRevenueUSD;
      setLiquidCashUSD(newBalanceUSD);
      persistState({ soldAssets: newSoldAssets, liquidCashUSD: newBalanceUSD });

      setSellModalDrop(null);
  };

  const filteredDrops = data?.drops?.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.store.toLowerCase().includes(search.toLowerCase())) ||[];

  // --- ADVANCED P&L CALCULATIONS ---
  let activeCostBasis = 0;
  let activeMarketValue = 0;
  let realizedProfit = 0;
  
  data?.drops?.forEach(drop => {
      const soldData = soldAssets[drop.name] || { qty: 0, revenueUSD: 0 };
      const activeQty = drop.totalItems - soldData.qty;
      const unitCost = drop.totalItems > 0 ? drop.totalSpend / drop.totalItems : 0;
      
      const soldCostBasis = soldData.qty * unitCost;
      realizedProfit += (soldData.revenueUSD - soldCostBasis);

      if (activeQty > 0) {
          activeCostBasis += (activeQty * unitCost);
          const val = marketValues.hasOwnProperty(drop.name) ? marketValues[drop.name] : unitCost;
          activeMarketValue += (val * activeQty);
      }
  });
  
  let unrealizedProfit = activeMarketValue - activeCostBasis;
  let totalProjectedWealthUSD = liquidCashUSD + activeMarketValue;

  useEffect(() => {
      if (!hydratedRef.current || totalProjectedWealthUSD === 0 || loading) return;
      const today = new Date().toISOString().split('T')[0];
      const newHistory = { ...wealthHistory };
      newHistory[today] = totalProjectedWealthUSD;
      setWealthHistory(newHistory);
      persistState({ wealthHistory: newHistory });
  }, [totalProjectedWealthUSD, loading]);

  // FOREX ORACLE
  const zarDiff = exchangeRate - thirtyDayAvgZAR;
  const isZarFavorable = zarDiff > 0; 

  const lockedCap = data?.globalStats?.lockedCapital || 0;
  const floatingCap = data?.globalStats?.floatingCapital || 0;
  const liquidCap = data?.globalStats?.liquidCapital || 0;
  const totalCap = lockedCap + floatingCap + liquidCap;
  
  const lockedPct = totalCap > 0 ? (lockedCap / totalCap) * 100 : 0;
  const floatingPct = totalCap > 0 ? (floatingCap / totalCap) * 100 : 0;
  const liquidPct = totalCap > 0 ? (liquidCap / totalCap) * 100 : 0;

  // --- ICONS ---
  const TruckIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>);
  const CardIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>);
  const HomeIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>);
  const CalendarIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>);
  const ChartIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>);
  const DocumentIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>);
  const BanknotesIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>);
  const SellIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
  const BeakerIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>);
  const TrophyIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M18.75 4.236c.982.143 1.954.317 2.916.52a6.003 6.003 0 01-5.395 4.972m0 0a8.001 8.001 0 00-1.587-5.592A8.001 8.001 0 0012 3a8.001 8.001 0 00-4.664 1.616" /></svg>);
  const WarningIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>);


  // --- MODALS ---
  const SellModal = () => {
      if (!sellModalDrop) return null;
      const soldData = soldAssets[sellModalDrop.name] || { qty: 0 };
      const activeQty = sellModalDrop.totalItems - soldData.qty;
      
      return (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all">
              <div className="bg-[#101010] w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
                  <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#151515]">
                      <div className="flex items-center space-x-2 text-emerald-400">
                          <SellIcon />
                          <h2 className="text-sm font-black uppercase tracking-widest">Liquidate Asset</h2>
                      </div>
                      <button onClick={() => setSellModalDrop(null)} className="text-gray-500 hover:text-white text-xs font-bold">CANCEL</button>
                  </div>
                  <div className="p-6">
                      <h3 className="font-bold text-white mb-1 line-clamp-1">{sellModalDrop.name}</h3>
                      <p className="text-xs text-gray-500 mb-6">{activeQty} Units Available to Sell</p>

                      <div className="space-y-4 mb-6">
                          <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                              <span className="text-sm font-bold text-gray-300">Quantity to Sell</span>
                              <input type="number" min="1" max={activeQty} value={sellQty} onChange={(e) => setSellQty(Math.min(activeQty, Math.max(1, parseInt(e.target.value) || 1)))} className="bg-[#1a1a1a] border border-white/10 text-white font-mono text-center w-16 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500/50" />
                          </div>
                          <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                              <span className="text-sm font-bold text-gray-300">Sale Price (Per Unit)</span>
                              <div className="flex items-center space-x-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 focus-within:border-emerald-500/50">
                                  <span className="text-gray-500 font-mono text-sm">{currency === 'ZAR' ? 'R' : '$'}</span>
                                  <input type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="0.00" className="bg-transparent text-white font-mono text-right w-20 focus:outline-none" />
                              </div>
                          </div>
                      </div>

                      <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 mb-6">
                          <p className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold mb-1">Revenue Injected to Bank</p>
                          <p className="text-2xl font-black text-white font-mono">{formatMoney((parseFloat(sellPrice) || 0) * sellQty, currency, 1)}</p>
                      </div>

                      <button onClick={confirmSale} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                          CONFIRM SALE
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  const TimelineModal = () => {
    if (!trackingModal) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all">
            <div className="bg-[#101010] w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#151515]"><h2 className="text-sm font-black text-white uppercase tracking-widest">Shipment Status</h2><button onClick={() => setTrackingModal(null)} className="text-gray-500 hover:text-white text-xs font-bold">CLOSE</button></div>
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {trackingModal.map((pkg, i) => {
                        const steps =['unfulfilled', 'shipped', 'delivered'];
                        const currentIdx = steps.indexOf(pkg.status) === -1 ? 0 : steps.indexOf(pkg.status);
                        
                        return (
                            <div key={i} className="mb-8 last:mb-0">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-[10px] font-bold bg-gray-800 text-gray-300 px-2 py-1 rounded tracking-wider">#{pkg.id}</span>
                                </div>
                                
                                {/* Vertical Stepper */}
                                <div className="relative pl-2 ml-1">
                                    <div className={`absolute left-[7px] top-3 bottom-1/3 w-0.5 ${currentIdx >= 1 ? 'bg-emerald-500' : 'bg-gray-800'}`}></div>
                                    <div className={`absolute left-[7px] top-1/2 bottom-0 w-0.5 ${currentIdx >= 2 ? 'bg-blue-500' : 'bg-gray-800'}`}></div>

                                    <div className="relative flex items-start mb-8 group">
                                        <div className={`absolute left-0 w-4 h-4 rounded-full border-2 z-10 bg-[#101010] flex items-center justify-center ${currentIdx >= 0 ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-gray-700'}`}>
                                            {currentIdx >= 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                                        </div>
                                        <div className="ml-8">
                                            <p className={`text-sm font-bold ${currentIdx >= 0 ? 'text-white' : 'text-gray-500'}`}>Order Confirmed</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Order received successfully</p>
                                        </div>
                                    </div>

                                    <div className="relative flex items-start mb-8 group">
                                        <div className={`absolute left-0 w-4 h-4 rounded-full border-2 z-10 bg-[#101010] flex items-center justify-center ${currentIdx >= 1 ? 'border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'border-gray-700'}`}>
                                            {currentIdx >= 1 && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                                        </div>
                                        <div className="ml-8">
                                            <p className={`text-sm font-bold leading-none ${currentIdx >= 1 ? 'text-white' : 'text-gray-500'}`}>Shipped</p>
                                            {currentIdx >= 1 ? (
                                                <div className="flex flex-col mt-1">
                                                    <p className="text-[10px] text-blue-400 font-mono">{pkg.carrier}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono tracking-wide">{pkg.tracking}</p>
                                                </div>
                                            ) : <p className="text-[10px] text-gray-500 mt-1">Pending shipment</p>}
                                        </div>
                                    </div>

                                    <div className="relative flex items-start group">
                                        <div className={`absolute left-0 w-4 h-4 rounded-full border-2 z-10 bg-[#101010] flex items-center justify-center ${currentIdx >= 2 ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]' : 'border-gray-700'}`}>
                                            {currentIdx >= 2 && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>}
                                        </div>
                                        <div className="ml-8">
                                            <p className={`text-sm font-bold leading-none ${currentIdx >= 2 ? 'text-white' : 'text-gray-500'}`}>Delivered</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{currentIdx >= 2 ? 'Package arrived' : 'Waiting for delivery'}</p>
                                        </div>
                                    </div>
                                </div>

                                {pkg.tracking && (
                                    <a href={`https://t.17track.net/en#nums=${pkg.tracking}`} target="_blank" className="mt-8 block w-full text-center bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-3 rounded-xl transition-colors border border-white/5 flex items-center justify-center space-x-2">
                                        <span>TRACK LIVE</span>
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
  };

  const RiskModal = ({ title, type, items, Icon, onClose }) => (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-all">
        <div className="bg-[#101010] w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#151515]"><div className="flex items-center space-x-3"><Icon className={`w-5 h-5 ${type === 'card' ? 'text-yellow-500' : 'text-blue-500'}`} /><h2 className="text-sm font-black text-white uppercase tracking-widest">{title}</h2></div><button onClick={onClose} className="text-gray-500 hover:text-white text-xs font-bold">CLOSE</button></div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                {items?.length === 0 && <div className="text-center py-8"><p className="text-gray-600 text-xs">No data collected yet.</p></div>}
                {items?.map((item, i) => {
                    const total = item.total; const canceled = item.canceled; const rate = (canceled / total) * 100;
                    let color = "text-emerald-500"; let bg = "bg-emerald-500/10 border-emerald-500/20";
                    if (rate > 50) { color = "text-red-500"; bg = "bg-red-500/10 border-red-500/20"; } else if (rate > 0) { color = "text-orange-500"; bg = "bg-orange-500/10 border-orange-500/20"; }
                    const label = type === 'card' ? (item.last4 === 'PayPal' ? 'PayPal' : `Ending in ${item.last4}`) : item.address.split(',')[0];
                    return (
                        <div key={i} className="flex justify-between items-start p-3 rounded-xl border border-white/5 bg-[#151515]">
                            <div className="flex-1 min-w-0 mr-4"><p className="text-sm font-bold text-gray-200 truncate">{label}</p></div>
                            <div className="text-right flex flex-col items-end space-y-1"><span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${bg} ${color}`}>{rate.toFixed(0)}% Fail</span></div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );

  // --- DETAIL VIEW RENDER ---
  if (selectedDrop) {
    const avgUnitCost = selectedDrop.totalItems > 0 ? selectedDrop.totalSpend / selectedDrop.totalItems : 0;
    const currentMarketValue = marketValues.hasOwnProperty(selectedDrop.name) ? marketValues[selectedDrop.name] : avgUnitCost;
    
    const soldData = soldAssets[selectedDrop.name] || { qty: 0, revenueUSD: 0 };
    const activeQty = selectedDrop.totalItems - soldData.qty;
    const isFullySold = activeQty <= 0;
    
    const projectedRevenue = currentMarketValue * activeQty;
    const projectedProfit = projectedRevenue - (avgUnitCost * activeQty);
    const profitColor = projectedProfit >= 0 ? 'text-emerald-400' : 'text-red-400';

    const realizedRevenue = soldData.revenueUSD;
    const realizedProfitPartial = realizedRevenue - (avgUnitCost * soldData.qty);
    const totalExpectedProfit = projectedProfit + realizedProfitPartial;

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans relative">
        <TimelineModal />
        <SellModal />
        
        <div className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10 p-4">
            <div className="max-w-md mx-auto flex items-center justify-between">
                <button onClick={() => setSelectedDrop(null)} className="text-gray-400 text-xs font-bold uppercase hover:text-white flex items-center bg-white/5 px-3 py-1.5 rounded-full transition-colors">← Back</button>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Order Details</span>
            </div>
        </div>

        <div className="max-w-md mx-auto p-4 pb-24">
          <div className="flex flex-col items-center mb-6 mt-2">
              <div className="w-28 h-28 bg-gray-800 rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-4 relative">
                  {selectedDrop.image ? <img src={selectedDrop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
              </div>
              <h1 className="text-xl font-bold text-center leading-tight mb-2 px-4">{selectedDrop.name}</h1>
              <div className="flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-full mb-3">
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{selectedDrop.store}</span>
              </div>
              <div className="flex space-x-4 mb-2">
                   <span className="text-xs font-bold text-emerald-500 bg-emerald-900/20 px-2 py-1 rounded">{selectedDrop.confirmed} Confirmed</span>
                   {selectedDrop.canceled > 0 && <span className="text-xs font-bold text-red-500 bg-red-900/20 px-2 py-1 rounded">{selectedDrop.canceled} Canceled</span>}
              </div>
          </div>

          {!isFullySold && (
              <div className="bg-gradient-to-b from-[#151515] to-[#101010] rounded-2xl p-5 border border-white/5 mb-8 shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center space-x-2"><ChartIcon className="w-3 h-3" /> <span>Active Inventory Valuation</span></h3>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{activeQty} Items Active</span>
                  </div>
                  
                  <div className="flex justify-between items-center px-1 mb-2">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Unit Cost (Scraped)</span>
                      <span className="text-sm font-bold text-gray-300 font-mono">{formatMoney(avgUnitCost, currency, exchangeRate)}</span>
                  </div>

                  <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5 mb-4">
                      <span className="text-xs font-bold text-gray-300">Unit Resell Value</span>
                      <div className="flex items-center space-x-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
                          <span className="text-gray-500 font-mono text-sm">{currency === 'ZAR' ? 'R' : '$'}</span>
                          <input type="number" value={marketValues[selectedDrop.name] !== undefined ? (marketValues[selectedDrop.name] * (currency === 'ZAR' ? exchangeRate : 1)).toFixed(2) : ''} onChange={(e) => { const val = parseFloat(e.target.value); if (isNaN(val)) handleMarketValueChange(selectedDrop.name, ''); else handleMarketValueChange(selectedDrop.name, currency === 'ZAR' ? val / exchangeRate : val); }} placeholder="0.00" className="bg-transparent text-white font-mono text-right w-16 focus:outline-none placeholder-gray-700 text-sm" />
                      </div>
                  </div>
                  
                  <div className="flex justify-between items-center px-1 mb-2 mt-4 pt-4 border-t border-white/5">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Total Spend (All items)</span>
                      <span className="text-sm font-bold text-gray-400 font-mono">{formatMoney(selectedDrop.totalSpend, currency, exchangeRate)}</span>
                  </div>
                  
                  {soldData.qty > 0 && (
                    <div className="flex justify-between items-center px-1 mb-2">
                        <span className="text-[10px] text-emerald-500 font-bold uppercase">Realized Revenue ({soldData.qty} sold)</span>
                        <span className="text-sm font-bold text-emerald-400 font-mono">+{formatMoney(soldData.revenueUSD, currency, exchangeRate)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center px-1 mb-2">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Proj. Revenue ({activeQty} active)</span>
                      <span className="text-sm font-bold text-white font-mono">{formatMoney(projectedRevenue, currency, exchangeRate)}</span>
                  </div>

                  <div className="flex justify-between items-center px-1 pt-2 mt-2">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Est. Total Net Profit</span>
                      <span className={`text-base font-black font-mono ${totalExpectedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalExpectedProfit >= 0 ? '+' : ''}{formatMoney(totalExpectedProfit, currency, exchangeRate)}</span>
                  </div>
              </div>
          )}

          {isFullySold && (
              <div className="bg-gradient-to-b from-[#0a1a10] to-[#101010] rounded-2xl p-5 border border-emerald-500/20 mb-8 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center space-x-2"><ChartIcon className="w-3 h-3" /> <span>Realized Valuation (Sold)</span></h3>
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-500/20">Asset Liquidated</span>
                  </div>
                  <div className="flex justify-between items-center px-1 mb-2">
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Unit Cost (Scraped)</span>
                      <span className="text-sm font-bold text-gray-300 font-mono">{formatMoney(avgUnitCost, currency, exchangeRate)}</span>
                  </div>
                  <div className="flex items-center justify-between bg-emerald-900/10 p-3 rounded-xl border border-emerald-500/20 mb-4">
                      <span className="text-xs font-bold text-emerald-400">Unit Sold Price (Avg)</span>
                      <span className="text-sm font-bold text-emerald-400 font-mono">{formatMoney(soldData.revenueUSD / soldData.qty, currency, exchangeRate)}</span>
                  </div>
                  <div className="flex justify-between items-center px-1 mb-2 mt-4 pt-4 border-t border-white/5">
                      <span className="text-[10px] text-emerald-500 font-bold uppercase">Total Revenue ({soldData.qty} sold)</span>
                      <span className="text-sm font-bold text-white font-mono">{formatMoney(soldData.revenueUSD, currency, exchangeRate)}</span>
                  </div>
                  <div className="flex justify-between items-center px-1 pt-2 mt-2">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">Final Net Profit</span>
                      <span className={`text-base font-black font-mono ${realizedProfitPartial >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{realizedProfitPartial >= 0 ? '+' : ''}{formatMoney(realizedProfitPartial, currency, exchangeRate)}</span>
                  </div>
              </div>
          )}
          
          <div className="flex justify-between items-end mb-3 px-1 border-b border-white/10 pb-2">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email Receipts</h2>
              <div className="flex space-x-3">
                  <button onClick={handleEmployeeExport} className="text-[9px] text-gray-500 hover:text-white uppercase transition-colors font-bold flex items-center space-x-1">
                      <DocumentIcon className="w-3 h-3" /><span>Export receiving txt</span>
                  </button>
                  <button onClick={() => setPrivacyMode(!privacyMode)} className="text-[9px] text-gray-500 hover:text-white uppercase transition-colors font-bold flex items-center space-x-1">
                     <span>{privacyMode ? "Show Emails" : "Hide Emails"}</span>
                  </button>
              </div>
          </div>
          
          <div className="space-y-3">
            {selectedDrop.breakdown.map((item, i) => {
               if (hiddenItems.includes(item.email)) return null;
               const confirmedCount = item.count - item.canceled;
               const unitPrice = item.latestQty > 0 ? item.latestPrice / item.latestQty : item.latestPrice;

               return (
                <SwipeableRow key={i} onAction={() => { const updated = [...hiddenItems, item.email]; setHiddenItems(updated); persistState({ hiddenItems: updated }); }} text="HIDE" colorClass="bg-red-600 border-red-600">
                  <div className="bg-[#151515] border border-white/5 rounded-xl p-4 flex justify-between items-center w-full h-full shadow-lg">
                    <div className="flex flex-col min-w-0 mr-4">
                      <span className="text-sm font-mono text-gray-300 truncate mb-1">{maskEmail(item.email)}</span>
                      <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 rounded font-mono">Qty: {item.latestQty}</span>
                              {item.latestPrice > 0 && <span className="text-[10px] text-emerald-500 bg-emerald-900/20 px-1.5 rounded font-mono">{formatMoney(unitPrice, currency, exchangeRate)}/ea</span>}
                          </div>
                          {item.packages?.length > 0 ? (
                              <button onClick={() => setTrackingModal(item.packages)} className="text-[9px] text-blue-400 font-bold flex items-center space-x-1 hover:text-blue-300 transition-colors bg-blue-900/10 px-1.5 py-0.5 rounded w-fit mt-1">
                                  <TruckIcon className="w-3 h-3" /><span>View Status</span>
                              </button>
                          ) : confirmedCount > 0 ? (
                              <span className="text-[9px] text-gray-500 font-bold mt-1 bg-gray-800 px-1.5 py-0.5 rounded w-fit">⏳ Unfulfilled</span>
                          ) : null}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="font-bold text-yellow-500 text-sm">{item.count} Order{item.count > 1 ? 's' : ''}</div>
                      <div className="text-[10px] font-bold mt-1 flex space-x-1">
                          {confirmedCount > 0 && <span className="text-emerald-500">{confirmedCount} Confirmed</span>}
                          {confirmedCount > 0 && item.canceled > 0 && <span className="text-gray-700">•</span>}
                          {item.canceled > 0 && <span className="text-red-500">{item.canceled} Canceled</span>}
                      </div>
                    </div>
                  </div>
                </SwipeableRow>
               );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN LAYOUT RENDER (Tabs) ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans pb-24 relative">
      <SellModal />
      {showCards && <RiskModal title="Card Risk Profile" type="card" items={data?.cards} Icon={CardIcon} onClose={() => setShowCards(false)} />}
      {showAddresses && <RiskModal title="Address Risk Profile" type="address" items={data?.addresses} Icon={HomeIcon} onClose={() => setShowAddresses(false)} />}
      
      <div className="sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 p-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">RIFT</h1>
          <div className="flex items-center space-x-3">
              <button onClick={toggleCurrency} className="bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black px-3 py-1.5 rounded-full transition-colors flex items-center space-x-1">
                  <span>{currency === 'USD' ? 'USD' : 'ZAR'}</span>
              </button>
              <button onClick={() => fetchData({ live: true })} disabled={loading} className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${loading ? 'bg-gray-800 text-gray-500' : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)]'}`}>
                {loading ? 'SYNCING...' : 'REFRESH'}
              </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* --- HOME TAB --- */}
            {activeTab === 'home' && (
              <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Spend</p>
                      <p className="text-xl font-bold text-white mt-1">{formatMoney(data?.globalStats?.spend || 0, currency, exchangeRate)}</p>
                  </div>
                  <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Secured Items</p>
                      <div className="flex items-end space-x-2 mt-1">
                          <p className="text-xl font-bold text-white">{data?.globalStats?.items || 0}</p>
                          <p className="text-[10px] text-gray-500 mb-1">in {data?.globalStats?.orders} orders</p>
                      </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button onClick={() => setShowCards(true)} className="bg-[#151515] border border-white/5 hover:border-yellow-600/50 p-4 rounded-2xl flex flex-col items-center justify-center group transition-all relative overflow-hidden">
                        <CardIcon className="w-8 h-8 text-yellow-500 mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-xs font-bold text-gray-300 group-hover:text-white">Card Health</p>
                        <span className="mt-1 text-[10px] bg-yellow-900/20 text-yellow-500 px-2 py-0.5 rounded-full font-mono">{data?.cards?.length || 0} Detected</span>
                    </button>
                    <button onClick={() => setShowAddresses(true)} className="bg-[#151515] border border-white/5 hover:border-blue-600/50 p-4 rounded-2xl flex flex-col items-center justify-center group transition-all relative overflow-hidden">
                        <HomeIcon className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-xs font-bold text-gray-300 group-hover:text-white">Address Health</p>
                        <span className="mt-1 text-[10px] bg-blue-900/20 text-blue-500 px-2 py-0.5 rounded-full font-mono">{data?.addresses?.length || 0} Detected</span>
                    </button>
                </div>

                <div className="relative mb-4">
                  <input type="text" placeholder="Search drops..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-[#151515] text-sm text-white border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-yellow-500/50 transition-colors" />
                </div>

                <div className="space-y-4">
                  {filteredDrops.length === 0 && <div className="text-center text-gray-600 text-xs py-10">No drops found.</div>}
                  {filteredDrops.map((drop, i) => {
                    const soldData = soldAssets[drop.name] || { qty: 0 };
                    const activeQty = drop.totalItems - soldData.qty;
                    const isFullySold = activeQty <= 0;

                    return (
                    <div key={i} onClick={() => setSelectedDrop(drop)} className="group relative bg-[#151515] border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-white/10 shadow-lg">
                      <div className="flex items-start">
                        <div className="w-16 h-16 bg-gray-800 rounded-lg mr-4 flex-shrink-0 overflow-hidden border border-white/5 relative">
                          {drop.image ? <img src={drop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl grayscale opacity-50">📦</div>}
                          {!isFullySold && (
                              <div className="absolute bottom-0 right-0 bg-black/60 backdrop-blur text-white text-[9px] px-1.5 py-0.5 rounded-tl-md font-bold">x{activeQty}</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                              <h3 className="font-bold text-sm text-gray-200 leading-tight truncate pr-2">{drop.name}</h3>
                              <span className="text-emerald-400 text-xs font-bold whitespace-nowrap">{formatMoney(drop.totalSpend, currency, exchangeRate)}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold mt-1 tracking-wide">{drop.store}</p>
                          <div className="flex h-1.5 w-full bg-gray-800 rounded-full overflow-hidden mt-3">
                              <div className="h-full bg-emerald-500" style={{ width: `${(drop.confirmed / drop.totalOrders) * 100}%` }}></div>
                              <div className="h-full bg-red-500" style={{ width: `${(drop.canceled / drop.totalOrders) * 100}%` }}></div>
                          </div>
                          <div className="flex items-center space-x-3 mt-1.5">
                              <span className="text-[10px] text-emerald-500 font-mono font-bold">{drop.confirmed} Confirmed</span>
                              {drop.canceled > 0 && <span className="text-[10px] text-red-500 font-mono font-bold">{drop.canceled} Canceled</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {/* --- TAB: ANALYTICS (P&L) --- */}
            {activeTab === 'analytics' && (
              <div className="animate-in fade-in duration-300">
                  <div className="flex justify-between items-end mb-4">
                      <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center"><ChartIcon className="w-3 h-3 mr-2" /> Financial Dashboard</h2>
                  </div>

                  <div className="bg-gradient-to-b from-[#151515] to-[#101010] border border-white/5 rounded-3xl p-6 shadow-2xl mb-6 relative overflow-hidden">
                      <div className="relative z-10">
                          <div className="flex justify-between items-end mb-1">
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Total Projected Wealth</p>
                          </div>
                          <p className="text-4xl font-black text-white tracking-tighter mb-6">
                              {formatMoney(totalProjectedWealthUSD, currency, exchangeRate)}
                          </p>

                          <div className="flex items-center justify-between bg-black/50 p-3 rounded-xl border border-white/5 backdrop-blur-md">
                              <div className="flex items-center space-x-2">
                                  <BanknotesIcon className="w-4 h-4 text-emerald-500" />
                                  <span className="text-xs font-bold text-gray-300">Liquid Cash Bank</span>
                              </div>
                              <div className="flex items-center space-x-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
                                  <span className="text-gray-500 font-mono text-sm">{currency === 'ZAR' ? 'R' : '$'}</span>
                                  <input 
                                      type="number" 
                                      value={liquidCashUSD ? (liquidCashUSD * (currency === 'ZAR' ? exchangeRate : 1)).toFixed(2) : ''}
                                      onChange={(e) => handleCashChange(e.target.value)}
                                      placeholder="0.00"
                                      className="bg-transparent text-white font-mono text-right w-20 focus:outline-none placeholder-gray-700 text-sm"
                                  />
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 flex flex-col shadow-lg">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1 flex items-center space-x-1"><span className="text-emerald-500">●</span><span>Realized Profit</span></p>
                          <p className={`text-xl font-black font-mono mt-1 ${realizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {realizedProfit >= 0 ? '+' : ''}{formatMoney(realizedProfit, currency, exchangeRate)}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1">Cash banked from sales</p>
                      </div>
                      
                      <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 flex flex-col shadow-lg">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1 flex items-center space-x-1"><span className="text-blue-500">●</span><span>Unrealized Profit</span></p>
                          <p className={`text-xl font-black font-mono mt-1 ${unrealizedProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {unrealizedProfit >= 0 ? '+' : ''}{formatMoney(unrealizedProfit, currency, exchangeRate)}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1">Tied up in active inventory</p>
                      </div>
                  </div>

                  {/* FOREX ORACLE CARD */}
                  <div className="bg-gradient-to-br from-[#0f172a] to-[#101010] border border-blue-500/20 rounded-3xl p-6 shadow-2xl mb-6 relative overflow-hidden">
                      <div className="relative z-10">
                          <div className="flex justify-between items-end mb-4">
                              <div>
                                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Live USD/ZAR Exchange</p>
                                  <p className="text-3xl font-black text-white">R{exchangeRate.toFixed(2)}</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Status</p>
                                  <div className={`inline-block px-2 py-1 rounded-lg text-[10px] font-black ${(exchangeRate - thirtyDayAvgZAR) > 0 ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/20' : 'bg-orange-900/30 text-orange-400 border border-orange-500/20'}`}>
                                      {(exchangeRate - thirtyDayAvgZAR) > 0 ? 'FAVORABLE RATE' : 'HOLD USD'}
                                  </div>
                              </div>
                          </div>

                          <div className="bg-black/50 p-4 rounded-xl border border-white/5 backdrop-blur-md">
                              <div className="flex justify-between items-center">
                                  <p className="text-xs text-gray-400">30-Day Moving Average:</p>
                                  <p className="text-xs font-bold text-white">R{thirtyDayAvgZAR.toFixed(2)}</p>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center shadow-lg">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Setup Win Rate</p>
                          <div className="relative w-16 h-16 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                  <path className="text-gray-800" strokeDasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke="currentColor" strokeWidth="3" fill="none" />
                                  <path className="text-yellow-500 transition-all duration-1000 ease-out" strokeDasharray={`${data?.globalStats?.winRate || 0}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke="currentColor" strokeWidth="3" fill="none" />
                              </svg>
                              <div className="absolute text-sm font-black text-white font-mono">{(data?.globalStats?.winRate || 0).toFixed(0)}%</div>
                          </div>
                      </div>

                      <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 flex flex-col justify-center shadow-lg">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Liquidity Status</p>
                          <div className="flex h-2 w-full bg-gray-800 rounded-full overflow-hidden mb-3">
                              <div className="h-full bg-gray-500" style={{ width: `${lockedPct}%` }}></div>
                              <div className="h-full bg-blue-500" style={{ width: `${floatingPct}%` }}></div>
                              <div className="h-full bg-emerald-500" style={{ width: `${liquidPct}%` }}></div>
                          </div>
                          <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-mono"><span className="text-gray-400">Locked</span><span className="text-white font-bold">{formatMoney(lockedCap, currency, exchangeRate)}</span></div>
                              <div className="flex justify-between text-[9px] font-mono"><span className="text-blue-400">Floating</span><span className="text-white font-bold">{formatMoney(floatingCap, currency, exchangeRate)}</span></div>
                              <div className="flex justify-between text-[9px] font-mono"><span className="text-emerald-400">Liquid</span><span className="text-white font-bold">{formatMoney(liquidCap, currency, exchangeRate)}</span></div>
                          </div>
                      </div>
                  </div>

                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Active Inventory Breakdown</h2>
                  <p className="text-xs text-gray-500 mb-4">Swipe left on an asset to mark it as sold and realize profits.</p>
                  
                  <div className="space-y-3 mb-6">
                      {data?.drops?.map((drop, i) => {
                          const soldData = soldAssets[drop.name] || { qty: 0 };
                          const activeQty = drop.totalItems - soldData.qty;
                          if (activeQty <= 0) return null; 

                          const unitCost = drop.totalItems > 0 ? drop.totalSpend / drop.totalItems : 0;
                          const mktVal = marketValues.hasOwnProperty(drop.name) ? marketValues[drop.name] : unitCost;
                          const rev = mktVal * activeQty;
                          const profit = rev - (unitCost * activeQty);

                          return (
                              <SwipeableRow key={i} onAction={() => openSellModal(drop)} text="SELL" colorClass="bg-emerald-600 border-emerald-600" Icon={<SellIcon />}>
                                  <div onClick={() => { setActiveTab('home'); setSelectedDrop(drop); }} className="bg-[#151515] border border-white/5 rounded-xl p-4 flex items-center justify-between w-full h-full shadow-lg cursor-pointer">
                                      <div className="flex items-center space-x-3 min-w-0 flex-1 mr-4">
                                          <div className="w-10 h-10 bg-gray-800 rounded-lg overflow-hidden shrink-0 border border-white/5">
                                              {drop.image ? <img src={drop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">📦</div>}
                                          </div>
                                          <div className="min-w-0">
                                              <p className="text-xs font-bold text-gray-200 truncate leading-tight">{drop.name}</p>
                                              <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1 bg-gray-800 px-1.5 py-0.5 rounded w-fit">{activeQty} Units Active</p>
                                          </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                          <p className="text-xs font-bold text-white mb-1 font-mono">{formatMoney(rev, currency, exchangeRate)} <span className="text-[9px] text-gray-500 font-sans font-normal ml-1">Value</span></p>
                                          <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${profit >= 0 ? 'bg-blue-900/20 text-blue-400' : 'bg-red-900/20 text-red-400'}`}>
                                              {profit >= 0 ? '+' : ''}{formatMoney(profit, currency, exchangeRate)}
                                          </span>
                                      </div>
                                  </div>
                              </SwipeableRow>
                          );
                      })}
                  </div>
                  
                  <button onClick={handleAccountantCSV} className="w-full bg-[#151515] hover:bg-[#1a1a1a] border border-white/10 text-white font-bold py-4 rounded-2xl text-xs transition-colors flex justify-center items-center space-x-2 shadow-lg mb-10">
                      <DocumentIcon className="w-4 h-4 text-emerald-500" />
                      <span>SARS ACCOUNTANT EXPORT (CSV)</span>
                  </button>
              </div>
            )}

            {/* --- TAB 3: SIMULATOR --- */}
            {activeTab === 'simulator' && (
              <div className="animate-in fade-in duration-300">
                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center">
                    <BeakerIcon className="w-3 h-3 mr-2" />
                    Flip Simulator
                  </h2>

                  <div className="bg-[#151515] border border-white/5 rounded-2xl p-5 mb-6 shadow-xl">
                      <div className="flex justify-between items-center mb-4">
                          <span className="text-xs font-bold text-gray-300">Liquid Cash Available</span>
                          <span className="text-sm font-black text-emerald-400 font-mono">{formatMoney(liquidCashUSD, currency, exchangeRate)}</span>
                      </div>
                      
                      <div className="space-y-3">
                          <input type="text" value={simName} onChange={(e) => setSimName(e.target.value)} placeholder="Product Name (e.g. 2026 Bowman)" className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
                          
                          <div className="grid grid-cols-2 gap-3">
                              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 flex flex-col">
                                  <span className="text-[9px] text-gray-500 uppercase font-bold mb-1">Unit Cost</span>
                                  <div className="flex items-center text-sm">
                                      <span className="text-gray-500 font-mono mr-1">{currency === 'ZAR' ? 'R' : '$'}</span>
                                      <input type="number" value={simCost} onChange={(e) => setSimCost(e.target.value)} placeholder="0.00" className="bg-transparent text-white font-mono w-full focus:outline-none" />
                                  </div>
                              </div>
                              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 flex flex-col">
                                  <span className="text-[9px] text-gray-500 uppercase font-bold mb-1">Est. Resell</span>
                                  <div className="flex items-center text-sm">
                                      <span className="text-gray-500 font-mono mr-1">{currency === 'ZAR' ? 'R' : '$'}</span>
                                      <input type="number" value={simResell} onChange={(e) => setSimResell(e.target.value)} placeholder="0.00" className="bg-transparent text-white font-mono w-full focus:outline-none" />
                                  </div>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-3 flex justify-between items-center">
                                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Qty</span>
                                  <div className="flex items-center space-x-3">
                                      <button onClick={() => setSimQty(Math.max(1, simQty - 1))} className="text-gray-400 hover:text-white text-lg font-mono leading-none px-2">-</button>
                                      <span className="text-white font-bold font-mono text-sm w-3 text-center">{simQty}</span>
                                      <button onClick={() => setSimQty(simQty + 1)} className="text-gray-400 hover:text-white text-lg font-mono leading-none px-2">+</button>
                                  </div>
                              </div>
                              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-3 flex justify-between items-center">
                                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Phase</span>
                                  <div className="flex items-center space-x-3">
                                      <button onClick={() => setSimStep(Math.max(1, simStep - 1))} className="text-gray-400 hover:text-white text-lg font-mono leading-none px-2">-</button>
                                      <span className="text-white font-bold font-mono text-sm w-3 text-center">{simStep}</span>
                                      <button onClick={() => setSimStep(simStep + 1)} className="text-gray-400 hover:text-white text-lg font-mono leading-none px-2">+</button>
                                  </div>
                              </div>
                          </div>
                      </div>

                      <button onClick={handleAddSim} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)] text-xs uppercase tracking-widest">
                          Add Scenario
                      </button>
                  </div>

                  {/* --- CHAINED TIMELINE LOGIC --- */}
                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Chained Timeline</h2>
                  <div className="space-y-0 mb-10">
                      {simFlips.length === 0 && <div className="text-center text-gray-600 text-xs py-10 border border-dashed border-white/10 rounded-xl">No simulations created.</div>}
                      
                      {(() => {
                          const groupedSims = simFlips.reduce((acc, sim) => {
                              const s = sim.step || 1;
                              if (!acc[s]) acc[s] = [];
                              acc[s].push(sim);
                              return acc;
                          }, {});
                          
                          const sortedSteps = Object.keys(groupedSims).map(Number).sort((a, b) => a - b);
                          
                          let rollingCash = liquidCashUSD;
                          let rollingNW = totalProjectedWealthUSD;
                          let totalChainSpend = 0;
                          let totalChainProfit = 0;

                          return (
                              <>
                                  {sortedSteps.map((step, index) => {
                                      const phaseSims = groupedSims[step];
                                      
                                      // Sort items within phase by ROI descending
                                      const sortedPhaseSims = [...phaseSims].sort((a, b) => {
                                          const roiA = a.cost > 0 ? ((a.resell - a.cost) / a.cost) * 100 : 0;
                                          const roiB = b.cost > 0 ? ((b.resell - b.cost) / b.cost) * 100 : 0;
                                          return roiB - roiA;
                                      });

                                      const phaseSpend = phaseSims.reduce((acc, sim) => acc + (sim.cost * sim.qty), 0);
                                      const phaseRev = phaseSims.reduce((acc, sim) => acc + (sim.resell * sim.qty), 0);
                                      const phaseProfit = phaseRev - phaseSpend;
                                      const phaseRoi = phaseSpend > 0 ? (phaseProfit / phaseSpend) * 100 : 0;
                                      
                                      const canAffordPhase = phaseSpend <= rollingCash;
                                      const startingCash = rollingCash;
                                      
                                      if (canAffordPhase) {
                                          rollingCash += phaseProfit;
                                          rollingNW += phaseProfit;
                                          totalChainSpend += phaseSpend;
                                          totalChainProfit += phaseProfit;
                                      }

                                      return (
                                          <div key={step} className="mb-6 relative">
                                              {/* Fixed timeline connecting line: Anchored to the exact center under the circle layer */}
                                              {index !== sortedSteps.length - 1 && <div className="absolute left-4 -ml-[1px] top-4 bottom-[-24px] w-0.5 bg-gray-800 z-0"></div>}
                                              
                                              <div className="relative z-10 flex items-center mb-3">
                                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 bg-[#0a0a0a] ${canAffordPhase ? 'border-emerald-500 text-emerald-400' : 'border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}>
                                                      {step}
                                                  </div>
                                                  <h3 className="ml-3 text-sm font-black uppercase tracking-widest text-white">Phase {step}</h3>
                                                  <span className="ml-auto text-[10px] text-gray-500 font-mono">Start Cash: {formatMoney(startingCash, currency, exchangeRate)}</span>
                                              </div>
                                              
                                              <div className={`bg-[#151515] border ${canAffordPhase ? 'border-white/5' : 'border-red-500/30'} rounded-2xl p-4 shadow-lg ml-4 relative overflow-hidden z-10`}>
                                                  {sortedPhaseSims.map((sim, i) => {
                                                      const itemProfit = (sim.resell - sim.cost) * sim.qty;
                                                      const itemRoi = sim.cost > 0 ? ((sim.resell - sim.cost) / sim.cost) * 100 : 0;

                                                      return (
                                                          <div key={sim.id} className="flex justify-between items-center mb-3 pb-3 border-b border-white/5 last:border-0 last:mb-0 last:pb-0">
                                                             <div className="flex-1">
                                                                 <p className="text-xs font-bold text-gray-300 flex items-center">
                                                                     {i === 0 && phaseSims.length > 1 && itemRoi > 0 && <TrophyIcon className="w-3 h-3 text-yellow-500 mr-1" />}
                                                                     {sim.name} <span className="text-[9px] text-gray-500 font-mono ml-1">x{sim.qty}</span>
                                                                 </p>
                                                                 <p className="text-[9px] text-gray-500 font-mono mt-0.5">Cost: {formatMoney(sim.cost, currency, exchangeRate)} | Sell: {formatMoney(sim.resell, currency, exchangeRate)}</p>
                                                             </div>
                                                             <div className="text-right flex flex-col items-end">
                                                                 <span className={`text-[10px] font-mono font-bold ${itemProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                     {itemProfit >= 0 ? '+' : ''} {formatMoney(itemProfit, currency, exchangeRate)}
                                                                 </span>
                                                                 <span className={`text-[9px] mt-0.5 bg-white/5 px-1.5 py-0.5 rounded font-mono ${itemRoi >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                                                     {itemRoi >= 0 ? '+' : ''}{itemRoi.toFixed(0)}% ROI
                                                                 </span>
                                                                 <button onClick={() => handleRemoveSim(sim.id)} className="text-[8px] mt-1 font-bold text-gray-600 hover:text-red-500 uppercase tracking-widest transition-colors">
                                                                    Remove
                                                                 </button>
                                                             </div>
                                                          </div>
                                                      );
                                                  })}
                                                  
                                                  <div className="mt-4 pt-3 border-t border-dashed border-white/10 bg-black/30 -mx-4 -mb-4 p-4 rounded-b-2xl">
                                                      <div className="flex justify-between items-center mb-1">
                                                          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Phase Spend</span>
                                                          <span className={`text-xs font-mono font-bold ${canAffordPhase ? 'text-white' : 'text-red-400'}`}>{formatMoney(phaseSpend, currency, exchangeRate)}</span>
                                                      </div>
                                                      <div className="flex justify-between items-center">
                                                          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Phase Net Profit</span>
                                                          <span className={`text-xs font-mono font-bold ${phaseProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                              {phaseProfit >= 0 ? '+' : ''}{formatMoney(phaseProfit, currency, exchangeRate)}
                                                          </span>
                                                      </div>
                                                      <div className="flex justify-between items-center mt-1">
                                                          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Phase ROI</span>
                                                          <span className={`text-xs font-mono font-bold ${phaseRoi >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                                              {phaseRoi >= 0 ? '+' : ''}{phaseRoi.toFixed(1)}%
                                                          </span>
                                                      </div>
                                                      {!canAffordPhase && (
                                                          <div className="mt-3 bg-red-900/20 border border-red-500/20 p-2 rounded text-[9px] text-red-400 font-bold uppercase tracking-widest flex items-center justify-center space-x-1">
                                                              <WarningIcon className="w-3 h-3" />
                                                              <span>Insufficient Liquidity to Execute Phase</span>
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}

                                  {/* --- GRAND TOTAL SUMMARY --- */}
                                  {sortedSteps.length > 0 && (
                                      <div className="mt-8 bg-gradient-to-b from-[#151515] to-[#101010] border border-emerald-500/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(16,185,129,0.1)] ml-4">
                                          <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center">
                                              <TrophyIcon className="w-4 h-4 mr-1" /> Campaign Results
                                          </h3>
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs text-gray-400">Total Final Liquidity</span>
                                              <span className="text-sm font-mono font-bold text-white">{formatMoney(rollingCash, currency, exchangeRate)}</span>
                                          </div>
                                          <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs text-gray-400">Total Proj. Net Worth</span>
                                              <span className="text-sm font-mono font-black text-emerald-400">{formatMoney(rollingNW, currency, exchangeRate)}</span>
                                          </div>
                                          <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                              <span className="text-xs text-gray-400">Cumulative ROI</span>
                                              <span className="text-sm font-mono font-bold text-blue-400">
                                                  {totalChainSpend > 0 ? ((totalChainProfit / totalChainSpend) * 100).toFixed(1) : 0}%
                                              </span>
                                          </div>
                                      </div>
                                  )}
                              </>
                          );
                      })()}
                  </div>
              </div>
            )}

            {/* --- TAB: CALENDAR --- */}
            {activeTab === 'calendar' && (
              <div className="animate-in fade-in duration-300">
                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center"><CalendarIcon className="w-3 h-3 mr-2" /> Release Calendar</h2>
                  {Object.keys(groupReleasesByWeek(calendarData)).map((weekGroup, idx) => (
                      <div key={idx} className="mb-6">
                          <h3 className="text-[10px] font-black text-blue-400 bg-blue-900/10 border border-blue-500/20 px-3 py-1.5 rounded-lg uppercase tracking-widest mb-3 sticky top-0 z-10 w-fit backdrop-blur-md shadow-sm">
                              {weekGroup}
                          </h3>
                          <div className="space-y-3">
                              {groupReleasesByWeek(calendarData)[weekGroup].map((drop, dropIdx) => {
                                  let day = "TBA"; let shortMonth = "SOON";
                                  const ts = drop.timestamp || 9999999999999;
                                  if (ts !== 9999999999999) {
                                      const d = new Date(ts);
                                      day = d.getDate(); shortMonth = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
                                  }
                                  const t = drop.type.toUpperCase();
                                  let badgeColor = 'text-gray-400 bg-gray-400/10 border-gray-400/20'; 
                                  if (t === 'MAIN RELEASE') badgeColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'; 
                                  else if (t === 'PRE-ORDER') badgeColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20'; 
                                  else if (t === 'EQL DRAW') badgeColor = 'text-orange-400 bg-orange-400/10 border-orange-400/20'; 

                                  return (
                                      <div key={dropIdx} className="w-full text-left flex bg-[#151515] border border-white/5 rounded-xl overflow-hidden shadow-sm">
                                          <div className="w-20 bg-black/40 border-r border-white/5 flex flex-col shrink-0">
                                              <div className="w-full aspect-square bg-gray-800 overflow-hidden relative">
                                                  {drop.image ? (
                                                      <img src={drop.image} alt={drop.name} className="w-full h-full object-cover" loading="lazy" />
                                                  ) : (
                                                      <div className="w-full h-full flex items-center justify-center text-2xl grayscale opacity-40">📦</div>
                                                  )}
                                              </div>
                                              <div className="flex flex-col items-center justify-center py-1.5 flex-1">
                                                  <span className="text-[9px] font-bold text-gray-500 leading-none mb-0.5">{shortMonth}</span>
                                                  <span className="text-base font-black text-white leading-none">{day}</span>
                                              </div>
                                          </div>
                                          <div className="p-3 flex-1 min-w-0 flex flex-col justify-center">
                                              <div className="flex justify-between items-start mb-0.5">
                                                  <h4 className="text-sm font-bold text-gray-200 leading-tight pr-2 line-clamp-2">{drop.name}</h4>
                                              </div>
                                              <p className="text-[10px] text-gray-500 font-mono mb-2 truncate">{drop.date}</p>
                                              <div className="flex items-center justify-between">
                                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${badgeColor}`}>{drop.type}</span>
                                                  <span className="text-[10px] text-gray-400 font-mono font-bold">{drop.price}</span>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* --- BOTTOM NAVIGATION BAR --- */}
      <div className="fixed bottom-4 left-4 right-4 z-50">
          <div className="max-w-md mx-auto bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 flex justify-between items-center shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              <button onClick={() => { setActiveTab('home'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors w-12 ${activeTab === 'home' && !selectedDrop ? 'text-yellow-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <HomeIcon className="w-6 h-6 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Home</span>
              </button>
              <button onClick={() => { setActiveTab('analytics'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors w-12 ${activeTab === 'analytics' && !selectedDrop ? 'text-emerald-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <ChartIcon className="w-6 h-6 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest">P&L</span>
              </button>
              <button onClick={() => { setActiveTab('simulator'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors w-12 ${activeTab === 'simulator' && !selectedDrop ? 'text-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <BeakerIcon className="w-6 h-6 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Sims</span>
              </button>
              <button onClick={() => { setActiveTab('calendar'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors w-12 ${activeTab === 'calendar' && !selectedDrop ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <CalendarIcon className="w-6 h-6 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Drops</span>
              </button>
          </div>
      </div>
    </div>
  );
}