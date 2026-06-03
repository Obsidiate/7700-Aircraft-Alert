import alertSoundUrl from '../../public/airbus_master_warn.mp3'

let audioCtx = null
let alertAudio = null

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

function getAlertAudio() {
  if (!alertAudio) {
    alertAudio = new Audio(alertSoundUrl)
    alertAudio.preload = 'auto'
  }
  return alertAudio
}

function syntheticFallback() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const t = ctx.currentTime
    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.connect(env)
      env.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 1100
      env.gain.setValueAtTime(0, t + i * 0.30)
      env.gain.linearRampToValueAtTime(0.6, t + i * 0.30 + 0.004)
      env.gain.exponentialRampToValueAtTime(0.001, t + i * 0.30 + 0.20)
      osc.start(t + i * 0.30)
      osc.stop(t + i * 0.30 + 0.20)
    }
  } catch {
    // Audio unavailable
  }
}

export function playAlertBeep() {
  try {
    const audio = getAlertAudio()
    audio.currentTime = 0
    const playPromise = audio.play()
    if (playPromise) {
      playPromise.catch(() => syntheticFallback())
    }
  } catch {
    syntheticFallback()
  }
}
