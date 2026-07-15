// src/components/garvis/canvas/CanvasChat.tsx
// GARVIS, DOCKED ON THE CANVAS. The canvas's mouth and hands: an "ask or tell Garvis…" line pinned
// under the branch canvas. A question gets a grounded answer; a "make me…" gets real work — and when
// a turn creates something, the parent reloads the level so the new node blooms into the ring you're
// looking at. Purely presentational: it owns the thread + composer UI and calls onSend; the parent
// owns what a turn actually does (grounded ask vs a studio decision that persists a real artifact).

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

export interface CanvasTurn { role: 'you' | 'garvis'; text: string; note?: string }

export function CanvasChat({ onSend, hint }: {
  onSend: (text: string) => Promise<{ reply: string; note?: string }>;
  hint?: string;   // placeholder — e.g. "Ask about this area, or tell Garvis to make something"
}) {
  const [turns, setTurns] = useState<CanvasTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'you', text }]);
    setBusy(true);
    try {
      const res = await onSend(text);
      setTurns((t) => [...t, { role: 'garvis', text: res.reply, note: res.note }]);
    } catch (e) {
      setTurns((t) => [...t, { role: 'garvis', text: e instanceof Error ? e.message : 'Something went wrong — try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-wrap">
      <style>{CC_CSS}</style>
      {(turns.length > 0 || busy) && (
        <div className="cc-thread" ref={scrollRef}>
          {turns.map((t, i) => (
            <div key={i} className={`cc-turn ${t.role}`}>
              <div className="cc-bubble">{t.text}</div>
              {t.note && <div className="cc-note">{t.note}</div>}
            </div>
          ))}
          {busy && <div className="cc-turn garvis"><div className="cc-bubble cc-typing"><Loader2 size={13} className="cc-spin" /> Garvis is on it…</div></div>}
        </div>
      )}
      <div className="cc-bar">
        <input
          className="cc-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={hint ?? 'Ask or tell Garvis…'}
          aria-label="Ask or tell Garvis"
        />
        <button className="cc-send" onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 size={16} className="cc-spin" /> : <ArrowUp size={16} />}
        </button>
      </div>
    </div>
  );
}

const CC_CSS = `
.cc-wrap{ margin-top:12px; border:1px solid var(--gv-night-line); border-radius:16px; overflow:hidden;
  background:linear-gradient(180deg, color-mix(in srgb, var(--gv-night-2) 88%, transparent), var(--gv-night-1)); }
.cc-thread{ max-height:240px; overflow-y:auto; padding:14px 14px 4px; display:flex; flex-direction:column; gap:10px; }
.cc-turn{ display:flex; flex-direction:column; gap:3px; max-width:82%; }
.cc-turn.you{ align-self:flex-end; align-items:flex-end; }
.cc-turn.garvis{ align-self:flex-start; align-items:flex-start; }
.cc-bubble{ font-size:13.5px; line-height:1.5; border-radius:14px; padding:9px 13px; white-space:pre-wrap; }
.cc-turn.you .cc-bubble{ background:var(--gv-ember-grad); color:#1A0E04; border-bottom-right-radius:5px; font-weight:500; }
.cc-turn.garvis .cc-bubble{ background:var(--gv-night-orb); color:var(--gv-night-ink); border:1px solid var(--gv-night-line2); border-bottom-left-radius:5px; }
.cc-typing{ display:inline-flex; align-items:center; gap:7px; color:var(--gv-night-dim); }
.cc-note{ font-size:11.5px; color:var(--gv-ember); display:flex; align-items:center; gap:5px; padding:0 4px; }
.cc-bar{ display:flex; align-items:center; gap:8px; padding:10px; border-top:1px solid var(--gv-night-line); background:rgba(0,0,0,.15); }
.cc-in{ flex:1; font:inherit; font-size:14px; color:var(--gv-night-ink); background:var(--gv-night-orb); border:1px solid var(--gv-night-line2); border-radius:11px; padding:11px 13px; }
.cc-in::placeholder{ color:var(--gv-night-dim); }
.cc-in:focus-visible{ outline:none; border-color:var(--gv-ember); box-shadow:0 0 0 3px rgba(var(--gv-ember-rgb),.18); }
.cc-send{ flex:0 0 auto; width:40px; height:40px; border-radius:11px; border:none; cursor:pointer; display:grid; place-items:center;
  background:var(--gv-ember-grad); color:#1A0E04; transition:.15s ease; }
.cc-send:hover{ filter:brightness(1.05); } .cc-send:disabled{ opacity:.45; cursor:default; filter:none; }
.cc-spin{ animation:cc-rot 1s linear infinite; } @keyframes cc-rot{ to{ transform:rotate(360deg) } }
@media (prefers-reduced-motion:reduce){ .cc-spin{ animation:none } }
`;
