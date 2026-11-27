# Agentic RAG 的收益与边界：会“多查几轮”不等于更强

> **定位**：前沿资料 · 主题合并（Agentic 检索）· 关联知识点 R6-06（Agentic RAG）、R6-05（Adaptive RAG）、R0-06（成本模型）
> **主源一**：Susheel Suresh 等，《AgenticRAG: Agentic Retrieval for Enterprise Knowledge Bases》，arXiv:2605.05538（2026-05-07）
> **主源二**：Aditi Singh 等，《Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG》，arXiv:2501.09136（2025-01；2026-04 修订）
> **主源三**：Mishca de Costa 等，《From Naive RAG to Deep Agentic Retrieval: An Evolving Context Engineering Pipeline for Regulatory Compliance》，arXiv:2607.24791（2026-06-28）
> **本地存档**：[AgenticRAG 摘要页](原文/html/2605.05538.html) ｜ [综述摘要页](原文/html/2501.09136.html) ｜ [OPG 案例摘要页](原文/html/2607.24791.html)
> **证据强度**：高（工业 harness + 多基准）+ 中（综述/案例）

## 一句话结论

**Agentic RAG 的收益来自“把检索从一次固定 top-k 变成可迭代的证据获取过程”，而不是来自“多几个 agent”**。在复杂任务上收益很实在：AgenticRAG 在 BRIGHT 上 recall@1 **49.6%（+21.8pp）**、WixQA factuality **0.96**、FinanceBench 答案正确率 **92%（距 oracle 真证据 2pp 内）**；但它**慢**（2–10 秒/查询），简单 FAQ 上通常是过度设计。**按问题复杂度路由，才是正确姿势。**

## 三个硬结论

**① Agentic harness 可以不换搜索栈，只加“工具层”。**
AgenticRAG 在现有企业搜索基础设施上叠一层轻量 harness，给推理 LLM 配 `search / find / open / summarize` 四个工具，让它**迭代检索、在文档内导航、自主分析证据**。结果是：**BRIGHT recall@1 49.6%（+21.8pp over best embedding baseline）、WixQA factuality 0.96（+13% relative）、FinanceBench 92% answer correctness（within 2pp of oracle）**。

**② 生产演化路径不是“一步到位”，而是“按成本升级”。**
OPG 的监管合规检索案例把演化分成：naive RAG → hybrid + rerank → agentic function-calling → deep multi-agent；最终形态叫 **PEA-CAE（Progressive Evidence Acquisition with Cost-Aware Escalation）**：**先用低成本、高精度检索，证据不足再升级到全文阅读/多 agent**。这比“所有 query 都走 agent”便宜得多。

**③ 综述把 Agentic RAG 拆成四种模式。**
2501.09136 把 agentic 设计模式归为：**reflection（反思）、planning（规划）、tool use（工具）、multi-agent collaboration（多智能体协作）**。这意味着“Agentic RAG”不是一个架构，而是四种能力的组合；**你不需要四个都上**。

## 精评：值钱的地方

1. **+21.8pp / 92% 是硬收益**，说明在复杂检索上，“让模型自己决定查什么”比“固定 top-k”更有效。
2. **PEA-CAE 的成本感知升级**是可直接抄的架构：默认便宜路径，证据不足才升级；把“升级”当异常处理，而不是默认路径。
3. **工具化（search/find/open/summarize）比“多 agent”更实用**：大部分收益来自“能在文档内打开和定位”，不是来自 agent 数量。

## 精评：不能当真（或容易被误读）的地方

- **延迟 2–10 秒/查询**（综述/实践口径），对 C 端高 QPS 可能不可接受；必须在业务侧设预算。
- **基准收益不等于生产收益**：BRIGHT/FinanceBench 的查询分布与你的业务可能不同；要自建分层评估。
- **多 agent 协作的收益最不确定**：综述把它列为模式之一，但工程上常增加协调失败与成本；先从单 agent + 工具开始。

## 对你的动作

1. **先建路由**：简单 FAQ 走 hybrid+rerank；多跳/研究/跨文档走 agentic；聚合/报表走 SQL。**默认不 agentic。**
2. **工具最小集**：`search(query)`、`open(doc_id/page)`、`summarize(span)`；先不要多 agent。
3. **预算硬约束**：`max_tool_calls`、`max_tokens`、`timeout`；超过就降级到“返回已收集证据 + 不确定性”。
4. **按 PEA-CAE 设计升级**：低成本的先做，证据不足才升级；记录 `escalation_rate` 与 `cost_per_success`。

## 自测

1. 你的查询里，真正需要多轮/多工具的占比是多少？如果没有数据，先量。
2. 你的 Agentic 路径平均几秒？P95 呢？业务能接受吗？
3. 如果 Agentic 把准确率从 70% 提到 85%，但成本涨 5 倍、延迟涨 4 倍，你会全量上还是只对某类 query 上？

## 原文

- AgenticRAG：<https://arxiv.org/abs/2605.05538> ｜ [本地摘要页](原文/html/2605.05538.html)
- Agentic RAG 综述：<https://arxiv.org/abs/2501.09136> ｜ [本地摘要页](原文/html/2501.09136.html)
- OPG 生产案例：<https://arxiv.org/abs/2607.24791> ｜ [本地摘要页](原文/html/2607.24791.html)
