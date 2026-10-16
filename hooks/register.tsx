import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import type { AgentRun, Flow, Panel, Phase, PlannedTask } from '../types'

const flow = atom({ plugin: 'agents-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'agents-progress', key: 'agents' } as const, [])
const panel = atom({ plugin: 'agents-progress', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
const now = atom({ plugin: 'agents-progress', key: 'now' } as const, 0)

// `update` writes, and so redraws every reader, even when the value stays the same:
// these write only a change. One per value, as the engine's scan reads each by name.
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

async function patchFlow($: EngineInterface, change: (f: Flow | null) => Flow | null): Promise<Flow | null> {
  const held = await read($, flow)
  return same(change(held), held) ? held : update($, flow, change)
}

async function patchAgents($: EngineInterface, change: (list: AgentRun[]) => AgentRun[]): Promise<AgentRun[]> {
  const held = await read($, agents)
  return same(change(held), held) ? held : update($, agents, change)
}

const TOOL = 'mcp__agents-progress__progress'
const STEP_TOOL = 'mcp__agents-progress__step'
const PANE = 'agents-progress'
const QUIET_TOOLS = new Set([TOOL, STEP_TOOL])
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
// How long a finished flow's band stays before it steps aside by itself.
const FINISHED_LINGER_MS = 10_000
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Portuguese or Russian.

type Lang = 'en' | 'pt' | 'ru'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    earlier: 'earlier',
    fewer: 'Show fewer',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'Tasks running',
    flow: 'Progress',
    view: 'View',
    main: 'Main conversation',
    inView: 'in view',
    gone: "This run's transcript is gone: Claude Code lets a run go about 30 seconds after it ends.",
  },
  pt: {
    pane: 'Agentes',
    cost: 'Custo',
    tokens: 'Tokens',
    time: 'Tempo',
    collapse: 'Recolher',
    expand: 'Expandir',
    running: 'Em execução',
    finished: 'Concluídos',
    earlier: 'anteriores',
    fewer: 'Mostrar menos',
    planned: 'Planejados',
    empty: 'Nenhum subagente ainda.',
    round: 'rodada',
    failed: 'erro',
    after: 'depois de',
    tokensWord: 'tokens',
    agentsCount: 'agentes',
    isRunning: 'em execução',
    isFinished: 'concluído',
    isPlanned: 'planejada',
    opened: 'Painel de agentes aberto.',
    closed: 'Painel de agentes fechado.',
    done: 'Concluído',
    plan: 'Plano',
    design: 'Design',
    tasks: 'Tarefas',
    review: 'Revisão',
    busy: 'Tarefas em execução',
    flow: 'Progresso',
    view: 'Ver',
    main: 'Conversa principal',
    inView: 'em vista',
    gone: 'O transcript deste run não está mais disponível: o Claude Code libera um run cerca de 30 s depois que ele termina.',
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    earlier: 'ранее',
    fewer: 'Показать меньше',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'Задачи в работе',
    flow: 'Прогресс',
    view: 'Открыть',
    main: 'Основной диалог',
    inView: 'открыт',
    gone: 'Транскрипт этого запуска больше недоступен: Claude Code отпускает запуск примерно через 30 секунд после завершения.',
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
// $.ui.view came with Claude Code 2.1.300; the desktop app runs its own engine, which
// may lag. Set in session.start, as lang is.
let canView = true

const VIEW_SINCE = [2, 1, 300]

async function engineHasView($: EngineInterface): Promise<boolean> {
  try {
    const { base, version } = await $.session.version()
    const parts = (base ?? version).split(/[.-]/).slice(0, 3).map(Number)
    // A version not spelled as a release is a build of its own: assume it has the call.
    if (parts.length < 3 || parts.some(isNaN)) return true
    for (const [i, since] of VIEW_SINCE.entries()) if (parts[i] !== since) return parts[i]! > since
    return true
  } catch {
    return false
  }
}
const tr = () => STRINGS[lang]

const langOf = (v: unknown): Lang => {
  if (typeof v !== 'string') return 'en'
  if (/^(ru|russian|рус)/i.test(v.trim())) return 'ru'
  if (/^(pt|portugu)/i.test(v.trim())) return 'pt'
  return 'en'
}

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'pt' || option === 'ru') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

const blank = (): Flow => ({
  title: tr().flow,
  total: 0,
  done: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && input.title.trim() !== prev.title)

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: (t.tier ?? '').trim().toLowerCase(),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total)))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: input.title?.trim() || base.title,
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

// What every subagent's brief gets, so the pane draws the task's own bar instead of
// its context fill. In English, as the tools' own descriptions are.
const STEP_BRIEF =
  'Report your progress with `mcp__agents-progress__step` (if it is listed only by name, load it first with ' +
  'ToolSearch `select:mcp__agents-progress__step`): right after reading this brief, call it with `total` (your plan ' +
  'in 3 to 8 steps) and `done: 0`; call it again with the new `done` and a short `note` as each step finishes.'

const briefed = (prompt: string, isOn: boolean): string =>
  !isOn || prompt.includes(STEP_TOOL) ? prompt : `${prompt}\n\n${STEP_BRIEF}`

// Runs still at work. The Agent tool answers as soon as a background run starts,
// so only the runs' own status says how many are out.
const runningOf = (list: AgentRun[]): number => list.filter(a => a.status === 'running').length

const label = (f: Flow, running: number): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const isReview = f.phase === 'review'
  // Without a plan there is no x/y, only how many run now: "Tarefas em execução: 2".
  if (!f.total) return `${isReview ? s.review : s.busy}: ${running}`
  return `${isReview ? s.review : s.tasks} ${f.done}/${f.total}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The whole row is one SVG: the desktop wraps sibling elements onto new lines,
// so title, bar, percent and the crab live in one drawing; only the count and
// the dismiss are Buttons beside it.
const H = 22
const BAR_H = 16
const CRAB_W = 26
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const rowSvg = (f: Flow, W: number, running: number): string => {
  const isWorking = running > 0
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46 - CRAB_W)
  const color = f.isFinished ? DONE : ACCENT
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + running)) / f.total) : 0
  // Each layer's cells go into four paths, one per twinkle group: four animated
  // elements however wide the bar, where every cell was one before.
  const dots = ['', '', '', '']
  const faint = ['', '', '', '']
  const cell = (x: number, y: number, size: number) => `M${x} ${y}h${size}v${size}h${-size}z`

  // Dithered fill: sparse at the start, dense toward the head.
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots[Math.floor(noise(r, c) * 4)] += cell(c * CELL + 1, r * CELL + 1, 2)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint[Math.floor(noise(r + 5, c) * 4)] += cell(c * CELL + 1, r * CELL + 1, 1.7)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${x}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const text = label(f, running)
  const pillW = Math.round(18 + text.length * 6.6)
  const pillX = Math.max(0, Math.min(BAR_W - pillW, fillW - pillW))
  const percent = `${Math.round(ratio(f) * 100)}%`
  const walker = crab(W - CRAB_W + 1, 0, 'other', false, isWorking, 0.8)
  const layer = (groups: string[]) => groups.map((d, k) => (d ? `<path class="t${k}" d="${d}"/>` : '')).join('')
  // Pixels twinkle in four out-of-phase groups while runs are at work; otherwise the bar stands still.
  const twinkle =
    isWorking && !f.isFinished
      ? `.t0,.t1,.t2,.t3{animation:tw 2.2s ease-in-out infinite}
.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:0.3}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
${twinkle}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="5" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" x="16" y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${BAR_X},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${layer(dots)}</g>
<g fill="${color}" opacity="0.45">${layer(faint)}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(text)}</text>
</g>
<text class="m" x="${W - CRAB_W - 6}" y="${H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${crabCss(walker)}${walker}
</svg>`
}

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, string> = {
  fable: 'Fable',
  heavy: 'Opus',
  careful: 'Opus',
  medium: 'Sonnet',
  light: 'Haiku',
}

// USD per million tokens: input, output, cache read, cache write (5-minute TTL).
// The engine reports tokens, not money, so the panel's cost is an estimate.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string): [number, number, number, number] =>
  PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]

const costOf = (model: string, u: Usage): number => {
  const [i, o, r, w] = priceOf(model)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

const windowOf = (model: string): number => (/haiku/i.test(model) ? 200_000 : 1_000_000)

// What each tier runs on, for planned tasks that have no run yet.
// A run takes its tier from an agent type named after one (`careful`, `plugin:careful`), else from its model: Fable is fable, Opus heavy at xhigh or max
// effort and careful below, Sonnet medium, Haiku light.
const tierOf = (type: string, model = '', effort = ''): string => {
  const named = type.replace(/^[^:]*:/, '').toLowerCase()
  if (named in TIER_MODEL) return named
  const m = model.toLowerCase()
  if (/fable|mythos/.test(m)) return 'fable'
  if (/opus/.test(m)) return /xhigh|max/.test(effort) ? 'heavy' : 'careful'
  if (/sonnet/.test(m)) return 'medium'
  if (/haiku/.test(m)) return 'light'
  return 'other'
}

const tierOfRun = (a: AgentRun): string => tierOf(a.type, a.model, a.effort)

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

// The runs started since the flow began: earlier runs of the session are not its tasks.
const runsOf = (f: Flow, list: AgentRun[]): AgentRun[] => list.filter(a => a.startedAt >= (f.startedAt ?? 0))

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(runsOf(f, list).map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

// The time some run was at work: runs side by side count once, and the idle spells
// between them (the session keeps its runs across flows) not at all.
const busyTime = (list: AgentRun[], at: number): number => {
  const spans = list.map(a => [a.startedAt, a.endedAt ?? Math.max(at, a.startedAt)] as const).sort((x, y) => x[0] - y[0])
  let total = 0
  let end = -Infinity
  for (const [from, to] of spans) {
    if (to <= end) continue
    total += to - Math.max(from, end)
    end = to
  }
  return total
}

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  return { cost, tokens, time: busyTime(list, at) }
}

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top. A drawing carries only the rules
// of the costumes walking in it, and none when no crab walks.
const WALK_CSS = `.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@keyframes blink{50%{opacity:.15}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}`

const COSTUME_CSS: Record<string, string> = {
  fable: `.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .ant{animation:blink 1s steps(1) infinite}
