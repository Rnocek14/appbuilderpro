// src/components/garvis/approvalMeta.ts
// ONE vocabulary for approval kinds — the Approvals ledger and the Inbox Decisions lane must name
// the same decision the same way (flow audit: the lane showed raw snake_case while the ledger had
// icons + labels).

import { Mail, Users, Globe, Rocket, CreditCard, Database, FileSignature } from 'lucide-react';
import type { ApprovalKind } from '../../lib/garvis/execution';

export const KIND_META: Record<ApprovalKind, { icon: typeof Mail; label: string }> = {
  send_email: { icon: Mail, label: 'Send email' },
  publish_post: { icon: Users, label: 'Publish post' },
  deploy_site: { icon: Globe, label: 'Deploy site' },
  deploy_backend: { icon: Rocket, label: 'Deploy backend' },
  spend: { icon: CreditCard, label: 'Spend' },
  apply_migration: { icon: Database, label: 'Apply migration' },
  crm_action: { icon: Users, label: 'CRM action' },
  send_batch: { icon: Mail, label: 'Send batch' },
  send_for_signature: { icon: FileSignature, label: 'Send for signature' },
};
