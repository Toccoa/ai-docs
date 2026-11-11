# AI 文档

AI Agent / RAG 学习笔记的静态站点，用 [VitePress](https://vitepress.dev) 构建，部署在 GitHub Pages。

**线上地址：<https://toccoa.github.io/ai-docs/>**

## 结构

```
.
├── site/           站点脚手架（config / sidebar / theme），不放文章
├── content/        已发布的文章副本（站点只读这里）
├── scripts/        publish.mjs：一键把文章发布进 content/
├── _站点方案/      方案文档与预览截图
└── *.md, 图片/     原始笔记，不参与构建
```

`content/` 里全是**副本**，原始笔记不会被改动。

## 本地开发

```bash
npm install          # 首次
npm run docs:dev     # http://localhost:5173
npm run docs:build   # 产物在 site/.vitepress/dist
```

## 发布一篇文章

```bash
node scripts/publish.mjs "深度精讲-xxx.md"   # 单篇，连图片一起复制
node scripts/publish.mjs --all              # 把能发的全发一遍
git add content/ && git commit -m "add: xxx" && git push
```

推送到 `main` 后，GitHub Actions 会自动构建并部署。

## 文档

完整的方案、踩坑记录与运维说明在 [`_站点方案/静态站点方案.md`](_站点方案/静态站点方案.md)。