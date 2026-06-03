import { useState, useRef, useEffect, useCallback } from 'react'
import { Save, MapPin, Palette } from 'lucide-react'
import './Settings.css'

const SQUAWK_OPTIONS = [
  { code: '7700', label: 'General Emergency', desc: 'Covers all emergencies including mechanical failure, medical, etc.' },
  { code: '7600', label: 'Radio Failure',     desc: 'Aircraft has lost radio communications (NORDO)' },
  { code: '7500', label: 'Hijacking',          desc: 'Unlawful interference / hijack declared' },
  { code: '7400', label: 'Drone Lost Link',    desc: 'UAV/UAS has lost its uplink' },
]

const NM_TO_KM = 1.852
const NM_TO_MI = 1.15078
const KM_TO_NM = 1 / NM_TO_KM
const MI_TO_NM = 1 / NM_TO_MI
const API_LIMIT_NM = 250

const UNIT_OPTS = [
  { id: 'nm', label: 'NM', maxDisplay: 2159, step: 25, toNm: v => v,                                   fromNm: v => v },
  { id: 'km', label: 'KM', maxDisplay: 4000, step: 50, toNm: v => Math.round(v * KM_TO_NM),           fromNm: v => Math.round(v * NM_TO_KM) },
  { id: 'mi', label: 'MI', maxDisplay: 2485, step: 30, toNm: v => Math.round(v * MI_TO_NM),           fromNm: v => Math.round(v * NM_TO_MI) },
]

function getUnit(id) {
  return UNIT_OPTS.find(u => u.id === id) || UNIT_OPTS[0]
}

