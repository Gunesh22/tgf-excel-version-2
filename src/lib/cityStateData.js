/**
 * City & State API Engine
 * 100% Dynamic - Free OpenStreetMap Nominatim API Integration
 * No hardcoded city arrays.
 */

// In-memory cache for API queries to prevent duplicate network calls
const apiCache = new Map();

/**
 * Free Public API City Search (OpenStreetMap Nominatim API)
 * @param {string} query Search input
 * @param {AbortSignal} [signal] Optional cancellation signal
 * @returns {Promise<Array<{city: string, state: string}>>}
 */
export const searchCities = async (query, signal = null) => {
  if (!query || typeof query !== "string") return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  if (apiCache.has(q)) {
    return apiCache.get(q);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&countrycodes=in`;
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "TGF-CallCenter-App/1.0"
      },
      signal
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const results = [];
    const seen = new Set();

    data.forEach(item => {
      const addr = item.address || {};
      const cityName = addr.city || addr.town || addr.municipality || addr.village || addr.county || item.name;
      const stateName = addr.state || addr.state_district || addr.region || "";

      if (cityName && stateName) {
        const cleanCity = cityName.trim();
        const cleanState = stateName.trim();
        const key = `${cleanCity.toLowerCase()}_${cleanState.toLowerCase()}`;

        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            city: cleanCity,
            state: cleanState
          });
        }
      }
    });

    apiCache.set(q, results);
    return results;
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn("City API lookup error:", err);
    }
    return [];
  }
};

/**
 * Fetch state for a city dynamically via Free API
 * @param {string} cityName
 * @returns {Promise<string|null>}
 */
export const getStateForCity = async (cityName) => {
  if (!cityName || typeof cityName !== "string") return null;
  const q = cityName.trim().toLowerCase();

  const apiResults = await searchCities(cityName);
  const match = apiResults.find(r => r.city.toLowerCase() === q) || apiResults[0];
  return match ? match.state : null;
};
