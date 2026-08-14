// Client-side re-export of the canonical quality bar (house pattern: shared logic lives in
// supabase/functions/_shared, the client re-exports). Import from here in src/.
export { QUALITY_BAR, holdsBar } from '../../../supabase/functions/_shared/qualityCore';
