// src/lib/garvis/usCities.ts
// The geography for a NATIONAL sweep — a curated list of major US cities (ordered roughly by
// population, all 50 states + DC represented) so "find roofers across the country" fans a real
// per-city Google search over a sane, bounded set. Pure data (verified by nationalSweep.verify.ts).
// This is NOT "every business in America" — it's the cities to sweep a niche across; the cap keeps
// the search cost honest (one Serper search per city).

export type UsRegion = 'Northeast' | 'Midwest' | 'South' | 'West';
export interface UsCity { city: string; state: string; region: UsRegion }

const C = (city: string, state: string, region: UsRegion): UsCity => ({ city, state, region });

/** Ordered by population (biggest first) so "top N cities" means the N largest markets. */
export const US_CITIES: UsCity[] = [
  C('New York', 'NY', 'Northeast'), C('Los Angeles', 'CA', 'West'), C('Chicago', 'IL', 'Midwest'),
  C('Houston', 'TX', 'South'), C('Phoenix', 'AZ', 'West'), C('Philadelphia', 'PA', 'Northeast'),
  C('San Antonio', 'TX', 'South'), C('San Diego', 'CA', 'West'), C('Dallas', 'TX', 'South'),
  C('Jacksonville', 'FL', 'South'), C('Austin', 'TX', 'South'), C('Fort Worth', 'TX', 'South'),
  C('San Jose', 'CA', 'West'), C('Columbus', 'OH', 'Midwest'), C('Charlotte', 'NC', 'South'),
  C('Indianapolis', 'IN', 'Midwest'), C('San Francisco', 'CA', 'West'), C('Seattle', 'WA', 'West'),
  C('Denver', 'CO', 'West'), C('Oklahoma City', 'OK', 'South'), C('Nashville', 'TN', 'South'),
  C('Washington', 'DC', 'South'), C('El Paso', 'TX', 'South'), C('Las Vegas', 'NV', 'West'),
  C('Boston', 'MA', 'Northeast'), C('Detroit', 'MI', 'Midwest'), C('Portland', 'OR', 'West'),
  C('Louisville', 'KY', 'South'), C('Memphis', 'TN', 'South'), C('Baltimore', 'MD', 'South'),
  C('Milwaukee', 'WI', 'Midwest'), C('Albuquerque', 'NM', 'West'), C('Tucson', 'AZ', 'West'),
  C('Fresno', 'CA', 'West'), C('Sacramento', 'CA', 'West'), C('Kansas City', 'MO', 'Midwest'),
  C('Mesa', 'AZ', 'West'), C('Atlanta', 'GA', 'South'), C('Omaha', 'NE', 'Midwest'),
  C('Colorado Springs', 'CO', 'West'), C('Raleigh', 'NC', 'South'), C('Virginia Beach', 'VA', 'South'),
  C('Long Beach', 'CA', 'West'), C('Miami', 'FL', 'South'), C('Oakland', 'CA', 'West'),
  C('Minneapolis', 'MN', 'Midwest'), C('Tulsa', 'OK', 'South'), C('Bakersfield', 'CA', 'West'),
  C('Wichita', 'KS', 'Midwest'), C('Arlington', 'TX', 'South'), C('Aurora', 'CO', 'West'),
  C('Tampa', 'FL', 'South'), C('New Orleans', 'LA', 'South'), C('Cleveland', 'OH', 'Midwest'),
  C('Honolulu', 'HI', 'West'), C('Anaheim', 'CA', 'West'), C('Lexington', 'KY', 'South'),
  C('Stockton', 'CA', 'West'), C('Corpus Christi', 'TX', 'South'), C('Henderson', 'NV', 'West'),
  C('Riverside', 'CA', 'West'), C('Newark', 'NJ', 'Northeast'), C('Saint Paul', 'MN', 'Midwest'),
  C('Santa Ana', 'CA', 'West'), C('Cincinnati', 'OH', 'Midwest'), C('Irvine', 'CA', 'West'),
  C('Orlando', 'FL', 'South'), C('Pittsburgh', 'PA', 'Northeast'), C('St. Louis', 'MO', 'Midwest'),
  C('Greensboro', 'NC', 'South'), C('Jersey City', 'NJ', 'Northeast'), C('Anchorage', 'AK', 'West'),
  C('Lincoln', 'NE', 'Midwest'), C('Plano', 'TX', 'South'), C('Durham', 'NC', 'South'),
  C('Buffalo', 'NY', 'Northeast'), C('Chandler', 'AZ', 'West'), C('Chula Vista', 'CA', 'West'),
  C('Toledo', 'OH', 'Midwest'), C('Madison', 'WI', 'Midwest'), C('Gilbert', 'AZ', 'West'),
  C('Reno', 'NV', 'West'), C('Fort Wayne', 'IN', 'Midwest'), C('St. Petersburg', 'FL', 'South'),
  C('Lubbock', 'TX', 'South'), C('Irving', 'TX', 'South'), C('Winston-Salem', 'NC', 'South'),
  C('Chesapeake', 'VA', 'South'), C('Glendale', 'AZ', 'West'), C('Scottsdale', 'AZ', 'West'),
  C('Norfolk', 'VA', 'South'), C('Boise', 'ID', 'West'), C('Richmond', 'VA', 'South'),
  C('Spokane', 'WA', 'West'), C('Baton Rouge', 'LA', 'South'), C('Tacoma', 'WA', 'West'),
  C('Des Moines', 'IA', 'Midwest'), C('Birmingham', 'AL', 'South'),
  // State-coverage fillers so a by-state sweep works for all 50 states + DC.
  C('Salt Lake City', 'UT', 'West'), C('Providence', 'RI', 'Northeast'), C('Hartford', 'CT', 'Northeast'),
  C('Charleston', 'SC', 'South'), C('Columbia', 'SC', 'South'), C('Little Rock', 'AR', 'South'),
  C('Jackson', 'MS', 'South'), C('Manchester', 'NH', 'Northeast'), C('Portland', 'ME', 'Northeast'),
  C('Burlington', 'VT', 'Northeast'), C('Wilmington', 'DE', 'South'), C('Charleston', 'WV', 'South'),
  C('Fargo', 'ND', 'Midwest'), C('Sioux Falls', 'SD', 'Midwest'), C('Billings', 'MT', 'West'),
  C('Cheyenne', 'WY', 'West'),
];

export type SweepScope =
  | { mode: 'topN'; n: number }
  | { mode: 'state'; state: string }
  | { mode: 'region'; region: UsRegion };

/** The cities a scope selects. topN takes the N largest markets; state/region filter. */
export function citiesFor(scope: SweepScope): UsCity[] {
  if (scope.mode === 'topN') return US_CITIES.slice(0, Math.max(1, Math.min(scope.n, US_CITIES.length)));
  if (scope.mode === 'state') return US_CITIES.filter((c) => c.state === scope.state);
  return US_CITIES.filter((c) => c.region === scope.region);
}

/** Sorted unique state codes present in the dataset (for a state picker). */
export const US_STATES: string[] = [...new Set(US_CITIES.map((c) => c.state))].sort();
