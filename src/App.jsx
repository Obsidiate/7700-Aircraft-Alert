import { useState, useEffect, useCallback, useRef } from 'react'
import { Radio, Clock, Settings, BookOpen, AlertTriangle } from 'lucide-react'
import Dashboard from './panels/Dashboard.jsx'
import History from './panels/History.jsx'
import SettingsPanel from './panels/Settings.jsx'
import Resources from './panels/Resources.jsx'
import { bridge, SQUAWK_META } from './services/bridge.js'
import { playAlertBeep } from './services/audio.js'
import './App.css'

const NAV = [
  { id: 'dashboard', label: 'LIVE',      icon: Radio },
  { id: 'history',   label: 'HISTORY',   icon: Clock },
  { id: 'resources', label: 'RESOURCES', icon: BookOpen },
  { id: 'settings',  label: 'SETTINGS',  icon: Settings },
]

const GITHUB_REPO = 'Obsidiate/7700'
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`

function compareSemver(a, b) {
  const parse = v => v.replace(/^v/, '').split('.').map(Number)
  const [aMaj, aMin, aPatch] = parse(a)
  const [bMaj, bMin, bPatch] = parse(b)
  if (bMaj !== aMaj) return bMaj - aMaj
  if (bMin !== aMin) return bMin - aMin
  return bPatch - aPatch
}

export default function App() {
  const [panel, setPanel] = useState('dashboard')
  const [alerts, setAlerts] = useState([])
  const [aircraft, setAircraft] = useState([])
  const [settings, setSettings] = useState(null)
  const [lastPoll, setLastPoll] = useState(null)
  const [flashAlert, setFlashAlert] = useState(null)
  const [versionStatus, setVersionStatus] = useState(null) // null | 'current' | 'outdated'
  const [latestVersion, setLatestVersion] = useState(null)
  const [emergencyAircraft, setEmergencyAircraft] = useState(null)
  const flashTimerRef = useRef(null)

  useEffect(() => {
    bridge.getSettings().then(setSettings)
    bridge.getHistory().then(setAlerts)

    bridge.onNewAlert((alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 200))
      triggerFlash(alert)
      playAlertBeep()
      if (!alert._simulated) setEmergencyAircraft(alert)
    })

    bridge.onAircraftUpdate((ac) => {
      setAircraft(ac)
      setLastPoll(new Date())
    })

    // Version check
    bridge.getAppVersion().then(currentVersion => {
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.tag_name) return
          const latest = data.tag_name
          setLatestVersion(latest)
          setVersionStatus(compareSemver(currentVersion, latest) > 0 ? 'outdated' : 'current')
        })
        .catch(() => {})
    })

    return () => {
      bridge.removeAllListeners('new-alert')
      bridge.removeAllListeners('aircraft-update')
    }
  }, [])

  function triggerFlash(alert) {
    clearTimeout(flashTimerRef.current)
    setFlashAlert(alert)
    flashTimerRef.current = setTimeout(() => setFlashAlert(null), 4000)
  }

  const handleSimulateAlert = useCallback(async (ac) => {
    if (ac === null) {
      // Sim cancelled — clear emergency aircraft only if it was simulated
      setEmergencyAircraft(prev => prev?._simulated ? null : prev)
      return
    }
    await bridge.simulateAlert(ac)
    triggerFlash(ac)
    playAlertBeep()
    setEmergencyAircraft(ac)
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
      {/* Version banner */}
      {versionStatus === 'outdated' && (
        <div
          className="version-banner version-outdated"
          onClick={() => bridge.openExternal(RELEASES_URL)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && bridge.openExternal(RELEASES_URL)}
        >
          ↑ New version {latestVersion} available — click to download
        </div>
      )}
      {versionStatus === 'current' && (
        <div className="version-banner version-current">
          ✓ Up to date
        </div>
      )}

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
              R: {formatRadiusForDisplay(settings.radius, settings.radiusUnit)}
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {panel === 'dashboard' && (
          <Dashboard
            aircraft={aircraft}
            alerts={alerts}
            settings={settings}
            lastPoll={lastPoll}
            onSimulateAlert={handleSimulateAlert}
            emergencyAircraft={emergencyAircraft}
          />
        )}
        {panel === 'history'   && <History alerts={alerts} onClear={() => { bridge.clearHistory(); setAlerts([]) }} />}
        {panel === 'resources' && <Resources settings={settings} emergencyAircraft={emergencyAircraft} />}
        {panel === 'settings'  && settings && <SettingsPanel settings={settings} onSave={handleSaveSettings} />}
      </main>
    </div>
  )
}

function formatRadiusForDisplay(radiusNm, unit) {
  if (!unit || unit === 'nm') return `${radiusNm}nm`
  if (unit === 'km') return `${Math.round(radiusNm * 1.852)}km`
  if (unit === 'mi') return `${Math.round(radiusNm * 1.15078)}mi`
  return `${radiusNm}nm`
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
