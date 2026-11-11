import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 已发布内容目录：仓库根/content */
export const CONTENT = path.resolve(HERE, '../../content')

type Item = { text: string; link?: string; collapsed?: boolean; items?: Item[] }

/**
 * 顶层单文件的归类规则。
 * 只要文件名命中该组 tests 里的任意一条正则，就归入这个组；顺序即优先级。
 * 新增系列时在这里加一行即可。
 */
const RULES: { text: string; tests: RegExp[] }[] = [
  { text: '深度精讲', tests: [/^深度精讲-/, /-精讲-/] },
  { text: '原文翻译', tests: [/^原文翻译-/, /-全文翻译-/] },
  { text: '开发日报', tests: [/开发日报-/, /^日报-/] },
  { text: '知识地图', tests: [/知识地图/] },
]

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
function titleOf(file: string, group?: string): { short: string; full: string } {
  const head = fs.readFileSync(file, 'utf-8').split('\n').find((l) => /^#\s+/.test(l)) || ''
  let t = head.replace(/^#\s+/, '').trim()
  if (!t) t = path.basename(file, '.md')
  if (group && t.startsWith(group + '：')) t = t.slice(group.length + 1).trim()
  const full = t
  t = t.replace(/（[^）]*）\s*$/, '').trim() || full
  if (t.length > 34) t = t.slice(0, 33) + '…'
  return { short: t, full }
}

function linkOf(file: string): string {
  const rel = path.relative(CONTENT, file).replace(/\.md$/, '')
  return '/' + rel.split(path.sep).map(encodeURIComponent).join('/')
}

function itemOf(file: string, group?: string): Item {
  const { short, full } = titleOf(file, group)
  return {
    // text 里的 HTML 会被 VitePress 原样渲染，所以可以用 title 属性挂完整标题
    text: short === full ? short : `<span title="${full.replace(/"/g, '&quot;')}">${short}</span>`,
    link: linkOf(file),
  }
}

function groupOfFile(file: string): string {
  const base = path.basename(file)
  for (const r of RULES) if (r.tests.some((re) => re.test(base))) return r.text
  return '其他'
}

/** 递归构建某个子目录的 sidebar 节点 */
function buildDir(dir: string): Item[] {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  const items: Item[] = []
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    if (e.isDirectory()) {
      const sub = buildDir(path.join(dir, e.name))
      const label = e.name.replace(/^\d+[-_.]/, '') // 02-每日推荐 → 每日推荐
      if (sub.length) items.push({ text: label, collapsed: true, items: sub })
    } else if (e.name.endsWith('.md') && e.name !== 'index.md') {
      items.push(itemOf(path.join(dir, e.name)))
    }
  }
  return items
}

export function buildSidebar(): Item[] {
  const groups = new Map<string, Item[]>()
  for (const file of walk(CONTENT)) {
    const rel = path.relative(CONTENT, file)
    // 子目录里的文件：目录本身就是系列；顶层单文件：按前缀规则归类
    const key = rel.includes(path.sep) ? rel.split(path.sep)[0] : groupOfFile(file)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(itemOf(file, key))
  }

  const out: Item[] = []
  for (const [text, items] of [...groups].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) {
    const p = path.join(CONTENT, text)
    const isDir = fs.existsSync(p) && fs.statSync(p).isDirectory()
    out.push({ text, collapsed: false, items: isDir ? buildDir(p) : items })
  }
  return out
}