import { useMemo, useState, useRef, useEffect } from 'react'
import { Zap, ExternalLink, X, List } from 'lucide-react'
import { SQUAWK_META } from '../services/bridge.js'
import { bridge } from '../services/bridge.js'
import { buildSuggestedGroups } from '../services/overpass.js'
import RadarScope from '../components/RadarScope.jsx'
import LiveMap from './LiveMap.jsx'
import './Dashboard.css'

const EMERGENCY_SQUAWKS = ['7700', '7600', '7500', '7400']

const SQUAWK_COLORS = {
  '7700': 'var(--squawk-7700)',
  '7600': 'var(--squawk-7600)',
  '7500': 'var(--squawk-7500)',
  '7400': 'var(--squawk-7400)',
}

const VIEWS = [
  ['split-radar', 'SPLIT RADAR'],
  ['split-map',   'SPLIT MAP'],
  ['split-both',  'SPLIT BOTH'],
  ['list',        'LIST'],
]

function fmt(v, suffix = '') {
  if (v == null || v === '') return '—'
  return `${v}${suffix}`
}

function fmtAlt(v) {
  if (v == null) return '—'
  if (v === 'ground') return 'GND'
  return `${Number(v).toLocaleString()}ft`
}

function formatRadius(radiusNm, unit) {
  if (!unit || unit === 'nm') return `${radiusNm}nm`
  if (unit === 'km') return `${Math.round(radiusNm * 1.852)}km`
  if (unit === 'mi') return `${Math.round(radiusNm * 1.15078)}mi`
  return `${radiusNm}nm`
}

function generateFakeAc(settings) {
  const lat = (settings?.location?.lat || 0) + (Math.random() - 0.5) * 2
  const lon = (settings?.location?.lon || 0) + (Math.random() - 0.5) * 2
  return {
    hex: 'sim0001',
    flight: 'SIM001',
    t: 'B738',
    lat, lon,
    alt_baro: 15000,
    gs: 320,
    track: Math.round(Math.random() * 360),
    squawk: '7700',
    distanceNm: Math.round(Math.random() * 80 + 20),
    bearing: Math.round(Math.random() * 360),
  }
}

