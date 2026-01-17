'use client';
import { useState, useEffect } from 'react';

const formatMoney = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [showCards, setShowCards] = useState(false); 
  const [showAddresses, setShowAddresses] = useState(false); 
  const [trackingModal, setTrackingModal] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/check-orders');
      const json = await res.json();
      setData(json);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const maskEmail = (email) => {
    if (!privacyMode) return email;
    const parts = email.split('@');
    return parts.length > 1 ? `${parts[0].substring(0, 4)}***@${parts[1]}` : email;
  };

  const handleExport = () => {
    if (!selectedDrop) return;
    let content = `RIFT INBOUND MANIFEST - ${new Date().toLocaleDateString()}\n================================================\n\n`;
    let totalPackages = 0;
    selectedDrop.breakdown.forEach(item => {
        const confirmedCount = item.count - item.canceled;
        if (confirmedCount <= 0) return;
        const qty = item.latestQty || 1;
        const trackingList = item.packages || [];
        if (trackingList.length > 0) {
            trackingList.forEach(t => {
                content += `${selectedDrop.name} - Qty ${qty} - Status: ${t.status} - ${t.tracking || 'No Tracking'} - ${t.carrier || 'Unknown'}\n`;
                totalPackages++;
            });
        } else {
            content += `${selectedDrop.name} - Qty ${qty} - UNFULFILLED - No Tracking\n`;
        }
    });
    content += `\n================================================\nTotal Incoming: ${totalPackages} Packages\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RIFT_Manifest_${selectedDrop.store}.txt`;
    a.click();
  };

  const filteredDrops = data?.drops?.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) || 
    d.store.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // --- ICONS ---
  const TruckIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>);
  const CardIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>);
  const HomeIcon = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>);

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
                        const steps = ['unfulfilled', 'shipped', 'delivered'];
                        const currentIdx = steps.indexOf(pkg.status) === -1 ? 0 : steps.indexOf(pkg.status);
                        
                        // Icons for steps
                        const Check = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-black"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>;

                        return (
                            <div key={i} className="mb-8 last:mb-0">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-[10px] font-bold bg-gray-800 text-gray-300 px-2 py-1 rounded tracking-wider">#{pkg.id}</span>
                                </div>
                                
                                {/* TIMELINE CONTAINER */}
                                <div className="flex flex-col">
                                    
                                    {/* STEP 1: CONFIRMED */}
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center relative">
                                            {/* DOT */}
                                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center z-10 shrink-0">
                                                <Check />
                                            </div>
                                            {/* LINE DOWN */}
                                            <div className={`w-0.5 h-full absolute top-5 ${currentIdx >= 1 ? 'bg-emerald-500' : 'bg-gray-800'}`}></div>
                                        </div>
                                        <div className="pb-8">
                                            <p className="text-sm font-bold text-white leading-none">Order Confirmed</p>
                                            <p className="text-[10px] text-gray-500 mt-1">Order processed successfully</p>
                                        </div>
                                    </div>

                                    {/* STEP 2: SHIPPED */}
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center relative">
                                            {/* DOT */}
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center z-10 shrink-0 border-2 ${currentIdx >= 1 ? 'bg-blue-500 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-[#101010] border-gray-700'}`}>
                                                {currentIdx >= 1 && <Check />}
                                            </div>
                                            {/* LINE DOWN */}
                                            <div className={`w-0.5 h-full absolute top-5 ${currentIdx >= 2 ? 'bg-blue-500' : 'bg-gray-800'}`}></div>
                                        </div>
                                        <div className="pb-8">
                                            <p className={`text-sm font-bold leading-none ${currentIdx >= 1 ? 'text-white' : 'text-gray-600'}`}>Shipped</p>
                                            {currentIdx >= 1 ? (
                                                <div className="mt-1">
                                                    <p className="text-[10px] text-gray-400 font-mono">{pkg.carrier}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono tracking-wide">{pkg.tracking}</p>
                                                </div>
                                            ) : <p className="text-[10px] text-gray-600 mt-1">Pending shipment</p>}
                                        </div>
                                    </div>

                                    {/* STEP 3: DELIVERED */}
                                    <div className="flex gap-4">
                                        <div className="flex flex-col items-center relative">
                                            {/* DOT */}
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
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
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

  // --- ANALYTICS MODAL ---
  const AnalyticsModal = ({ title, type, items, Icon, onClose }) => (
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

  if (!selectedDrop) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans pb-10">
        {showCards && <AnalyticsModal title="Card Risk Profile" type="card" items={data?.cards} Icon={CardIcon} onClose={() => setShowCards(false)} />}
        {showAddresses && <AnalyticsModal title="Address Risk Profile" type="address" items={data?.addresses} Icon={HomeIcon} onClose={() => setShowAddresses(false)} />}
        
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 p-4">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">RIFT</h1>
            <button onClick={fetchData} disabled={loading} className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${loading ? 'bg-gray-800 text-gray-500' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}>{loading ? 'SYNCING...' : 'REFRESH'}</button>
          </div>
        </div>

        <div className="max-w-md mx-auto p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Spend</p>
                <p className="text-xl font-bold text-white mt-1">{loading ? '-' : formatMoney(data?.globalStats?.spend || 0)}</p>
            </div>
            <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Secured Items</p>
                <div className="flex items-end space-x-2 mt-1">
                    <p className="text-xl font-bold text-white">{loading ? '-' : data?.globalStats?.items || 0}</p>
                    <p className="text-[10px] text-gray-500 mb-1">in {data?.globalStats?.orders} orders</p>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setShowCards(true)} className="bg-[#151515] border border-white/5 hover:border-yellow-600/50 p-4 rounded-2xl flex flex-col items-center justify-center group transition-all relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-yellow-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardIcon className="w-8 h-8 text-yellow-500 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-gray-300 group-hover:text-white">Card Health</p>
                  <span className="mt-1 text-[10px] bg-yellow-900/20 text-yellow-500 px-2 py-0.5 rounded-full font-mono">{data?.cards?.length || 0} Detected</span>
              </button>
              <button onClick={() => setShowAddresses(true)} className="bg-[#151515] border border-white/5 hover:border-blue-600/50 p-4 rounded-2xl flex flex-col items-center justify-center group transition-all relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <HomeIcon className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-gray-300 group-hover:text-white">Address Health</p>
                  <span className="mt-1 text-[10px] bg-blue-900/20 text-blue-500 px-2 py-0.5 rounded-full font-mono">{data?.addresses?.length || 0} Detected</span>
              </button>
          </div>

          <div className="relative mb-4">
            <input type="text" placeholder="Search drops..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-[#151515] text-sm text-white border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-yellow-500/50 transition-colors" />
          </div>

          <div className="space-y-4">
            {!loading && filteredDrops.length === 0 && <div className="text-center text-gray-600 text-xs py-10">No drops found.</div>}
            {!loading && filteredDrops.map((drop, i) => (
              <div key={i} onClick={() => setSelectedDrop(drop)} className="group relative bg-[#151515] border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-white/10">
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
      </div>
    );
  }

  // --- DETAIL VIEW ---
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 font-sans">
      <TimelineModal />
      <div className="max-w-md mx-auto pb-10">
        <button onClick={() => setSelectedDrop(null)} className="text-gray-500 text-xs font-bold uppercase hover:text-white mb-6 flex items-center">← Back</button>
        <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 bg-gray-800 rounded-2xl overflow-hidden border-2 border-white/5 shadow-2xl mb-4">
                {selectedDrop.image ? <img src={selectedDrop.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
            </div>
            <h1 className="text-lg font-bold text-center leading-tight mb-1 px-4">{selectedDrop.name}</h1>
            <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 uppercase tracking-widest">{selectedDrop.store}</span>
                <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                <span className="text-xs text-emerald-400 font-bold">{formatMoney(selectedDrop.totalSpend)}</span>
            </div>
            <div className="flex space-x-4 mt-3">
                 <span className="text-xs font-bold text-emerald-500 bg-emerald-900/20 px-2 py-1 rounded">{selectedDrop.confirmed} Confirmed</span>
                 {selectedDrop.canceled > 0 && <span className="text-xs font-bold text-red-500 bg-red-900/20 px-2 py-1 rounded">{selectedDrop.canceled} Canceled</span>}
            </div>
            <button onClick={handleExport} className="mt-4 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-full transition-colors flex items-center space-x-2 border border-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                <span>EXPORT MANIFEST</span>
            </button>
        </div>
        
        <div className="flex justify-between items-end mb-3 px-1 border-b border-white/10 pb-2">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Email Receipts</h2>
            <button onClick={() => setPrivacyMode(!privacyMode)} className="text-[10px] text-gray-600 hover:text-white uppercase transition-colors">{privacyMode ? "Show Emails" : "Hide Emails"}</button>
        </div>
        
        <div className="space-y-3">
          {selectedDrop.breakdown.map((item, i) => {
             const confirmedCount = item.count - item.canceled;
             return (
              <div key={i} className="bg-[#151515] border border-white/5 rounded-xl p-4 flex justify-between items-center">
                <div className="flex flex-col min-w-0 mr-4">
                  <span className="text-sm font-mono text-gray-300 truncate mb-1">{maskEmail(item.email)}</span>
                  <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 rounded font-mono">Qty: {item.latestQty}</span>
                          {item.latestPrice > 0 && <span className="text-[10px] text-emerald-500 bg-emerald-900/20 px-1.5 rounded font-mono">{formatMoney(item.latestPrice)}</span>}
                      </div>
                      {item.packages?.length > 0 ? (
                          <button onClick={() => setTrackingModal(item.packages)} className="text-[9px] text-blue-400 font-bold flex items-center space-x-1 hover:text-blue-300">
                              <TruckIcon className="w-3 h-3" />
                              <span>View Status</span>
                          </button>
                      ) : confirmedCount > 0 ? (
                          <span className="text-[9px] text-gray-600 font-bold">⏳ Unfulfilled</span>
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
             );
          })}
        </div>
      </div>
    </div>
  );
}