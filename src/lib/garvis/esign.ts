// src/lib/garvis/esign.ts
// Client-side re-export of the ONE e-signature core (supabase/functions/_shared/esignCore.ts),
// shared with docusign-send / docusign-webhook — the batchCore precedent. Impure half: esignRun.ts.

export {
  templateTokens, mergePaperwork, decideSendable, chunkedBase64,
  docHtml, envelopeRequest, mapDocusignStatus, mapRecipientStatus,
  type EsignRecipient, type MergeResult,
} from '../../../supabase/functions/_shared/esignCore';
