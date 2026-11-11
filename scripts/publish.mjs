#!/usr/bin/env node
/**
 * 把挑选好的文章「发布」到 content/ 的两个板块里。
 *
 *   node scripts/publish.mjs --all                         # 全部发布
 *   node scripts/publish.mjs 深度精讲-xxx.md …             # 只发布指定文件
 *   node scripts/publish.mjs 某篇.md --to "每日 AI Agent 技术精选/2026-11-12"   # 指定落点
 *   node scripts/publish.mjs --list                        # 列出可发布但还没发布的
 *
 * 落点规则（不经 --to 时）：
 *   - `RAG 每日精进/` 下的东西 → `content/RAG 学习路线图/`，内部子目录原样保留
 *   - 其余 md → `content/每日 AI Agent 技术精选/<日期>/`，日期取文件名里的 YYYY-MM-DD，
 *     没有就取文件修改时间（会打印出来，不对就用 --to 覆盖）
 *
 * 同时做的四件事：
 *   1. 复制图片到一个共享的 content/图片/…（不按天重复存），转 WebP
 *   2. 因为 md 换了位置，正文里的相对链接（图片和文章）按新路径重算一遍
 *   3. `[^1]:` 脚注定义改写成引用块——VitePress 没带脚注插件，原样保留会让构建失败
 *   4. 报告：找不到的图片、指向未发布文章的链接
 *
 * 原始文件只读，永远不写回。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convert } from './optimize-images.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')

const RAG_SRC = 'RAG 每日精进'
const RAG_DEST = 'RAG 学习路线图'
const DAILY_DEST = '每日 AI Agent 技术精选'

// 这些永远不进站点
const SKIP = [/^_站点方案\//, /^site\//, /^content\//, /^node_modules\//, /^\.git\//, /(^|\/)README\.md$/, /03-模板\.md$/]

const isSkipped = (rel) => SKIP.some((re) => re.test(rel.split(path.sep).join('/')))

const SRC_RE = /\.(png|jpe?g)$/i
const posix = (p) => p.split(path.sep).join('/')
const rel = (p) => path.relative(ROOT, p)

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const exists = (p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** 本地时区的 YYYY-MM-DD（不能用 toISOString，会被 UTC 拉回前一天） */
function localDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 源文件 → content 相对落点 */
function destRelOf(src, overrideTo) {
  const r = posix(rel(src))
  const base = path.posix.basename(r)
  if (overrideTo) return path.posix.join(overrideTo, base)

  const [head, ...rest] = r.split('/')
  if (head === RAG_SRC) return path.posix.join(RAG_DEST, ...rest)

  const m = base.match(/(\d{4}-\d{2}-\d{2})/)
  const date = m ? m[1] : localDate(fs.statSync(src).mtime)
  return path.posix.join(DAILY_DEST, date, base)
}

/** 正文里引用的本地图片（相对路径） */
function imageRefs(text) {
  const refs = new Set()
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)/g)) {
    const raw = m[1].replace(/^<|>$/g, '')
    if (/^(https?:|data:|\/)/i.test(raw)) continue
    refs.add(decodeURI(raw.split('#')[0].split('?')[0]))
  }
  return [...refs]
}

