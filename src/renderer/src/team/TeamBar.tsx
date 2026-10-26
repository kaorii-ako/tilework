import { useState } from 'react'
import { useCanvas } from '../canvas/store'
import { allowJoin, denyJoin, joinTeam, leaveTeam, rememberedName, startSharing, useTeamUi } from './session'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Who's on this canvas, one coloured circle each. */
function People() {
  const team = useCanvas((s) => s.team)
  if (!team) return null
  return (
    <div className="team-people" aria-label="People on this canvas">
      {team.people.map((p) => (
        <span
          key={p.id}
          className="avatar"
          style={{ background: p.color }}
          title={p.id === team.me ? `${p.name} (you)` : p.name}
        >
          {initials(p.name)}
        </span>
      ))}
    </div>
  )
}

/** Host: someone asked to join. Shown even when the panel is closed. */
function Requests() {
  const requests = useTeamUi((u) => u.requests)
  if (!requests.length) return null
  return (
    <div className="team-requests">
      {requests.map((r) => (
        <div key={r.id} className="team-request" role="alertdialog" aria-label={`${r.name} wants to join`}>
          <span>
            <b>{r.name}</b> wants to join this canvas.
          </span>
          <button type="button" className="primary" onClick={() => allowJoin(r.id)}>
            Allow
          </button>
          <button type="button" onClick={() => denyJoin(r.id)}>
            Deny
          </button>
        </div>
      ))}
    </div>
  )
}

function Panel({ onClose }: { onClose(): void }) {
  const ui = useTeamUi((u) => u)
  const team = useCanvas((s) => s.team)
  const [name, setName] = useState(rememberedName)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const ready = name.trim().length > 0

  return (
    <div className="team-panel" role="dialog" aria-label="Team" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {ui.phase === 'off' && (
        <>
          <h2>Work on one canvas together</h2>
          <p className="muted">
            Everyone’s agents show up live on one canvas. Each agent keeps running on its owner’s computer. Free and
            peer to peer, with no account.
          </p>
          <label>
            Your name
            <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="primary" disabled={!ready} onClick={() => void startSharing(name.trim())}>
            Share this canvas
          </button>
          <div className="team-or">or join a teammate</div>
          <label>
            Invite code
            <input
              value={code}
              placeholder="tw1.…"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ready && void joinTeam(code, name.trim())}
            />
          </label>
          <button type="button" disabled={!ready || !code.trim()} onClick={() => void joinTeam(code, name.trim())}>
            Join
          </button>
        </>
      )}
      {ui.phase === 'hosting' && ui.invite && (
        <>
          <h2>Sharing this canvas</h2>
          <label>
            Invite code
            <div className="row">
              <input readOnly value={ui.invite} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(ui.invite!)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </label>
          <p className="muted">
            Send it to your teammates. Anyone with the code can ask to join, and you approve each person. Their tiles
            are view-only for you, and yours for them.
          </p>
        </>
      )}
      {ui.phase === 'joining' && (
        <>
          <h2>Joining…</h2>
          <p className="muted">Waiting for the host to let you in.</p>
        </>
      )}
      {team && (ui.phase === 'hosting' || ui.phase === 'connected') && (
        <ul className="team-list">
          {team.people.map((p) => (
            <li key={p.id}>
              <span className="avatar small" style={{ background: p.color }} />
              {p.name}
              {p.id === team.me ? ' (you)' : ''}
            </li>
          ))}
        </ul>
      )}
      {ui.phase !== 'off' && (
        <button type="button" onClick={leaveTeam}>
          {ui.phase === 'hosting' ? 'Stop sharing' : ui.phase === 'joining' ? 'Cancel' : 'Leave'}
        </button>
      )}
      {ui.error && (
        <p className="team-error" role="alert">
          {ui.error}
        </p>
      )}
    </div>
  )
}

/** Team mode (KAO-54): share this canvas, or join a teammate's. Top right, always there. */
export function TeamBar() {
  const [open, setOpen] = useState(false)
  const phase = useTeamUi((u) => u.phase)
  const error = useTeamUi((u) => u.error)
  return (
    <>
      <div className="team-bar">
        <People />
        <button
          type="button"
          aria-expanded={open}
          className={error && !open ? 'attention' : undefined}
          onClick={() => setOpen(!open)}
        >
          {phase === 'off' ? 'Share' : phase === 'joining' ? 'Joining…' : 'Team'}
        </button>
      </div>
      {open && <Panel onClose={() => setOpen(false)} />}
      <Requests />
    </>
  )
}
