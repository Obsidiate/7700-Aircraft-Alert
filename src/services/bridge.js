// Bridge between the renderer and Electron main process.
// Falls back to mock data when running in a plain browser (web build / dev without Electron).

const isElectron = typeof window !== 'undefined' && !!window.app7700

const DEFAULTS = {
  location: { lat: -37.8136, lon: 144.9631, label: 'Melbourne, VIC' },
  radius: 150,
  pollInterval: 30,
  squawkFilters: ['7700', '7600', '7500', '7400'],
  preferredApi: 'airplanes.live',
  resources: [
    { id: '1', label: 'LiveATC – Melbourne Approach', url: 'https://www.liveatc.net/search/?icao=YMML' },
    { id: '2', label: 'Airframes.io ACARS', url: 'https://app.airframes.io' },
    { id: '3', label: 'FlightAware', url: 'https://flightaware.com' },
    { id: '4', label: 'ADS-B Exchange Globe', url: 'https://globe.adsbexchange.com' },
  ]
}

export const bridge = {
  async getSettings() {
    if (isElectron) return window.app7700.getSettings()
    return { ...DEFAULTS }
  },

  async saveSettings(settings) {
    if (isElectron) return window.app7700.saveSettings(settings)
    console.log('[bridge] saveSettings (mock):', settings)
    return { ok: true }
  },

  async getHistory() {
    if (isElectron) return window.app7700.getHistory()
    return []
  },

  async clearHistory() {
    if (isElectron) return window.app7700.clearHistory()
    return { ok: true }
  },

  async getResources() {
    if (isElectron) return window.app7700.getResources()
    return DEFAULTS.resources
  },

  async saveResources(resources) {
    if (isElectron) return window.app7700.saveResources(resources)
    return { ok: true }
  },

  async getStatus() {
    if (isElectron) return window.app7700.getStatus()
    return { polling: false, lastPoll: null, activeCount: 0 }
  },

  openExternal(url) {
    if (isElectron) return window.app7700.openExternal(url)
    window.open(url, '_blank', 'noopener')
  },

  onNewAlert(cb) {
    if (isElectron) window.app7700.onNewAlert(cb)
  },

  onAircraftUpdate(cb) {
    if (isElectron) window.app7700.onAircraftUpdate(cb)
  },

  removeAllListeners(channel) {
    if (isElectron) window.app7700.removeAllListeners(channel)
  },

  async getAppVersion() {
    if (isElectron) return window.app7700.getAppVersion()
    return '0.0.0'
  },

  async simulateAlert(ac) {
    if (isElectron) return window.app7700.simulateAlert(ac)
    return { ok: true }
  },

  async overpassQuery(query) {
    if (isElectron) return window.app7700.overpassQuery(query)
    // Web fallback — direct fetch (works in browser dev, blocked in packaged Electron)
    const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    })
    return res.json()
  },
}

export const SQUAWK_META = {
  '7700': { label: 'EMERGENCY',     color: 'var(--squawk-7700)', short: 'MAYDAY' },
  '7600': { label: 'RADIO FAILURE', color: 'var(--squawk-7600)', short: 'NORDO'  },
  '7500': { label: 'HIJACK',        color: 'var(--squawk-7500)', short: 'HIJACK' },
  '7400': { label: 'DRONE LINK',    color: 'var(--squawk-7400)', short: 'UAS'    },
}
