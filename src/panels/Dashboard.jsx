import { useMemo, useState, useRef, useEffect } from 'react'
import { SQUAWK_META } from '../services/bridge.js'
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

function fmt(v, suffix = '') {
  if (v == null || v === '') return '—'
  return `${v}${suffix}`
}

function fmtAlt(v) {
  if (v == null) return '—'
  if (v === 'ground') return 'GND'
  return `${Number(v).toLocaleString()}ft`
}

const VIEWS = [
  ['split', 'SPLIT'],
  ['radar', 'RADAR'],
  ['map',   'MAP'],
  ['combo', 'RADAR+MAP'],
  ['list',  'LIST'],
]

export default function Dashboard({ aircraft, settings }) {
  const [selected, setSelected]   = useState(null)
  const [view, setView]           = useState('split')
  const [comboWide, setComboWide] = useState(false)
  const bodyRef                   = useRef(null)

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

  // ResizeObserver: switch combo layout at 900px
  useEffect(() => {
    if (view !== 'combo' || !bodyRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      setComboWide(entry.contentRect.width >= 900)
    })
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [view])

  const showRadar = view === 'radar' || view === 'split' || view === 'combo'
  const showMap   = view === 'map'   || view === 'combo'
  const showList  = view === 'list'  || view === 'split'

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1 className="panel-title">LIVE TRAFFIC</h1>
          {settings?.location && (
            <span className="dim mono" style={{ fontSize: 12 }}>
              {settings.location.label} · {settings?.radius}nm radius
            </span>
          )}
        </div>
        <div className="header-centre">
          <div className="view-toggle">
            {VIEWS.map(([v, l]) => (
              <button
                key={v}
                className={`view-btn ${view === v ? 'active' : ''} ${v === 'combo' ? 'view-btn-combo' : ''}`}
                onClick={() => setView(v)}
              >{l}</button>
            ))}
          </div>
        </div>
        <div className="header-stats">
          <Stat label="IN RANGE"  value={aircraft.length} />
          <Stat label="EMERGENCY" value={emergencyCount} alert={emergencyCount > 0} />
        </div>
      </div>

      {/* Emergency strip */}
      {emergencyCount > 0 && (
        <div className="emergency-strip">
          {sorted
            .filter(ac => EMERGENCY_SQUAWKS.includes(String(ac.squawk)))
            .map(ac => <EmergencyCard key={ac.hex} ac={ac} onClick={() => handleSelect(ac.hex)} />)}
        </div>
      )}

      {/* ── Main body ── */}
      <div
        ref={bodyRef}
        className={[
          'dashboard-body',
          `view-${view}`,
          view === 'combo' ? (comboWide ? 'combo-wide' : 'combo-tall') : '',
        ].join(' ')}
      >

        {/* Radar pane */}
        {showRadar && (
          <div className="radar-pane">
            <RadarScope
              aircraft={sorted}
              settings={settings}
              selected={selected}
              onSelect={handleSelect}
            />
            {selectedAc && (
              <div className="selected-bar animate-fade-in">
                <span className="mono" style={{ color: SQUAWK_COLORS[String(selectedAc.squawk)] || 'var(--green)' }}>
                  {selectedAc.flight?.trim() || selectedAc.hex?.toUpperCase()}
                </span>
                <span className="dim">{selectedAc.t}</span>
                <span className="dim">{selectedAc.r}</span>
                <span className="mono">{fmtAlt(selectedAc.alt_baro)}</span>
                <span className="mono">{fmt(selectedAc.gs, 'kt')}</span>
                <span className="mono">{fmt(selectedAc.track, '°')}</span>
                {selectedAc.distanceNm != null && <span className="mono">{selectedAc.distanceNm}nm</span>}
                {selectedAc.squawk && (
                  <span className="mono" style={{ color: SQUAWK_COLORS[String(selectedAc.squawk)] || 'var(--text-secondary)' }}>
                    SQK {selectedAc.squawk}
                  </span>
                )}
                <button className="close-btn" onClick={() => setSelected(null)}>✕</button>
              </div>
            )}
          </div>
        )}

        {/* Map pane — combo or standalone map view */}
        {showMap && (
          <div className="map-pane">
            <LiveMap aircraft={sorted} settings={settings} embedded />
          </div>
        )}

        {/* List pane */}
        {showList && (
          <div className="list-pane">
            {sorted.length === 0 ? (
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
            ) : (
              <table className="aircraft-table">
                <thead>
                  <tr>
                    <th>SQK</th>
                    <th>CALLSIGN</th>
                    <th>TYPE</th>
                    <th>ALT</th>
                    <th>SPD</th>
                    <th>HDG</th>
                    <th>DIST</th>
                    <th>BRG</th>
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
                        className={[
                          isEmergency ? 'row-emergency' : '',
                          isSelected  ? 'row-selected'  : '',
                        ].join(' ')}
                        onClick={() => handleSelect(ac.hex)}
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
            )}
          </div>
        )}
      </div>
    </div>
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
