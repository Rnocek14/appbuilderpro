// supabase/functions/_shared/esignCore.ts
// ONE implementation of the e-signature core, shared by docusign-send / docusign-webhook and the
// client studio (the batchCore precedent). Pure: no Deno, no DOM, no Supabase. Verified by
// src/lib/garvis/esign.verify.ts.
//
// Honesty contract (the deliverable-studio rule, applied to paperwork): a merge NEVER invents a
// value — an unresolved {{token}} becomes a visible "[needs your input: token]" hole and is listed
// in gaps, and decideSendable REFUSES to queue a document that still has holes. Status maps return
// null for states they don't recognize — an unknown provider status is unknown, never guessed.
// Legal-scope honesty: this signs documents the OPERATOR authors (letters, agreements). It does not
// fill state-mandated forms; the UI must never imply it does.

export interface EsignRecipient {
  name: string;
  email: string;
  status?: string;    // sent | delivered | signed | declined (mapped from the provider)
  signedAt?: string;
}

export interface MergeResult { body: string; gaps: string[] }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_ ]+?)\s*\}\}/g;

/** Every distinct {{token}} in a template, in first-appearance order. */
export function templateTokens(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of template.matchAll(TOKEN_RE)) {
    const t = m[1].trim();
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

/** Merge fields into the template. Empty/missing values become VISIBLE holes + gaps entries. */
export function mergePaperwork(template: string, fields: Record<string, string>): MergeResult {
  const gaps = new Set<string>();
  const body = template.replace(TOKEN_RE, (_all, raw: string) => {
    const token = String(raw).trim();
    const v = (fields[token] ?? '').trim();
    if (v) return v;
    gaps.add(token);
    return `[needs your input: ${token}]`;
  });
  return { body, gaps: [...gaps] };
}

/** The refusal gate, re-checked SERVER-SIDE before any envelope is created. */
export function decideSendable(merged: MergeResult, recipients: EsignRecipient[]): { ok: boolean; reason: string | null } {
  if (merged.gaps.length > 0) {
    return { ok: false, reason: `Unfilled fields: ${merged.gaps.join(', ')} — fill them before sending; nothing is ever invented.` };
  }
  if (merged.body.includes('[needs your input:')) {
    return { ok: false, reason: 'The document still contains unfilled holes.' };
  }
  if (recipients.length === 0) return { ok: false, reason: 'Add at least one signer.' };
  const bad = recipients.find((r) => !EMAIL_RE.test((r.email ?? '').trim()));
  if (bad) return { ok: false, reason: `Signer "${bad.name || bad.email || '?'}" has no valid email.` };
  if (!merged.body.trim()) return { ok: false, reason: 'The document is empty.' };
  return { ok: true, reason: null };
}

/** Chunked base64 — the lakegen send crashed on multi-hundred-KB files because
 *  String.fromCharCode(...spread) blows the arg limit. This never spreads. */
export function chunkedBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    let part = '';
    for (let j = 0; j < slice.length; j++) part += String.fromCharCode(slice[j]);
    bin += part;
  }
  // btoa exists in both Deno and browsers.
  return btoa(bin);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Printable HTML for the signed document. Neutral shell, the operator's own words only — no
 *  invented branding or identity. Appends one signature block per signer with anchor strings
 *  (/sig1/, /date1/, …) rendered white so DocuSign places tabs exactly there. */
export function docHtml(input: { title: string; body: string; signers: EsignRecipient[]; fromLine?: string | null }): string {
  const paras = input.body.split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
  const sigBlocks = input.signers.map((s, i) => `
    <div style="margin-top:28px; border-top:1px solid #999; padding-top:8px;">
      <p>Signature (${escapeHtml(s.name || s.email)}): <span style="color:#ffffff">/sig${i + 1}/</span></p>
      <p>Date: <span style="color:#ffffff">/date${i + 1}/</span></p>
    </div>`).join('\n');
  return `<html><body style="font-family: Georgia, serif; font-size: 12pt; line-height: 1.55; margin: 48px; color: #111;">
<h1 style="font-size:16pt;">${escapeHtml(input.title)}</h1>
${paras}
${input.fromLine ? `<p style="margin-top:20px;">${escapeHtml(input.fromLine)}</p>` : ''}
${sigBlocks}
</body></html>`;
}

/** The DocuSign envelope request. Anchors are guaranteed because WE generated the document. */
export function envelopeRequest(input: {
  title: string; docBase64: string; signers: EsignRecipient[]; webhookUrl?: string | null;
}): Record<string, unknown> {
  const req: Record<string, unknown> = {
    emailSubject: `Please sign: ${input.title}`.slice(0, 100),
    documents: [{ documentBase64: input.docBase64, name: input.title.slice(0, 100) || 'Document', fileExtension: 'html', documentId: '1' }],
    recipients: {
      signers: input.signers.map((s, i) => ({
        email: s.email.trim(), name: (s.name || s.email).trim(), recipientId: String(i + 1), routingOrder: String(i + 1),
        tabs: {
          signHereTabs: [{ anchorString: `/sig${i + 1}/`, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }],
          dateSignedTabs: [{ anchorString: `/date${i + 1}/`, anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }],
        },
      })),
    },
    status: 'sent',
  };
  if (input.webhookUrl) {
    req.eventNotification = {
      url: input.webhookUrl, loggingEnabled: 'true', requireAcknowledgment: 'true',
      envelopeEvents: ['sent', 'delivered', 'completed', 'declined', 'voided'].map((e) => ({ envelopeEventStatusCode: e })),
      eventData: { version: 'restv2.1', format: 'json' },
    };
  }
  return req;
}

/** Envelope status map (harvested from the lakegen webhook, verified). Unknown → null, never guessed. */
export function mapDocusignStatus(s: string): 'sent' | 'delivered' | 'completed' | 'declined' | 'voided' | null {
  const v = s.trim().toLowerCase().replace(/^envelope-/, '');
  if (v === 'sent') return 'sent';
  if (v === 'delivered') return 'delivered';
  if (v === 'completed') return 'completed';
  if (v === 'declined') return 'declined';
  if (v === 'voided') return 'voided';
  return null;
}

/** Recipient status map. Unknown → null. */
export function mapRecipientStatus(s: string): 'sent' | 'delivered' | 'signed' | 'declined' | null {
  const v = s.trim().toLowerCase();
  if (v === 'sent') return 'sent';
  if (v === 'delivered') return 'delivered';
  if (v === 'completed' || v === 'signed') return 'signed';
  if (v === 'declined') return 'declined';
  return null;
}
