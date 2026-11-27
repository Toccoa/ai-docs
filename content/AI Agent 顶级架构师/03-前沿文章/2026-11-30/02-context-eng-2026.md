# 02｜2026 年末的新上下文工程挑战

> **来源**：LangChain Blog ｜ **发布**：2026-11-02 ｜ **作者**：Harrison Chase
> **原文**：https://blog.langchain.com/context-engineering-challenges-late-2026
> **原文存档**：[原文/02-context-eng-2026.md](原文/02-context-eng-2026.md)
> **翻译方式**：全文翻译（一篇约 900 词的短评，正文六个小节全部译出，链接保留在原文指向的位置；标题后的阅读时长标记「5min」与页头导航控件为网页模板，不译）
> **挂接知识点**：A2-04、A3-02

## 为什么今天读这篇

因为在一个"Agent 架构已经收敛、难题都解决了"的行业情绪里，这篇是少数把"收敛之后新长出来的问题"点名列出来的文章。收敛的部分很清楚——LLM 在循环里跑、调工具、在沙箱里执行——而 Harrison Chase 的判断是：这套架构的**上下文工程**确实已经标准化了（摘要把长线程、卸载大工具结果、技能渐进披露、工具搜索、子智能体做上下文隔离、把 bash 当主工具），所以老问题看起来都解决了。真正的新变量是**主动性、常驻、目标导向**这一类智能体：它们在后台跑、被事件流或心跳唤醒、和别人异步协作、朝一个长期目标迭代。这六条挑战（主动性尺度、记忆、异步、目标追踪、对齐、浏览器操作）不是"提示技巧"层面的问题，而是架构层面的：每一条都要求你重新决定"什么进入上下文、什么时候进入、以什么形态进入"。对做架构决策的人，这篇文章的价值在于它给了一份**问题清单**而不是答案清单——而恰恰是这份清单，能让你在评审一个"主动型 Agent"方案时问出对的问题。

## 三句话摘要

1. 整个行业正在收敛到同一种 Agent 架构（LLM + 循环 + 工具 + 沙箱），而围绕它的上下文工程实践也已经形成了一套"标准答案"：摘要把长线程、卸载大工具结果、技能渐进披露、工具搜索、子智能体做上下文隔离、bash 作为主工具。
2. 但这种收敛带来的"难题都解决了"的感觉是错的：过去几个月里，每一个作者交流过的 Agent 构建者都在思考**主动性、常驻、目标导向**的智能体，而这类智能体引入了一整组新挑战。
3. 新挑战共六条——如何在不过度打扰的前提下保持主动、记忆该记什么、异步工作如何通知主智能体、目标如何拆解与迭代、如何防止智能体以不可预期的方式"作弊"地优化目标、以及浏览器作为通用工具时如何管理上下文——业界目前都还没有通用解法。

## 译文

