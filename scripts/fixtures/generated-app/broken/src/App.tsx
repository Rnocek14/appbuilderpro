// The SAME app with four planted defects — each one a class a code generator actually produces,
// and each one invisible to a compiler:
//   1. <button>Export</button>      — renders, does nothing when clicked
//   2. onClick={handleShare}        — the name is never defined; clicking throws a ReferenceError
//   3. <div onClick=…>              — works with a mouse, unreachable by keyboard
//   4. <form> with no onSubmit      — Enter reloads the page and loses what was typed
import { useState } from 'react';

export default function App() {
  const [items, setItems] = useState<string[]>(['Write the brief', 'Call the printer']);
  const [draft, setDraft] = useState('');
  const [done, setDone] = useState<number[]>([]);

  const add = () => { if (draft.trim()) { setItems([...items, draft.trim()]); setDraft(''); } };
  const toggle = (i: number) => setDone(done.includes(i) ? done.filter((d) => d !== i) : [...done, i]);

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 560, margin: '0 auto' }}>
      <h1>Task Board</h1>
      <form style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task" aria-label="New task" style={{ flex: 1 }} />
        <button type="button" onClick={add}>Add</button>
      </form>
      <ul>
        {items.map((t, i) => (
          <li key={i}>
            <button onClick={() => toggle(i)} style={{ textDecoration: done.includes(i) ? 'line-through' : 'none' }}>{t}</button>
          </li>
        ))}
      </ul>
      <p>{items.length} task(s), {done.length} done.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button>Export</button>
        <button onClick={handleShare}>Share</button>
        <div onClick={() => setDone([])} style={{ cursor: 'pointer', padding: '4px 8px', border: '1px solid #999' }}>Reset done</div>
      </div>
    </main>
  );
}
