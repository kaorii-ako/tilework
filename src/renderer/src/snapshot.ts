import type { Terminal } from '@xterm/xterm'
import type { SerializeAddon } from '@xterm/addon-serialize'

// The addon paints inverse cells black on grey; repaint them in the tile's own colours.
const INVERSE = 'color: #000000; background-color: #BFBFBF;'
const INVERSE_THEMED = 'color: var(--tile); background-color: var(--text);'

/**
 * The rows inside the addon's clipboard HTML (`<html>…<pre><div style=…>ROWS</div></pre>…`),
 * one `<div>` per terminal row. Text is already escaped by the addon.
 */
export function snapshotRows(html: string): string {
  const open = html.indexOf('<pre><div')
  if (open < 0) return ''
  const start = html.indexOf('>', open + 5) + 1
  const end = html.lastIndexOf('</div></pre>')
  return html.slice(start, end).replaceAll(INVERSE, INVERSE_THEMED)
}

/** The visible rows as coloured HTML. */
export function snapshot(term: Terminal, serializer: SerializeAddon): string {
  const top = term.buffer.active.viewportY
  return snapshotRows(
    serializer.serializeAsHTML({ range: { startLine: top, endLine: top + term.rows - 1, startCol: 0 } })
  )
}
