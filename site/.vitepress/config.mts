import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { buildSidebar, CONTENT } from './sidebar.mts'

/**
 * 判断正文里的链接指向的 md 是否已发布到 content/。
 * 外链和纯锚点一律放行。
 *
 * 两种写法都要认：
 *   - 相对链接（`02-每日推荐/2026-11-11.md`）→ 相对「当前 md 所在目录」
 *   - 站内绝对链接（`/深度精讲-xxx`）→ 相对 content 根
 * 早先版本对两者都按 content 根解析，导致嵌套目录里的相对链接被误判成未发布。
 */
function published(href: string, fromDir: string): boolean {
  const clean = decodeURI(href.split('#')[0].split('?')[0])
  if (!clean || /^([a-z]+:)?\/\//i.test(clean) || clean.startsWith('mailto:')) return true
  const p = clean.startsWith('/')
    ? path.join(CONTENT, clean.slice(1))
    : path.resolve(fromDir, clean)
  for (const c of [p, p + '.md', path.join(p, 'index.md')]) {
    try {
      if (fs.statSync(c).isFile()) return true
    } catch {}
  }
  return false
}

export default defineConfig({
  // 只把 content/ 当正文源目录；原始笔记目录完全不参与构建
  srcDir: '../content',
  // 兜底：模板里的 {{ }} 不会报错，只会静默把文字吃掉，所以宁可排除
  srcExclude: ['**/README.md', '**/03-模板.md'],

  // 部署到 GitHub Pages 项目站点时，base 必须写成 '/仓库名/'，否则白屏且无报错。
  // 这里由 CI 注入，本地默认 '/'，两边都不用改代码。
  base: process.env.DOCS_BASE || '/',

  lang: 'zh-CN',
  title: 'AI 文档',
  description: '已发布的 AI 学习笔记',

  markdown: {
    // 原文大量使用「一行一条元信息」的写法（> 原文：… / > 作者：…），
    // markdown 默认把连续行并成一段，会挤成一整块。开启后单换行即换行。
    breaks: true,
    config(md) {
      // 只发布一部分文章时，正文里指向未发布文章的链接会变死链，导致整个构建失败。
      // 这里把这类链接降级成带删除线的纯文本，构建照常通过。
      md.core.ruler.push('strip_unpublished_links', (state) => {
        // env 里带着当前 md 的绝对路径，用它算出「当前目录」才能正确解析相对链接
        const env = state.env as { path?: string; relativePath?: string }
        const fromDir = env?.path
          ? path.dirname(env.path)
          : path.join(CONTENT, path.dirname(env?.relativePath || ''))
        for (const block of state.tokens) {
          if (block.type !== 'inline' || !block.children) continue
          const kids = block.children
          const stack: boolean[] = []
          for (const k of kids) {
            if (k.type === 'link_open') {
              if (published(k.attrGet('href') || '', fromDir)) {
                stack.push(true)
                continue
              }
              k.type = 'html_inline'
              k.tag = ''
              k.attrs = []
              k.content = '<span class="link-unpublished" title="该文章尚未发布到本站">'
              stack.push(false)
            } else if (k.type === 'link_close') {
              if (stack.pop() === false) {
                k.type = 'html_inline'
                k.tag = ''
                k.attrs = []
                k.content = '</span>'
              }
            }
          }
        }
      })
    },
  },

  themeConfig: {
    outline: { level: [2, 3], label: '本页目录' },
    nav: [
      { text: '首页', link: '/' },
      { text: 'RAG 学习路线图', link: '/RAG 学习路线图/' },
      { text: '每日精选', link: '/每日 AI Agent 技术精选/' },
    ],
    sidebar: buildSidebar(),
    search: { provider: 'local' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '主题',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
  },
})