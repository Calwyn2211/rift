'use client';
import { useState, useEffect } from 'react';

// Money Formatter
const formatMoney = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDrop, setSelectedDrop] = useState(null);
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

  const filteredDrops = data?.drops?.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) || 
    d.store.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // --- HOME VIEW ---
  if (!selectedDrop) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-sans pb-10">
        
        {/* Header */}
        <div className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 p-4">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
              RIFTBOUND
            </h1>
            <button 
                onClick={fetchData} 
                disabled={loading}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${loading ? 'bg-gray-800 text-gray-500' : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)]'}`}
            >
              {loading ? 'SYNCING...' : 'REFRESH'}
            </button>
          </div>
        </div>

        <div className="max-w-md mx-auto p-4">
            
          {/* Dashboard Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Spend</p>
                <p className="text-xl font-bold text-white mt-1">
                    {loading ? '-' : formatMoney(data?.globalStats?.spend || 0)}
                </p>
            </div>
            <div className="bg-[#151515] p-4 rounded-2xl border border-white/5 shadow-xl">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Secured Items</p>
                <div className="flex items-end space-x-2 mt-1">
                    <p className="text-xl font-bold text-white">{loading ? '-' : data?.globalStats?.items || 0}</p>
                    <p className="text-[10px] text-gray-500 mb-1">in {data?.globalStats?.orders} orders</p>
                </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <input 
                type="text" 
                placeholder="Search drops..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#151515] text-sm text-white border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-yellow-500/50 transition-colors"
            />
          </div>

          {/* List */}
          <div className="space-y-4">
            {!loading && filteredDrops.length === 0 && (
                <div className="text-center text-gray-600 text-xs py-10">No drops found.</div>
            )}

            {!loading && filteredDrops.map((drop, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedDrop(drop)}
                className="group relative bg-[#151515] border border-white/5 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer hover:border-white/10"
              >
                <div className="flex items-start">
                  <div className="w-16 h-16 bg-gray-800 rounded-lg mr-4 flex-shrink-0 overflow-hidden border border-white/5 relative">
                    {drop.image ? (
                      <img src={drop.image} alt="Item" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl grayscale opacity-50">📦</div>
                    )}
                    <div className="absolute bottom-0 right-0 bg-black/60 backdrop-blur text-white text-[9px] px-1.5 py-0.5 rounded-tl-md font-bold">
                        x{drop.totalItems}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-sm text-gray-200 leading-tight truncate pr-2">{drop.name}</h3>
                        <span className="text-emerald-400 text-xs font-bold whitespace-nowrap">{formatMoney(drop.totalSpend)}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mt-1 tracking-wide">{drop.store}</p>
                    
                    <div className="flex items-center space-x-2 mt-3">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${(drop.confirmed / drop.totalOrders) * 100}%` }}></div>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">
                            {drop.confirmed} <span className="text-gray-600">/</span> {drop.totalOrders}
                        </span>
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
      <div className="max-w-md mx-auto pb-10">
        <button onClick={() => setSelectedDrop(null)} className="text-gray-500 text-xs font-bold uppercase hover:text-white mb-6 flex items-center">
          ← Back
        </button>
        
        {/* HERO */}
        <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 bg-gray-800 rounded-2xl overflow-hidden border-2 border-white/5 shadow-2xl mb-4">
                {selectedDrop.image ? (
                  <img src={selectedDrop.image} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>
                )}
            </div>
            <h1 className="text-lg font-bold text-center leading-tight mb-1 px-4">{selectedDrop.name}</h1>
            <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500 uppercase tracking-widest">{selectedDrop.store}</span>
                <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                <span className="text-xs text-emerald-400 font-bold">{formatMoney(selectedDrop.totalSpend)}</span>
            </div>
        </div>

        {/* LIST HEADER */}
        <div className="flex justify-between items-end mb-3 px-1 border-b border-white/10 pb-2">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Email Receipts</h2>
            <button onClick={() => setPrivacyMode(!privacyMode)} className="text-[10px] text-gray-600 hover:text-white uppercase transition-colors">
                {privacyMode ? "Show Emails" : "Hide Emails"}
            </button>
        </div>

        {/* RECEIPTS LIST (UPDATED FOR CANCELLATION TRACKING) */}
        <div className="space-y-3">
          {selectedDrop.breakdown.map((item, i) => {
             // Logic: Calculate how many confirmed
             const confirmedCount = item.count - item.canceled;

             return (
              <div key={i} className="bg-[#151515] border border-white/5 rounded-xl p-4 flex justify-between items-center">
                
                {/* Left: Email & Badges */}
                <div className="flex flex-col min-w-0 mr-4">
                  <span className="text-sm font-mono text-gray-300 truncate mb-1">{maskEmail(item.email)}</span>
                  <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 rounded font-mono">
                         Qty: {item.latestQty}
                      </span>
                      {item.latestPrice > 0 && (
                          <span className="text-[10px] text-emerald-500 bg-emerald-900/20 px-1.5 rounded font-mono">
                             {formatMoney(item.latestPrice)}
                          </span>
                      )}
                  </div>
                </div>

                {/* Right: Stats Breakdown */}
                <div className="text-right flex flex-col items-end">
                  
                  {/* Total Orders Header */}
                  <div className="font-bold text-yellow-500 text-sm">
                      {item.count} Order{item.count > 1 ? 's' : ''}
                  </div>

                  {/* Sub-line: Breakdown */}
                  <div className="text-[10px] font-bold mt-1 flex space-x-1">
                      {/* Confirmed Count */}
                      {confirmedCount > 0 && (
                          <span className="text-gray-500">
                             {confirmedCount} Confirmed
                          </span>
                      )}

                      {/* Dot separator if both exist */}
                      {confirmedCount > 0 && item.canceled > 0 && (
                          <span className="text-gray-700">•</span>
                      )}

                      {/* Canceled Count */}
                      {item.canceled > 0 && (
                          <span className="text-red-500">
                             {item.canceled} Canceled
                          </span>
                      )}
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