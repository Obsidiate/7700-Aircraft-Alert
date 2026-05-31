import { useState } from 'react'
import { Save, MapPin } from 'lucide-react'
import './Settings.css'

const SQUAWK_OPTIONS = [
  { code: '7700', label: 'General Emergency', desc: 'Covers all emergencies including mechanical failure, medical, etc.' },
  { code: '7600', label: 'Radio Failure',     desc: 'Aircraft has lost radio communications (NORDO)' },
  { code: '7500', label: 'Hijacking',          desc: 'Unlawful interference / hijack declared' },
  { code: '7400', label: 'Drone Lost Link',    desc: 'UAV/UAS has lost its uplink' },
]

export default function SettingsPanel({ settings, onSave }) {
  const [form, setForm] = useState({ ...settings })
  const [saved, setSaved] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setLoc = (key, val) => setForm(f => ({ ...f, location: { ...f.location, [key]: val } }))

  const toggleSquawk = (code) => {
    const filters = form.squawkFilters.includes(code)
      ? form.squawkFilters.filter(c => c !== code)
      : [...form.squawkFilters, code]
    set('squawkFilters', filters)
  }

  const handleSave = async () => {
    await onSave(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h1 className="panel-title">SETTINGS</h1>
      </div>

      <div className="settings-body">
        {/* Location */}
        <Section title="MONITORING LOCATION" icon={<MapPin size={14} />}>
          <div className="field-row">
            <Field label="Location Label">
              <input
                className="input"
                value={form.location.label}
                onChange={e => setLoc('label', e.target.value)}
                placeholder="e.g. Melbourne, VIC"
              />
            </Field>
          </div>
          <div className="field-row two-col">
            <Field label="Latitude">
              <input
                className="input mono"
                type="number"
                step="0.0001"
                value={form.location.lat}
                onChange={e => setLoc('lat', parseFloat(e.target.value))}
              />
            </Field>
            <Field label="Longitude">
              <input
                className="input mono"
                type="number"
                step="0.0001"
                value={form.location.lon}
                onChange={e => setLoc('lon', parseFloat(e.target.value))}
              />
            </Field>
          </div>
          <p className="hint">
            Find your coordinates at <a href="https://maps.google.com" className="link" onClick={e => { e.preventDefault(); window.open('https://maps.google.com', '_blank') }}>maps.google.com</a> — right-click any point and click the coordinates to copy them.
          </p>
        </Section>

        {/* Radius & polling */}
        <Section title="SCAN PARAMETERS">
          <div className="field-row two-col">
            <Field label={`Radius: ${form.radius} nm`}>
              <input
                className="range-input"
                type="range"
                min="25" max="250" step="25"
                value={form.radius}
                onChange={e => set('radius', parseInt(e.target.value))}
              />
              <div className="range-labels dim mono">
                <span>25nm</span><span>250nm</span>
              </div>
            </Field>
            <Field label={`Poll Interval: ${form.pollInterval}s`}>
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
            </Field>
          </div>
          <p className="hint">APIs are rate-limited to 1 req/sec. Polling more frequently than 15s is not recommended.</p>
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

function Field({ label, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}