感觉所有人都在收敛到同一种 Agent 架构：一个 LLM，跑在循环里，调用工具，在沙箱里执行。[Claude Code](https://www.anthropic.com/research/claude-3-7-sonnet) —— 也许是最早的高关注度体现 —— 已经发布超过一年半了。[Deep Agents](https://www.langchain.com/blog/deep-agents)，我们的 Agent 执行架，也在一年多前上线。这个模式已经积累了一段时间。

这种收敛本身没什么不好，但它导致我最近交流过的一些 AI 工程师产生了一种情绪：「所有难题都解决了」，或者「已经没有新的 AI 工程问题要解决了」。

当人们表达这种情绪时，我认为他们说的主要是我们为了让 Agent 工作而做的[上下文工程](https://www.langchain.com/blog/context-engineering-for-agents)实践。某种程度上他们是对的——我们已经共同到达了很多接近标准的上下文工程方案：

- 当长线程对上下文窗口来说太多时，[把长线程摘要化](https://www.langchain.com/blog/context-management-for-deepagents)
- [卸载大型工具调用结果](https://www.langchain.com/blog/context-engineering-deep-agents-remember)
- 用[技能](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)做渐进披露
- 用[工具搜索](https://www.anthropic.com/research/advanced-tool-use)应对工具过多
- 用[子智能体](https://www.anthropic.com/engineering/multi-agent-research-system)做上下文隔离
- 把 bash 当作[主工具](https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools)

（对像我这样的上下文工程爱好者来说）好消息是，我认为我们正在看到 Agent 能力的一次阶跃变化，或者至少是它们被使用方式的阶跃变化。具体来说，过去几个月里，每一个和我聊过的 Agent 构建者都在思考[主动性、常驻、目标导向的智能体](https://www.langchain.com/blog/proactive-agents)。这类智能体的内核与编程智能体有许多相似之处，但也带来了一组新的挑战。我在下面挑几个重点讲。我们（在 LangChain，以及在整个行业）并不必然拥有这些问题的解法（或者至少没有通用解法），所以思考这些问题是我最近一段时间最有意思的事！

**如何做到主动而不烦人**：这些主动型智能体在后台运行，要么[监听事件流](https://www.langchain.com/blog/introducing-ambient-agents)，要么被心跳唤醒。一方面，它们需要能够把东西推送给用户——这会带来"帮上忙了"的感觉。另一方面，如果你向用户推送太多通知，就有让他们不堪重负的风险。[把这件事校准成一种令人愉悦的体验](https://www.langchain.com/blog/what-weve-learned-building-proactive-agents)（不多不少）仍然是一个艰难的上下文工程挑战！

**记忆**：[Agent 的记忆](https://www.langchain.com/blog/memory-for-agents)是我们与构建者讨论了一段时间的话题。记忆系统最终有两个部分：底层数据结构，以及围绕这些数据的智能层（一个智能体）。数据结构通常相当简单（[文件](https://www.langchain.com/blog/how-we-built-agent-builders-memory)、单个字符串）。智能层最难的部分是弄清楚该记住什么。与主动性类似，两个极端都很容易搞砸（什么都不记，或者把细节记得太琐碎）。由于这个决定"记什么"的智能层本身常常就是一个（简单的）智能体，围绕"记什么、何时记"的上下文工程仍然是一个开放问题。

**异步**：这些智能体运行的时间越来越长，并且要与其它本身运行时间也越来越长的系统（工具、其它智能体）交互。然而，你几乎总是希望与用户交互的主智能体能对新的消息保持响应。这两点结合起来，导向一种架构：越来越多的工作在异步的[工具](https://developers.openai.com/api/docs/guides/async-tool-calling)和[子智能体](https://docs.langchain.com/langsmith/python/managed-deep-agents-subagents)里完成。这带来一组新的上下文工程挑战：当那项工作完成时，你如何[通知](https://www.langchain.com/blog/managed-deep-agents-browser-use-and-asynchronous-subagents)主智能体？当主智能体[仍在运行，vs 已经结束](https://www.langchain.com/blog/agents-are-going-async)时，你如何处理这些情况？如果它正暂停等待人类审批呢？

**目标追踪**：智能体正在[从做任务转向朝着目标工作](https://www.langchain.com/blog/from-tasks-to-goals)。像 [Hone](https://hone.com/blog/introducing-engines/) 这样的智能体是很好的例子。你如何设计出能把目标拆成更小步骤、跑实验、拿反馈、并持续朝一个更大目标迭代的智能体？让智能体为了一个目标去尝试新的实验（而不是只是重复做过的事）是有挑战的。让智能体去思考宽泛的目标而不只是小任务是有挑战的。让它们在长时间跨度上保持一致也是有挑战的。

**对齐**：与上一条相关。[目标设计](https://www.langchain.com/blog/goal-engineering)本身就很难。用户要设计出智能体无法作弊的目标将非常困难。如果智能体盲目地试图优化一个目标——它们可能达成它，但可能以[我们无法预料的方式作弊](https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/)。比如那个经典例子：「清除代码库里所有的 bug」→ 把整个代码库删掉（没有代码就没有 bug）。你如何设计一个执行架，让智能体不仅聚焦于目标，而且不会对那些目标过度优化？

**浏览器操作**：对编程智能体来说，最重要的工具是能运行并执行代码的 bash 工具。对很多这类更通用的智能体来说，[浏览器](https://www.langchain.com/blog/browser-use-in-managed-deep-agents)正在成为那个工具。驱动浏览器要比驱动终端[复杂得多](https://docs.langchain.com/langsmith/python/managed-deep-agents-browser-use)！你和图像交互，还是和 DOM 交互？两者都是很大的对象——你如何[围绕它管理上下文](https://www.langchain.com/blog/how-we-optimized-browser-use-for-deep-agents)？这些只是冒出来的问题中的一部分。

几个月前，我大概会同意上下文工程里没有那么多开放问题了。但有了这些常驻、主动的智能体，我们看到一整组新的挑战正在浮现！能活在这个时代真好。

## 与路线图的挂接

- **A2-04（上下文工程：压缩、摘要、卸载）**：这篇文章的价值不在技术细节，而在于它把 A2-04 的清单**划了一条时间线**。左半边是已标准化的六件事（摘要化、卸载、技能、工具搜索、子智能体、bash），你今天可以直接照抄；右半边是六条尚未标准化的新挑战，每一条都在改写"上下文里该放什么"的答案。做架构方案时，用左半边做基线，用右半边列出风险项。
- **A3-02（短期记忆与上下文装配）**：文中"记忆"与"异步"两节直指装配问题。异步一节尤其关键：当工作被移到异步工具/子智能体里，主智能体的上下文就出现了一个"悬挂引用"——工作还在跑，但结果尚未存在；工作完成了，主智能体可能已经翻过好几轮。这要求装配逻辑能处理"迟到的事实"，而不是简单的"追加一段历史"。
- **延伸读到 A4-05（副作用与人工审批）**：文中"如果它正暂停等待人类审批呢？"这一问，把异步上下文的难点和审批点绑在了一起——暂停态本身就是一种需要被持久化、并在恢复时被正确重新装配的状态（呼应 A3-06）。

## 三个自测问题

1. 文章列出的六条"已标准化"的上下文工程实践，哪些是**减少进入上下文的 token**，哪些是**改变 token 进入上下文的方式**？这个区分对你的架构选型有什么影响？
2. 在"异步"一节里，主智能体等待异步子智能体完成时，上下文工程要解决的核心矛盾是什么？请举出至少两种"通知时机"不同所带来的失败模式。
3. 「清除代码库里所有 bug → 删掉代码库」这个例子，为什么被归到"对齐"而不是"上下文工程"？它的防线应该建在执行架（harness）的哪一层？
