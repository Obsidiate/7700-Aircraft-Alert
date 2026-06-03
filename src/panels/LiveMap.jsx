import { useEffect, useRef, useCallback, useState } from 'react'
import './LiveMap.css'

// Leaflet must be imported after CSS
// We do a dynamic import to avoid SSR issues and ensure CSS loads first
let L = null

const EMERGENCY_SQUAWKS = new Set(['7700', '7600', '7500', '7400'])

const SQUAWK_META = {
  '7700': { label: 'EMERGENCY',     color: '#e03030' },
  '7600': { label: 'RADIO FAILURE', color: '#e09020' },
  '7500': { label: 'HIJACK',        color: '#d020e0' },
  '7400': { label: 'DRONE LINK',    color: '#2090e0' },
}

// Dark OSM tile options — all free, no API key needed
const TILE_LAYERS = {
  dark: {
    label: 'Dark (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  osm: {
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
  },
  topo: {
    label: 'Topo (OpenTopoMap)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    subdomains: 'abc',
    maxZoom: 17,
  },
}

// SVG aircraft icon — returns an L.divIcon
function makeAircraftIcon(heading, isEmergency, squawk, isSelected, accentColor = '#20c060') {
  const color = isEmergency ? (SQUAWK_META[String(squawk)]?.color || '#e03030') : accentColor
  const size = isEmergency ? 22 : 16
  const pulse = isEmergency ? `
    <circle cx="11" cy="11" r="14" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5">
      <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite"/>
    </circle>` : ''

  const selectedRing = isSelected ? `<circle cx="11" cy="11" r="12" fill="none" stroke="#20c0d0" stroke-width="1.5" opacity="0.8"/>` : ''

  // Plane silhouette rotated to heading
  const svg = `
    <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"
         style="transform: rotate(${heading || 0}deg); transform-origin: center; overflow: visible;">
      ${pulse}
      ${selectedRing}
      <g transform="translate(11,11)">
        <!-- fuselage -->
        <ellipse rx="2" ry="7" fill="${color}" opacity="0.95"/>
        <!-- wings -->
        <polygon points="-7,2 7,2 3,-1 -3,-1" fill="${color}" opacity="0.85"/>
        <!-- tail -->
        <polygon points="-3,5 3,5 1,3 -1,3" fill="${color}" opacity="0.75"/>
        <!-- nose dot -->
        <circle cy="-6" r="1.5" fill="${color}"/>
      </g>
    </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  })
}

// Home marker icon
function makeHomeIcon(accentColor = '#20c060') {
  const c = accentColor
  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4"/>
      <circle cx="12" cy="12" r="5"  fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
      <circle cx="12" cy="12" r="2"  fill="${c}"/>
      <line x1="12" y1="2"  x2="12" y2="6"  stroke="${c}" stroke-width="1.5"/>
      <line x1="12" y1="18" x2="12" y2="22" stroke="${c}" stroke-width="1.5"/>
      <line x1="2"  y1="12" x2="6"  y2="12" stroke="${c}" stroke-width="1.5"/>
      <line x1="18" y1="12" x2="22" y2="12" stroke="${c}" stroke-width="1.5"/>
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

export default function LiveMap({ aircraft, settings, embedded = false, lastPoll = null }) {
  const accentColor = settings?.radarColor || '#20c060'
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())   // hex -> { marker, polyline }
  const homeMarkerRef = useRef(null)
  const rangeCircleRef = useRef(null)
  const tileLayerRef = useRef(null)
  const trailsRef = useRef(new Map())    // hex -> [latlng, ...]
  const [leafletReady, setLeafletReady] = useState(false)
  const [selectedHex, setSelectedHex] = useState(null)
  const [tileMode, setTileMode] = useState('dark')
  const [showTrails, setShowTrails] = useState(true)
  const [showRange, setShowRange] = useState(true)
  const [filterEmergency, setFilterEmergency] = useState(false)
  const [hoveredAc, setHoveredAc] = useState(null)

  // Load Leaflet dynamically (avoids SSR issues and ensures CSS is loaded)
  useEffect(() => {
    import('leaflet').then(mod => {
      L = mod.default || mod
      // Fix Leaflet default icon path issue with bundlers
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      setLeafletReady(true)
    })
  }, [])

  // Initialise map once Leaflet is ready and container is mounted
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapRef.current) return

    const loc = settings?.location || { lat: -37.8136, lon: 144.9631 }
    const map = L.map(mapContainerRef.current, {
      center: [loc.lat, loc.lon],
      zoom: 7,
      zoomControl: true,
      attributionControl: true,
    })

    // Style attribution control to fit dark theme
    map.getContainer().querySelector('.leaflet-control-attribution').style.cssText =
      'background: rgba(6,9,18,0.85); color: #445577; font-size: 9px; padding: 2px 6px;'

    const tile = TILE_LAYERS[tileMode]
    tileLayerRef.current = L.tileLayer(tile.url, {
      attribution: tile.attribution,
      subdomains: tile.subdomains || 'abc',
      maxZoom: tile.maxZoom,
    }).addTo(map)

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [leafletReady])  // intentionally only on leafletReady — settings handled below

  // Swap tile layer when tileMode changes
  useEffect(() => {
    if (!mapRef.current || !L) return
    if (tileLayerRef.current) {
      tileLayerRef.current.remove()
    }
    const tile = TILE_LAYERS[tileMode]
    tileLayerRef.current = L.tileLayer(tile.url, {
      attribution: tile.attribution,
      subdomains: tile.subdomains || 'abc',
      maxZoom: tile.maxZoom,
    }).addTo(mapRef.current)
  }, [tileMode])

  // Home marker + range circle — update when settings change
  useEffect(() => {
    if (!mapRef.current || !L || !settings?.location) return
    const { lat, lon } = settings.location
    const radiusNm = settings.radius || 150
    const radiusM = radiusNm * 1852

    if (homeMarkerRef.current) homeMarkerRef.current.remove()
    homeMarkerRef.current = L.marker([lat, lon], { icon: makeHomeIcon(accentColor), zIndexOffset: 1000 })
      .bindTooltip(`${settings.location.label}`, { permanent: false, className: 'map-tooltip' })
      .addTo(mapRef.current)

    if (rangeCircleRef.current) rangeCircleRef.current.remove()
    if (showRange) {
      rangeCircleRef.current = L.circle([lat, lon], {
        radius: radiusM,
        color: accentColor,
        weight: 1,
        opacity: 0.3,
        fillColor: accentColor,
        fillOpacity: 0.03,
        dashArray: '4 6',
      }).addTo(mapRef.current)
    }
  }, [settings, leafletReady, showRange, accentColor])

  // Toggle range circle
  useEffect(() => {
    if (!mapRef.current || !L || !settings?.location) return
    if (rangeCircleRef.current) rangeCircleRef.current.remove()
    if (showRange) {
      const { lat, lon } = settings.location
      const radiusM = (settings.radius || 150) * 1852
      rangeCircleRef.current = L.circle([lat, lon], {
        radius: radiusM,
        color: accentColor,
        weight: 1,
        opacity: 0.3,
        fillColor: accentColor,
        fillOpacity: 0.03,
        dashArray: '4 6',
      }).addTo(mapRef.current)
    }
  }, [showRange, accentColor])

  // Update aircraft markers
  useEffect(() => {
    if (!mapRef.current || !L) return

    const displayAircraft = filterEmergency
      ? aircraft.filter(ac => EMERGENCY_SQUAWKS.has(String(ac.squawk)))
      : aircraft

    const currentHexes = new Set(displayAircraft.map(ac => ac.hex))

    // Remove stale markers
    for (const [hex, { marker, trail }] of markersRef.current) {
      if (!currentHexes.has(hex)) {
        marker.remove()
        if (trail) trail.remove()
        markersRef.current.delete(hex)
        trailsRef.current.delete(hex)
      }
    }

    // Add/update markers
    for (const ac of displayAircraft) {
      if (!ac.lat || !ac.lon) continue

      const isEmergency = EMERGENCY_SQUAWKS.has(String(ac.squawk))
      const isSelected = ac.hex === selectedHex
      const latlng = [ac.lat, ac.lon]

      // Update trail history
      const history = trailsRef.current.get(ac.hex) || []
      const last = history[history.length - 1]
      if (!last || last[0] !== ac.lat || last[1] !== ac.lon) {
        history.push(latlng)
        if (history.length > 30) history.shift()
        trailsRef.current.set(ac.hex, history)
      }

      const icon = makeAircraftIcon(ac.track, isEmergency, ac.squawk, isSelected, accentColor)
      const popupContent = makePopupHTML(ac)

      if (markersRef.current.has(ac.hex)) {
        // Update existing
        const { marker, trail } = markersRef.current.get(ac.hex)
        marker.setLatLng(latlng)
        marker.setIcon(icon)
        marker.getPopup()?.setContent(popupContent)

        if (trail) trail.remove()
        const newTrail = showTrails && history.length > 1
          ? L.polyline(history, {
              color: isEmergency ? (SQUAWK_META[String(ac.squawk)]?.color || '#e03030') : accentColor,
              weight: isEmergency ? 2 : 1,
              opacity: isEmergency ? 0.6 : 0.3,
              dashArray: isEmergency ? null : '3 5',
            }).addTo(mapRef.current)
          : null
        markersRef.current.set(ac.hex, { marker, trail: newTrail })

      } else {
        // Create new marker
        const marker = L.marker(latlng, {
          icon,
          zIndexOffset: isEmergency ? 500 : 0,
        })
          .bindPopup(popupContent, { className: 'map-popup', maxWidth: 240 })
          .addTo(mapRef.current)

        marker.on('click', () => {
          setSelectedHex(prev => prev === ac.hex ? null : ac.hex)
        })
        marker.on('mouseover', () => setHoveredAc(ac))
        marker.on('mouseout',  () => setHoveredAc(null))

        const trail = showTrails && history.length > 1
          ? L.polyline(history, {
              color: isEmergency ? (SQUAWK_META[String(ac.squawk)]?.color || '#e03030') : accentColor,
              weight: isEmergency ? 2 : 1,
              opacity: isEmergency ? 0.6 : 0.3,
              dashArray: isEmergency ? null : '3 5',
            }).addTo(mapRef.current)
          : null

        markersRef.current.set(ac.hex, { marker, trail })
      }
    }
  }, [aircraft, selectedHex, showTrails, filterEmergency, accentColor])

  // Pan to selected aircraft
  useEffect(() => {
    if (!selectedHex || !mapRef.current) return
    const ac = aircraft.find(a => a.hex === selectedHex)
    if (ac?.lat && ac?.lon) {
      mapRef.current.panTo([ac.lat, ac.lon], { animate: true, duration: 0.5 })
    }
  }, [selectedHex])

  const flyHome = useCallback(() => {
    if (!mapRef.current || !settings?.location) return
    mapRef.current.flyTo(
      [settings.location.lat, settings.location.lon],
      7, { animate: true, duration: 1 }
    )
    setSelectedHex(null)
  }, [settings])

  const emergencies = aircraft.filter(ac => EMERGENCY_SQUAWKS.has(String(ac.squawk)))

  return (
    <div className={`livemap-panel${embedded ? " livemap-embedded" : ""}`}>
      {/* Toolbar — hidden when embedded in combo view */}
      {!embedded && <div className="map-toolbar">
        <div className="toolbar-left">
          <h1 className="panel-title">LIVE MAP</h1>
          <span className="dim mono" style={{ fontSize: 12 }}>
            {aircraft.filter(ac => ac.lat).length} plotted
            {emergencies.length > 0 && (
              <span style={{ color: 'var(--red)', marginLeft: 10 }}>
                ● {emergencies.length} EMERGENCY
              </span>
            )}
          </span>
        </div>

        <div className="toolbar-controls">
          {/* Tile selector */}
          <div className="tile-selector">
            {Object.entries(TILE_LAYERS).map(([key, { label }]) => (
              <button
                key={key}
                className={`tile-btn ${tileMode === key ? 'active' : ''}`}
                onClick={() => setTileMode(key)}
              >{label}</button>
            ))}
          </div>

          {/* Toggles */}
          <button
            className={`toggle-btn ${showTrails ? 'on' : ''}`}
            onClick={() => setShowTrails(t => !t)}
            title="Toggle trails"
          >TRAILS</button>

          <button
            className={`toggle-btn ${showRange ? 'on' : ''}`}
            onClick={() => setShowRange(r => !r)}
            title="Toggle range ring"
          >RANGE</button>

          <button
            className={`toggle-btn ${filterEmergency ? 'on emergency' : ''}`}
            onClick={() => setFilterEmergency(f => !f)}
            title="Show emergency only"
          >EMRG ONLY</button>

          <button className="home-btn" onClick={flyHome} title="Return to home location">
            ⌂ HOME
          </button>
        </div>
      </div>}

      {/* Emergency bar — hidden when embedded */}
      {!embedded && emergencies.length > 0 && <div style={{display:"none"}}/>}
      {emergencies.length > 0 && (
        <div className="map-emergency-bar">
          {emergencies.map(ac => {
            const meta = SQUAWK_META[String(ac.squawk)]
            return (
              <button
                key={ac.hex}
                className="em-chip"
                style={{ borderColor: meta?.color, color: meta?.color }}
                onClick={() => setSelectedHex(ac.hex)}
              >
                <span className="em-pulse" style={{ background: meta?.color }} />
                <span className="mono">{ac.squawk}</span>
                <span>{ac.flight?.trim() || ac.hex?.slice(0,6).toUpperCase()}</span>
                {ac.distanceNm != null && <span className="dim">{ac.distanceNm}nm</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Map container */}
      <div className="map-wrap">
        <div ref={mapContainerRef} className="leaflet-container-inner" />

        {!leafletReady && (
          <div className="map-loading">
            <div className="loading-ring" />
            <span className="dim mono">Loading map…</span>
          </div>
        )}

        {!lastPoll && (
          <div className="map-poll-wait">
            <div className="poll-wait-dot" />
            <span className="mono">Waiting for first poll…</span>
          </div>
        )}

        {/* Selected aircraft overlay */}
        {selectedHex && (() => {
          const ac = aircraft.find(a => a.hex === selectedHex)
          if (!ac) return null
          const meta = SQUAWK_META[String(ac.squawk)]
          return (
            <div className="selected-overlay animate-fade-in">
              <div className="so-header" style={{ borderColor: meta?.color || 'var(--border-bright)' }}>
                <span className="so-callsign mono">{ac.flight?.trim() || ac.hex?.toUpperCase()}</span>
                <button className="so-close" onClick={() => setSelectedHex(null)}>✕</button>
              </div>
              <div className="so-body">
                <Row label="TYPE"    value={ac.t || '—'} />
                <Row label="REG"     value={ac.r || '—'} />
                <Row label="ALT"     value={ac.alt_baro ? `${Number(ac.alt_baro).toLocaleString()}ft` : '—'} />
                <Row label="SPEED"   value={ac.gs ? `${ac.gs}kt` : '—'} />
                <Row label="HEADING" value={ac.track ? `${ac.track}°` : '—'} />
                <Row label="DIST"    value={ac.distanceNm != null ? `${ac.distanceNm}nm` : '—'} />
                <Row label="BEARING" value={ac.bearing != null ? `${Math.round(ac.bearing)}°` : '—'} />
                {ac.squawk && (
                  <Row
                    label="SQUAWK"
                    value={ac.squawk}
                    color={meta?.color}
                    extra={meta?.label}
                  />
                )}
                {ac.lat && ac.lon && (
                  <Row label="POS" value={`${ac.lat.toFixed(4)}, ${ac.lon.toFixed(4)}`} mono />
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function Row({ label, value, color, extra, mono }) {
  return (
    <div className="so-row">
      <span className="so-label">{label}</span>
      <span className={`so-value ${mono ? 'mono' : ''}`} style={color ? { color } : {}}>
        {value}
        {extra && <span className="so-extra"> {extra}</span>}
      </span>
    </div>
  )
}

function makePopupHTML(ac) {
  const isEmergency = EMERGENCY_SQUAWKS.has(String(ac.squawk))
  const meta = SQUAWK_META[String(ac.squawk)]
  return `
    <div class="map-popup-inner">
      <div class="mp-header ${isEmergency ? 'mp-emergency' : ''}" style="${isEmergency ? `color:${meta?.color}` : ''}">
        ${ac.flight?.trim() || ac.hex?.toUpperCase() || '?'}
        ${isEmergency ? `<span class="mp-badge">${ac.squawk} ${meta?.label}</span>` : ''}
      </div>
      <div class="mp-grid">
        <span class="mp-lbl">TYPE</span><span class="mp-val">${ac.t || '—'}</span>
        <span class="mp-lbl">REG</span><span class="mp-val">${ac.r || '—'}</span>
        <span class="mp-lbl">ALT</span><span class="mp-val">${ac.alt_baro ? Number(ac.alt_baro).toLocaleString()+'ft' : '—'}</span>
        <span class="mp-lbl">SPD</span><span class="mp-val">${ac.gs ? ac.gs+'kt' : '—'}</span>
        <span class="mp-lbl">HDG</span><span class="mp-val">${ac.track ? ac.track+'°' : '—'}</span>
        ${ac.distanceNm != null ? `<span class="mp-lbl">DIST</span><span class="mp-val">${ac.distanceNm}nm</span>` : ''}
      </div>
    </div>`
}
