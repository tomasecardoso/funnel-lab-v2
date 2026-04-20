import { useEffect, useRef, useState, useCallback } from 'react';
import { updateScenario as updateScenarioDb } from './scenarios.js';

const DRAFT_KEY = 'funnel-lab:draft';
const SUPABASE_DEBOUNCE_MS = 1500;
const DRAFT_DEBOUNCE_MS = 500;

/**
 * Manages auto-save behavior. Returns a status and helpers.
 *
 * Inputs:
 *   - state: { nodes, edges, textBlocks }   // the canvas state to save
 *   - activeScenarioId: string | null       // if set, also save to Supabase
 *
 * Status values: 'idle' | 'saving' | 'saved' | 'error' | 'offline'
 */
export function useAutoSave({ nodes, edges, textBlocks, activeScenarioId, enabled = true }) {
  const [status, setStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const supabaseTimerRef = useRef(null);
  const draftTimerRef = useRef(null);
  const lastSavedStateRef = useRef(null);
  const firstRunRef = useRef(true);

  // Skip saving on very first render (we just loaded state, no changes yet)
  useEffect(() => {
    firstRunRef.current = false;
  }, []);

  // Stable signature of current state — used to detect no-op saves
  const stateKey = () => JSON.stringify({ nodes, edges, textBlocks });

  // --- Draft buffer save (localStorage, debounced 500ms) -------------------
  useEffect(() => {
    if (!enabled) return;
    if (firstRunRef.current) return;

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        const draft = {
          nodes, edges, textBlocks,
          activeScenarioId: activeScenarioId || null,
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch (e) {
        // localStorage full or disabled — non-fatal
        console.warn('Draft buffer save failed:', e);
      }
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [nodes, edges, textBlocks, activeScenarioId, enabled]);

  // --- Supabase save (debounced 1500ms, only when scenario is loaded) ------
  useEffect(() => {
    if (!enabled) return;
    if (firstRunRef.current) return;
    if (!activeScenarioId) {
      setStatus('idle');
      return;
    }

    const currentKey = stateKey();
    if (lastSavedStateRef.current === currentKey) {
      return; // nothing changed since last save
    }

    setStatus('saving');

    if (supabaseTimerRef.current) clearTimeout(supabaseTimerRef.current);
    supabaseTimerRef.current = setTimeout(async () => {
      try {
        if (!navigator.onLine) {
          setStatus('offline');
          return;
        }
        await updateScenarioDb(activeScenarioId, { nodes, edges, textBlocks });
        lastSavedStateRef.current = currentKey;
        setLastSavedAt(Date.now());
        setStatus('saved');
      } catch (e) {
        console.error('Auto-save failed:', e);
        setStatus('error');
      }
    }, SUPABASE_DEBOUNCE_MS);

    return () => {
      if (supabaseTimerRef.current) clearTimeout(supabaseTimerRef.current);
    };
  }, [nodes, edges, textBlocks, activeScenarioId, enabled]);

  // Clear saved-status after a short display period so it doesn't linger
  useEffect(() => {
    if (status === 'saved') {
      const t = setTimeout(() => setStatus('idle'), 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  // Force immediate save (called when tab becomes hidden or unloads)
  const flushNow = useCallback(async () => {
    if (!activeScenarioId) return;
    if (supabaseTimerRef.current) clearTimeout(supabaseTimerRef.current);
    try {
      await updateScenarioDb(activeScenarioId, { nodes, edges, textBlocks });
      lastSavedStateRef.current = stateKey();
      setLastSavedAt(Date.now());
      setStatus('saved');
    } catch (e) {
      console.error('Flush save failed:', e);
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenarioId, nodes, edges, textBlocks]);

  // Flush on visibility change (tab hidden) + before unload
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', flushNow);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', flushNow);
    };
  }, [flushNow]);

  return { status, lastSavedAt, flushNow };
}

// --- Draft buffer utilities (used at mount to restore unsaved work) --------

export function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}
