'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ password: pass }),
    });

    if (res.ok) {
      router.push('/'); // Go to Dashboard
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-[#151515] border border-white/10 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-2xl font-black italic text-center text-white mb-6 tracking-tighter">RIFTBOUND</h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="Enter Access Key"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none transition-colors text-center tracking-widest"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs text-center font-bold uppercase tracking-wide">
              Access Denied
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? 'UNLOCKING...' : 'ENTER'}
          </button>
        </form>
      </div>
    </div>
  );
}