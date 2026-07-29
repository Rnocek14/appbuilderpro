// A well-formed generated app: every control has a handler, the form submits, the clickable
// element is a real <button>, and nothing references a name that does not exist.
import { useState } from 'react';

export default function App() {
  const [items, setItems] = useState<string[]>(['Write the brief', 'Call the printer']);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<'all' | 'done'>('all');
  const [done, setDone] = useState<number[]>([]);

  const add = () => { if (draft.trim()) { setItems([...items, draft.trim()]); setDraft(''); } };
  const toggle = (i: number) => setDone(done.includes(i) ? done.filter((d) => d !== i) : [...done, i]);
  const clear = () => { setItems([]); setDone([]); };

  const shown = filter === 'all' ? items : items.filter((_, i) => done.includes(i));

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 560, margin: '0 auto' }}>
      <h1>Task Board</h1>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: 'flex', gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task" aria-label="New task" style={{ flex: 1 }} />
        <button type="submit">Add</button>
      </form>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>All</button>
        <button onClick={() => setFilter('done')} aria-pressed={filter === 'done'}>Done</button>
      </div>
      <ul>
        {shown.map((t, i) => (
          <li key={i}>
            <button onClick={() => toggle(i)} style={{ textDecoration: done.includes(i) ? 'line-through' : 'none' }}>{t}</button>
          </li>
        ))}
      </ul>
      <p>{items.length} task(s), {done.length} done.</p>
      <button onClick={clear}>Clear all</button>
    </main>
  );
}
