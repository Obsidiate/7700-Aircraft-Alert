const APIS = {
  'airplanes.live': {
    byRadius: (lat, lon, dist) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${dist}`,
    name: 'airplanes.live',
  },
  'adsb.fi': {
    byRadius: (lat, lon, dist) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
    name: 'adsb.fi',
  },
}

const FALLBACK_ORDER = ['airplanes.live', 'adsb.fi']

let pollerTimer = null
let seenSquawks = new Map() // hex -> squawk, to avoid re-alerting same aircraft

async function fetchAircraft(settings) {
  const { location, radius, preferredApi } = settings
  const { lat, lon } = location

  const apiOrder = [preferredApi, ...FALLBACK_ORDER.filter(a => a !== preferredApi)]

  for (const apiKey of apiOrder) {
    const api = APIS[apiKey]
    if (!api) continue

    try {
      const url = api.byRadius(lat, lon, radius)
      const res = await fetch(url, {
        headers: { 'User-Agent': '7700/0.1 (emergency monitor; contact via github)' },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const aircraft = data.ac || data.aircraft || []
      console.log(`[7700] Polled ${api.name}: ${aircraft.length} aircraft in range`)
      return aircraft
    } catch (err) {
      console.warn(`[7700] API ${apiKey} failed: ${err.message}`)
    }
  }

  throw new Error('All APIs failed')
}

function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065 // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function poll(settings, onAlert, onUpdate) {
  const { squawkFilters, location } = settings

  try {
    const aircraft = await fetchAircraft(settings)

    // Filter for emergency squawks
    const emergencies = aircraft.filter(ac => {
      const squawk = ac.squawk || ac.sqk
      return squawk && squawkFilters.includes(String(squawk))
    })

    // Enrich with distance
    const enriched = emergencies.map(ac => {
      const lat = ac.lat
      const lon = ac.lon
      const dist = (lat && lon)
        ? Math.round(haversineNm(location.lat, location.lon, lat, lon))
        : null
      return { ...ac, squawk: ac.squawk || ac.sqk, distanceNm: dist }
    })

    // Fire alerts for new squawks (not seen before, or squawk changed)
    for (const ac of enriched) {
      const key = ac.hex
      const prev = seenSquawks.get(key)
      if (prev !== ac.squawk) {
        seenSquawks.set(key, ac.squawk)
        onAlert(ac)
      }
    }

    // Clean up aircraft that are no longer squawking emergency
    const currentHexes = new Set(enriched.map(ac => ac.hex))
    for (const [hex] of seenSquawks) {
      if (!currentHexes.has(hex)) seenSquawks.delete(hex)
    }

    // Send all aircraft in range (not just emergencies) for the dashboard
    const allEnriched = aircraft.map(ac => {
      const lat = ac.lat
      const lon = ac.lon
      const dist = (lat && lon)
        ? Math.round(haversineNm(location.lat, location.lon, lat, lon))
        : null
      return { ...ac, squawk: ac.squawk || ac.sqk, distanceNm: dist }
    })

    onUpdate(allEnriched)
  } catch (err) {
    console.error('[7700] Poll error:', err.message)
    onUpdate([])
  }
}

function startPoller(settings, onAlert, onUpdate) {
  if (pollerTimer) clearInterval(pollerTimer)

  const intervalMs = (settings.pollInterval || 30) * 1000

  // Poll immediately
  poll(settings, onAlert, onUpdate)

  // Then on interval
  pollerTimer = setInterval(() => poll(settings, onAlert, onUpdate), intervalMs)
  console.log(`[7700] Poller started — every ${settings.pollInterval}s, radius ${settings.radius}nm`)
}

function stopPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer)
    pollerTimer = null
    console.log('[7700] Poller stopped')
  }
}

module.exports = { startPoller, stopPoller }
