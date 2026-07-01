// supabase/functions/_shared/streamparse.ts
// One-shot parser for the §-delimited protocol the build/edit prompts emit (§FILE / §DELETE /
// §ACTION / §EXPLANATION / §PLAN …). Pure (no Deno/browser APIs) so it can also be used client-side.
// The client uses an incremental streaming parser for live UI; the edge functions complete the call
// then parse the whole text with this.

export interface ParsedProtocol {
  action: 'discuss' | 'plan' | 'edit' | 'ask' | 'none';
  explanation: string;
  summary: string;
  steps: string[];
  fileHints: string[];
  options: string[];
  openQuestions: string[];
  question: string;
  changes: { path: string; content: string }[];
  deletions: string[];
}

export function parseProtocol(text: string): ParsedProtocol {
  const out: ParsedProtocol = {
    action: 'none', explanation: '', summary: '', steps: [], fileHints: [],
    options: [], openQuestions: [], question: '', changes: [], deletions: [],
  };
  const lines = text.split('\n');

  // current accumulating block: 'explanation' | 'summary' | 'question' | 'file'
  let block: '' | 'explanation' | 'summary' | 'question' | 'file' = '';
  let buf: string[] = [];
  let filePath = '';

  const flush = () => {
    const body = buf.join('\n').replace(/\n$/, '');
    if (block === 'explanation') out.explanation = body;
    else if (block === 'summary') out.summary = body;
    else if (block === 'question') out.question = body;
    else if (block === 'file' && filePath) out.changes.push({ path: filePath, content: body });
    buf = [];
    block = '';
    filePath = '';
  };

  for (const line of lines) {
    if (line.startsWith('§')) {
      flush();
      const rest = (m: string) => line.slice(m.length).trim();
      if (line.startsWith('§ACTION')) {
        const a = rest('§ACTION').toLowerCase();
        out.action = (['discuss', 'plan', 'edit', 'ask'].includes(a) ? a : 'none') as ParsedProtocol['action'];
      } else if (line.startsWith('§EXPLANATION')) { block = 'explanation'; }
      else if (line.startsWith('§SUMMARY')) { block = 'summary'; }
      else if (line.startsWith('§STEP')) { const s = rest('§STEP'); if (s) out.steps.push(s); }
      else if (line.startsWith('§FILEHINT')) { const s = rest('§FILEHINT'); if (s) out.fileHints.push(s); }
      else if (line.startsWith('§OPENQ')) { const s = rest('§OPENQ'); if (s) out.openQuestions.push(s); }
      else if (line.startsWith('§OPTION')) { const s = rest('§OPTION'); if (s) out.options.push(s); }
      else if (line.startsWith('§QUESTION')) { block = 'question'; }
      else if (line.startsWith('§DELETE')) { const p = rest('§DELETE'); if (p) out.deletions.push(p); }
      else if (line.startsWith('§FILE')) { block = 'file'; filePath = rest('§FILE'); }
      else if (line.startsWith('§END')) { /* block already flushed */ }
      // unknown § marker: ignore
    } else if (block) {
      buf.push(line);
    }
  }
  flush();

  // If the model emitted §FILE blocks but no §ACTION, treat it as an edit/generation.
  if (out.action === 'none' && out.changes.length) out.action = 'edit';
  return out;
}
