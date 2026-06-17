import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { cn } from '../lib/utils';

marked.setOptions({ gfm: true, breaks: true });

// Forge-themed prose styling for rendered markdown (headings, tables, lists, code, links).
// Tables get borders + horizontal scroll so the wide research comparison tables stay readable.
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
  '[&_code]:rounded [&_code]:bg-forge-panel [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]',
  '[&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:bg-forge-panel [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_hr]:my-3 [&_hr]:border-forge-border',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-forge-border [&_blockquote]:pl-3 [&_blockquote]:text-forge-dim [&_blockquote]:my-2',
  '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]',
  '[&_th]:border [&_th]:border-forge-border [&_th]:bg-forge-panel [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-forge-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
);

/** Render model markdown (research/discuss answers) as themed, sanitized HTML. */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const raw = marked.parse(content, { async: false }) as string;
  const html = DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] });
  return <div className={cn(PROSE, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
