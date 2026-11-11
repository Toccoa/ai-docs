#!/usr/bin/env node
// 把「已经写过的内容」链回知识地图。
//
// 每日推荐里的每个知识点标题都带 ID，形如：## 知识点 1：RAG 四层失败模型（R0-03）
// 这个脚本扫一遍这些标题，把链接塞进 00-RAG知识地图.md 对应那一行的「知识点」列。
// 幂等：重复跑只替换上一次插入的链接，不会叠加。
//
//   node scripts/link-knowledge-map.mjs          # 写入
//   node scripts/link-knowledge-map.mjs --check  # 只报告差多少，不改文件

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = 'RAG 每日精进'                       // 原始笔记目录
const MAP_FILE = path.join(ROOT, '00-RAG知识地图.md')
const SCAN_DIRS = ['02-每日推荐', '05-前沿资料']

// 非日报文件的简称，键是文件名
const ALIAS = {
  '2026-11-10-记忆栈-四层与dreaming.md': '记忆栈',
}

// 与 VitePress 一致的标题锚点规则：小写，非「字母数字汉字连字符」一律压成 -
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

function readTitle(file) {
  const text = fs.readFileSync(file, 'utf8')
  const h1 = text.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : ''
}

function labelOf(rel, title) {
  // 02-每日推荐/2026-11-09.md → 「001 期」
  const issue = title.match(/第\s*(\d+)\s*期/)
  if (issue) return `${issue[1].padStart(3, '0')} 期`
  const base = path.basename(rel)
  return ALIAS[base] || base.replace(/\.md$/, '')
}

/** 扫描目录，返回 { 'R0-03': [{rel, anchor, label}] } */
export function collectCoverage() {
  const coverage = new Map()
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.endsWith('.md')) continue
      const rel = path.posix.join(dir, name)
      const title = readTitle(path.join(abs, name))
      const label = labelOf(rel, title)
      const lines = fs.readFileSync(path.join(abs, name), 'utf8').split('\n')
      for (const line of lines) {
        const m = line.match(/^##\s+(.+)$/)
        if (!m) continue
        const heading = m[1].trim()
        const idm = heading.match(/[（(](R\d+-\d+)[）)]/)
        if (!idm) continue
        const id = idm[1]
        if (!coverage.has(id)) coverage.set(id, [])
        coverage.get(id).push({ rel, anchor: slugify(heading), label })
      }
    }
  }
  return coverage
}

const INJECTED = /[ \t]*\*\*\[📄 [^\]]*\]\([^)]*\)\*\*/g

/** 在知识地图文本里给有内容的知识点补链接，返回 { text, added, total } */
export function linkMap(text, coverage) {
  let added = 0
  let total = 0
  const out = text.split('\n').map((line) => {
    // 只处理表格行，且第一列是知识点 ID
    const m = line.match(/^\|\s*(R\d+-\d+)\s*\|(.*)$/)
    if (!m) return line
    const id = m[1]
    total += 1
    const cells = line.split('|')
    // cells: ['', ' R0-01 ', ' 知识点 ', ' 核心问题 ', ' 难度 ', '']
    if (cells.length < 6) return line
    const hadLink = INJECTED.test(cells[2])
    INJECTED.lastIndex = 0
    const name = cells[2].replace(INJECTED, '').trim()
    const hits = coverage.get(id)
    if (!hits) {
      // 内容被删掉了，只在确实残留链接时才动这一行
      if (!hadLink) return line
      cells[2] = ` ${name} `
      return cells.join('|')
    }
    added += 1
    const links = hits
      .map((h) => `[📄 ${h.label}](${h.rel}#${h.anchor})`)
      .join(' ')
    cells[2] = ` ${name} **${links}** `
    return cells.join('|')
  })
  return { text: out.join('\n'), added, total }
}

function main() {
  const check = process.argv.includes('--check')
  const coverage = collectCoverage()
  const before = fs.readFileSync(MAP_FILE, 'utf8')
  const { text, added, total } = linkMap(before, coverage)
  const missing = [...coverage.keys()].filter((id) => !before.includes(`| ${id} |`))

  console.log(`扫描到 ${coverage.size} 个有内容的知识点，地图共 ${total} 个知识点`)
  console.log(`补上链接：${added} 行`)
  if (missing.length) {
    console.log(`⚠ 这些 ID 在每日推荐里出现，但地图里没有对应行：${missing.join(', ')}`)
  }
  if (check) {
    console.log(text === before ? '地图已是最新' : '地图需要更新')
    return
  }
  if (text !== before) {
    fs.writeFileSync(MAP_FILE, text)
    console.log(`已写入 ${MAP_FILE}`)
  } else {
    console.log('没有变化')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()