.c-fable.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}`,
  heavy: `.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}`,
  careful: `.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}`,
  medium: `.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}`,
  light: `.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}`,
  explore: `.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}`,
}

const crabCss = (markup: string): string => {
  const walking = new Set([...markup.matchAll(/class="c-([a-z]+) run"/g)].map(m => m[1] ?? ''))
  if (!walking.size) return ''
  return `<style>${WALK_CSS}${[...walking].map(c => COSTUME_CSS[c] ?? '').join('')}</style>`
}

const COSTUMES: Record<string, (f: Fill, t: string) => void> = {
  // Fable: astronaut in a glass dome; floats instead of walking, the antenna and the star blink.
  fable: (f, t) => {
    crabBody(f)
    f(6, 7, 18, 1, '#E6E8EE'); f(5, 8, 1, 14, '#E6E8EE'); f(24, 8, 1, 14, '#E6E8EE'); f(6, 22, 18, 1, '#C9CCD2')
    f(6, 8, 18, 14, 'rgba(169,214,245,.32)'); f(8, 9, 2, 1, '#fff'); f(8, 10, 1, 2, '#fff')
    f(14, 4, 2, 3, '#C9CCD2'); f(14, 2, 2, 2, t, 'ant'); f(13, 18, 4, 2, t)
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  // Heavy: detective with a deerstalker; the magnifier sweeps and glints.
  heavy: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  // Careful: engineer in a hard hat; the wrench turns a bolt.
  careful: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Medium: chef, the toque traced from DockCrab's Sprites.chefHat; tosses the omelette.
  medium: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  // Light: racer in a helmet; runs at double pace, the checkered flag flutters.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  // Explore: pirate scouting the code; the cutlass fences.
  explore: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  other: f => crabBody(f),
}

const costumeOf = (a: AgentRun): string => (a.type === 'Explore' ? 'explore' : tierOfRun(a))

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE): string => {
  // Cells in a row of one colour become one path, in drawing order, so what
  // overlaps still overlaps the same way: a few paths instead of ~150 rects.
  const groups = new Map<string, { c: string; d: string }[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    const runs = groups.get(cls) ?? []
    groups.set(cls, runs)
    const cell = `M${cx} ${cy}h${w}v${h}h${-w}z`
    const last = runs[runs.length - 1]
    if (last?.c === c) last.d += cell
    else runs.push({ c, d: cell })
  }
  const draw = COSTUMES[costume] ?? ((g: Fill) => crabBody(g))
  draw(f, colorOf(costume))
  const paths = (cls: string) => (groups.get(cls) ?? []).map(r => `<path fill="${r.c}" d="${r.d}"/>`).join('')
  const group = (cls: string) => `<g class="${cls}">${paths(cls)}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${paths('bd')}${props.map(group).join('')}</g>`
  return `<g transform="translate(${x},${y}) scale(${scale})" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${costume}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${crabCss(body)}${body}</svg>`

// The pane's own title already says "Agents": the header names the flow, if any.
const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>): string => {
  const s = tr()
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = title ? 28 : 0
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${i * (tw + gap)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" x="${i * (tw + gap) + 9}" y="${top + 16}" font-family="${FONT}" font-size="11">${k}</text>
<text class="t" x="${i * (tw + gap) + 9}" y="${top + 33}" font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    headerHeight(title),
    `${title ? `<text class="t" x="0" y="15" font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W))}</text>` : ''}
