import { useEffect, useRef, useCallback, useState } from 'react'

const EMERGENCY_SQUAWKS = new Set(['7700', '7600', '7500', '7400'])

const SQUAWK_COLORS_HEX = {
  '7700': '#e03030',
  '7600': '#e09020',
  '7500': '#d020e0',
  '7400': '#2090e0',
}

// Convert bearing + distance to x/y on the scope
// bearing: degrees true north clockwise
// distance: nm
// radius: max nm shown on scope
// scopeR: pixel radius of scope
function project(bearingDeg, distanceNm, radiusNm, scopeR) {
  const r = (distanceNm / radiusNm) * scopeR
  const theta = (bearingDeg - 90) * (Math.PI / 180) // rotate so north=up
  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
  }
}

// Bearing from origin to aircraft in degrees true
function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

export default function RadarScope({ aircraft, settings, onSelect, selected }) {
  const canvasRef = useRef(null)
  const sweepRef = useRef(0)
  const rafRef = useRef(null)
  const trailsRef = useRef(new Map()) // hex -> [{x,y,age}]
  const lastSweepHitRef = useRef(new Map()) // hex -> sweep angle when last lit
  const [hoveredHex, setHoveredHex] = useState(null)
  const tooltipRef = useRef(null)
  const mouseRef = useRef({ x: 0, y: 0 })

  const radiusNm = settings?.radius || 150

  // Build positioned aircraft list
  const positioned = aircraft
    .filter(ac => ac.lat != null && ac.lon != null && settings?.location)
    .map(ac => {
      const bear = bearing(
        settings.location.lat, settings.location.lon,
        ac.lat, ac.lon
      )
      return { ...ac, bearing: bear }
    })

  const positionedRef = useRef(positioned)
  positionedRef.current = positioned

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    const scopeR = Math.min(cx, cy) - 24 // leave margin for labels

    ctx.clearRect(0, 0, W, H)

    // ── Background ───────────────────────────────────────────────────────────
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scopeR)
    bgGrad.addColorStop(0, '#07140a')
    bgGrad.addColorStop(0.7, '#050e07')
    bgGrad.addColorStop(1, '#030808')
    ctx.beginPath()
    ctx.arc(cx, cy, scopeR, 0, Math.PI * 2)
    ctx.fillStyle = bgGrad
    ctx.fill()

    // ── Range rings ──────────────────────────────────────────────────────────
    const rings = 4
    ctx.setLineDash([2, 4])
    for (let i = 1; i <= rings; i++) {
      const r = (i / rings) * scopeR
      const nm = Math.round((i / rings) * radiusNm)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(32,180,80,0.18)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Ring label
      ctx.fillStyle = 'rgba(32,180,80,0.5)'
      ctx.font = '10px "Share Tech Mono", monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${nm}nm`, cx + 4, cy - r + 12)
    }
    ctx.setLineDash([])

    // ── Cross-hairs ───────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(32,180,80,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, cy - scopeR); ctx.lineTo(cx, cy + scopeR)
    ctx.moveTo(cx - scopeR, cy); ctx.lineTo(cx + scopeR, cy)
    ctx.stroke()

    // ── Compass cardinal labels ──────────────────────────────────────────────
    ctx.fillStyle = 'rgba(32,180,80,0.6)'
    ctx.font = '11px "Share Tech Mono", monospace'
    ctx.textAlign = 'center'
    const cardinals = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]]
    for (const [label, dx, dy] of cardinals) {
      ctx.fillText(label, cx + dx * (scopeR + 14), cy + dy * (scopeR + 14) + 4)
    }

    // ── Degree tick marks ────────────────────────────────────────────────────
    for (let deg = 0; deg < 360; deg += 10) {
      const major = deg % 30 === 0
      const theta = (deg - 90) * Math.PI / 180
      const r1 = scopeR
      const r2 = scopeR - (major ? 8 : 4)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(theta) * r1, cy + Math.sin(theta) * r1)
      ctx.lineTo(cx + Math.cos(theta) * r2, cy + Math.sin(theta) * r2)
      ctx.strokeStyle = major ? 'rgba(32,180,80,0.5)' : 'rgba(32,180,80,0.2)'
      ctx.lineWidth = major ? 1.5 : 1
      ctx.stroke()

      if (major && deg % 90 !== 0) {
        ctx.fillStyle = 'rgba(32,180,80,0.45)'
        ctx.font = '9px "Share Tech Mono", monospace'
        const lr = scopeR - 18
        ctx.fillText(`${deg}`, cx + Math.cos(theta) * lr, cy + Math.sin(theta) * lr + 3)
      }
    }

    // ── Scope rim ────────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.arc(cx, cy, scopeR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(32,180,80,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // ── Sweep arm ────────────────────────────────────────────────────────────
    const sweep = sweepRef.current
    const sweepTheta = (sweep - 90) * Math.PI / 180

    // Fade trail behind sweep (60° arc)
    const trailGrad = ctx.createConicalGradient
      ? null // not widely supported, use manual arc
      : null

    // Draw sweep trail as arc segments
    const trailArc = (60 * Math.PI) / 180
    const trailSteps = 20
    for (let i = 0; i < trailSteps; i++) {
      const frac = i / trailSteps
      const thetaStart = sweepTheta - trailArc * (1 - frac)
      const thetaEnd = sweepTheta - trailArc * (1 - frac - 1 / trailSteps)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, scopeR, thetaStart, thetaEnd)
      ctx.closePath()
      ctx.fillStyle = `rgba(20,160,60,${0.045 * frac})`
      ctx.fill()
    }

    // Sweep line
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(
      cx + Math.cos(sweepTheta) * scopeR,
      cy + Math.sin(sweepTheta) * scopeR
    )
    ctx.strokeStyle = 'rgba(32,220,80,0.85)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = '#20e050'
    ctx.shadowBlur = 6
    ctx.stroke()
    ctx.shadowBlur = 0

    // ── Aircraft blips ───────────────────────────────────────────────────────
    const acList = positionedRef.current

    for (const ac of acList) {
      const isEmergency = EMERGENCY_SQUAWKS.has(String(ac.squawk))
      const color = isEmergency
        ? (SQUAWK_COLORS_HEX[String(ac.squawk)] || '#e03030')
        : '#20c060'

      const { x, y } = project(ac.bearing, ac.distanceNm ?? 0, radiusNm, scopeR)
      const px = cx + x
      const py = cy + y

      // Determine brightness based on sweep proximity
      const acAngle = ((ac.bearing % 360) + 360) % 360
      let angleDiff = ((sweep - acAngle + 360) % 360)
      if (angleDiff > 180) angleDiff = 360 - angleDiff
      // Blip fades over 60° after sweep passes
      const blipAge = angleDiff <= 60 ? 1 - angleDiff / 60 : 0
      const baseAlpha = isEmergency ? 1 : 0.4 + blipAge * 0.6

      // Trail dots
      const trails = trailsRef.current.get(ac.hex) || []

      // Update trails on sweep hit
      if (angleDiff < 3) {
        const lastHit = lastSweepHitRef.current.get(ac.hex) || -999
        if (Math.abs(sweep - lastHit) > 5) {
          trails.unshift({ x: px, y: py, age: 0 })
          if (trails.length > 5) trails.pop()
          lastSweepHitRef.current.set(ac.hex, sweep)
          trailsRef.current.set(ac.hex, trails)
        }
      }

      // Draw trail
      for (let t = 1; t < trails.length; t++) {
        const trail = trails[t]
        const trailAlpha = (1 - t / trails.length) * 0.3 * baseAlpha
        ctx.beginPath()
        ctx.arc(trail.x, trail.y, 2, 0, Math.PI * 2)
        ctx.fillStyle = isEmergency
          ? color + Math.floor(trailAlpha * 255).toString(16).padStart(2, '0')
          : `rgba(32,192,96,${trailAlpha})`
        ctx.fill()
      }

      // Emergency: outer ring pulse
      if (isEmergency) {
        const pulseR = 10 + Math.sin(Date.now() / 300) * 3
        ctx.beginPath()
        ctx.arc(px, py, pulseR, 0, Math.PI * 2)
        ctx.strokeStyle = color + '60'
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(px, py, 6, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.shadowColor = color
        ctx.shadowBlur = 8
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Main blip
      const blipR = isEmergency ? 4 : (ac.hex === selected ? 4 : 2.5)
      ctx.beginPath()
      ctx.arc(px, py, blipR, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = baseAlpha
      if (isEmergency || ac.hex === selected) {
        ctx.shadowColor = color
        ctx.shadowBlur = isEmergency ? 12 : 6
      }
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Track vector (heading line)
      if (ac.track != null && ac.gs > 30) {
        const vecLen = Math.min(ac.gs / 200, 0.5) * scopeR * 0.12
        const trackTheta = (ac.track - 90) * Math.PI / 180
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px + Math.cos(trackTheta) * vecLen, py + Math.sin(trackTheta) * vecLen)
        ctx.strokeStyle = color
        ctx.globalAlpha = baseAlpha * 0.7
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Label: callsign or hex
      if (baseAlpha > 0.3 || isEmergency || ac.hex === selected) {
        const label = (ac.flight?.trim() || ac.hex?.toUpperCase()?.slice(0, 6) || '?')
        const labelAlpha = isEmergency ? 1 : Math.max(0.35, baseAlpha)
        ctx.fillStyle = isEmergency ? color : `rgba(32,192,96,${labelAlpha})`
        ctx.font = isEmergency
          ? 'bold 10px "Share Tech Mono", monospace'
          : '9px "Share Tech Mono", monospace'
        ctx.textAlign = 'left'

        // Offset label to avoid blip overlap
        const lx = px + (x >= 0 ? 6 : -6 - ctx.measureText(label).width)
        const ly = py + (y >= 0 ? -6 : 14)
        if (isEmergency) {
          ctx.shadowColor = color
          ctx.shadowBlur = 6
        }
        ctx.fillText(label, lx, ly)
        ctx.shadowBlur = 0

        // Alt tag for selected
        if (ac.hex === selected && ac.alt_baro) {
          ctx.fillStyle = 'rgba(32,192,96,0.7)'
          ctx.font = '8px "Share Tech Mono", monospace'
          ctx.fillText(
            `${Math.round(ac.alt_baro / 100) * 100}ft`,
            lx, ly + 11
          )
        }
      }
    }

    // ── Origin marker ────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#20c060'
    ctx.shadowColor = '#20c060'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.shadowBlur = 0

    // Cross at origin
    ctx.strokeStyle = '#20c06099'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy)
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8)
    ctx.stroke()

    // ── Hover tooltip ─────────────────────────────────────────────────────────
    if (hoveredHex) {
      const hovered = acList.find(ac => ac.hex === hoveredHex)
      if (hovered) {
        const { x, y } = project(hovered.bearing, hovered.distanceNm ?? 0, radiusNm, scopeR)
        const px = cx + x
        const py = cy + y
        const lines = [
          hovered.flight?.trim() || hovered.hex?.toUpperCase(),
          `${hovered.t || '?'} · ${hovered.r || '?'}`,
          `ALT ${hovered.alt_baro ? Number(hovered.alt_baro).toLocaleString() + 'ft' : '—'}`,
          `SPD ${hovered.gs ? hovered.gs + 'kt' : '—'}  HDG ${hovered.track ? hovered.track + '°' : '—'}`,
          `${hovered.distanceNm != null ? hovered.distanceNm + 'nm' : '—'}  BRG ${Math.round(hovered.bearing)}°`,
          hovered.squawk ? `SQK ${hovered.squawk}` : '',
        ].filter(Boolean)

        const pad = 8
        const lineH = 14
        const boxW = 160
        const boxH = lines.length * lineH + pad * 2
        let bx = px + 12
        let by = py - boxH / 2
        if (bx + boxW > W - 10) bx = px - boxW - 12
        if (by < 4) by = 4
        if (by + boxH > H - 4) by = H - boxH - 4

        ctx.fillStyle = 'rgba(6,9,18,0.92)'
        ctx.strokeStyle = SQUAWK_COLORS_HEX[String(hovered.squawk)] || 'rgba(32,180,80,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(bx, by, boxW, boxH, 3)
        ctx.fill()
        ctx.stroke()

        for (let i = 0; i < lines.length; i++) {
          ctx.fillStyle = i === 0 ? '#e8eef8' : 'rgba(136,153,187,0.9)'
          ctx.font = i === 0
            ? 'bold 11px "Share Tech Mono", monospace'
            : '10px "Share Tech Mono", monospace'
          ctx.textAlign = 'left'
          ctx.fillText(lines[i], bx + pad, by + pad + i * lineH + 10)
        }
      }
    }

    // ── Sweep stats overlay ──────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(32,180,80,0.5)'
    ctx.font = '10px "Share Tech Mono", monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${acList.length} A/C`, cx - scopeR + 6, cy + scopeR - 8)
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(sweep)}°`, cx + scopeR - 6, cy + scopeR - 8)

  }, [hoveredHex, radiusNm, selected])

  // Animation loop
  useEffect(() => {
    let last = performance.now()
    const SWEEP_SPEED = 24 // degrees per second

    const loop = (now) => {
      const dt = (now - last) / 1000
      last = now
      sweepRef.current = (sweepRef.current + SWEEP_SPEED * dt) % 360
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = width * window.devicePixelRatio
      canvas.height = height * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Mouse interaction
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    mouseRef.current = { x: mx, y: my }

    const W = rect.width
    const H = rect.height
    const cx = W / 2
    const cy = H / 2
    const scopeR = Math.min(cx, cy) - 24

    let hit = null
    let minDist = 16

    for (const ac of positionedRef.current) {
      if (ac.distanceNm == null) continue
      const { x, y } = project(ac.bearing, ac.distanceNm, radiusNm, scopeR)
      const dx = mx - (cx + x)
      const dy = my - (cy + y)
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) { minDist = d; hit = ac.hex }
    }

    setHoveredHex(hit)
    canvas.style.cursor = hit ? 'pointer' : 'default'
  }, [radiusNm])

  const handleClick = useCallback((e) => {
    if (hoveredHex) onSelect?.(hoveredHex)
  }, [hoveredHex, onSelect])

  const handleMouseLeave = useCallback(() => {
    setHoveredHex(null)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    />
  )
}
