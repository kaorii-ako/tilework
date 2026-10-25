import { describe, expect, it } from 'vitest'
import { snapshotRows } from './snapshot'

// The shape @xterm/addon-serialize 0.14's serializeAsHTML produces.
const wrap = (rows: string) =>
  "<html><body><!--StartFragment--><pre><div style='color: #000000; background-color: #ffffff; font-family: mono; font-size: 13px;'>" +
  rows +
  '</div></pre><!--EndFragment--></body></html>'

describe('snapshotRows', () => {
  it('keeps the rows and their colours and drops the document wrapper', () => {
    const rows =
      "<div><span>$ ls</span></div><div><span><span style='color: #7aa2f7; font-weight: bold;'>src</span> a &lt; b</span></div>"
    expect(snapshotRows(wrap(rows))).toBe(rows)
  })

  it('repaints inverse cells in the tile colours', () => {
    const out = snapshotRows(
      wrap("<div><span><span style='color: #000000; background-color: #BFBFBF;'>sel</span></span></div>")
    )
    expect(out).toContain('color: var(--tile); background-color: var(--text);')
    expect(out).not.toContain('#BFBFBF')
  })

  it('returns nothing for unexpected input', () => {
    expect(snapshotRows('')).toBe('')
  })
})
