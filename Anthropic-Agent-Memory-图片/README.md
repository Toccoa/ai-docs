# Anthropic《The components of agent memory》原文配图

来源文章：https://www.anthropic.com/research/components-of-agent-memory （2026-11-06）
所有图片均为 Anthropic 官方原文配图，从 `www-cdn.anthropic.com` 下载原始分辨率（多数 3840px 宽）。
版权归 Anthropic 所有，此处仅作本地归档与离线阅读之用。

## 文件清单

| # | 文件 | 尺寸 | 内容 | 原文位置 |
|---|---|---|---|---|
| 1 | `fig01-记忆层级总览.png` | 3840×1754 | 四层记忆层级（transcripts → notes → representations → injected context），以及 "Dreaming" 方框内从 transcripts 指向各层的箭头 | 开篇，图 1 |
| 2 | `fig02-写入记忆笔记.png` | 3840×1754 | 同一层级，高亮 memory notes 层；箭头从 session 直指 notes，标注"由 Claude 写下的显著观察" | 「记忆笔记」节，图 2 |
| 3 | `fig03-CL-Bench结果.png` | 3840×2160 | 左：各模型有/无记忆的柱状对比（Opus 5.5 0.655→0.838 等）；右：30 道题上的运行平均折线 | 「记忆是预测」节，图 3 |
| 4 | `fig04-Pokemon记忆目录对比.png` | 3840×2545 | 同比例尺树图（面积＝字符量）：Sonnet 3.7 的 413 文件/97.8 万字符 vs Fable 5 的 10 文件/4.3 万字符 | 「判断显著性」节，图 4 |
| 5 | `fig05-引导与硬规则效果.png` | 3840×2310 | 左：Sonnet 4.6 基线 0.330 / 有记忆 0.364 / 有记忆+改进指令 0.641；右："只记失败"规则下各模型增益变化（Opus 5 −0.234） | 「引导写记忆」节，图 5 |
| 6 | `fig06-dreaming纠错机制.png` | 3840×1754 | 层级图，高亮 transcripts → notes 的箭头，表示 dreaming 用原始记录校对笔记 | 「Dreaming 可以修正记忆」节，图 6 |
| 7 | `fig07-月见山错误笔记对比.png` | 3840×2101 | 两张地图面板：左"原始记忆"（错误笔记，agent 朝下一城镇走），右"记忆+dreaming"（笔记被修正，agent 返回洞口） | 同上，图 7 |
| 8 | `fig08-到达华蓝市进度.png` | 3840×2636 | 3,000 个动作内的进度折线：记忆+dreaming 在第 1,935 步到达；原始记忆掉下台阶退回；无记忆从未到达 | 同上，图 8 |
| 9 | `fig09-dreaming建表征.png` | 3840×1754 | 层级图，高亮指向记忆表征层（wiki）的箭头 | 「构建新的记忆表征」节，图 9 |
| 10 | `fig10-wiki规模与得分.png` | 3136×1432 | 中：2M→128M dreaming token 下三类配置得分（wiki+search 54%→61%、纯 wiki 13%→48%、纯 search 53% 持平）；左右：2 个与 128 个 session 后的 wiki 网络图（103 页/766 链接 → 222 页/12,893 链接） | 同上，图 10 |
| 11 | `fig11-任务类型与wiki收益.png` | 3840×3694 | 两张"评分标准↔源文档"连线图：左为需跨文档综合的任务（wiki 有收益），右为单文档可检索的任务（无收益） | 同上，图 11 |
| 12 | `fig12-wiki比语料还大.png` | 3840×2150 | 左：10 个文档 115KB；右：由它建出的 wiki 68 页/255 链接/203KB（1.77× 语料）——博尔赫斯式地图 | 同上，图 12 |
| 13 | `fig13-dreaming写入注入层.png` | 3840×1754 | 层级图，高亮指向顶端注入上下文层的箭头，该层供给下一个 session | 「提升笔记」节，图 13 |
| 14 | `fig14-合同条款写冲突.png` | 3840×1822 | 左：四个 agent 同写 `provisions.md` 互相覆盖，57 条受评事实只活下 41 条；右：一合同一页一 writer 且逐字引用，57/57 | 「聚焦特定目标」节，图 14 |
| 15 | `fig15-第二轮dreaming补漏.png` | 3840×1812 | wiki 网络图前后对比：9 条指向不存在页面的链接被重指，新增 3 页（index 等），38 页/225 链接 → 41 页/278 链接 | 「填补缺口」节，图 15 |

## 引用方式

文档内引用路径（两篇文档都在上级目录，用的是相对路径）：

```markdown
![图 3：CL-Bench 结果](Anthropic-Agent-Memory-图片/fig03-CL-Bench结果.png)
```

- `Anthropic-Agent-Memory-全文翻译-2026-11-06.md`：15 张全部按原文位置内嵌
- `Anthropic-Agent-Memory-精讲-2026-11-10.md`：内嵌 8 张关键图（1/3/4/5/7/10/12/14）

## 重新下载

同目录的 `list.txt` 保存了「本地文件名 + CDN 文件名」的完整映射，可整体重建：

```bash
cd Anthropic-Agent-Memory-图片
while read -r name file; do
  curl -sSL --max-time 60 -o "$name.png" \
    "https://www-cdn.anthropic.com/images/4zrzovbb/website/$file"
done < list.txt
```

单个 CDN 文件名格式为 `<hash>-<W>x<H>.png`，例如图 1 是
`a0bcfa203214d817d2b4261b7188aba8be6db5b2-3840x1754.png`。
