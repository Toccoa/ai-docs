import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 已发布内容目录：仓库根/content */
export const CONTENT = path.resolve(HERE, '../../content')

type Item = { text: string; link?: string; collapsed?: boolean; items?: Item[] }

/** 板块顺序（目录名）；不在这里的目录排在后面，按名称排 */
const SECTION_ORDER = ['RAG 学习路线图', '每日 AI Agent 技术精选']

/**
 * 同一天里几篇的先后。顺序即优先级，命不中的排最后。
 * 新增系列时在这里加一行。
 */
const RULES: { text: string; tests: RegExp[] }[] = [
  { text: '开发日报', tests: [/开发日报-/, /^日报-/, /精选-?\d{4}-\d{2}-\d{2}/] },
  { text: '深度精讲', tests: [/^深度精讲-/, /-精讲-/] },
  { text: '原文翻译', tests: [/^原文翻译-/, /-全文翻译-/] },
  { text: '知识地图', tests: [/知识地图/] },
]

const isDate = (name: string) => /^\d{4}-\d{2}-\d{2}$/.test(name)

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.md') && e.name !== 'index.md') out.push(p)
  }
  return out
}

/** 取首个 `# ` 标题，去掉与组名重复的前缀和尾部括号补充，再截断 */
function titleOf(file: string, group?: string): { short: string; full: string; prefix: string } {
  const head = fs.readFileSync(file, 'utf-8').split('\n').find((l) => /^#\s+/.test(l)) || ''
  let t = head.replace(/^#\s+/, '').trim()
  if (!t) t = path.basename(file, '.md')
  if (group && t.startsWith(group + '：')) t = t.slice(group.length + 1).trim()

  // 「深度精讲：xxx」「原文翻译：xxx」这类前缀，栏里已经有分组了，去掉更省地方
  let prefix = ''
  const m = t.match(/^(深度精讲|原文翻译|全文翻译|开发日报|精讲|日报|每日推荐)\s*[：:]\s*/)
  if (m) {
    prefix = m[1]
    t = t.slice(m[0].length).trim() || t
  }

  const full = t
  t = t.replace(/（[^）]*）\s*$/, '').trim() || full
  if (t.length > 34) t = t.slice(0, 33) + '…'
  return { short: t, full, prefix }
}

function linkOf(file: string): string {
  const rel = path.relative(CONTENT, file).replace(/\.md$/, '')
  return '/' + rel.split(path.sep).map(encodeURIComponent).join('/')
}

function itemOf(file: string, group?: string, withPrefix = false): Item {
  const { short, full, prefix } = titleOf(file, group)
  // 同一天里精讲和翻译会重名，这时把前缀加回来区分
  const label = withPrefix && prefix ? `${prefix}｜${short}` : short
  return {
    // text 里的 HTML 会被 VitePress 原样渲染，所以可以用 title 属性挂完整标题
    text: label === full ? label : `<span title="${full.replace(/"/g, '&quot;')}">${label}</span>`,
    link: linkOf(file),
  }
}

function groupOfFile(file: string): string {
  const base = path.basename(file)
  for (const r of RULES) if (r.tests.some((re) => re.test(base))) return r.text
  return '其他'
}

function rankOf(file: string): number {
  const g = groupOfFile(file)
  const i = RULES.findIndex((r) => r.text === g)
  return i < 0 ? RULES.length : i
}

/** 目录名/文件名里有没有 01- 这种序号 */
const numOf = (name: string): number | null => {
  const m = name.match(/^(\d+)[-_.]/)
  return m ? Number(m[1]) : null
}

/** 递归构建某个目录的 sidebar 节点 */
function buildDir(dir: string): Item[] {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')

  const numbered: { n: number; e: fs.Dirent }[] = []
  const dirs: string[] = []
  const files: string[] = []

  for (const e of entries) {
    const n = isDate(e.name) ? null : numOf(e.name)
    if (n !== null) numbered.push({ n, e })
    else if (e.isDirectory()) dirs.push(e.name)
    else if (e.name.endsWith('.md') && e.name !== 'index.md') files.push(path.join(dir, e.name))
  }

  const items: Item[] = []

  // 1. 带序号的：文件和子目录按同一套数字排（00-知识地图 → 01-学习进度 → 02-每日推荐 → 04-索引）
  for (const { e } of numbered.sort((a, b) => a.n - b.n)) {
    if (e.isDirectory()) {
      const sub = buildDir(path.join(dir, e.name))
      if (sub.length) items.push({ text: e.name.replace(/^\d+[-_.]\s*/, ''), collapsed: true, items: sub })
    } else if (e.name.endsWith('.md') && e.name !== 'index.md') {
      items.push(itemOf(path.join(dir, e.name)))
    }
  }

  // 2. 日期目录：新的在前
  for (const name of dirs.filter(isDate).sort((a, b) => b.localeCompare(a))) {
    const sub = buildDir(path.join(dir, name))
    if (sub.length) items.push({ text: name, collapsed: true, items: sub })
  }

  // 3. 其余子目录（不含 md 的，例如图片目录，直接跳过）
  for (const name of dirs.filter((d) => !isDate(d)).sort((a, b) => a.localeCompare(b, 'zh'))) {
    const sub = buildDir(path.join(dir, name))
    if (sub.length) items.push({ text: name, collapsed: true, items: sub })
  }

  // 4. 同一天里的几篇按「日报 → 精讲 → 翻译 → 知识地图」排，其余按文件名
  files.sort((a, b) => rankOf(a) - rankOf(b) || path.basename(a).localeCompare(path.basename(b), 'zh'))
  const shortOf = new Map(files.map((f) => [f, titleOf(f).short]))
  const dup = new Map<string, number>()
  for (const f of files) dup.set(shortOf.get(f)!, (dup.get(shortOf.get(f)!) || 0) + 1)
  for (const f of files) items.push(itemOf(f, undefined, (dup.get(shortOf.get(f)!) || 0) > 1))

  return items
}

/** 板块节点：目录名做标题，里面的子目录/文件做条目 */
function buildSection(name: string): Item {
  return { text: name, collapsed: false, items: buildDir(path.join(CONTENT, name)) }
}

export function buildSidebar(): Item[] {
  const dirs = fs
    .readdirSync(CONTENT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && walk(path.join(CONTENT, e.name)).length > 0)
    .map((e) => e.name)
    .sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a)
      const ib = SECTION_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh')
    })

  const out = dirs.map(buildSection)

  // 兜底：万一 content 根上有散的 md（比如新文章放错了），也让它出现在侧边栏里
  const loose = fs
    .readdirSync(CONTENT)
    .filter((n) => n.endsWith('.md') && n !== 'index.md')
    .map((n) => path.join(CONTENT, n))
  if (loose.length) {
    const groups = new Map<string, Item[]>()
    for (const f of loose) {
      const g = groupOfFile(f)
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(itemOf(f, g))
    }
    for (const [text, items] of groups) out.push({ text, collapsed: true, items })
  }
  return out
}