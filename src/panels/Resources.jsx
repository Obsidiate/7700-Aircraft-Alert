import { useState, useEffect, useRef } from 'react'
import { ExternalLink, Plus, Trash2, GripVertical, Save } from 'lucide-react'
import { bridge } from '../services/bridge.js'
import { buildSuggestedGroups } from '../services/overpass.js'
import './Resources.css'

function useSuggestedLinks(settings, emergencyAircraft) {
  const [suggestions, setSuggestions] = useState(null)
  const keyRef = useRef(null)

  useEffect(() => {
    if (!settings?.location) return
    const { lat, lon } = settings.location
    const acLat = emergencyAircraft?.lat ?? null
    const acLon = emergencyAircraft?.lon ?? null
    const key = `${lat},${lon},${settings.radius},${acLat},${acLon}`
    if (key === keyRef.current) return
    keyRef.current = key

    const radiusM = (settings.radius || 150) * 1852
    buildSuggestedGroups(lat, lon, settings.location.label, radiusM, acLat, acLon)
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
  }, [settings?.location?.lat, settings?.location?.lon, settings?.radius, emergencyAircraft?.lat, emergencyAircraft?.lon])

  return { suggestions }
}

export default function Resources({ settings, emergencyAircraft }) {
  const [resources, setResources] = useState([])
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const { suggestions } = useSuggestedLinks(settings, emergencyAircraft)

  useEffect(() => {
    bridge.getResources().then(setResources)
  }, [])

  const addResource = () => {
    if (!newLabel.trim() || !newUrl.trim()) return
    setResources(r => [...r, { id: String(Date.now()), label: newLabel.trim(), url: newUrl.trim() }])
    setNewLabel('')
    setNewUrl('')
  }

  const removeResource = (id) => setResources(r => r.filter(x => x.id !== id))

  const handleSave = async () => {
    await bridge.saveResources(resources)
    setSaved(true)
    setEditing(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="resources-panel">
      <div className="resources-header">
        <div>
          <h1 className="panel-title">RESOURCES</h1>
          <span className="dim mono" style={{ fontSize: 12 }}>Quick-access links for monitoring &amp; investigation</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setEditing(e => !e)}>
            {editing ? 'Cancel' : 'Edit Links'}
          </button>
          {editing && (
            <button className={`btn-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
              <Save size={14} />
              {saved ? 'Saved!' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <div className="resources-body">
        {/* Suggested for your area */}
        <div className="suggested-section">
          <div className="section-title">SUGGESTED LINKS</div>
          {!settings?.location && (
            <p className="dim" style={{ fontSize: 12 }}>Set a location in Settings to see location-based tracking links.</p>
          )}
          {suggestions?.map((group, i) => (
            <SuggestedGroup key={i} group={group} />
          ))}
        </div>

        {/* User links */}
        <ResourceGroup title="ATC AUDIO" resources={resources.filter(r =>
          r.url.includes('liveatc') || r.label.toLowerCase().includes('atc') || r.label.toLowerCase().includes('radio')
        )} editing={editing} onRemove={removeResource} />

        <ResourceGroup title="ACARS &amp; DATA" resources={resources.filter(r =>
          r.url.includes('airframes') || r.url.includes('acars') || r.label.toLowerCase().includes('acars')
        )} editing={editing} onRemove={removeResource} />

        <ResourceGroup title="TRACKING &amp; MAPS" resources={resources.filter(r =>
          !r.url.includes('liveatc') && !r.label.toLowerCase().includes('atc') &&
          !r.label.toLowerCase().includes('radio') &&
          !r.url.includes('airframes') && !r.url.includes('acars') &&
          !r.label.toLowerCase().includes('acars')
        )} editing={editing} onRemove={removeResource} />

        {editing && (
          <div className="add-resource-form">
            <div className="section-title">ADD LINK</div>
            <div className="add-form-row">
              <input className="input" placeholder="Label (e.g. LiveATC Melbourne)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <input className="input mono" placeholder="https://..." value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addResource()} />
              <button className="btn-add" onClick={addResource}><Plus size={16} /></button>
            </div>
          </div>
        )}

        {/* Squawk reference */}
        <div className="reference-section">
          <div className="section-title">SQUAWK CODE REFERENCE</div>
          <div className="ref-grid">
            {[
              { code: '7700', label: 'General Emergency', color: 'var(--squawk-7700)', detail: 'Mayday — any emergency incl. mechanical, medical, fuel' },
              { code: '7600', label: 'Radio Failure',     color: 'var(--squawk-7600)', detail: 'NORDO — loss of radio communications' },
              { code: '7500', label: 'Hijacking',          color: 'var(--squawk-7500)', detail: 'Unlawful interference — do not query on radio' },
              { code: '7400', label: 'UAS Lost Link',     color: 'var(--squawk-7400)', detail: 'Drone / UAV has lost its command uplink' },
              { code: '2000', label: 'No Discrete Code',  color: 'var(--text-dim)',    detail: 'IFR flight where no code has been assigned' },
              { code: '1200', label: 'VFR (US)',           color: 'var(--text-dim)',    detail: 'Standard VFR code in the United States' },
            ].map(({ code, label, color, detail }) => (
              <div className="ref-card" key={code}>
                <span className="ref-code mono" style={{ color }}>{code}</span>
                <span className="ref-label">{label}</span>
                <span className="ref-detail dim">{detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SuggestedGroup({ group }) {
  return (
    <div className={`suggested-group ${group.emergency ? 'suggested-emergency' : ''}`}>
      <div className="suggested-heading">{group.heading}</div>
      <div className="resource-list">
        {group.links.map((link, j) => (
          <div key={j} className="resource-row">
            <div className="resource-info">
              <span className="resource-label">{link.label}</span>
              <span className="resource-url dim mono">{link.url}</span>
            </div>
            <div className="resource-actions">
              <button className="btn-open" onClick={() => bridge.openExternal(link.url)}>
                <ExternalLink size={13} />
                Open
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResourceGroup({ title, resources, editing, onRemove }) {
  if (resources.length === 0 && !editing) return null
  return (
    <div className="resource-group">
      <div className="section-title" dangerouslySetInnerHTML={{ __html: title }} />
      {resources.length === 0 && <p className="dim" style={{ fontSize: 12 }}>No links in this category.</p>}
      <div className="resource-list">
        {resources.map(r => (
          <ResourceRow key={r.id} resource={r} editing={editing} onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}

function ResourceRow({ resource, editing, onRemove }) {
  return (
    <div className="resource-row">
      {editing && <GripVertical size={14} className="drag-handle" />}
      <div className="resource-info">
        <span className="resource-label">{resource.label}</span>
        <span className="resource-url dim mono">{resource.url}</span>
      </div>
      <div className="resource-actions">
        <button className="btn-open" onClick={() => bridge.openExternal(resource.url)}>
          <ExternalLink size={13} />
          Open
        </button>
        {editing && (
          <button className="btn-remove" onClick={() => onRemove(resource.id)}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
