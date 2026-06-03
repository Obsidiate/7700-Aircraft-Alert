const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, shell } = require('electron')
const path = require('path')
const Store = require('electron-store')
const { startPoller, stopPoller } = require('./poller')

const store = new Store({
  defaults: {
    location: { lat: -37.8136, lon: 144.9631, label: 'Melbourne, VIC' },
    radius: 150,
    pollInterval: 30,
    squawkFilters: ['7700', '7600', '7500', '7400'],
    preferredApi: 'airplanes.live',
    radarColor: '#20c060',
    radiusUnit: 'nm',
    alertHistory: [],
    resources: [
      { id: '1', label: 'LiveATC – Melbourne Approach', url: 'https://www.liveatc.net/search/?icao=YMML' },
      { id: '2', label: 'LiveATC – Melbourne Ground', url: 'https://www.liveatc.net/search/?icao=YMML' },
      { id: '3', label: 'Airframes.io ACARS', url: 'https://app.airframes.io' },
      { id: '4', label: 'FlightAware', url: 'https://flightaware.com' },
      { id: '5', label: 'ADS-B Exchange', url: 'https://globe.adsbexchange.com' },
    ]
  }
})

let mainWindow = null
let tray = null
let isPolling = false

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin') {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  // Use a simple programmatic icon since we don't have asset files yet
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  const updateMenu = (status = 'idle') => {
    const contextMenu = Menu.buildFromTemplate([
      { label: '7700', enabled: false },
      { label: `Status: ${status}`, enabled: false },
      { type: 'separator' },
      { label: 'Show Window', click: () => { mainWindow.show(); mainWindow.focus() } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.quit() } },
    ])
    tray.setContextMenu(contextMenu)
    tray.setToolTip(`7700 — ${status}`)
  }

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })

  updateMenu('Monitoring')
  return updateMenu
}

function sendAlert(aircraft) {
  // Native OS notification
  if (Notification.isSupported()) {
    const squawkLabels = {
      '7700': '🚨 GENERAL EMERGENCY',
      '7600': '📻 RADIO FAILURE',
      '7500': '🔴 HIJACK DECLARED',
      '7400': '🛸 DRONE LOST LINK',
    }
    const label = squawkLabels[aircraft.squawk] || `SQUAWK ${aircraft.squawk}`
    const notification = new Notification({
      title: `${label}`,
      body: `${aircraft.flight || aircraft.hex} — ${aircraft.t || 'Unknown type'}\nAlt: ${aircraft.alt_baro || '?'}ft  Speed: ${aircraft.gs || '?'}kts`,
      urgency: 'critical',
    })
    notification.on('click', () => {
      mainWindow.show()
      mainWindow.focus()
    })
    notification.show()
  }

  // Save to history
  const history = store.get('alertHistory') || []
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...aircraft,
  }
  history.unshift(entry)
  store.set('alertHistory', history.slice(0, 200)) // keep last 200

  // Forward to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-alert', entry)
  }
}

// IPC handlers
ipcMain.handle('get-settings', () => ({
  location: store.get('location'),
  radius: store.get('radius'),
  radiusUnit: store.get('radiusUnit'),
  pollInterval: store.get('pollInterval'),
  squawkFilters: store.get('squawkFilters'),
  preferredApi: store.get('preferredApi'),
  radarColor: store.get('radarColor'),
  resources: store.get('resources'),
}))

ipcMain.handle('save-settings', (_, settings) => {
  Object.entries(settings).forEach(([k, v]) => store.set(k, v))
  // Restart poller with new settings
  const current = {
    location: store.get('location'),
    radius: store.get('radius'),
    pollInterval: store.get('pollInterval'),
    squawkFilters: store.get('squawkFilters'),
    preferredApi: store.get('preferredApi'),
  }
  stopPoller()
  startPoller(current, sendAlert, (aircraft) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('aircraft-update', aircraft)
    }
  })
  return { ok: true }
})

ipcMain.handle('get-history', () => store.get('alertHistory') || [])
ipcMain.handle('clear-history', () => { store.set('alertHistory', []); return { ok: true } })

ipcMain.handle('open-external', (_, url) => { shell.openExternal(url) })

ipcMain.handle('get-resources', () => store.get('resources'))
ipcMain.handle('save-resources', (_, resources) => { store.set('resources', resources); return { ok: true } })

ipcMain.handle('get-status', () => ({
  polling: isPolling,
  lastPoll: store.get('lastPoll'),
  activeCount: store.get('activeCount') || 0,
}))

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('overpass-query', async (_, query) => {
  const url = 'https://overpass.kumi.systems/api/interpreter'
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('[7700] Overpass error:', err.message)
    return { elements: [] }
  }
})

ipcMain.handle('simulate-alert', (_, ac) => {
  sendAlert(ac)
  return { ok: true }
})

app.whenReady().then(() => {
  createWindow()
  createTray()

  const settings = {
    location: store.get('location'),
    radius: store.get('radius'),
    pollInterval: store.get('pollInterval'),
    squawkFilters: store.get('squawkFilters'),
    preferredApi: store.get('preferredApi'),
  }

  isPolling = true
  startPoller(settings, sendAlert, (aircraft) => {
    store.set('lastPoll', new Date().toISOString())
    store.set('activeCount', aircraft.length)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('aircraft-update', aircraft)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPoller()
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow) mainWindow.show()
})

app.on('before-quit', () => {
  stopPoller()
})
