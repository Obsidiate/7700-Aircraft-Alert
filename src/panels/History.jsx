import { SQUAWK_META } from '../services/bridge.js'
import { Trash2 } from 'lucide-react'
import './History.css'

export default function History({ alerts, onClear }) {
  return (
    <div className="history-panel">
      <div className="history-header">
        <div>
          <h1 className="panel-title">ALERT HISTORY</h1>
          <span className="dim mono" style={{ fontSize: 12 }}>{alerts.length} events recorded</span>
        </div>
        {alerts.length > 0 && (
          <button className="btn-ghost" onClick={onClear}>
            <Trash2 size={14} />
            Clear History
          </button>
        )}
      </div>

      <div className="history-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <p className="dim">No alerts recorded yet.</p>
            <p className="dim" style={{ fontSize: 12 }}>Emergency squawks within your radius will appear here.</p>
          </div>
        ) : (
          alerts.map(alert => <HistoryRow key={alert.id} alert={alert} />)
        )}
      </div>
    </div>
  )
}

function HistoryRow({ alert }) {
  const meta = SQUAWK_META[String(alert.squawk)] || {}
  const time = new Date(alert.timestamp)

  return (
    <div className="history-row animate-fade-in">
      <div className="history-time mono dim">
        <div>{time.toLocaleDateString()}</div>
        <div>{time.toLocaleTimeString()}</div>
      </div>
      <div className="history-squawk mono" style={{ color: meta.color || 'var(--amber)' }}>
        {alert.squawk}
      </div>
      <div className="history-meta">
        <div className="history-label" style={{ color: meta.color }}>{meta.label || 'ALERT'}</div>
        <div className="history-id mono">{alert.flight?.trim() || alert.hex?.toUpperCase()}</div>
      </div>
      <div className="history-details dim mono">
        {alert.t && <span className="detail-chip">{alert.t}</span>}
        {alert.r && <span className="detail-chip">{alert.r}</span>}
        {alert.alt_baro && <span className="detail-chip">{Number(alert.alt_baro).toLocaleString()}ft</span>}
        {alert.gs && <span className="detail-chip">{alert.gs}kt</span>}
        {alert.distanceNm != null && <span className="detail-chip">{alert.distanceNm}nm</span>}
      </div>
    </div>
  )
}
