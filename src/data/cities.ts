/**
 * A static fallback city list for location autocomplete. `autocompleteLocations`
 * (lib/places.ts) hits Foursquare and returns [] on any failure — including a
 * quota/key problem, which leaves the location picker with no suggestions at
 * all and no way for someone to actually pick a city. This list has no
 * external dependency, so typing "Las Vegas" always finds something to tap,
 * regardless of Foursquare's availability. Not exhaustive — major US cities
 * plus a handful of large international ones.
 */
export interface City {
  label: string;
  detail: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { label: 'New York, NY', detail: 'United States', lat: 40.7128, lng: -74.006 },
  { label: 'Los Angeles, CA', detail: 'United States', lat: 34.0522, lng: -118.2437 },
  { label: 'Chicago, IL', detail: 'United States', lat: 41.8781, lng: -87.6298 },
  { label: 'Houston, TX', detail: 'United States', lat: 29.7604, lng: -95.3698 },
  { label: 'Phoenix, AZ', detail: 'United States', lat: 33.4484, lng: -112.074 },
  { label: 'Philadelphia, PA', detail: 'United States', lat: 39.9526, lng: -75.1652 },
  { label: 'San Antonio, TX', detail: 'United States', lat: 29.4241, lng: -98.4936 },
  { label: 'San Diego, CA', detail: 'United States', lat: 32.7157, lng: -117.1611 },
  { label: 'Dallas, TX', detail: 'United States', lat: 32.7767, lng: -96.797 },
  { label: 'Austin, TX', detail: 'United States', lat: 30.2672, lng: -97.7431 },
  { label: 'San Jose, CA', detail: 'United States', lat: 37.3382, lng: -121.8863 },
  { label: 'Fort Worth, TX', detail: 'United States', lat: 32.7555, lng: -97.3308 },
  { label: 'Jacksonville, FL', detail: 'United States', lat: 30.3322, lng: -81.6557 },
  { label: 'San Francisco, CA', detail: 'United States', lat: 37.7749, lng: -122.4194 },
  { label: 'Columbus, OH', detail: 'United States', lat: 39.9612, lng: -82.9988 },
  { label: 'Charlotte, NC', detail: 'United States', lat: 35.2271, lng: -80.8431 },
  { label: 'Indianapolis, IN', detail: 'United States', lat: 39.7684, lng: -86.1581 },
  { label: 'Seattle, WA', detail: 'United States', lat: 47.6062, lng: -122.3321 },
  { label: 'Denver, CO', detail: 'United States', lat: 39.7392, lng: -104.9903 },
  { label: 'Washington, DC', detail: 'United States', lat: 38.9072, lng: -77.0369 },
  { label: 'Boston, MA', detail: 'United States', lat: 42.3601, lng: -71.0589 },
  { label: 'El Paso, TX', detail: 'United States', lat: 31.7619, lng: -106.485 },
  { label: 'Nashville, TN', detail: 'United States', lat: 36.1627, lng: -86.7816 },
  { label: 'Detroit, MI', detail: 'United States', lat: 42.3314, lng: -83.0458 },
  { label: 'Oklahoma City, OK', detail: 'United States', lat: 35.4676, lng: -97.5164 },
  { label: 'Portland, OR', detail: 'United States', lat: 45.5152, lng: -122.6784 },
  { label: 'Las Vegas, NV', detail: 'United States', lat: 36.1699, lng: -115.1398 },
  { label: 'Memphis, TN', detail: 'United States', lat: 35.1495, lng: -90.049 },
  { label: 'Louisville, KY', detail: 'United States', lat: 38.2527, lng: -85.7585 },
  { label: 'Baltimore, MD', detail: 'United States', lat: 39.2904, lng: -76.6122 },
  { label: 'Milwaukee, WI', detail: 'United States', lat: 43.0389, lng: -87.9065 },
  { label: 'Albuquerque, NM', detail: 'United States', lat: 35.0844, lng: -106.6504 },
  { label: 'Tucson, AZ', detail: 'United States', lat: 32.2226, lng: -110.9747 },
  { label: 'Fresno, CA', detail: 'United States', lat: 36.7378, lng: -119.7871 },
  { label: 'Sacramento, CA', detail: 'United States', lat: 38.5816, lng: -121.4944 },
  { label: 'Mesa, AZ', detail: 'United States', lat: 33.4152, lng: -111.8315 },
  { label: 'Atlanta, GA', detail: 'United States', lat: 33.749, lng: -84.388 },
  { label: 'Kansas City, MO', detail: 'United States', lat: 39.0997, lng: -94.5786 },
  { label: 'Colorado Springs, CO', detail: 'United States', lat: 38.8339, lng: -104.8214 },
  { label: 'Miami, FL', detail: 'United States', lat: 25.7617, lng: -80.1918 },
  { label: 'Raleigh, NC', detail: 'United States', lat: 35.7796, lng: -78.6382 },
  { label: 'Omaha, NE', detail: 'United States', lat: 41.2565, lng: -95.9345 },
  { label: 'Long Beach, CA', detail: 'United States', lat: 33.7701, lng: -118.1937 },
  { label: 'Virginia Beach, VA', detail: 'United States', lat: 36.8529, lng: -75.978 },
  { label: 'Oakland, CA', detail: 'United States', lat: 37.8044, lng: -122.2712 },
  { label: 'Minneapolis, MN', detail: 'United States', lat: 44.9778, lng: -93.265 },
  { label: 'Tulsa, OK', detail: 'United States', lat: 36.154, lng: -95.9928 },
  { label: 'Tampa, FL', detail: 'United States', lat: 27.9506, lng: -82.4572 },
  { label: 'Arlington, TX', detail: 'United States', lat: 32.7357, lng: -97.1081 },
  { label: 'New Orleans, LA', detail: 'United States', lat: 29.9511, lng: -90.0715 },
  { label: 'Wichita, KS', detail: 'United States', lat: 37.6872, lng: -97.3301 },
  { label: 'Cleveland, OH', detail: 'United States', lat: 41.4993, lng: -81.6944 },
  { label: 'Bakersfield, CA', detail: 'United States', lat: 35.3733, lng: -119.0187 },
  { label: 'Aurora, CO', detail: 'United States', lat: 39.7294, lng: -104.8319 },
  { label: 'Anaheim, CA', detail: 'United States', lat: 33.8366, lng: -117.9143 },
  { label: 'Honolulu, HI', detail: 'United States', lat: 21.3069, lng: -157.8583 },
  { label: 'Santa Ana, CA', detail: 'United States', lat: 33.7455, lng: -117.8677 },
  { label: 'Riverside, CA', detail: 'United States', lat: 33.9806, lng: -117.3755 },
  { label: 'Corpus Christi, TX', detail: 'United States', lat: 27.8006, lng: -97.3964 },
  { label: 'Lexington, KY', detail: 'United States', lat: 38.0406, lng: -84.5037 },
  { label: 'Stockton, CA', detail: 'United States', lat: 37.9577, lng: -121.2908 },
  { label: 'St. Louis, MO', detail: 'United States', lat: 38.627, lng: -90.1994 },
  { label: 'Saint Paul, MN', detail: 'United States', lat: 44.9537, lng: -93.09 },
  { label: 'Cincinnati, OH', detail: 'United States', lat: 39.1031, lng: -84.512 },
  { label: 'Pittsburgh, PA', detail: 'United States', lat: 40.4406, lng: -79.9959 },
  { label: 'Greensboro, NC', detail: 'United States', lat: 36.0726, lng: -79.792 },
  { label: 'Anchorage, AK', detail: 'United States', lat: 61.2181, lng: -149.9003 },
  { label: 'Plano, TX', detail: 'United States', lat: 33.0198, lng: -96.6989 },
  { label: 'Lincoln, NE', detail: 'United States', lat: 40.8136, lng: -96.7026 },
  { label: 'Orlando, FL', detail: 'United States', lat: 28.5383, lng: -81.3792 },
  { label: 'Irvine, CA', detail: 'United States', lat: 33.6846, lng: -117.8265 },
  { label: 'Newark, NJ', detail: 'United States', lat: 40.7357, lng: -74.1724 },
  { label: 'Durham, NC', detail: 'United States', lat: 35.994, lng: -78.8986 },
  { label: 'Chula Vista, CA', detail: 'United States', lat: 32.6401, lng: -117.0842 },
  { label: 'St. Petersburg, FL', detail: 'United States', lat: 27.7676, lng: -82.6403 },
  { label: 'Jersey City, NJ', detail: 'United States', lat: 40.7178, lng: -74.0431 },
  { label: 'Chandler, AZ', detail: 'United States', lat: 33.3062, lng: -111.8413 },
  { label: 'Madison, WI', detail: 'United States', lat: 43.0731, lng: -89.4012 },
  { label: 'Reno, NV', detail: 'United States', lat: 39.5296, lng: -119.8138 },
  { label: 'Buffalo, NY', detail: 'United States', lat: 42.8864, lng: -78.8784 },
  { label: 'Toledo, OH', detail: 'United States', lat: 41.6528, lng: -83.5379 },
  { label: 'Fort Lauderdale, FL', detail: 'United States', lat: 26.1224, lng: -80.1373 },
  { label: 'St. Paul, MN', detail: 'United States', lat: 44.9537, lng: -93.09 },
  { label: 'Boise, ID', detail: 'United States', lat: 43.615, lng: -116.2023 },
  { label: 'Richmond, VA', detail: 'United States', lat: 37.5407, lng: -77.436 },
  { label: 'Spokane, WA', detail: 'United States', lat: 47.6588, lng: -117.426 },
  { label: 'Baton Rouge, LA', detail: 'United States', lat: 30.4515, lng: -91.1871 },
  { label: 'Des Moines, IA', detail: 'United States', lat: 41.5868, lng: -93.625 },
  { label: 'Salt Lake City, UT', detail: 'United States', lat: 40.7608, lng: -111.891 },
  { label: 'Tacoma, WA', detail: 'United States', lat: 47.2529, lng: -122.4443 },
  { label: 'Providence, RI', detail: 'United States', lat: 41.824, lng: -71.4128 },
  { label: 'Fort Wayne, IN', detail: 'United States', lat: 41.0793, lng: -85.1394 },
  { label: 'Chesapeake, VA', detail: 'United States', lat: 36.7682, lng: -76.2875 },
  { label: 'Modesto, CA', detail: 'United States', lat: 37.6391, lng: -120.9969 },
  { label: 'Grand Rapids, MI', detail: 'United States', lat: 42.9634, lng: -85.6681 },
  { label: 'Huntsville, AL', detail: 'United States', lat: 34.7304, lng: -86.5861 },
  { label: 'Tallahassee, FL', detail: 'United States', lat: 30.4383, lng: -84.2807 },
  { label: 'Worcester, MA', detail: 'United States', lat: 42.2626, lng: -71.8023 },
  { label: 'Knoxville, TN', detail: 'United States', lat: 35.9606, lng: -83.9207 },
  { label: 'Newport News, VA', detail: 'United States', lat: 37.0871, lng: -76.4730 },
  { label: 'Brownsville, TX', detail: 'United States', lat: 25.9018, lng: -97.4975 },
  { label: 'Overland Park, KS', detail: 'United States', lat: 38.9822, lng: -94.6708 },
  { label: 'Santa Rosa, CA', detail: 'United States', lat: 38.4404, lng: -122.7141 },
  { label: 'Providence, RI', detail: 'United States', lat: 41.8240, lng: -71.4128 },
  { label: 'Ann Arbor, MI', detail: 'United States', lat: 42.2808, lng: -83.743 },
  { label: 'Charleston, SC', detail: 'United States', lat: 32.7765, lng: -79.9311 },
  { label: 'Savannah, GA', detail: 'United States', lat: 32.0809, lng: -81.0912 },
  { label: 'Naples, FL', detail: 'United States', lat: 26.1420, lng: -81.7948 },
  { label: 'Napa, CA', detail: 'United States', lat: 38.2975, lng: -122.2869 },
  { label: 'Aspen, CO', detail: 'United States', lat: 39.1911, lng: -106.8175 },
  { label: 'Toronto', detail: 'Canada', lat: 43.6532, lng: -79.3832 },
  { label: 'Vancouver', detail: 'Canada', lat: 49.2827, lng: -123.1207 },
  { label: 'Montreal', detail: 'Canada', lat: 45.5019, lng: -73.5674 },
  { label: 'Mexico City', detail: 'Mexico', lat: 19.4326, lng: -99.1332 },
  { label: 'London', detail: 'United Kingdom', lat: 51.5072, lng: -0.1276 },
  { label: 'Paris', detail: 'France', lat: 48.8566, lng: 2.3522 },
  { label: 'Rome', detail: 'Italy', lat: 41.9028, lng: 12.4964 },
  { label: 'Tokyo', detail: 'Japan', lat: 35.6762, lng: 139.6503 },
  { label: 'Sydney', detail: 'Australia', lat: -33.8688, lng: 151.2093 },
  { label: 'Dubai', detail: 'United Arab Emirates', lat: 25.2048, lng: 55.2708 },
];

/** Prefix-first substring match on `label`, case-insensitive. */
export function searchCities(query: string, limit = 6): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: City[] = [];
  const includes: City[] = [];
  for (const c of CITIES) {
    const label = c.label.toLowerCase();
    if (label.startsWith(q)) starts.push(c);
    else if (label.includes(q)) includes.push(c);
  }
  return [...starts, ...includes].slice(0, limit);
}
