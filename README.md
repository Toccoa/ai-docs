# AI 文档

AI Agent / RAG 学习笔记的静态站点，用 [VitePress](https://vitepress.dev) 构建，部署在 GitHub Pages。

**线上地址：<https://blog.093681.xyz/>**（GitHub Pages + Cloudflare，旧地址 `toccoa.github.io/ai-docs` 自动跳转）

## 结构

```
.
├── site/           站点脚手架（config / sidebar / theme），不放文章
├── content/        已发布的文章副本（站点只读这里）
│   ├── RAG 学习路线图/           成体系的学习路径，全量收录
│   └── 每日 AI Agent 技术精选/   按日期归档，一天一个文件夹
├── scripts/        publish.mjs 发布脚本、optimize-images.mjs 图片转 WebP、link-knowledge-map.mjs 知识地图回链
├── _站点方案/      方案文档与预览截图
└── *.md, 图片/     原始笔记，不参与构建
```

`content/` 里全是**副本**，原始笔记不会被改动。两个板块各有一个手写的 `index.md` 做板块首页，其余全部自动生成。

## 本地开发

```bash
npm install          # 首次
npm run docs:dev     # http://localhost:5173
npm run docs:build   # 产物在 site/.vitepress/dist
```

## 发布一篇文章

```bash
node scripts/publish.mjs "深度精讲-xxx.md"   # 单篇：自动分流到对应板块，连图片一起转 WebP
node scripts/publish.mjs --all              # 把能发的全发一遍
node scripts/publish.mjs --list             # 只看会落到哪、还有哪些没发
node scripts/link-knowledge-map.mjs         # 日报里出现新知识点后，给知识地图补链接
node scripts/publish.mjs "某篇.md" --to "每日 AI Agent 技术精选/2026-11-12"   # 落点不对时手动指定
npm run images                             # 单独把 content/ 里的图转一遍（可选）
git add -A && git commit -m "add: xxx" && git push
```

落点规则：`RAG 每日精进/` 下的文件进 `RAG 学习路线图/`（保留子目录）；其余进 `每日 AI Agent 技术精选/<日期>/`，日期取文件名里的 `YYYY-MM-DD`，没有就用文件修改时间。文章被搬动后，正文里的相对链接会按新位置重算。

图片会被转成 WebP（最长边 2400px、质量 88）再进 `content/`，原始 png 保持不动。实测 26 张图 8.6 MB → 2.7 MB。

推送到 `main` 后，GitHub Actions 会自动构建并部署。

## 文档

完整的方案、踩坑记录与运维说明在 [`_站点方案/静态站点方案.md`](_站点方案/静态站点方案.md)。