/** 正文里的站内文章链接（相对路径、以 .md 结尾） */
function mdLinks(text) {
  const refs = new Set()
  for (const m of text.matchAll(/(?<!!)\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)/g)) {
    const raw = m[1].replace(/^<|>$/g, '')
    if (/^(https?:|mailto:|data:|#|\/)/i.test(raw)) continue
    if (!/\.md(#|$)/.test(raw)) continue
    refs.add(decodeURI(raw.split('#')[0]))
  }
  return [...refs]
}

const stats = {
  md: 0,
  img: 0,
  webp: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  footnote: 0,
  relinked: 0,
  missingImg: [],
  grayLinks: [],
  skipped: [],
  routed: [],
}

/** basename → content 相对路径；重名的一律不进表（宁可报错也不乱指） */
function indexByBasename(items) {
  const map = new Map()
  const dup = new Set()
  for (const { base, destRel } of items) {
    if (map.has(base)) dup.add(base)
    else map.set(base, destRel)
  }
  for (const d of dup) map.delete(d)
  return map
}

async function main() {
  const argv = process.argv.slice(2)
  const toIdx = argv.indexOf('--to')
  const overrideTo = toIdx >= 0 ? argv[toIdx + 1]?.replace(/^\/+|\/+$/g, '') : undefined
  const args = argv.filter((a, i) => a !== '--to' && i !== (toIdx >= 0 ? toIdx + 1 : -1))

  const allFiles = walk(ROOT).filter((p) => !isSkipped(rel(p)))
  const listOnly = args.includes('--list')

  if (!args.length) {
    const pending = allFiles.filter((p) => !exists(path.join(CONTENT, destRelOf(p, overrideTo))))
    console.log(`可发布 ${allFiles.length} 篇，其中还没发布 ${pending.length} 篇：`)
    for (const p of pending) console.log(`  ${posix(rel(p))}  →  ${destRelOf(p, overrideTo)}`)
    console.log('\n用法：node scripts/publish.mjs --all   或   node scripts/publish.mjs <文件>… [--to <板块/日期>]')
    process.exit(0)
  }

  const targets = args.includes('--all')
    ? allFiles
    : args.map((a) => path.resolve(ROOT, a)).filter((p) => {
        if (!exists(p)) {
          console.error(`跳过（找不到）：${a}`)
          return false
        }
        return true
      })

  // 第一遍：算出每篇的落点，这样才能把「指向某篇文章的链接」重算到新位置
  const plan = targets.map((src) => ({ src, destRel: destRelOf(src, overrideTo) }))
  const existing = walk(CONTENT)
    .filter((p) => path.basename(p) !== 'index.md')
    .map((p) => ({ base: path.basename(p), destRel: posix(path.relative(CONTENT, p)) }))
  const byBase = indexByBasename([...plan.map((p) => ({ base: path.basename(p.src), destRel: p.destRel })), ...existing])

  for (const { src, destRel } of plan) {
    if (isSkipped(rel(src))) {
      stats.skipped.push(posix(rel(src)))
      continue
    }
    stats.routed.push([posix(rel(src)), destRel])
    await publishOne(src, destRel, byBase)
  }

  report(listOnly)
}

async function publishOne(src, destRel, byBase) {
  const srcDir = path.dirname(src)
  const mdDirRel = path.posix.dirname(destRel)
  let text = fs.readFileSync(src, 'utf8')

  // 1. 脚注定义 → 引用块
  text = text.replace(/^\[\^[^\]]+\]:\s*/gm, () => {
    stats.footnote++
    return '> '
  })

  // 2. 图片：复制到共享的 content/图片/…（转 WebP），引用重算成从新落点出发的相对路径
  const imgMap = new Map()
  for (const r of imageRefs(text)) {
    const from = path.join(srcDir, r)
    if (!exists(from)) {
      stats.missingImg.push(`${posix(rel(src))} → ${r}`)
      continue
    }
    const baseRel = posix(r) // 保持源里的相对位置，比如 图片/demystifying-evals/fig01.png
    const sharedRel = SRC_RE.test(baseRel) ? baseRel.replace(SRC_RE, '.webp') : baseRel
    const to = path.join(CONTENT, sharedRel)
    fs.mkdirSync(path.dirname(to), { recursive: true })

    let finalRel = sharedRel
    const conv = await convert(from, to)
    if (conv) {
      stats.webp++
      stats.bytesBefore += conv.before
      stats.bytesAfter += conv.after
    } else if (!exists(to)) {
      fs.copyFileSync(from, to) // 已经是 webp 之类的，原样拷
    }
    stats.img++
    imgMap.set(r, path.posix.relative(mdDirRel || '.', finalRel))
  }

  // 3. 指向其它文章的相对链接：按文件名在新位置重新指过去
  const linkMap = new Map()
  for (const r of mdLinks(text)) {
    const target = byBase.get(path.posix.basename(r))
    if (!target) continue
    const nextRef = path.posix.relative(mdDirRel || '.', target)
    if (nextRef !== r) linkMap.set(r, nextRef)
  }

  // 4. 一次性做替换——只改 `](...)` 里的目标，正文里同名的普通文字不动
  text = rewriteDest(text, 'img', imgMap)
  text = rewriteDest(text, 'link', linkMap)
  stats.relinked += [...linkMap.keys()].length

  // 5. 写盘
  const dst = path.join(CONTENT, destRel)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.writeFileSync(dst, text)
  stats.md++
}

/** 目标里有空格/括号时要写成 <…>，否则 markdown-it 不认 */
const fmtRef = (ref) => (/[\s()<>]/.test(ref) ? `<${ref}>` : ref)

/**
 * 只替换 `[文字](目标 "标题")` 里的「目标」。
 * 判断依据是括号前那个 `[`（图片是 `![`），所以正文里出现同样的文件名不会误伤。
 */
function rewriteDest(text, kind, map) {
  if (!map.size) return text
  const re = /(!?\[[^\]]*\]\()\s*(<[^>]*>|[^)\s]+)((?:\s+["'][^"']*["'])?)\)/g
  return text.replace(re, (m, head, rawRef, title) => {
    if (head.startsWith('!') !== (kind === 'img')) return m
    const ref = rawRef.replace(/^<|>$/g, '')
    const [p, hash = ''] = ref.split('#')
    const hit = map.get(decodeURI(p))
    if (!hit) return m
    const next = fmtRef(hit + (hash ? '#' + hash : ''))
    return `${head}${next}${title})`
  })
}

function report(listOnly) {
  if (listOnly) return
  for (const [from, to] of stats.routed) console.log(`  ${from}\n    → ${to}`)
  if (!stats.md) return

  const saved = stats.bytesBefore ? `（${(stats.bytesBefore / 1048576).toFixed(1)} MB → ${(stats.bytesAfter / 1048576).toFixed(1)} MB）` : ''
  console.log(
    `\n已发布 ${stats.md} 篇，图片 ${stats.img} 个（转 webp ${stats.webp} 个${saved}），重算链接 ${stats.relinked} 处，改写脚注 ${stats.footnote} 处`
  )
  if (stats.skipped.length) console.log(`按规则跳过 ${stats.skipped.length} 个文件（README / 模板）`)
  if (stats.missingImg.length) {
    console.log(`\n⚠ ${stats.missingImg.length} 处图片找不到（页面会显示破图）：`)
    for (const m of stats.missingImg) console.log('  ' + m)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})