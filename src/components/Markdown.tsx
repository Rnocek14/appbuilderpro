import { marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';
import { cn } from '../lib/utils';

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Custom fenced-code rendering: syntax highlighting (highlight.js) + a header bar showing the
// language and a Copy button. For an app builder, code is the main payload — this is the single
// biggest lever for "output looks finished". The Copy button carries no handler here (this is an
// HTML string); the <Markdown> wrapper delegates the click and reads the block's text.
marked.use({
  renderer: {
    code({ text, lang }: Tokens.Code): string {
      const language = (lang ?? '').trim().split(/\s+/)[0];
      let body: string;
      let shown = language;
      try {
        if (language && hljs.getLanguage(language)) {
          body = hljs.highlight(text, { language }).value;
        } else {
          const auto = hljs.highlightAuto(text);
          body = auto.value;
          shown = shown || auto.language || '';
        }
      } catch {
        body = escapeHtml(text);
      }
      return (
        `<div class="ff-code my-2 overflow-hidden rounded-lg border border-forge-border">` +
        `<div class="ff-code-bar flex items-center justify-between border-b border-forge-border bg-forge-raised px-3 py-1">` +
        `<span class="font-mono text-[10px] uppercase tracking-wide text-forge-dim">${escapeHtml(shown || 'text')}</span>` +
        `<button type="button" class="ff-code-copy rounded px-1.5 py-0.5 text-[10px] text-forge-dim transition-colors hover:bg-forge-panel hover:text-forge-ink">Copy</button>` +
        `</div>` +
        `<pre class="!m-0 !rounded-none !bg-transparent !p-0 max-h-[420px] overflow-auto"><code class="hljs language-${escapeHtml(shown)}">${body}</code></pre>` +
        `</div>`
      );
    },
  },
});

// Forge-themed prose styling for rendered markdown (headings, tables, lists, inline code, links).
// Fenced code blocks are handled by the custom renderer above (.ff-code) + the hljs theme.
const PROSE = cn(
  'text-sm leading-relaxed text-forge-ink max-w-full overflow-x-auto',
  '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1',
  '[&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_p]:my-1.5',
  '[&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc',
  '[&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal',
  '[&_li]:my-0.5',
  '[&_strong]:font-semibold [&_strong]:text-forge-ink',
  '[&_em]:italic',
  '[&_a]:text-forge-ember [&_a]:underline [&_a]:break-words',
  // inline code only — fenced blocks live inside .ff-code and opt out of this padding/background.
  '[&_code:not(.hljs)]:rounded [&_code:not(.hljs)]:bg-forge-panel [&_code:not(.hljs)]:px-1 [&_code:not(.hljs)]:py-0.5 [&_code:not(.hljs)]:font-mono [&_code:not(.hljs)]:text-[12px]',
  '[&_hr]:my-3 [&_hr]:border-forge-border',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-forge-border [&_blockquote]:pl-3 [&_blockquote]:text-forge-dim [&_blockquote]:my-2',
  '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]',
  '[&_th]:border [&_th]:border-forge-border [&_th]:bg-forge-panel [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-forge-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
);

/** Copy the code from a clicked ".ff-code-copy" button (delegated — the HTML is injected). */
function handleCopyClick(e: React.MouseEvent<HTMLDivElement>) {
  const btn = (e.target as HTMLElement).closest('.ff-code-copy');
  if (!btn) return;
  const code = btn.closest('.ff-code')?.querySelector('pre code')?.textContent ?? '';
  if (!code) return;
  void navigator.clipboard?.writeText(code);
  const prev = btn.textContent;
  btn.textContent = 'Copied!';
  window.setTimeout(() => { btn.textContent = prev ?? 'Copy'; }, 1500);
}

/** Render model markdown (research/discuss answers, assistant replies) as themed, sanitized HTML. */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const raw = marked.parse(content, { async: false }) as string;
  const html = DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
  return <div className={cn(PROSE, className)} onClick={handleCopyClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
