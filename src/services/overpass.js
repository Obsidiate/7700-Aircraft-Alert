// Generates suggested link groups from user location — no external API required.
// Tracking sites accept lat/lon directly in their URLs.

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function buildSuggestedGroups(homeLat, homeLon, homeLabel, _radiusM, acLat, acLon) {
  const la = parseFloat(homeLat).toFixed(4)
  const lo = parseFloat(homeLon).toFixed(4)

  const groups = []

  // Tracking sites — centred on home location
  groups.push({
    heading: `LIVE TRACKING — ${homeLabel}`,
    links: [
      { label: 'Flightradar24', url: `https://www.flightradar24.com/${la},${lo}/9` },
      { label: 'ADS-B Exchange', url: `https://globe.adsbexchange.com/?lat=${la}&lon=${lo}&zoom=9` },
      { label: 'FlightAware', url: `https://flightaware.com/live/map/` },
      { label: 'Plane Finder', url: `https://planefinder.net/` },
    ],
  })

  // If there's an emergency aircraft with a different position, add tracking centred on it
  if (acLat != null && acLon != null) {
    const acLaStr = parseFloat(acLat).toFixed(4)
    const acLoStr = parseFloat(acLon).toFixed(4)
    groups.push({
      heading: 'TRACKING — EMERGENCY AIRCRAFT POSITION',
      emergency: true,
      links: [
        { label: 'Flightradar24 (aircraft area)', url: `https://www.flightradar24.com/${acLaStr},${acLoStr}/10` },
        { label: 'ADS-B Exchange (aircraft area)', url: `https://globe.adsbexchange.com/?lat=${acLaStr}&lon=${acLoStr}&zoom=10` },
      ],
    })
  }

  // ATC audio
  groups.push({
    heading: 'ATC AUDIO',
    links: [
      { label: 'LiveATC — Search by airport', url: 'https://www.liveatc.net/search/' },
      { label: 'LiveATC — Top 50 feeds', url: 'https://www.liveatc.net/topfeeds.php' },
      { label: 'OpenSky Network', url: 'https://opensky-network.org/' },
    ],
  })

  // Investigation tools
  groups.push({
    heading: 'INVESTIGATION & DATA',
    links: [
      { label: 'Airframes.io — ACARS decoder', url: 'https://app.airframes.io/' },
      { label: 'ADS-B Exchange — Aircraft lookup', url: 'https://www.adsbexchange.com/data/' },
      { label: 'FlightAware — Flight search', url: 'https://flightaware.com/live/' },
      { label: 'Skyvector — IFR charts', url: 'https://skyvector.com/' },
      { label: 'Our Airports — Airport database', url: 'https://ourairports.com/airports/' },
    ],
  })

  return Promise.resolve(groups)
}
