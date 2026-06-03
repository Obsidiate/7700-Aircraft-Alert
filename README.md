# 7700 Aircraft Alert

Emergency aviation transponder squawk monitor. Polls live ADS-B data within a configurable radius and fires native desktop notifications when an aircraft squawks an emergency code.

Built with Electron + React + Vite. Runs on Windows and macOS.

---

<img width="2547" height="1346" alt="7700" src="https://github.com/user-attachments/assets/b2cde0f7-8050-4f94-8bcd-863ccc232eaa" />



## Planned Features

1st release is a super-alpha proof of concept at this stage. Intending to add:

- **Location picker** with automatically pulled ATC / live tracking site links for the selected area
- **More / better GUI layouts**
- **Preview alarm button** — test your alert sound without waiting for a real emergency
- **Customisable alert sounds and notifications**

---

## Features

- **Electron + React + Vite scaffold** — hot reload in dev, single-command distributable builds
- **ADS-B polling** — airplanes.live primary, adsb.fi automatic fallback; no API key required
- **Emergency squawk detection** — watches for 7700 / 7600 / 7500 / 7400; fires native OS notifications (Windows toast / macOS Notification Centre) with deduplication
- **Radar scope** — canvas-based sweep with blip fade, heading vectors, hover tooltips, click-to-select; no external dependencies
- **Live map** — Leaflet + OSM tiles; aircraft icons rotated to heading, emergency pulsing rings, trail lines, range ring
- **Dashboard views** — SPLIT (radar + list) / RADAR / MAP / RADAR+MAP / LIST; responsive RADAR+MAP layout via ResizeObserver
- **Settings panel** — location (lat/lon), radius (25–250 nm), poll interval, per-code squawk filter toggles, API preference
- **History panel** — timestamped log of every emergency detected (last 200, persisted via electron-store)
- **Resources panel** — editable quick-links for LiveATC feeds, ACARS tools, tracking sites; squawk code reference card
- **System tray** — runs quietly in the background; macOS hide-on-close keeps polling

---

## Squawk Codes

| Code | Meaning | Colour |
|---|---|---|
| 7700 | General emergency (mechanical, medical, fuel, etc.) | Red |
| 7600 | Radio failure — NORDO | Amber |
| 7500 | Hijacking / unlawful interference | Purple |
| 7400 | UAV / drone lost command link | Blue |

---

## Quick Start

Requires Node.js 18+.

```bash
npm install
npm run dev       # Vite dev server + Electron, hot reload
npm run dist      # Build distributable (.exe on Windows, .dmg on macOS)
```

---

## Project Structure

```
7700/
├── electron/
│   ├── main.js       # Main process: window, tray, IPC, notification dispatch
│   ├── preload.js    # Secure context bridge (main ↔ renderer)
│   └── poller.js     # ADS-B polling, haversine distance, alert deduplication
├── src/
│   ├── App.jsx / App.css          # Shell layout, sidebar nav, flash alert banner
│   ├── index.css                  # Design tokens, global styles, animations
│   ├── components/
│   │   └── RadarScope.jsx         # Canvas radar (self-contained, no deps)
│   ├── panels/
│   │   ├── Dashboard.jsx/.css     # Live view with mode toggle
│   │   ├── LiveMap.jsx/.css       # Leaflet map (embedded or standalone)
│   │   ├── History.jsx/.css       # Alert log
│   │   ├── Settings.jsx/.css      # Config UI
│   │   └── Resources.jsx/.css     # Editable links + squawk reference
│   └── services/
│       └── bridge.js              # IPC abstraction (Electron ↔ web fallback)
├── index.html        # Leaflet CSS loaded here via CDN (must not be a JS import)
├── vite.config.js
└── package.json
```

---

## Data Sources

Both are free, no API key required.

| API | Endpoint |
|---|---|
| airplanes.live (primary) | `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}` |
| adsb.fi (fallback) | `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{dist}` |

Both return ADSBexchange v2 compatible JSON (`{ ac: [ ...aircraft ] }`). Failover is automatic on non-200 or timeout.

---

## Legal

- airplanes.live: personal, non-commercial use. Contribute a feeder if you use it regularly.
- adsb.fi: personal, non-commercial use. Cite adsb.fi and link to their homepage.
- This tool is for situational awareness only. Not for safety-critical decision making.
