# 原文存档

这里存放前沿资料条目的原文，便于离线核对与引用。

## 目录

- `*.pdf` — **ACL Anthology 的 PDF**，已逐一用 HTTP `Content-Length` 校验大小一致，且文件含完整 `%%EOF` 结构。
- `html/` — **arXiv 论文的 HTML 版本**（当 PDF 无法完整下载时的替代存档，含完整 `</html>` 结尾）。

## 为什么 arXiv 的 PDF 很多没有存在这里

在本机网络环境下，`arxiv.org/pdf/...` 的下载被限速到约 4 KB/s：单篇 1 MB 的 PDF 需要 250 秒以上，`curl --max-time` 会在中途把它截断（实测 `size_download=930 666` 恰好等于 240 秒超时时的字节数）。截断的 PDF 打开会报错或丢页，**存进来等于存了一个坏文件**，所以：

- 能完整拿到的（ACL Anthology）→ 存 PDF；
- 拿不全的（多数 arXiv）→ 存 HTML 版本，或**在条目里只写原文链接**。

**每个前沿资料条目的「原文」小节都会注明本地是否有存档、是 PDF 还是 HTML**，不做含糊表述。

## 已核验完整的 PDF

| 文件 | 大小 | 对应条目 |
| --- | --- | --- |
| `2026.emnlp-main.1533-TrustRAG.pdf` | 433 KB | 证据的三条边界 |
| `2026.latechclfl-1.23-pre-targeting.pdf` | 1.8 MB | （语料预裁剪，见 11-14 条目引述） |
| `2026.findings-eacl.35-multilingual-rag.pdf` | 3.4 MB | 跨语言检索 |
| `2026.aacl-long.153-abstention-misleading.pdf` | 750 KB | 拒答与多跳评测 |
| `2026.acl-long.1705-Bright-Pro.pdf` | 5.0 MB | 拒答与多跳评测 |
| `2026.acl-industry.149-prefix-injection.pdf` | 511 KB | 索引期前缀注入 |

## HTML 存档

`html/` 下按 arXiv ID 命名（如 `2610.29188.html`）。抓取判据：文件含 `</html>` 且大于 20 KB。

## 重新抓取

```bash
bash scripts/fetch-frontier-originals.sh
```

（脚本会先比对 `Content-Length`，不一致就重试；仍失败的只保留 HTML 或链接。）