export default function Dashboard({ aircraft, settings, lastPoll, onSimulateAlert, emergencyAircraft }) {
  const [selected, setSelected]   = useState(null)
  const [view, setView]           = useState('split-both')
  const [simActive, setSimActive] = useState(false)
  const simRef                    = useRef(null)
  const [listMode, setListMode]   = useState('traffic') // 'traffic' | 'emergency'

  // Auto-switch list pane to emergency mode when a new emergency aircraft arrives
  useEffect(() => {
    if (emergencyAircraft) setListMode('emergency')
  }, [emergencyAircraft?.hex, emergencyAircraft?.squawk])

  const sorted = useMemo(() => {
    const emergencies = aircraft.filter(ac => EMERGENCY_SQUAWKS.includes(String(ac.squawk)))
    const normal      = aircraft.filter(ac => !EMERGENCY_SQUAWKS.includes(String(ac.squawk)))
    emergencies.sort((a, b) => (a.distanceNm || 999) - (b.distanceNm || 999))
    normal.sort((a, b) => (a.distanceNm || 999) - (b.distanceNm || 999))
    return [...emergencies, ...normal]
  }, [aircraft])

  const emergencyCount = sorted.filter(ac => EMERGENCY_SQUAWKS.includes(String(ac.squawk))).length
  const selectedAc     = selected ? aircraft.find(ac => ac.hex === selected) : null
  const handleSelect   = (hex) => setSelected(prev => prev === hex ? null : hex)

  const showRadar = view === 'split-radar' || view === 'split-both'
  const showMap   = view === 'split-map'   || view === 'split-both'
  const showList  = view !== 'split-both'

  const displayAircraft = simActive && simRef.current
    ? sorted.map(ac => ac.hex === simRef.current.hex
        ? { ...ac, squawk: '7700' }
        : ac
      ).concat(sorted.find(ac => ac.hex === simRef.current.hex) ? [] : [simRef.current])
    : sorted

  function handleSimToggle() {
    if (simActive) {
      setSimActive(false)
      simRef.current = null
      onSimulateAlert?.(null)
      return
    }
    const pool = aircraft.length > 0 ? aircraft : [generateFakeAc(settings)]
    const target = pool[Math.floor(Math.random() * pool.length)]
    const fakeAc = { ...target, squawk: '7700', _simulated: true }
    simRef.current = fakeAc
    setSimActive(true)
    onSimulateAlert?.(fakeAc)
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1 className="panel-title">LIVE TRAFFIC</h1>
          {settings?.location && (
            <span className="dim mono" style={{ fontSize: 12 }}>
              {settings.location.label} · {formatRadius(settings.radius, settings.radiusUnit)} radius
            </span>
          )}
        </div>
        <div className="header-centre">
          <div className="view-toggle">
            {VIEWS.map(([v, l]) => (
              <button
                key={v}
                className={`view-btn ${view === v ? 'active' : ''}`}
                onClick={() => setView(v)}
              >{l}</button>
            ))}
          </div>
        </div>
        <div className="header-stats">
          <Stat label="IN RANGE"  value={aircraft.length} />
          <Stat label="EMERGENCY" value={emergencyCount} alert={emergencyCount > 0} />
          <button
            className={`sim-btn ${simActive ? 'sim-active' : ''}`}
            onClick={handleSimToggle}
            title="Simulate an emergency alert"
          >
            <Zap size={13} />
            {simActive ? 'CANCEL SIM' : 'SIM ALERT'}
          </button>
        </div>
      </div>

      {/* Emergency strip */}
      {(emergencyCount > 0 || simActive) && (
        <div className="emergency-strip">
          {displayAircraft
            .filter(ac => EMERGENCY_SQUAWKS.includes(String(ac.squawk)))
            .map(ac => <EmergencyCard key={ac.hex} ac={ac} onClick={() => handleSelect(ac.hex)} />)}
        </div>
      )}

      {/* Main body */}
      <div className={`dashboard-body view-${view}`}>
        {view === 'split-both' ? (
          <>
            <div className="dual-left">
              <div className="radar-pane">
                <RadarScope
                  aircraft={displayAircraft}
                  settings={settings}
                  selected={selected}
                  onSelect={handleSelect}
                />
                {selectedAc && <SelectedBar ac={selectedAc} onClose={() => setSelected(null)} />}
              </div>
              <div className="map-pane">
                <LiveMap aircraft={displayAircraft} settings={settings} lastPoll={lastPoll} embedded />
              </div>
            </div>
            <div className="list-pane">
              <ListPaneContent
                listMode={listMode}
                onListMode={setListMode}
                emergencyAircraft={emergencyAircraft}
                settings={settings}
                sorted={displayAircraft}
                selected={selected}
                onSelect={handleSelect}
              />
            </div>
          </>
        ) : (
          <>
            {showRadar && (
              <div className="radar-pane">
                <RadarScope
                  aircraft={displayAircraft}
                  settings={settings}
                  selected={selected}
                  onSelect={handleSelect}
                />
                {selectedAc && <SelectedBar ac={selectedAc} onClose={() => setSelected(null)} />}
              </div>
            )}
            {showMap && (
              <div className="map-pane">
                <LiveMap aircraft={displayAircraft} settings={settings} lastPoll={lastPoll} embedded />
              </div>
            )}
            {showList && (
              <div className="list-pane">
                <ListPaneContent
                  listMode={listMode}
                  onListMode={setListMode}
                  emergencyAircraft={emergencyAircraft}
                  settings={settings}
                  sorted={displayAircraft}
                  selected={selected}
                  onSelect={handleSelect}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SelectedBar({ ac, onClose }) {
  const color = SQUAWK_COLORS[String(ac.squawk)]
  return (
    <div className="selected-bar animate-fade-in">
      <span className="mono" style={{ color: color || 'var(--green)' }}>
        {ac.flight?.trim() || ac.hex?.toUpperCase()}
      </span>
      <span className="dim">{ac.t}</span>
      <span className="dim">{ac.r}</span>
      <span className="mono">{fmtAlt(ac.alt_baro)}</span>
      <span className="mono">{fmt(ac.gs, 'kt')}</span>
      <span className="mono">{fmt(ac.track, '°')}</span>
      {ac.distanceNm != null && <span className="mono">{ac.distanceNm}nm</span>}
      {ac.squawk && (
        <span className="mono" style={{ color: color || 'var(--text-secondary)' }}>
          SQK {ac.squawk}
        </span>
      )}
      <button className="close-btn" onClick={onClose}>✕</button>
    </div>
  )
}

function ListPaneContent({ listMode, onListMode, emergencyAircraft, settings, sorted, selected, onSelect }) {
  if (listMode === 'emergency' && emergencyAircraft) {
    return (
      <>
        <div className="list-mode-bar">
          <button className="list-mode-btn" onClick={() => onListMode('traffic')}>
            <List size={12} /> Show all traffic
          </button>
          <button className="list-mode-close" onClick={() => onListMode('traffic')}>
            <X size={12} />
          </button>
        </div>
        <EmergencyLinksPane ac={emergencyAircraft} settings={settings} sorted={sorted} selected={selected} onSelect={onSelect} />
      </>
    )
  }
  return <AircraftList sorted={sorted} selected={selected} onSelect={onSelect} />
}

function EmergencyLinksPane({ ac, settings, sorted, selected, onSelect }) {
  const color = SQUAWK_COLORS[String(ac.squawk)] || 'var(--red)'
  const [groups, setGroups] = useState(null)

  useEffect(() => {
    if (!settings?.location) return
    const { lat, lon, label } = settings.location
    const radiusM = (settings.radius || 150) * 1852
    buildSuggestedGroups(lat, lon, label, radiusM, ac.lat ?? null, ac.lon ?? null)
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [ac.hex, ac.lat, ac.lon])

  return (
    <div className="elp-wrap">
      {/* Aircraft summary card */}
      <div className="elp-card" style={{ borderColor: color }}>
        <div className="elp-squawk mono" style={{ color }}>{ac.squawk}</div>
        <div className="elp-meta">
          <span className="elp-callsign mono">{ac.flight?.trim() || ac.hex?.toUpperCase()}</span>
          <span className="elp-type dim">{ac.t || '—'}</span>
        </div>
        <div className="elp-details dim mono">
          {ac.alt_baro && <span>{Number(ac.alt_baro).toLocaleString()}ft</span>}
          {ac.gs && <span>{ac.gs}kt</span>}
          {ac.distanceNm != null && <span>{ac.distanceNm}nm</span>}
          {ac.bearing != null && <span>{Math.round(ac.bearing)}°</span>}
        </div>
        <div className="elp-label" style={{ color }}>
          {SQUAWK_META[String(ac.squawk)]?.label || 'EMERGENCY'}
        </div>
      </div>

      {/* Airport links */}
      <div className="elp-links">
        <div className="elp-links-title dim">RELEVANT LINKS</div>

        {groups?.map((group, i) => (
          <div key={i} className={`elp-group ${group.emergency ? 'elp-emergency' : ''}`}>
            <div className="elp-group-heading">{group.heading}</div>
            {group.links.map((link, j) => (
              <button key={j} className="elp-link-row" onClick={() => bridge.openExternal(link.url)}>
                <span className="elp-link-label">{link.label}</span>
                <ExternalLink size={12} className="elp-link-icon" />
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Traffic list fills remaining space */}
      {sorted?.length > 0 && (
        <div className="elp-traffic">
          <div className="elp-links-title dim">ALL TRAFFIC</div>
          <AircraftList sorted={sorted} selected={selected} onSelect={onSelect} />
        </div>
      )}
    </div>
  )
}

function AircraftList({ sorted, selected, onSelect }) {
  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-radar">
          <svg viewBox="0 0 120 120" width="80" height="80">
            <circle cx="60" cy="60" r="55" fill="none" stroke="var(--border)" strokeWidth="1" />
            <circle cx="60" cy="60" r="36" fill="none" stroke="var(--border)" strokeWidth="1" />
            <circle cx="60" cy="60" r="18" fill="none" stroke="var(--border)" strokeWidth="1" />
            <circle cx="60" cy="60" r="3"  fill="var(--border-bright)" />
            <line x1="60" y1="60" x2="60" y2="5" stroke="var(--green)" strokeWidth="1.5" opacity="0.5"
              style={{ transformOrigin: '60px 60px', animation: 'radar-sweep 4s linear infinite' }} />
          </svg>
        </div>
        <p className="dim">Scanning…</p>
      </div>
    )
  }

  return (
    <table className="aircraft-table">
      <thead>
        <tr>
          <th>SQK</th><th>CALLSIGN</th><th>TYPE</th>
          <th>ALT</th><th>SPD</th><th>HDG</th><th>DIST</th><th>BRG</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(ac => {
          const isEmergency = EMERGENCY_SQUAWKS.includes(String(ac.squawk))
          const color       = SQUAWK_COLORS[String(ac.squawk)]
          const isSelected  = ac.hex === selected
          return (
            <tr
              key={ac.hex}
              className={[isEmergency ? 'row-emergency' : '', isSelected ? 'row-selected' : ''].join(' ')}
              onClick={() => onSelect(ac.hex)}
            >
              <td>
                <span className="squawk-cell mono" style={color ? { color, fontWeight: 700 } : {}}>
                  {isEmergency && <span className="squawk-pulse" style={{ background: color }} />}
                  {fmt(ac.squawk)}
                </span>
              </td>
              <td className="mono">{ac.flight?.trim() || ac.hex?.toUpperCase() || '—'}</td>
              <td className="mono dim">{fmt(ac.t)}</td>
              <td className="mono">{fmtAlt(ac.alt_baro)}</td>
              <td className="mono">{fmt(ac.gs, 'kt')}</td>
              <td className="mono">{fmt(ac.track, '°')}</td>
              <td className="mono">{ac.distanceNm != null ? `${ac.distanceNm}nm` : '—'}</td>
              <td className="mono dim">{ac.bearing != null ? `${Math.round(ac.bearing)}°` : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Stat({ label, value, alert }) {
  return (
    <div className={`stat-box ${alert ? 'stat-alert' : ''}`}>
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function EmergencyCard({ ac, onClick }) {
  const meta = SQUAWK_META[String(ac.squawk)]
  return (
    <div className="emergency-card animate-slide-in" style={{ borderColor: meta?.color }} onClick={onClick}>
      <div className="ec-squawk mono" style={{ color: meta?.color }}>{ac.squawk}</div>
      <div className="ec-type">{meta?.label || 'ALERT'}</div>
      <div className="ec-id mono">{ac.flight?.trim() || ac.hex?.toUpperCase()}</div>
      <div className="ec-detail dim mono">
        {ac.t && <span>{ac.t}</span>}
        {ac.alt_baro && <span>{Number(ac.alt_baro).toLocaleString()}ft</span>}
        {ac.distanceNm != null && <span>{ac.distanceNm}nm</span>}
        {ac.bearing != null && <span>{Math.round(ac.bearing)}°</span>}
      </div>
    </div>
  )
}
