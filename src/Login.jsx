import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase.js';
import { GitBranch } from 'lucide-react';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [err, setErr] = useState('');

  // If already signed in, bounce to home.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav('/', { replace: true });
    });
  }, [nav]);

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setStatus('error');
      setErr(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="w-full h-screen flex items-center justify-center text-zinc-200 font-ui"
         style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#000" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@600&family=Inter:wght@400;500;600&display=swap');
      `}</style>

      <div className="w-full max-w-sm px-6">
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #ff5a00 0%, #cc4800 100%)",
              boxShadow: "0 0 20px rgba(255,90,0,0.35)",
            }}
          >
            <GitBranch size={17} className="text-black" strokeWidth={2.5}/>
          </div>
          <div>
            <div className="text-[22px] text-white" style={{ fontFamily: "'Azeret Mono', monospace", letterSpacing: "-0.04em", fontWeight: 600 }}>
              FUNNEL<span style={{ color: "#ff5a00" }}>.</span>LAB
            </div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 mt-0.5">
              Digital Plane · Scenario Engine
            </div>
          </div>
        </div>

        {status !== 'sent' ? (
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">Email</div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@digitalplane.pt"
                className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#ff5a00]"
              />
            </label>
            <button
              type="submit"
              disabled={status === 'sending' || !email.trim()}
              className="w-full py-2 rounded-md text-sm font-medium transition disabled:opacity-50"
              style={{
                background: "#ff5a00",
                color: "#000",
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {err && (
              <div className="text-xs text-red-400 mt-2">{err}</div>
            )}
            <div className="text-[11px] text-zinc-600 pt-2">
              You'll get a one-click sign-in link by email. No password needed.
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-white">Check your inbox.</div>
            <div className="text-xs text-zinc-500">We sent a magic link to <span className="text-zinc-300">{email}</span>. Click it to sign in.</div>
          </div>
        )}
      </div>
    </div>
  );
}