${tile(0, s.cost, '≈' + fmtCost(t.cost))}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const headerHeight = (title: string): number => (title ? 72 : 44)

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

// The task's own percentage, for a run that reports its steps. A run that answered is
// full, though it may answer before reporting its last step; a failed one keeps its count.
const stepsOf = (a: AgentRun, sep: string): string => {
  if (!a.stepTotal) return ''
  const done = a.status === 'done' ? a.stepTotal : (a.stepDone ?? 0)
  return `${Math.round((progressOf(a) ?? 0) * 100)}% · ${done}/${a.stepTotal}${a.stepNote ? sep + a.stepNote : ''}`
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

// A run another subagent started sits under it, this many pixels in per level.
const INDENT = 16

const agentSvg = (full: number, a: AgentRun, at: number, depth = 0, isViewed = false): string => {
  const s = tr()
  const ind = Math.min(depth, MAX_DEPTH) * INDENT
  const W = full - ind
  const tier = tierOfRun(a)
  const color = colorOf(tier)
  const ctx = ctxOf(a)
  const textW = W - 42 - 22
  const meta = [a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  const barW = textW
  const progress = progressOf(a)
  const stats = `ctx ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  const steps = stepsOf(a, ' · ')
  const stepsW = Math.max(0, barW - textWidth(stats, 11) - 12)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fillW = Math.round(barW * (progress ?? ctx / 100))
  // The run in the main view sits on a tile; a nested one hangs from an elbow.
  const tile = isViewed ? `<rect class="tile" x="-4" y="1" width="${W + 4}" height="63" rx="8"/>` : ''
  const elbow = ind ? `<path class="ln" d="M${ind - 10} 0v24h6" fill="none"/>` : ''
  return svg(
    full,
    66,
    `${elbow}<g transform="translate(${ind},0)">${tile}${crab(0, 14, costumeOf(a), false, a.status === 'running')}
<text class="t" x="42" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text x="42" y="34" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tier)}</tspan><tspan class="s">  ${xml(meta.join('  ·  '))}</tspan></text>
${steps && stepsW > 30 ? `<text class="t" x="42" y="49" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(steps, 11, stepsW))}</text>` : ''}
<text class="s" x="${42 + barW}" y="49" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="42" y="55" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="42" y="55" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${color}"`}/>
${statusMark(W - 8, 16, a.status, color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/></g>`,
  )
}

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const textW = W - 42 - 22
  const meta = [TIER_MODEL[tier] ?? '']
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${crab(0, 6, tier, true)}
<text class="s" x="42" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text x="42" y="34" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier)}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(W - 8, 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    ...list.filter(a => a.status === 'running').map(a => ({ k: costumeOf(a), c: colorOf(tierOfRun(a)), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: costumeOf(a), c: colorOf(tierOfRun(a)), s: a.status, dim: false })),
    ...planned.map(p => ({ k: p.tier in TIER_COLOR ? p.tier : 'other', c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = icons.slice(0, fit)
  const more = icons.length - shown.length
  const body = shown
    .map((ic, i) => crab(i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${i * 36 + 32}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" x="${x}" y="21" font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" x="${W}" y="21" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// The pane draws the latest finished runs; the totals still count every run.
const FINISHED_SHOWN = 10

// CSS pixels the desktop keeps beside each run's drawing for its transcript button.
const VIEW_W = 72

// Claude Code drops a finished subagent from its tasks list 30 s after it ends, and
// $.ui.view finds only the agents still there. A redraw a little later takes the press
// off the runs it let go.
const RELEASED_MS = 31_000

// The ids $.agent.list() still holds; null where it could not say.
async function listedIds($: EngineInterface): Promise<Set<string> | null> {
  try {
    return new Set((await $.agent.list()).map(a => a.id))
  } catch {
    return null
  }
}

// How deep the pane indents a run started by another subagent; deeper ones stay at it.
const MAX_DEPTH = 3

type Nested = { a: AgentRun; depth: number }

// Each run followed by the runs it started, a level deeper, when they share its
// section; one whose parent is drawn elsewhere, or not at all, starts a tree of its own.
const nest = (rows: AgentRun[]): Nested[] => {
  const ids = new Set(rows.map(a => a.agentId).filter(Boolean))
  const out: Nested[] = []
  const seen = new Set<AgentRun>()
  const walk = (a: AgentRun, depth: number): void => {
    if (seen.has(a)) return
    seen.add(a)
    out.push({ a, depth })
    for (const c of rows) if (c.parentId && c.parentId === a.agentId) walk(c, depth + 1)
  }
  for (const a of rows) if (!a.parentId || !ids.has(a.parentId)) walk(a, 0)
  for (const a of rows) walk(a, 0)
  return out
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// Escape closes it, from the pane or an idle, empty prompt; over a turn or text it stays the person's.
const PANE_OPEN = () => ({ id: PANE, title: tr().pane, closeOnEscape: true }) as const

// Opens the agents pane, or closes it when it is up; true when it ends up open.
// Up means drawn and in front: one opened unasked on a narrow terminal waits undrawn,
// and one behind another pane's tab is out of sight, so the person's ask opens those.
async function togglePane($: EngineInterface): Promise<boolean> {
  const mine = (await $.ui.panes()).find(p => p.id === PANE)
  if (mine?.isPlaced && mine.isShown) {
    await $.ui.close({ id: PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open(PANE_OPEN())
  return true
}

// Marks the key once the pane opened (or waits for room, which seats it later);
// an open that fails leaves it unmarked, so the next run tries again.
async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  void $.ui
    .open(PANE_OPEN())
    .then(() => update($, panel, prev => ({ ...prev, autoOpenedFor: key })))
    .catch(() => {})
}

// Ticks the running runs' clocks once a second, and stops when none runs: an idle
// session reads nothing. A run that starts or resumes starts it again.
let ticker: Timer | null = null

function startTicker($: EngineInterface): void {
  if (ticker) return
  ticker = $.clock.every(1000, () => {
    void (async () => {
      if (!(await read($, agents)).some(a => a.status === 'running')) {
        ticker?.cancel()
        ticker = null
        return
      }
      const at = await $.clock.now()
      await update($, now, () => at)
    })()
  })
}

// A finished flow leaves the band after FINISHED_LINGER_MS, unless a newer one took its place.
function stepAside($: EngineInterface, f: Flow): void {
  const finishedAt = f.finishedAt
  if (finishedAt === undefined) return
  void (async () => {
    const wait = Math.max(0, finishedAt + FINISHED_LINGER_MS - (await $.clock.now()))
    $.clock.after(wait, () => {
      void patchFlow($, prev => (prev?.isFinished && prev.finishedAt === finishedAt ? null : prev))
    })
  })()
}

// Nothing another plugin drew: core's own band (an `engine` element, which the band
// replaced before too) or an empty box.
const isBlank = (el: RenderElement | undefined): boolean =>
  !el || el.type === 'engine' || (el.type === 'Box' && (el.children ?? []).length === 0)

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    canView = await engineHasView($)
    // A reload drops pending timers: a finished flow held by the host still steps aside.
    const held = await read($, flow)
    if (held?.isFinished) stepAside($, held)
    await $.tool.register({
      name: 'progress',
      description:
        'Report the progress of work delegated to subagents to the progress bar above the prompt and the agents panel. ' +
        'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
        'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the overall task, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
          done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
          phase: { type: 'string', enum: [...PHASES] },
          finished: { type: 'boolean', description: 'True once the flow is closed.' },
          tasks: {
            type: 'array',
            description:
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: {
                  type: 'string',
                  enum: ['fable', 'heavy', 'careful', 'medium', 'light'],
                  description: 'The model the task runs on: fable = Fable, heavy and careful = Opus, medium = Sonnet, light = Haiku.',
                },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
              },
              required: ['title', 'tier'],
            },
          },
        },
      },
    })
    await $.tool.register({
      name: 'step',
      description:
        'For subagents: report progress on your own task to the agents panel. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
        },
        required: ['done'],
      },
    })
    await $.command.register({
      name: 'agents-info',
      description: 'Show or hide the panel of subagents: running, finished and planned, with model, context, cost and time',
    })

    // A reload drops the old ticker with the old module: start again for runs still at work.
    if ((await read($, agents)).some(a => a.status === 'running')) startTicker($)
    return started
  })

  on('command.run', { command: 'agents-info' }, async $ => {
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as ProgressInput
    // The pane keeps every run of the session; a new flow only marks when it began.
    const at = await $.clock.now()
    const next = await patchFlow($, p => {
      const merged = merge(p, input)
      return {
        ...merged,
        ...(isNewFlow(p, input) ? { startedAt: at } : {}),
        ...(merged.isFinished ? { finishedAt: at } : {}),
      }
    })
    if (next?.isFinished) stepAside($, next)
    if (next && input.tasks?.length) await autoOpen($, next.title)
    return { result: `ok: ${label(next ?? blank(), runningOf(await read($, agents)))}` }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    await patchAgents($, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: 'ok' }
  })

  on('agent.spawn', async ($, e, next) => {
    // A resume (a parent woken when its background child answers, say) continues a run
    // already listed: its prompt is the waking message, which the engine keeps as sent.
    const isResume = e.resume !== undefined
    const started = await next(isResume ? e : { ...e, prompt: briefed(e.prompt, options.stepBrief !== 'off') })
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    const id = started.agentId ?? e.resume?.agentId ?? e.tool_use_id
    const list = await read($, agents)
    const wasIdle = !list.some(a => a.status === 'running')
    const held = list.find(a => a.id === id)
    if (isResume && held) {
      // The same run at work again: its start, totals, steps and round stay.
      await update($, agents, all =>
        all.map(a => (a.id === id ? { ...a, model: started.model || a.model, status: 'running' as const, endedAt: undefined } : a)),
      )
      await update($, now, () => at)
      startTicker($)
      return started
    }
    await update($, agents, all => {
      const round = 1 + all.filter(a => a.id !== id && e.description && norm(a.description) === norm(e.description)).length
      const run: AgentRun = {
        id,
        agentId: started.agentId ?? e.resume?.agentId,
        type: e.subagentType,
        description: e.description,
        ...(e.parentAgentId ? { parentId: e.parentAgentId } : {}),
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...all.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    startTicker($)
    // A run started under a flow still planning moves it to delegating.
    await patchFlow($, prev => (prev && !prev.isFinished && prev.phase === 'plan' ? { ...prev, phase: 'delegate' } : prev))
    // Any subagent opens the panel: once per reported flow, else once per busy spell
    // (a run started while none was running), so closing it sticks until the next one.
    const f = await read($, flow)
    if (f && !f.isFinished) await autoOpen($, f.title)
    else if (wasIdle) await autoOpen($, `run:${id}`)
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    await patchAgents($, list =>
      list.map(a =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage),
              steps: a.steps + 1,
            },
      ),
    )
    // A run resumed after it answered is at work again.
    startTicker($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      const list = await patchAgents($, list =>
        list.map(a => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    (e.usage.input_tokens || 0) +
                    (e.usage.output_tokens || 0) +
                    (e.usage.cache_read_input_tokens || 0) +
                    (e.usage.cache_creation_input_tokens || 0),
                  costUsd: costOf(e.usage.model || a.model, e.usage),
                }
              : {}),
          }
        }),
      )
      if (list.some(a => a.agentId === agentId)) {
        await update($, now, () => at)
        if (canView) $.clock.after(RELEASED_MS, () => $.ui.invalidate('ui.render'))
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = await read($, flow)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const shownDone = nest(p.isDoneCollapsed ? [] : p.isEarlierShown ? finished : finished.slice(0, FINISHED_SHOWN))
    const shownRunning = nest(running)
    // The agent whose transcript is in the main view, if any.
    const viewed = e.props.view?.agentId
    const earlier = p.isDoneCollapsed ? 0 : finished.length - finished.slice(0, FINISHED_SHOWN).length
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    const toggleCompact = (
      <Button
        key="compact"
        label={p.isCompact ? s.expand : s.collapse}
        plain
        hotkey="c"
        onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))}
      />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? '▸' : '▾'} ${s.finished} · ${finished.length}`}
        plain
        hotkey="f"
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    // Past the latest FINISHED_SHOWN, the rest of the session's runs open on demand.
    const toggleEarlier =
      earlier > 0 ? (
        <Button
          key="earlier"
          label={p.isEarlierShown ? `▴ ${s.fewer}` : `+${earlier} ${s.earlier}`}
          plain
          hotkey="e"
          onPress={() => update($, panel, prev => ({ ...prev, isEarlierShown: !prev.isEarlierShown }))}
        />
      ) : null
    // A press puts the run's transcript in the main view, or, on the run in view, the
    // main conversation back; a run the tasks list no longer holds says why not.
    // An engine before $.ui.view draws no such press: it would do nothing and say nothing.
    // Nor does a run the tasks list let go (the run in view keeps its way back), and one
    // let go since this drawing says so in the panel's language, not the engine's.
    const listed = canView ? await listedIds($) : null
    const canPress = (a: AgentRun, isViewed: boolean): a is AgentRun & { agentId: string } =>
      canView && !!a.agentId && (isViewed || !listed || listed.has(a.agentId))
    const show = (agentId?: string) => () => {
      void (async () => {
        const ids = agentId ? await listedIds($) : null
        if (agentId && ids && !ids.has(agentId)) {
          $.ui.toast(s.gone)
          $.ui.invalidate('ui.render')
          return
        }
        const shown = await $.ui.view(agentId ? { agentId } : {})
        if (shown.deny) $.ui.toast(shown.deny)
      })()
    }
    const toMain = canView && viewed ? <Button key="main" label={`↩ ${s.main}`} plain hotkey="m" onPress={show()} /> : null
    const isEmpty = list.length === 0 && planned.length === 0
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )
      // The drawing leaves room beside it for the button that opens the run's transcript.
      const rowW = canView ? W - VIEW_W : W
      const agentRow = ({ a, depth }: Nested, state: string) => {
        const isViewed = !!a.agentId && a.agentId === viewed
        return (
          <Box key={a.id} flexDirection="row" alignItems="center" gap={1}>
            <Svg
              source={agentSvg(rowW, a, at, depth, isViewed)}
              alt={`${a.description}: ${modelName(a.model)}, ${state}${isViewed ? `, ${s.inView}` : ''}`}
              width={rowW}
              height={66}
            />
            {canPress(a, isViewed) ? (
              <Button key={`view-${a.id}`} label={isViewed ? '↩' : s.view} plain onPress={show(isViewed ? undefined : a.agentId)} />
            ) : null}
          </Box>
        )
      }

      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1}>
            <Svg source={compactSvg(W, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          <Svg source={headerSvg(W, title, t)} alt={title ? `${title}: ${summary}` : summary} width={W} height={headerHeight(title)} />
          {toggleCompact}
          {toMain}
          {isEmpty && <Text dimColor>{s.empty}</Text>}
          {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
          {shownRunning.map(n => agentRow(n, s.isRunning))}
          {finished.length > 0 && toggleDone}
          {shownDone.map(n => agentRow(n, s.isFinished))}
          {toggleEarlier}
          {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
          {planned.map(pl => (
            <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} width={W} height={46} />
          ))}
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = ({ a, depth }: Nested) => {
      const isViewed = !!a.agentId && a.agentId === viewed
      const tier = tierOfRun(a)
      const color = colorOf(tier)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model)
      // The bar and the task's own steps on one row, the run's numbers on the next:
      // one row held both, and a step's note truncated them.
      const steps = stepsOf(a, ' · ')
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1} paddingLeft={2 * Math.min(depth, MAX_DEPTH)}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>{isViewed ? '▶' : depth ? '↳' : '▣'}</Text>
            {canPress(a, isViewed) ? (
              <Button key={`view-${a.id}`} plain onPress={show(isViewed ? undefined : a.agentId)}>
                <Text bold color={isViewed ? ACCENT : undefined} wrap="truncate-end">
                  {a.description || a.type}
                </Text>
              </Button>
            ) : (
              <Text bold wrap="truncate-end">
                {a.description || a.type}
              </Text>
            )}
            <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>{STATUS_GLYPH[a.status]}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {tier === 'other' ? a.type : tier} · {model}
            {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            {steps ? ` ${steps}` : ''}
          </Text>
          <Text dimColor wrap="truncate-end">
            {'  '}ctx {ctx}% · {fmtTokens(a.contextTokens)} · ≈{fmtCost(a.costUsd)} · {fmtTime(elapsed(a, at))}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            {title}
          </Text>
          {toggleCompact}
        </Box>
        {toMain}
        <Text dimColor>
          ≈{fmtCost(t.cost)} · {fmtTokens(t.tokens)} {s.tokensWord} · {fmtTime(t.time)}
        </Text>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={colorOf(tierOfRun(a))}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
            {planned.map(pl => (
              <Text key={`plan-${pl.n}`} dimColor>
                ◷{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{s.running} · {running.length}</Text>}
            {shownRunning.map(row)}
            {finished.length > 0 && toggleDone}
            {shownDone.map(row)}
            {toggleEarlier}
            {planned.length > 0 && <Text dimColor>{s.planned} · {planned.length}</Text>}
            {planned.map(pl => {
              const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
              return (
                <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
                  <Text dimColor wrap="truncate-end">
                    <Text color={colorOf(tier)}>▢</Text> {pl.n}. {pl.title} ◷
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {tier} · {TIER_MODEL[tier] ?? ''}
                    {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })

  // The band and the pane already show what these calls report: their rows in the
  // transcript draw nothing, unless the call failed.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!QUIET_TOOLS.has(e.props.tool) || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!QUIET_TOOLS.has(e.props.tool) || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const f = await read($, flow)
    if (f === null || e.props.hasSurvey) return below

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const crew = runsOf(f, list).length + plannedOf(f, list).length
    const running = runningOf(list)
    const crewButton = (
      <Button key="agents-pane" label={`×${crew}`} plain onPress={() => void togglePane($)} />
    )
    const percent = `${Math.round(ratio(f) * 100)}%`
    const dismiss = (
      <Button
        key="agents-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => patchFlow($, () => null)}
      />
    )

    // Another plugin's band stays, with this one under it.
    const stack = (mine: RenderElement): RenderElement =>
      isBlank(below) ? mine : (
        <Box flexDirection="column">
          {below}
          {mine}
        </Box>
      )

    // The terminal's table has no Svg, though its resolve answers the name: ask the surface.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss
      // and their gaps. No floor above the slot: a row wider than it would wrap.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      return stack(
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg source={rowSvg(f, width, running)} alt={`${f.title}: ${label(f, running)}, ${percent}`} width={width} height={H} />
          {crewButton}
          {dismiss}
        </Box>,
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    return stack(
      <Box flexDirection="row" gap={2}>
        <Box width={titleW} flexShrink={0}>
          <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
          <Text wrap="truncate-end">{f.title}</Text>
        </Box>
        <Text color={f.isFinished ? DONE : ACCENT}>{barText(f, width)}</Text>
        <Text bold>{label(f, running)}</Text>
        <Text dimColor>{percent}</Text>
        {crewButton}
        {dismiss}
      </Box>,
    )
  })
}
