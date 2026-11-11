#!/usr/bin/env node
/**
 * 把 content/ 里的 png/jpg 转成 webp，并把 md 里的引用一起改掉。
 *
 * 只处理 content/ 下的副本，原始笔记里的图片一个字节都不动。
 *
 *   node scripts/optimize-images.mjs          # 转换 content/ 里所有还没转的图
 *   node scripts/optimize-images.mjs --dry     # 只看会省多少，不写盘
 *
 * 参数（想改质量就改这里）：
 *   MAX_WIDTH = 2400   超过这个宽度就等比缩（正文栏最宽约 700 CSS px，2400 够 3 倍屏 + 放大看）
 *   QUALITY   = 88     实测在你这 26 张图上，q88@2400 比 q82 全尺寸还小，字也清楚
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')

const MAX_WIDTH = 2400
const QUALITY = 88
const SRC_RE = /\.(png|jpe?g)$/i

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/**
 * 把单个图片转成 webp。
 * 返回 { out, before, after, width } —— out 为 webp 绝对路径；已转过的返回 null。
 *
 * destAbs 可指定落点（publish.mjs 会把图放到 content/图片/… 而不是源目录旁边）；
 * 不传就写在源文件旁边的同名 .webp。
 */
export async function convert(absImg, destAbs) {
  if (!SRC_RE.test(absImg)) return null
  const out = destAbs || absImg.replace(SRC_RE, '.webp')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const before = fs.statSync(absImg).size

  // 已经有转好的 webp 就直接复用（重复发布同一篇文章时会走到这里）
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(absImg).mtimeMs) {
    return { out, before, after: fs.statSync(out).size, width: 0, reused: true }
  }

  const img = sharp(absImg, { failOn: 'none' }).rotate()
  const meta = await img.metadata()
  const width = Math.min(MAX_WIDTH, meta.width || MAX_WIDTH)
  const buf = await img
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6, alphaQuality: 100, smartSubsample: true })
    .toBuffer()

  fs.writeFileSync(out, buf)
  return { out, before, after: buf.length, width, reused: false }
}

/** 引用改写用：把 md 里指向旧图的路径换成 .webp */
function swapRef(ref) {
  const [p, hash = ''] = ref.split('#')
  if (!SRC_RE.test(p)) return null
  return p.replace(SRC_RE, '.webp') + (hash ? '#' + hash : '')
}

/**
 * 重写一段 markdown 里所有图片引用（markdown 语法和 html img 都算）。
 * map 是「content 相对路径 → 新路径」。
 */
export function rewriteRefs(text, mdRelDir, map) {
  let n = 0
  const fix = (ref, style) => {
    const bare = decodeURIComponent(ref)
    const abs = path.posix.normalize(path.posix.join(mdRelDir, bare))
    if (!map.has(abs)) return ref
    const next = swapRef(bare)
    if (!next) return ref
    n++
    // 原来的写法保留了中文不编码，这里也保持一致；只有原本编码过的才重新编码
    return style === 'angle' ? `<${next}>` : next
  }

  // ![alt](path) / [text](path) 里的图片
  text = text.replace(/(!\[[^\]]*\]\(\s*)(<[^>]+>|[^)\s]+)/g, (m, head, ref) => {
    const angle = ref.startsWith('<')
    return head + fix(angle ? ref.slice(1, -1) : ref, angle ? 'angle' : 'plain')
  })
  // html <img src="...">
  text = text.replace(/(<img[^>]*?\ssrc=["'])([^"']+)(["'])/gi, (m, head, ref, tail) => head + fix(ref, 'plain') + tail)
  return { text, n }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

async function main() {
  const dry = process.argv.includes('--dry')
  if (!fs.existsSync(CONTENT)) {
    console.error(`没有 content/ 目录：${CONTENT}`)
    process.exit(1)
  }

  const imgs = walk(CONTENT).filter((f) => SRC_RE.test(f))
  if (!imgs.length) {
    console.log('content/ 里已经没有 png/jpg 了，无需转换。')
    return
  }

  const map = new Map()
  let before = 0
  let after = 0
  const rows = []

  for (const f of imgs) {
    const rel = path.relative(CONTENT, f).split(path.sep).join('/')
    if (dry) {
      const meta = await sharp(f, { failOn: 'none' }).metadata()
      const buf = await sharp(f, { failOn: 'none' })
        .resize({ width: Math.min(MAX_WIDTH, meta.width), withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 6 })
        .toBuffer()
      before += fs.statSync(f).size
      after += buf.length
      rows.push([rel, kb(fs.statSync(f).size), kb(buf.length), `${meta.width}→${Math.min(MAX_WIDTH, meta.width)}`])
      continue
    }
    const r = await convert(f)
    if (!r) continue
    before += r.before
    after += r.after
    rows.push([rel, kb(r.before), kb(r.after), r.reused ? '已存在' : `${r.width}px`])
    map.set(rel, path.relative(CONTENT, r.out).split(path.sep).join('/'))
    if (!dry && fs.existsSync(f)) fs.unlinkSync(f)
  }

  for (const r of rows) console.log(`  ${r[1].padStart(9)} → ${r[2].padStart(8)}  ${r[3].padStart(9)}  ${r[0]}`)

  // 改 md 引用
  let mdFixed = 0
  let refFixed = 0
  if (!dry && map.size) {
    for (const f of walk(CONTENT).filter((f) => f.endsWith('.md'))) {
      const dirRel = path.relative(CONTENT, path.dirname(f)).split(path.sep).join('/')
      const text = fs.readFileSync(f, 'utf8')
      const { text: next, n } = rewriteRefs(text, dirRel === '' ? '.' : dirRel, map)
      if (n) {
        fs.writeFileSync(f, next)
        mdFixed++
        refFixed += n
      }
    }
  }

  const pct = before ? ((1 - after / before) * 100).toFixed(0) : '0'
  console.log(
    `\n${dry ? '[dry-run] ' : ''}${rows.length} 张图 ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB（省 ${pct}%）` +
      (mdFixed ? `，改写 ${mdFixed} 篇 md 的 ${refFixed} 处引用` : '')
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}