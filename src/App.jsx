import { useState, useEffect, useCallback } from 'react'
import { Radio, Clock, Settings, BookOpen, AlertTriangle, Map } from 'lucide-react'
import Dashboard from './panels/Dashboard.jsx'
import History from './panels/History.jsx'
import SettingsPanel from './panels/Settings.jsx'
import Resources from './panels/Resources.jsx'
import LiveMap from './panels/LiveMap.jsx'
import { bridge, SQUAWK_META } from './services/bridge.js'
import './App.css'

const NAV = [
  { id: 'dashboard',  label: 'LIVE',      icon: Radio },
  { id: 'map',        label: 'MAP',       icon: Map },
  { id: 'history',    label: 'HISTORY',   icon: Clock },
  { id: 'resources',  label: 'RESOURCES', icon: BookOpen },
  { id: 'settings',   label: 'SETTINGS',  icon: Settings },
]

export default function App() {
  const [panel, setPanel] = useState('dashboard')
  const [alerts, setAlerts] = useState([])
  const [aircraft, setAircraft] = useState([])
  const [settings, setSettings] = useState(null)
  const [lastPoll, setLastPoll] = useState(null)
  const [flashAlert, setFlashAlert] = useState(null)

  useEffect(() => {
    bridge.getSettings().then(setSettings)
    bridge.getHistory().then(setAlerts)

    bridge.onNewAlert((alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 200))
      setFlashAlert(alert)
      setTimeout(() => setFlashAlert(null), 4000)
    })

    bridge.onAircraftUpdate((ac) => {
      setAircraft(ac)
      setLastPoll(new Date())
    })

    return () => {
      bridge.removeAllListeners('new-alert')
      bridge.removeAllListeners('aircraft-update')
    }
  }, [])

  const activeAlerts = aircraft.filter(ac =>
    settings?.squawkFilters?.includes(String(ac.squawk))
  )

  const handleSaveSettings = useCallback(async (newSettings) => {
    await bridge.saveSettings(newSettings)
    setSettings(newSettings)
  }, [])

  return (
    <div className="app-shell">
      {/* Flash alert banner */}
      {flashAlert && (
        <div className="flash-banner animate-slide-in" style={{
          borderColor: SQUAWK_META[flashAlert.squawk]?.color || 'var(--red)'
        }}>
          <AlertTriangle size={16} />
          <span className="flash-code" style={{ color: SQUAWK_META[flashAlert.squawk]?.color }}>
            {flashAlert.squawk}
          </span>
          <span className="flash-label">{SQUAWK_META[flashAlert.squawk]?.label || 'ALERT'}</span>
          <span className="flash-id mono">{flashAlert.flight || flashAlert.hex}</span>
          <span className="flash-type dim">{flashAlert.t || ''}</span>
          {flashAlert.distanceNm && (
            <span className="flash-dist mono">{flashAlert.distanceNm}nm</span>
          )}
        </div>
      )}

      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <RadarIcon active={activeAlerts.length > 0} />
          </div>
          <div className="logo-text">
            <span className="logo-primary">7700</span>
          </div>
        </div>

        <div className="nav-items">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${panel === id ? 'active' : ''}`}
              onClick={() => setPanel(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
              {id === 'dashboard' && activeAlerts.length > 0 && (
                <span className="nav-badge">{activeAlerts.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="sidebar-status">
          <div className="status-row">
            <span className={`status-dot ${lastPoll ? 'active' : 'idle'}`} />
            <span className="dim mono" style={{ fontSize: 11 }}>
              {lastPoll
                ? lastPoll.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Connecting…'}
            </span>
          </div>
          <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
            {aircraft.length} a/c in range
          </div>
          {settings?.location && (
            <div className="dim" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>
              {settings.location.label}<br />
              R: {settings.radius}nm
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {panel === 'dashboard'  && <Dashboard aircraft={aircraft} alerts={alerts} settings={settings} />}
        {panel === 'map'       && <LiveMap aircraft={aircraft} settings={settings} />}
        {panel === 'history'    && <History alerts={alerts} onClear={() => { bridge.clearHistory(); setAlerts([]) }} />}
        {panel === 'resources'  && <Resources />}
        {panel === 'settings'   && settings && <SettingsPanel settings={settings} onSave={handleSaveSettings} />}
      </main>
    </div>
  )
}

function RadarIcon({ active }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--border-bright)" strokeWidth="1" />
      <circle cx="16" cy="16" r="9"  fill="none" stroke="var(--border)"        strokeWidth="1" />
      <circle cx="16" cy="16" r="4"  fill="none" stroke="var(--border)"        strokeWidth="1" />
      <circle cx="16" cy="16" r="1.5" fill={active ? 'var(--red)' : 'var(--text-dim)'} />
      {active && (
        <line
          x1="16" y1="16" x2="16" y2="2"
          stroke="var(--green)" strokeWidth="1.5" opacity="0.8"
          style={{ transformOrigin: '16px 16px', animation: 'radar-sweep 3s linear infinite' }}
        />
      )}
    </svg>
  )
}