export default function SettingsPanel({ settings, onSave }) {
  const [form, setForm] = useState({ ...settings })
  const [saved, setSaved] = useState(false)
  const [locationDirty, setLocationDirty] = useState(false)

  const unit = getUnit(form.radiusUnit)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setLoc = (val) => {
    setForm(f => ({ ...f, location: val }))
    setLocationDirty(true)
  }

  const toggleSquawk = (code) => {
    const filters = form.squawkFilters.includes(code)
      ? form.squawkFilters.filter(c => c !== code)
      : [...form.squawkFilters, code]
    set('squawkFilters', filters)
  }

  const handleSave = async () => {
    await onSave(form)
    setSaved(true)
    setLocationDirty(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const displayRadius = unit.fromNm(form.radius)
  const apiLimitDisplay = unit.fromNm(API_LIMIT_NM)
  const apiLimitPct = Math.min(100, (apiLimitDisplay / unit.maxDisplay) * 100)

  function handleRadiusChange(displayVal) {
    const nm = Math.max(unit.toNm(unit.step), unit.toNm(parseInt(displayVal)))
    set('radius', nm)
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h1 className="panel-title">SETTINGS</h1>
      </div>

      <div className="settings-body">
        {/* Location */}
        <Section title="MONITORING LOCATION" icon={<MapPin size={14} />}>
          <AddressSearch value={form.location} onChange={setLoc} />
          {locationDirty && (
            <button className={`btn-save btn-save-inline ${saved ? 'saved' : ''}`} onClick={handleSave}>
              <Save size={14} />
              {saved ? 'Saved!' : 'Save & Apply Location'}
            </button>
          )}
        </Section>

        {/* Radius & polling */}
        <Section title="SCAN PARAMETERS">
          <div className="field-row two-col">
            <div className="field">
              <div className="radius-header">
                <label className="field-label">
                  Radius: {displayRadius}{unit.label.toLowerCase()}
                </label>
                <div className="unit-toggle">
                  {UNIT_OPTS.map(u => (
                    <button
                      key={u.id}
                      className={`unit-btn ${form.radiusUnit === u.id ? 'active' : ''}`}
                      onClick={() => set('radiusUnit', u.id)}
                    >{u.label}</button>
                  ))}
                </div>
              </div>
              <div className="slider-wrap">
                <input
                  className="range-input"
                  type="range"
                  min={unit.step}
                  max={unit.maxDisplay}
                  step={unit.step}
                  value={displayRadius}
                  onChange={e => handleRadiusChange(e.target.value)}
                />
                <div
                  className="api-limit-marker"
                  style={{ left: `${apiLimitPct}%` }}
                  title={`ADS-B API limit ≈ ${apiLimitDisplay}${unit.label.toLowerCase()}`}
                />
              </div>
              <div className="range-labels dim mono">
                <span>{unit.step}{unit.label.toLowerCase()}</span>
                <span className="api-limit-label" style={{ left: `${apiLimitPct}%` }}>API limit</span>
                <span>{unit.maxDisplay}{unit.label.toLowerCase()}</span>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Poll Interval: {form.pollInterval}s</label>
              <input
                className="range-input"
                type="range"
                min="15" max="120" step="15"
                value={form.pollInterval}
                onChange={e => set('pollInterval', parseInt(e.target.value))}
              />
              <div className="range-labels dim mono">
                <span>15s</span><span>120s</span>
              </div>
            </div>
          </div>
          <p className="hint">
            ADS-B APIs typically cover up to {API_LIMIT_NM}nm (~{Math.round(API_LIMIT_NM * NM_TO_KM)}km) server-side. Larger radii will query at the API limit.
          </p>
        </Section>

        {/* Squawk filters */}
        <Section title="MONITORED SQUAWK CODES">
          <div className="squawk-options">
            {SQUAWK_OPTIONS.map(({ code, label, desc }) => (
              <label key={code} className={`squawk-option ${form.squawkFilters.includes(code) ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.squawkFilters.includes(code)}
                  onChange={() => toggleSquawk(code)}
                />
                <span className="squawk-code mono">{code}</span>
                <span className="squawk-meta">
                  <span className="squawk-label">{label}</span>
                  <span className="squawk-desc dim">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        {/* API preference */}
        <Section title="DATA SOURCE">
          <div className="api-options">
            {['airplanes.live', 'adsb.fi'].map(api => (
              <label key={api} className={`api-option ${form.preferredApi === api ? 'checked' : ''}`}>
                <input
                  type="radio"
                  name="api"
                  value={api}
                  checked={form.preferredApi === api}
                  onChange={() => set('preferredApi', api)}
                />
                <span className="mono">{api}</span>
                {api === 'airplanes.live' && <span className="badge-recommended">RECOMMENDED</span>}
              </label>
            ))}
          </div>
          <p className="hint">The other API is automatically used as fallback if the primary fails.</p>
        </Section>

        {/* Display */}
        <Section title="DISPLAY" icon={<Palette size={14} />}>
          <div className="field color-field">
            <label className="field-label">Radar / Map Accent Color</label>
            <div className="color-row">
              <input
                type="color"
                className="color-picker"
                value={form.radarColor || '#20c060'}
                onChange={e => set('radarColor', e.target.value)}
              />
              <span className="mono dim" style={{ fontSize: 13 }}>{form.radarColor || '#20c060'}</span>
              <button
                className="color-reset"
                onClick={() => set('radarColor', '#20c060')}
              >Reset</button>
            </div>
            <p className="hint">Controls radar sweep, range rings, and non-emergency aircraft color. Emergency squawk colors are fixed.</p>
          </div>
        </Section>
      </div>

      <div className="settings-footer">
        <button className={`btn-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
          <Save size={15} />
          {saved ? 'Saved!' : 'Save & Apply'}
        </button>
      </div>
    </div>
  )
}

function AddressSearch({ value, onChange }) {
  const [query, setQuery] = useState(value?.label || '')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback((q) => {
    if (q.length < 3) { setSuggestions([]); setOpen(false); return }
    setLoading(true)
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
      { headers: { 'User-Agent': '7700-app/0.1 (emergency squawk monitor)' } }
    )
      .then(r => r.json())
      .then(data => {
        setSuggestions(data || [])
        setOpen((data || []).length > 0)
      })
      .catch(() => { setSuggestions([]); setOpen(false) })
      .finally(() => setLoading(false))
  }, [])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 500)
  }

  function handleSelect(item) {
    const label = item.display_name.split(',').slice(0, 3).join(',').trim()
    onChange({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label })
    setQuery(label)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="address-search" ref={containerRef}>
      <div className="field" style={{ position: 'relative' }}>
        <label className="field-label">Search Address or City</label>
        <div className="address-input-wrap">
          <input
            className="input"
            value={query}
            onChange={handleInput}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Type a city, airport, or address…"
            autoComplete="off"
          />
          {loading && <span className="address-loading">…</span>}
        </div>
        {open && suggestions.length > 0 && (
          <ul className="address-dropdown">
            {suggestions.map((item, i) => (
              <li key={i} className="address-suggestion" onMouseDown={() => handleSelect(item)}>
                <span className="suggestion-name">{item.display_name.split(',').slice(0, 2).join(', ')}</span>
                <span className="suggestion-detail dim">{item.display_name.split(',').slice(2, 4).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="coords-display mono dim">
        <span>Lat: {value?.lat?.toFixed(4) ?? '—'}</span>
        <span>Lon: {value?.lon?.toFixed(4) ?? '—'}</span>
      </div>
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div className="settings-section">
      <div className="section-title">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}
