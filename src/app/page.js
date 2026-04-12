'use client';
import { useState, useEffect } from 'react';

const formatMoney = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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

const SwipeableRow = ({ children, onHide }) => (
    <div className="relative w-full overflow-hidden rounded-xl h-[88px]">
      <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
        <div className="w-full flex-shrink-0 snap-center">{children}</div>
        <button onClick={onHide} className="w-20 flex-shrink-0 snap-center bg-red-600 flex flex-col items-center justify-center text-white border-y border-r border-red-600 rounded-r-xl">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mb-1"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
          <span className="text-[10px] font-bold">HIDE</span>
        </button>
      </div>
    </div>
);

export default function App() {
  const[activeTab, setActiveTab] = useState('home');
  const [data, setData] = useState(null);
  const [calendarData, setCalendarData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marketValues, setMarketValues] = useState({});
  const[selectedDrop, setSelectedDrop] = useState(null);
  const [showCards, setShowCards] = useState(false); 
  const [showAddresses, setShowAddresses] = useState(false); 
  const[trackingModal, setTrackingModal] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [search, setSearch] = useState('');
  const [hiddenItems, setHiddenItems] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const[ordersRes, calRes] = await Promise.all([fetch('/api/check-orders'), fetch('/api/calendar')]);
      setData(await ordersRes.json());
      const calJson = await calRes.json();
      setCalendarData(calJson.releases ||[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    const savedValues = localStorage.getItem('rift_market_values');
    if (savedValues) setMarketValues(JSON.parse(savedValues));
    fetchData();
  },[]);

  const handleMarketValueChange = (productName, value) => {
    const newVals = { ...marketValues };
    if (value === '') { delete newVals[productName]; } 
    else { newVals[productName] = parseFloat(value); }
    setMarketValues(newVals);
    localStorage.setItem('rift_market_values', JSON.stringify(newVals));
  };

  const maskEmail = (email) => {
    if (!privacyMode) return email;
    const parts = email.split('@');
    return parts.length > 1 ? `${parts[0].substring(0, 4)}***@${parts[1]}` : email;
  };

  const handleAccountantCSV = () => {
    if (!data || !data.rawOrders) return;
    let csvContent = "Date Exported,Order ID,Store/Platform,Product Name,Status,Fulfillment Status,Email/Alias,Qty,Unit Cost (USD),Total Spend (USD),Tracking Number,Carrier\n";
    const today = new Date().toLocaleDateString('en-ZA'); 
    
    data.rawOrders.forEach(order => {
        const safeName = `"${order.productName.replace(/"/g, '""')}"`;
        // Since order.price is the total spend, unit cost is total / qty
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

  const filteredDrops = data?.drops?.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.store.toLowerCase().includes(search.toLowerCase())) ||[];

  // --- CALCULATE P&L GLOBALS ---
  let totalCostBasis = data?.globalStats?.spend || 0;
  let totalMarketValue = 0;
  data?.drops?.forEach(drop => {
      const avgCost = drop.totalItems > 0 ? drop.totalSpend / drop.totalItems : 0;
      const val = marketValues.hasOwnProperty(drop.name) ? marketValues[drop.name] : avgCost;
      totalMarketValue += (val * (drop.totalItems || 0));
  });
  let unrealizedProfit = totalMarketValue - totalCostBasis;
  let globalROI = totalCostBasis > 0 ? (unrealizedProfit / totalCostBasis) * 100 : 0;

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

  // --- TIMELINE MODAL ---
  const TimelineModal = () => {
    if (!trackingModal) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all">
            <div className="bg-[#101010] w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#151515]">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest">Shipment Status</h2>
                    <button onClick={() => setTrackingModal(null)} className="text-gray-500 hover:text-white text-xs font-bold">CLOSE</button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {trackingModal.map((pkg, i) => {
                        const steps =['unfulfilled', 'shipped', 'delivered'];
                        const currentIdx = steps.indexOf(pkg.status) === -1 ? 0 : steps.indexOf(pkg.status);
                        const Check = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-black"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>;
                        return (
                            <div key={i} className="mb-8 last:mb-0">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-[10px] font-bold bg-gray-800 text-gray-300 px-2 py-1 rounded tracking-wider">#{pkg.id}</span>
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center relative">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center z-10 shrink-0"><Check /></div>
                                            <div className={`w-0.5 h-full absolute top-5 ${currentIdx >= 1 ? 'bg-emerald-500' : 'bg-gray-800'}`}></div>
                                        </div>
                                        <div className="pb-8">
                                            <p className="text-sm font-bold text-white leading-none">Order Confirmed</p>
                                            <p className="text-[10px] text-gray-500 mt-1">Order processed successfully</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center relative">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center z-10 shrink-0 border-2 ${currentIdx >= 1 ? 'bg-blue-500 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-[#101010] border-gray-700'}`}>
                                                {currentIdx >= 1 && <Check />}
                                            </div>
                                            <div className={`w-0.5 h-full absolute top-5 ${currentIdx >= 2 ? 'bg-yellow-500' : 'bg-gray-800'}`}></div>
                                        </div>
                                        <div className="pb-8">
                                            <p className={`text-sm font-bold leading-none ${currentIdx >= 1 ? 'text-white' : 'text-gray-600'}`}>Shipped</p>
                                            {currentIdx >= 1 ? (
                                                <div className="mt-1">
                                                    <p className="text-[10px] text-blue-400 font-mono">{pkg.carrier}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono tracking-wide">{pkg.tracking}</p>
                                                </div>
                                            ) : <p className="text-[10px] text-gray-600 mt-1">Pending shipment</p>}
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center relative">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center z-10 shrink-0 border-2 ${currentIdx >= 2 ? 'bg-yellow-500 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-[#101010] border-gray-700'}`}>
                                                {currentIdx >= 2 && <Check />}
                                            </div>
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold leading-none ${currentIdx >= 2 ? 'text-white' : 'text-gray-600'}`}>Delivered</p>
                                            <p className={`text-[10px] mt-1 ${currentIdx >= 2 ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {currentIdx >= 2 ? 'Package arrived' : 'Waiting for delivery'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                {pkg.tracking && (
                                    <a href={`https://t.17track.net/en#nums=${pkg.tracking}`} target="_blank" className="mt-6 block w-full text-center bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-3 rounded-xl transition-colors border border-white/5 flex items-center justify-center space-x-2">
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
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#151515]">
                <div className="flex items-center space-x-3">
                    <Icon className={`w-5 h-5 ${type === 'card' ? 'text-yellow-500' : 'text-blue-500'}`} />
                    <h2 className="text-sm font-black text-white uppercase tracking-widest">{title}</h2>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white text-xs font-bold">CLOSE</button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                {items?.length === 0 && <div className="text-center py-8"><p className="text-gray-600 text-xs">No data collected yet.</p></div>}
                {items?.map((item, i) => {
                    const total = item.total;
                    const canceled = item.canceled;
                    const rate = (canceled / total) * 100;
                    let color = "text-emerald-500"; let bg = "bg-emerald-500/10 border-emerald-500/20";
                    if (rate > 50) { color = "text-red-500"; bg = "bg-red-500/10 border-red-500/20"; } 
                    else if (rate > 0) { color = "text-orange-500"; bg = "bg-orange-500/10 border-orange-500/20"; }
                    const label = type === 'card' ? (item.last4 === 'PayPal' ? 'PayPal' : `Ending in ${item.last4}`) : item.address.split(',')[0];
                    const subLabel = type === 'card' ? `${total} transactions` : item.address;
                    return (
                        <div key={i} className="flex justify-between items-start p-3 rounded-xl border border-white/5 bg-[#151515]">
                            <div className="flex-1 min-w-0 mr-4">
                                <p className="text-sm font-bold text-gray-200 truncate">{label}</p>
                                <p className="text-[10px] text-gray-500 truncate leading-relaxed">{subLabel}</p>
                            </div>
                            <div className="text-right flex flex-col items-end space-y-1">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${bg} ${color}`}>{rate.toFixed(0)}% Fail</span>
                                <p className="text-[10px] text-gray-600 font-mono">{canceled}/{total} Void</p>
                            </div>
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
    
    const projectedRevenue = currentMarketValue * (selectedDrop.totalItems || 0);
    const projectedProfit = projectedRevenue - selectedDrop.totalSpend;
    const profitColor = projectedProfit >= 0 ? 'text-emerald-400' : 'text-red-400';

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans relative">
        <TimelineModal />
        
        <div className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10 p-4">
            <div className="max-w-md mx-auto flex items-center justify-between">
                <button onClick={() => setSelectedDrop(null)} className="text-gray-400 text-xs font-bold uppercase hover:text-white flex items-center bg-white/5 px-3 py-1.5 rounded-full transition-colors">
                    ← Back
                </button>
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Order Details</span>
            </div>
        </div>

        <div className="max-w-md mx-auto p-4 pb-24">
          <div className="flex flex-col items-center mb-6 mt-2">
              <div className="w-28 h-28 bg-gray-800 rounded-3xl overflow-hidden border border-white/10 shadow-2xl mb-4">
                  {selectedDrop.image ? <img src={selectedDrop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
              </div>
              <h1 className="text-xl font-bold text-center leading-tight mb-2 px-4">{selectedDrop.name}</h1>
              <div className="flex items-center space-x-2 bg-white/5 px-3 py-1.5 rounded-full">
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{selectedDrop.store}</span>
              </div>
          </div>

          {/* VALUATION ENGINE WITH CLEAR COST DISTINCTION */}
          <div className="bg-gradient-to-b from-[#151515] to-[#101010] rounded-2xl p-5 border border-white/5 mb-8 shadow-xl">
              <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center space-x-2">
                  <ChartIcon className="w-3 h-3" /> <span>Market Valuation</span>
              </h3>
              
              <div className="flex justify-between items-center px-1 mb-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">Unit Cost (Scraped)</span>
                  <span className="text-sm font-bold text-gray-300 font-mono">{formatMoney(avgUnitCost)}</span>
              </div>

              <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5 mb-4">
                  <span className="text-xs font-bold text-gray-300">Unit Resell Value</span>
                  <div className="flex items-center space-x-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
                      <span className="text-gray-500 font-mono text-sm">$</span>
                      <input 
                          type="number" 
                          value={marketValues[selectedDrop.name] ?? ''}
                          onChange={(e) => handleMarketValueChange(selectedDrop.name, e.target.value)}
                          placeholder="0.00"
                          className="bg-transparent text-white font-mono text-right w-16 focus:outline-none placeholder-gray-700 text-sm"
                      />
                  </div>
              </div>
              
              <div className="flex justify-between items-center px-1 mb-2 mt-4 pt-4 border-t border-white/5">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">Total Spend</span>
                  <span className="text-sm font-bold text-gray-400 font-mono">{formatMoney(selectedDrop.totalSpend)}</span>
              </div>
              <div className="flex justify-between items-center px-1 mb-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">Proj. Revenue ({selectedDrop.totalItems} items)</span>
                  <span className="text-sm font-bold text-white font-mono">{formatMoney(projectedRevenue)}</span>
              </div>
              <div className="flex justify-between items-center px-1 pt-2 mt-2">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Est. Net Profit</span>
                  <span className={`text-base font-black font-mono ${profitColor}`}>
                      {projectedProfit >= 0 ? '+' : ''}{formatMoney(projectedProfit)}
                  </span>
              </div>
          </div>
          
          <div className="flex justify-between items-end mb-3 px-1 border-b border-white/10 pb-2">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email Receipts</h2>
              <div className="flex space-x-3">
                  <button onClick={handleEmployeeExport} className="text-[9px] text-gray-500 hover:text-white uppercase transition-colors font-bold flex items-center space-x-1">
                      <DocumentIcon className="w-3 h-3" /><span>Export receiving txt</span>
                  </button>
                  <button onClick={() => setPrivacyMode(!privacyMode)} className="text-[9px] text-gray-500 hover:text-white uppercase transition-colors font-bold flex items-center space-x-1">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                     <span>{privacyMode ? "Show Emails" : "Hide Emails"}</span>
                  </button>
              </div>
          </div>
          
          <div className="space-y-3">
            {selectedDrop.breakdown.map((item, i) => {
               if (hiddenItems.includes(item.email)) return null;
               const confirmedCount = item.count - item.canceled;
               
               // Calculate explicit unit price for this row's display
               const unitPrice = item.latestQty > 0 ? item.latestPrice / item.latestQty : item.latestPrice;

               return (
                <SwipeableRow key={i} onHide={() => setHiddenItems([...hiddenItems, item.email])}>
                  <div className="bg-[#151515] border border-white/5 rounded-xl p-4 flex justify-between items-center w-full h-full">
                    <div className="flex flex-col min-w-0 mr-4">
                      <span className="text-sm font-mono text-gray-300 truncate mb-1">{maskEmail(item.email)}</span>
                      <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                              <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 rounded font-mono">Qty: {item.latestQty}</span>
                              {item.latestPrice > 0 && <span className="text-[10px] text-emerald-500 bg-emerald-900/20 px-1.5 rounded font-mono">{formatMoney(unitPrice)}/ea</span>}
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

  // --- MAIN LAYOUT RENDER ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans pb-24 relative">
      {/* MODALS */}
      {showCards && <RiskModal title="Card Risk Profile" type="card" items={data?.cards} Icon={CardIcon} onClose={() => setShowCards(false)} />}
      {showAddresses && <RiskModal title="Address Risk Profile" type="address" items={data?.addresses} Icon={HomeIcon} onClose={() => setShowAddresses(false)} />}
      
      {/* GLOBAL HEADER */}
      <div className="sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 p-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">RIFT</h1>
          <button onClick={fetchData} disabled={loading} className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${loading ? 'bg-gray-800 text-gray-500' : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)]'}`}>
            {loading ? 'SYNCING...' : 'REFRESH'}
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* --- TAB: HOME --- */}
            {activeTab === 'home' && (
              <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Spend</p>
                      <p className="text-xl font-bold text-white mt-1">{formatMoney(data?.globalStats?.spend || 0)}</p>
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
                  {filteredDrops.map((drop, i) => (
                    <div key={i} onClick={() => setSelectedDrop(drop)} className="group relative bg-[#151515] border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-white/10 shadow-lg">
                      <div className="flex items-start">
                        <div className="w-16 h-16 bg-gray-800 rounded-lg mr-4 flex-shrink-0 overflow-hidden border border-white/5 relative">
                          {drop.image ? <img src={drop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl grayscale opacity-50">📦</div>}
                          <div className="absolute bottom-0 right-0 bg-black/60 backdrop-blur text-white text-[9px] px-1.5 py-0.5 rounded-tl-md font-bold">x{drop.totalItems}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                              <h3 className="font-bold text-sm text-gray-200 leading-tight truncate pr-2">{drop.name}</h3>
                              <span className="text-emerald-400 text-xs font-bold whitespace-nowrap">{formatMoney(drop.totalSpend)}</span>
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
                  ))}
                </div>
              </div>
            )}

            {/* --- TAB: ANALYTICS (P&L) --- */}
            {activeTab === 'analytics' && (
              <div className="animate-in fade-in duration-300">
                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center"><ChartIcon className="w-3 h-3 mr-2" /> Portfolio Valuation</h2>
                  
                  {/* P&L Hero Card */}
                  <div className="bg-gradient-to-br from-[#1a1a1a] to-[#101010] border border-white/5 rounded-3xl p-6 shadow-2xl mb-6">
                      <div className="flex justify-between items-start mb-6">
                          <div>
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total Market Value</p>
                              <p className="text-3xl font-black text-white">{formatMoney(totalMarketValue)}</p>
                          </div>
                          <div className="text-right">
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Cost Basis</p>
                              <p className="text-sm font-bold text-gray-300">{formatMoney(totalCostBasis)}</p>
                          </div>
                      </div>
                      
                      <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex justify-between items-center">
                          <div>
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Unrealized Profit</p>
                              <p className={`text-xl font-black ${unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {unrealizedProfit >= 0 ? '+' : ''}{formatMoney(unrealizedProfit)}
                              </p>
                          </div>
                          <div className="text-right">
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total ROI</p>
                              <div className={`inline-block px-2 py-1 rounded-lg text-xs font-black font-mono ${unrealizedProfit >= 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                                  {unrealizedProfit >= 0 ? '+' : ''}{globalROI.toFixed(1)}%
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                      {/* Setup Win-Rate Widget */}
                      <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 flex flex-col justify-center items-center text-center">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Setup Win Rate</p>
                          <div className="relative w-16 h-16 flex items-center justify-center">
                              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                  <path className="text-gray-800" strokeDasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke="currentColor" strokeWidth="3" fill="none" />
                                  <path className="text-yellow-500 transition-all duration-1000 ease-out" strokeDasharray={`${data?.globalStats?.winRate || 0}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke="currentColor" strokeWidth="3" fill="none" />
                              </svg>
                              <div className="absolute text-sm font-black text-white font-mono">{(data?.globalStats?.winRate || 0).toFixed(0)}%</div>
                          </div>
                      </div>

                      {/* Liquidity Tracker Widget */}
                      <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Liquidity Status</p>
                          <div className="flex h-2 w-full bg-gray-800 rounded-full overflow-hidden mb-3">
                              <div className="h-full bg-gray-500" style={{ width: `${lockedPct}%` }}></div>
                              <div className="h-full bg-blue-500" style={{ width: `${floatingPct}%` }}></div>
                              <div className="h-full bg-emerald-500" style={{ width: `${liquidPct}%` }}></div>
                          </div>
                          <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-mono"><span className="text-gray-400">Locked</span><span className="text-white font-bold">{formatMoney(lockedCap)}</span></div>
                              <div className="flex justify-between text-[9px] font-mono"><span className="text-blue-400">Floating</span><span className="text-white font-bold">{formatMoney(floatingCap)}</span></div>
                              <div className="flex justify-between text-[9px] font-mono"><span className="text-emerald-400">Liquid</span><span className="text-white font-bold">{formatMoney(liquidCap)}</span></div>
                          </div>
                      </div>
                  </div>

                  <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Asset Breakdown</h2>
                  <div className="space-y-3 mb-6">
                      {data?.drops?.map((drop, i) => {
                          const avgCost = drop.totalItems > 0 ? drop.totalSpend / drop.totalItems : 0;
                          const mktVal = marketValues.hasOwnProperty(drop.name) ? marketValues[drop.name] : avgCost;
                          const rev = mktVal * drop.totalItems;
                          const profit = rev - drop.totalSpend;
                          return (
                              <div key={i} onClick={() => { setActiveTab('home'); setSelectedDrop(drop); }} className="bg-[#151515] border border-white/5 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-white/10 transition-colors">
                                  <div className="flex items-center space-x-3 min-w-0 flex-1 mr-4">
                                      <div className="w-10 h-10 bg-gray-800 rounded-lg overflow-hidden shrink-0 border border-white/5">
                                          {drop.image ? <img src={drop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">📦</div>}
                                      </div>
                                      <div className="min-w-0">
                                          <p className="text-xs font-bold text-gray-200 truncate leading-tight">{drop.name}</p>
                                          <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">{drop.totalItems} Units</p>
                                      </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                      <p className="text-xs font-bold text-white mb-1 font-mono">{formatMoney(rev)} <span className="text-[9px] text-gray-500 font-sans font-normal ml-1">Est. Value</span></p>
                                      <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}`}>
                                          {profit >= 0 ? '+' : ''}{formatMoney(profit)}
                                      </span>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
                  
                  {/* SARS EXPORT BUTTON */}
                  <button onClick={handleAccountantCSV} className="w-full bg-[#151515] hover:bg-[#1a1a1a] border border-white/10 text-white font-bold py-4 rounded-2xl text-xs transition-colors flex justify-center items-center space-x-2 shadow-lg">
                      <DocumentIcon className="w-4 h-4 text-emerald-500" />
                      <span>SARS ACCOUNTANT EXPORT (CSV)</span>
                  </button>
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
                                          <div className="w-16 bg-black/40 border-r border-white/5 flex flex-col items-center justify-center shrink-0 py-3 px-1">
                                              <span className="text-[9px] font-bold text-gray-500 mb-1 truncate w-full text-center">{shortMonth}</span>
                                              <span className="text-lg font-black text-white leading-none">{day}</span>
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
          <div className="max-w-md mx-auto bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl px-8 py-3 flex justify-between items-center shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              <button onClick={() => { setActiveTab('home'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors ${activeTab === 'home' && !selectedDrop ? 'text-yellow-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <HomeIcon className="w-6 h-6 mb-1" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Home</span>
              </button>
              <button onClick={() => { setActiveTab('analytics'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors ${activeTab === 'analytics' && !selectedDrop ? 'text-emerald-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <ChartIcon className="w-6 h-6 mb-1" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Analytics</span>
              </button>
              <button onClick={() => { setActiveTab('calendar'); setSelectedDrop(null); }} className={`flex flex-col items-center transition-colors ${activeTab === 'calendar' && !selectedDrop ? 'text-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  <CalendarIcon className="w-6 h-6 mb-1" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Calendar</span>
              </button>
          </div>
      </div>
    </div>
  );
}