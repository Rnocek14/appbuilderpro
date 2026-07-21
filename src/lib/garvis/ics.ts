// src/lib/garvis/ics.ts — re-export of the shared pure ICS core (the calendar sense), so client
// code and the verify suite consume the exact functions garvis-pulse runs. One implementation.
export { parseIcsEvents, calendarLine, type IcsEvent } from '../../../supabase/functions/_shared/icsCore';
