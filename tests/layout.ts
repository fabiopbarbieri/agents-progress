// A small text layout of a terminal tree, to read what a pane of `columns` cells shows.
// It stands in for Ink and Yoga only as far as this mod's trees need, and was checked
// against the terminal of Claude Code 2.1.316: a framed Button keeps its width, a Box or
// a Text gives way (flexShrink 1 unless set), `truncate-end` cuts with `…`, and what
// still passes the edge is clipped.

type Node = string | number | boolean | null | undefined | El
type El = { type: string; props?: Record<string, unknown>; children?: Node[] }

// Cells a string takes. The glyphs this mod draws (█ ░ ▣ ● ✓ ◷ ▢ ≈ · −) are one cell;
// CJK and emoji are two.
const cells = (s: string): number =>
  [...s].reduce((w, ch) => w + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0)

// The first `w` cells of `s`.
const cut = (s: string, w: number): string => {
  let out = ''
  for (const ch of s) {
    if (cells(out + ch) > w) break
    out += ch
  }
  return out
}

const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cells(s)))

const kids = (el: El): Node[] => (el.children ?? []).filter(c => c !== null && c !== undefined && c !== false && c !== true)

const flat = (n: Node): string => (typeof n === 'string' || typeof n === 'number' ? String(n) : n && typeof n === 'object' ? kids(n).map(flat).join('') : '')

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

const isFramed = (el: El): boolean => el.type === 'Button' && !el.props?.plain

// The Button's own text: framed `[ label ]`, plain its label or children.
const buttonText = (el: El): string => (isFramed(el) ? `[ ${String(el.props?.label ?? flat(el))} ]` : kids(el).length ? flat(el) : String(el.props?.label ?? ''))

// Cells a node wants, unconstrained.
const natural = (n: Node): number => {
  if (typeof n === 'string' || typeof n === 'number') return cells(String(n))
  if (!n || typeof n !== 'object') return 0
  const p = n.props ?? {}
  if (typeof p.width === 'number') return p.width
  if (n.type === 'Text') return Math.max(0, ...flat(n).split('\n').map(cells))
  if (n.type === 'Button') return cells(buttonText(n))
  const c = kids(n)
  const inner =
    p.flexDirection === 'row'
      ? c.reduce<number>((w, k) => w + natural(k), 0) + num(p.gap) * Math.max(0, c.length - 1)
      : Math.max(0, ...c.map(natural))
  return inner + num(p.paddingLeft)
}

const shrinkOf = (n: Node): number => {
  if (!n || typeof n !== 'object') return 1
  if (typeof n.props?.flexShrink === 'number') return n.props.flexShrink
  // A framed Button keeps its width: `[ ? ]` stays whole while the title gives way.
  return isFramed(n) ? 0 : 1
}

const wrapWords = (s: string, w: number): string[] => {
  if (w <= 0) return ['']
  const lines: string[] = []
  for (const para of s.split('\n')) {
    let line = ''
    for (const word of para.split(/(?<= )/)) {
      if (cells(line + word) <= w || !line) line += word
      else {
        lines.push(line.trimEnd())
        line = word
      }
      while (cells(line) > w) {
        lines.push(cut(line, w))
        line = line.slice(cut(line, w).length)
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

// The rows a node draws in `w` cells, each at most `w` wide.
export const render = (n: Node, w: number): string[] => {
  if (w <= 0) return ['']
  if (typeof n === 'string' || typeof n === 'number') return [cut(String(n), w)]
  if (!n || typeof n !== 'object') return []
  const p = n.props ?? {}
  if (n.type === 'Text' || (n.type === 'Button' && !isFramed(n))) {
    const s = n.type === 'Text' ? flat(n) : buttonText(n)
    // A plain Button with Text inside draws as that Text, its wrap included.
    const inner = n.type === 'Button' ? kids(n).find((k): k is El => typeof k === 'object' && !!k && k.type === 'Text') : n
    const wrap = inner?.props?.wrap
    if (wrap === 'truncate-end') return [cells(s) > w ? cut(s, w - 1) + '…' : s]
    return wrapWords(s, w)
  }
  if (n.type === 'Button') return [cut(buttonText(n), w)]
  const c = kids(n)
  const pl = num(p.paddingLeft)
  const avail = typeof p.width === 'number' ? Math.min(w, p.width) : w
  const lead = ' '.repeat(Math.min(pl, avail))
  if (p.flexDirection !== 'row') {
    const out: string[] = []
    for (const k of c) {
      const kp = (typeof k === 'object' && k?.props) || {}
      for (let i = 0; i < num(kp.marginTop); i++) out.push('')
      out.push(...render(k, avail - pl).map(l => lead + l))
      for (let i = 0; i < num(kp.marginBottom); i++) out.push('')
    }
    return out
  }
  // A row: each child at its natural width, given way by flexShrink when the row is too
  // wide, the free cells spread between them under space-between.
  const gap = num(p.gap)
  const room = avail - pl - gap * Math.max(0, c.length - 1)
  const ws = c.map(natural)
  let over = ws.reduce((a, b) => a + b, 0) - room
  while (over > 0) {
    const weights = c.map((k, i) => (ws[i]! > 0 ? shrinkOf(k) * ws[i]! : 0))
    const sum = weights.reduce((a, b) => a + b, 0)
    if (sum === 0) break
    // Each gives way in proportion to its width, rounded down; the widest takes the rest.
    let taken = 0
    c.forEach((_, i) => {
      const give = Math.min(ws[i]!, Math.floor((over * weights[i]!) / sum))
      ws[i] = ws[i]! - give
      taken += give
    })
    if (taken === 0) {
      const i = weights.indexOf(Math.max(...weights))
      ws[i] = ws[i]! - 1
      taken = 1
    }
    over -= taken
  }
  const free = Math.max(0, room - ws.reduce((a, b) => a + b, 0))
  const between = p.justifyContent === 'space-between' && c.length > 1 ? free / (c.length - 1) : 0
  const drawn = c.map((k, i) => render(k, ws[i]!))
  const height = Math.max(1, ...drawn.map(d => d.length))
  const lines: string[] = []
  for (let r = 0; r < height; r++) {
    let line = ''
    drawn.forEach((d, i) => {
      if (i > 0) line += ' '.repeat(gap + Math.round(between * i) - Math.round(between * (i - 1)))
      line += pad(d[r] ?? '', ws[i]!)
    })
    // Past the pane's edge nothing shows.
    lines.push(lead + cut(line, avail - pl).trimEnd())
  }
  return lines
}

// Whether a row lost text: a cut with `…`, or a row clipped at the edge.
export const isCut = (natural: string, drawn: string): boolean => drawn !== natural.trimEnd()

export const naturalOf = natural
