# 7700 Aircraft Alert

Emergency aviation transponder squawk monitor. Polls live ADS-B data within a configurable radius and fires native desktop notifications when an aircraft squawks an emergency code.

Built with Electron + React + Vite. Runs on Windows and macOS.

---

<img width="2547" height="1346" alt="7700" src="https://github.com/user-attachments/assets/b2cde0f7-8050-4f94-8bcd-863ccc232eaa" />

---

## Disclaimer

This tool is a hobbyist/enthusiast project intended for light personal use only. It is absolutely not intended, approved, or suitable for commercial, operational, or emergency service use. It should not be considered reliable, it is in a very early active development stage, subject to breaking changes, and dependent on third-party ADS-B APIs that may be blocked, rate-limited, or discontinued at any time without notice. Do not use this tool for safety-critical decision making of any kind.

## Download

**[7700 Aircraft Alert V1.0.0.exe](https://github.com/Obsidiate/7700-Aircraft-Alert/releases/latest)** — portable single file, no installation required. Settings persist between sessions.

## Development 

This is still very much eary in development. 
Suggestions are quite welcome in the discussions tabs above!
Issues welcome in the issues tab above! 

---

## Features

**Live monitoring**
- ADS-B polling via airplanes.live (primary) and adsb.fi (automatic fallback) — no API key required
- Emergency squawk detection with native OS desktop notifications + A320 Master Caution alert sound
- Configurable poll interval (15–120 s) and radius up to 4,000 km

**Dashboard views**
- Split Both (default) — radar + map stacked left, aircraft list right
- Split Radar, Split Map, List — additional layout options
- Emergency response panel — on alert the list pane shows aircraft details and relevant links

**Radar scope**
- Canvas sweep with blip fade, heading vectors, hover tooltips, click-to-select
- Zoom (+/− and mousewheel) and drag-to-pan with reset
- Customisable accent colour for sweep, rings, and non-emergency aircraft

**Live map**
- Leaflet + OSM tiles; dark, standard, and topo layer options
- Aircraft icons rotated to heading, emergency pulsing rings, trail lines, range ring

**Settings**
- Address autocomplete via OpenStreetMap — search by city or airport
- Radius in nautical miles, kilometres, or miles (up to 4,000 km)
- Per-code squawk filter toggles, API preference, accent colour picker

**Alerts**
- Simulate Alert button — test the full alert stack without a real emergency
- Alert history — last 200 events, persisted; simulated alerts tagged SIM

**Resources**
- Suggested links auto-populated from your location (tracking, LiveATC, investigation tools)
- Editable quick-links panel + squawk code reference card

**Other**
- Version banner — notified on launch if a new GitHub release is available
- System tray — runs quietly in background

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
npm run dev    # Vite dev server + Electron, hot reload
npm run dist   # Build portable EXE
```

---

## Data Sources

Both free, no API key required.

| API | Endpoint |
|---|---|
| airplanes.live (primary) | `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}` |
| adsb.fi (fallback) | `https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{dist}` |

---

## Legal

- airplanes.live: personal, non-commercial use. Contribute a feeder if you use it regularly.
- adsb.fi: personal, non-commercial use.
- 
**Disclaimer:** This tool is a hobbyist/enthusiast project intended for light personal use only. It is absolutely not intended, approved, or suitable for commercial, operational, or emergency service use. It should not be considered reliable — it is in active development, subject to breaking changes, and dependent on third-party ADS-B APIs that may be blocked, rate-limited, or discontinued at any time without notice. Do not use this tool for safety-critical decision making of any kind.
