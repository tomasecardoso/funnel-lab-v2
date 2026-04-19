import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabase.js';

export default function RequireAuth({ children }) {
  const [status, setStatus] = useState('loading'); // loading | authed | anon

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.session ? 'authed' : 'anon');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'authed' : 'anon');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black text-zinc-500 text-sm">
        Loading…
      </div>
    );
  }

  if (status === 'anon') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
