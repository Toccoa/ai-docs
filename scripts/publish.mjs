#!/usr/bin/env node
/**
 * 把挑选好的文章「发布」到 content/。
 *
 *   node scripts/publish.mjs --all                 # 全部发布（首次全量预览）
 *   node scripts/publish.mjs 深度精讲-xxx.md ...    # 只发布指定文件
 *   node scripts/publish.mjs --list                # 只列出可发布但还没发布的
 *
 * 做的三件事：
 *   1. 复制 md，保持它在仓库里的相对路径（RAG 子目录结构一起带过去）
 *   2. 把它引用的本地图片一并复制，保持相对路径不变，所以正文一行都不用改
 *   3. 顺手把 [^1]: 这种脚注定义改写成引用块——VitePress 没带脚注插件，
 *      原样保留会让构建直接失败（见 _站点方案/静态站点方案.md 第五节）
 *
 * 原始文件只读，永远不写回。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convert, rewriteRefs } from './optimize-images.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')

// 这些永远不进站点
const SKIP = [/^_站点方案\//, /^site\//, /^content\//, /^node_modules\//, /^\.git\//, /(^|\/)README\.md$/, /03-模板\.md$/]

const isSkipped = (rel) => SKIP.some((re) => re.test(rel.split(path.sep).join('/')))

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const rel = (p) => path.relative(ROOT, p)
const exists = (p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** 从正文抽图片引用，只保留相对路径 */
function imageRefs(text) {
  const refs = new Set()
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const raw = m[1]
    if (/^(https?:|data:|\/)/i.test(raw)) continue
    refs.add(decodeURI(raw.split('#')[0].split('?')[0]))
  }
  return [...refs]
}

/** 正文里的站内链接（用于提示会变灰的链接） */
function docLinks(text) {
  const refs = new Set()
  for (const m of text.matchAll(/(?<!!)\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const raw = m[1]
    if (/^(https?:|mailto:|data:|#|\/)/i.test(raw)) continue
    refs.add(decodeURI(raw.split('#')[0].split('?')[0]))
  }
  return [...refs]
}

const stats = { md: 0, img: 0, webp: 0, bytesBefore: 0, bytesAfter: 0, footnote: 0, missingImg: [], grayLinks: [], skipped: [] }

async function publish(src) {
  const relPath = rel(src)
  if (isSkipped(relPath)) {
    stats.skipped.push(relPath)
    return
  }
  let text = fs.readFileSync(src, 'utf8')

  // 1. 脚注定义 → 引用块（只改副本）
  text = text.replace(/^\[\^[^\]]+\]:\s*/gm, () => {
    stats.footnote++
    return '> '
  })

  // 2. 复制图片，保持相对路径；顺带转成 webp（原始笔记里的 png 不动）
  const srcDir = path.dirname(src)
  const mdDirRel = path.dirname(relPath).split(path.sep).join('/')
  const map = new Map()
  for (const r of imageRefs(text)) {
    const from = path.join(srcDir, r)
    if (!exists(from)) {
      stats.missingImg.push(`${relPath} → ${r}`)
      continue
    }
    const to = path.join(CONTENT, path.dirname(relPath), r)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    stats.img++

    const conv = await convert(to)
    if (conv) {
      const relOld = path.relative(CONTENT, to).split(path.sep).join('/')
      const relNew = path.relative(CONTENT, conv.out).split(path.sep).join('/')
      if (relOld !== relNew) {
        if (fs.existsSync(to)) fs.unlinkSync(to)
        map.set(relOld, relNew)
        stats.webp++
        stats.bytesBefore += conv.before
        stats.bytesAfter += conv.after
      } else if (conv.reused === false) {
        stats.webp++
      }
    }
  }

  // 3. md 里的图片引用跟着改成 .webp，然后写盘
  const rewritten = rewriteRefs(text, mdDirRel, map)
  const dst = path.join(CONTENT, relPath)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.writeFileSync(dst, rewritten.text)
  stats.md++

  // 4. 记录会变灰的站内链接
  for (const r of docLinks(text)) {
    const target = path.resolve(srcDir, r)
    const cand = [target, target + '.md', path.join(target, 'index.md')]
    if (!cand.some(exists)) stats.grayLinks.push(`${relPath} → ${r}`)
  }
}

const args = process.argv.slice(2)
const allFiles = walk(ROOT).filter((p) => !isSkipped(rel(p)))

if (!args.length) {
  const pending = allFiles.filter((p) => !exists(path.join(CONTENT, rel(p))))
  console.log(`可发布 ${allFiles.length} 篇，其中还没发布 ${pending.length} 篇：`)
  for (const p of pending) console.log('  ' + rel(p))
  console.log('\n用法：node scripts/publish.mjs --all   或   node scripts/publish.mjs <文件>…')
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

for (const t of targets) await publish(t)

const saved = stats.bytesBefore ? `（${(stats.bytesBefore / 1048576).toFixed(1)} MB → ${(stats.bytesAfter / 1048576).toFixed(1)} MB）` : ''
console.log(
  `\n已发布 ${stats.md} 篇，复制图片 ${stats.img} 个，转 webp ${stats.webp} 个${saved}，改写脚注 ${stats.footnote} 处`
)
if (stats.skipped.length) console.log(`按规则跳过 ${stats.skipped.length} 个文件（README / 模板）`)
if (stats.missingImg.length) {
  console.log(`\n⚠ ${stats.missingImg.length} 处图片找不到（页面会显示破图）：`)
  for (const m of stats.missingImg) console.log('  ' + m)
}
if (stats.grayLinks.length) {
  console.log(`\nℹ ${stats.grayLinks.length} 处站内链接指向未发布文章，构建时会自动变成灰字：`)
  for (const m of stats.grayLinks) console.log('  ' + m)
}