import { useEffect, useState } from 'react'

type State = 'hidden' | 'missing' | 'installing' | 'installed' | { error: string }

/**
 * Without the Claude Code hook there are no status dots and no handoffs, and nothing says why.
 * On launch, offer to install it. "Not now" hides it until the next launch.
 */
export function HookBanner() {
  const [state, setState] = useState<State>('hidden')
  useEffect(() => {
    window.canvasApi.hookInstalled().then((ok) => !ok && setState('missing'))
  }, [])
  if (state === 'hidden') return null

  const install = async () => {
    setState('installing')
    const r = await window.canvasApi.installHook()
    setState(r.ok ? 'installed' : { error: r.error })
  }
  const close = () => setState('hidden')

  return (
    <div className="banner" role="status">
      {state === 'missing' || state === 'installing' ? (
        <>
          <span>Status and handoffs need a Claude Code hook.</span>
          <button type="button" className="primary" onClick={install} disabled={state === 'installing'}>
            Install
          </button>
          <button type="button" onClick={close}>
            Not now
          </button>
        </>
      ) : state === 'installed' ? (
        <>
          <span>Hook installed. Claude Code tiles that were already running need a restart.</span>
          <button type="button" onClick={close}>
            OK
          </button>
        </>
      ) : (
        <>
          <span>Couldn’t install the hook: {state.error}</span>
          <button type="button" onClick={close}>
            OK
          </button>
        </>
      )}
    </div>
  )
}
