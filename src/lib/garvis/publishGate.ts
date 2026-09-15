// src/lib/garvis/publishGate.ts
// Client re-export of the ONE brokerage-compliance gate (supabase/functions/_shared/publishGate.ts),
// shared with social-publish's fail-closed send-time check. Verified by publishGate.verify.ts.

export {
  carriesCompliance, complianceGate, withCompliance,
} from '../../../supabase/functions/_shared/publishGate';
