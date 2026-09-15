// supabase/functions/_shared/publishGate.ts
// THE BROKERAGE LINE PUBLISHES WITH THE POST, OR THE POST DOES NOT PUBLISH.
// Pure: no Deno, no DOM, no Supabase. Verified by src/lib/garvis/publishGate.verify.ts.
//
// brand_kits.compliance_line reaches the printed postcard back (FarmPanel, Postcard) and is handed to
// the chat prompts as context — but it is never rendered into a social caption or an email body, and
// nothing blocks a send when it is missing. CAN-SPAM's physical address IS enforced in send-email.
// For a licensed agent that is the wrong way round: the caption is exactly where the brokerage line
// is required.
//
// Same shape as disclosureGate(): return a named reason, or null to proceed. Fails CLOSED only when
// a compliance line is configured — an operator with none set is not blocked by a rule they never had.

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Is the required line actually present in the text? Whitespace- and case-insensitive. */
export function carriesCompliance(text: string, line: string | null | undefined): boolean {
  const required = norm(line ?? '');
  if (!required) return true;                 // nothing required
  return norm(text ?? '').includes(required);
}

/** The gate. Null = publish. A string = refuse, and say why in the operator's words. */
export function complianceGate(text: string, line: string | null | undefined): string | null {
  if (!norm(line ?? '')) return null;
  if (carriesCompliance(text, line)) return null;
  return `This post is missing the brokerage line ("${(line ?? '').trim()}") — add it to the caption before publishing.`;
}

/** Append it once, at the end, if it is missing. The withDisclosure() precedent. */
export function withCompliance(text: string, line: string | null | undefined): string {
  const required = (line ?? '').trim();
  if (!required || carriesCompliance(text, required)) return text ?? '';
  const t = (text ?? '').trim();
  return `${t}${t ? '\n\n' : ''}${required}`;
}
