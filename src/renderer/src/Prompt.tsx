import { useState } from 'react'
import { createStore, useStore } from 'zustand'

interface Ask {
  title: string
  initial?: string
  placeholder?: string
  ok?: string
  resolve(text: string | null): void
}

// UI-only state (one open dialog), not canvas state, so it lives here rather than in canvasStore.
const promptStore = createStore<{ ask: Ask | null }>()(() => ({ ask: null }))

/** Ask for one line of text. Resolves with the trimmed text, or null if cancelled or left blank. */
export function askText(opts: Omit<Ask, 'resolve'>): Promise<string | null> {
  promptStore.getState().ask?.resolve(null) // only one at a time
  return new Promise((resolve) => promptStore.setState({ ask: { ...opts, resolve } }))
}

function PromptDialog({ ask }: { ask: Ask }) {
  const [text, setText] = useState(ask.initial ?? '')
  const done = (v: string | null) => {
    promptStore.setState({ ask: null })
    ask.resolve(v?.trim() ? v.trim() : null)
  }
  return (
    <div className="scrim" onMouseDown={() => done(null)}>
      <form
        className="launcher prompt"
        role="dialog"
        aria-label={ask.title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && done(null)}
        onSubmit={(e) => {
          e.preventDefault()
          done(text)
        }}
      >
        <label>
          <span className="prompt-title">{ask.title}</span>
          <input autoFocus value={text} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="row end">
          <button type="button" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!text.trim()}>
            {ask.ok ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Renders the open askText dialog, if any. Mount once. */
export function PromptHost() {
  const ask = useStore(promptStore, (s) => s.ask)
  // key: a new question starts with its own initial text
  return ask ? <PromptDialog key={ask.title + (ask.initial ?? '')} ask={ask} /> : null
}
