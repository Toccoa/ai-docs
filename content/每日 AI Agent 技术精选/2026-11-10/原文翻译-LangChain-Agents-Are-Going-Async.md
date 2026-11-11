# 原文翻译：Agents Are Going Async（Agent 正在走向异步）

> **原文标题**：Agents Are Going Async
> **作者**：S. Runkle（Sydney Runkle）、T. Bengre（Thushanth Bengre）
> **发布**：LangChain Blog，2026 年 11 月 5 日，阅读时长 5 分钟
> **原文链接**：https://www.langchain.com/blog/agents-are-going-async
> **说明**：以下为全文逐段直译，保留原文结构、小标题、代码块、图注与链接；术语首次出现时括注英文原词。

---

## 核心要点（Key Takeaways）

- 随着 agent 承担起更大的目标，它们需要在**持续对用户保持可响应**的同时，**并行推进许多长任务**。
- 异步子代理（async subagents）把一个 agent 拆成两部分：一个始终对用户可用的**编排者（orchestrator）**，以及在后台运行任务、完成时向编排者汇报的**子代理**。
- 后台工作正在成为 agent 基础设施的常态——从 Claude Code 这类编码 agent，到 OpenAI 的 dots 这类个人 agent，都是如此。

---

试想这样一位幕僚长：每次你交给他一个大项目，他就消失不见，只在全部做完之后才回来。你大概会立刻解雇他。一位好的幕僚长会让项目在后台持续推进，同时保持随叫随到，并一路向你同步进展。

当我们要求 agent 去追求更大的目标时，它们也需要同样这两种性质。一个 agent 必须**可响应（responsive）**——接到新指令就立刻行动，并且带着此前全部上下文的语境；同时必须**有产出（productive）**——能同时推进许多大型任务。

我们长期以来用来构建 agent 的架构，**无法**同时满足这两项要求。在标准的 ReAct 循环中，每一次长时间的工具调用都会阻塞循环，其他所有任务都只能排在它后面。

于是我们看到，整个生态正在向一种分工收敛：**一个始终陪伴用户的 agent，加上在后台干长活的 worker**。Claude Code 默认把子代理放到后台运行；OpenAI 的 dots 把工作交给后台 worker，从而同时推进多件事情；DeepSeek Harness 则把它的超级 agent 构建在一个「与人对话的 router + 并行执行任务的后台 worker」的结构之上。

我们正通过[异步子代理](https://docs.langchain.com/oss/python/deepagents/async-subagents)把这一模式带入 [Deep Agents](https://www.langchain.com/deep-agents)。编排者始终对用户可用，并负责把对话的上下文组织好；异步子代理则作为后台 worker 运行，完成时向编排者汇报。这样一来，agent 能承担的工作量就随**后台 worker 的数量**增长，而不是受限于**单条循环的长度**。

## 异步子代理如何工作（How async subagents work）

agent 是在一个循环里运行的。模型调用一个工具，等待结果，再决定下一步做什么。过去，工具和子代理会阻塞这条循环，直到它们返回——就像代码里依次 `await` 每个慢调用一样。

异步子代理则像一个用 `asyncio.create_task` 启动的任务，或者一个你还没有 `await` 的 `Promise`。调用立刻返回，工作在后台独立运行，结果稍后回来。

![同步子代理 vs 异步子代理：编排者把工作交给异步子代理，自己则保持空闲以便与用户对话](https://cdn.prod.website-files.com/65c81e88c254bb0f97633a71/6aecdfa8017b07753945c843_6aecdf73f7189dcc96aaf4de_sync-vs-async-subagents-v2.png)

*编排者把工作交给异步子代理，自身则保持空闲，随时可以与用户对话。*

异步工作依赖系统的两项性质：

- **用户能够触达编排者。** 编排者是用户直接交互的那个 agent。子代理不再占用它的循环，因此只要它自己的循环不忙，用户就能触达它，而不必等每一个子代理都跑完。
- **任务并行运行，互不阻塞。** 任务来了编排者就启动子代理，而不是等一整批任务全部返回。

编排者通过五个工具来管理异步子代理：

- `start_async_task` —— 在**独立的 thread** 上启动一个子代理，并立刻返回。
- `check_async_task` —— 获取某个任务的状态；任务完成后，同时取回其结果。
- `update_async_task` —— 向正在运行的任务发送新指令。
- `cancel_async_task` —— 停止一个正在运行的任务。
- `list_async_tasks` —— 列出所有任务及其状态。

**「操控正在运行的子代理」和「触达编排者」是两件事。** 当编排者用 `update_async_task` 发送后续指令时，这条子代理定义上的 `update_strategy` 字段决定会发生什么：

- `"interrupt"`（默认值）会**停止当前这次 run**，带着新指令重新启动该子代理。适用于**纠错**，例如「改用 Postgres」。
- `"enqueue"` 会把后续指令**挂起**，等当前这次 run 结束后再处理。适用于**追加**，例如「你做完之后把测试也跑一下」。

## 通知如何工作（How notifications work）

每一个尚未完成的任务都会列在编排者的 **system prompt** 里，因此它始终知道自己有哪些活在空中。它可以主动用 `check_async_task` 轮询，任务也可以[自行上报](https://docs.langchain.com/langsmith/python/managed-deep-agents-subagents#get-notified-when-a-subagent-finishes)：

- 如果编排者**正忙（busy）**，它会在每次模型调用之前检查自己那些未完成的任务，并在 run 进行中就把结果取走。
- 如果它**空闲（idle）**，子代理会通过发起一次新的 run 把它唤醒。
- 如果它因为**等待审批而暂停（paused）**，那么这个审批请求不会被搅乱，结果会在用户答复之后才送达。

![异步子代理上报：无论编排者处于忙碌、空闲，还是因等待审批而暂停](https://cdn.prod.website-files.com/65c81e88c254bb0f97633a71/6aece061fd58da9939f252d0_6aece01aea23933948716221_async-subagent-notifications-v3.png)

*无论编排者处于忙碌、空闲，还是因等待审批而暂停，异步子代理都会把结果报回来。*

需要审批的子代理会以 `waiting` 状态出现，用户在**该子代理自己的 thread** 上作答，无需打断编排者。在 Slack 上的 Managed Deep Agents 中，该请求会[回帖到原始 thread](https://docs.langchain.com/langsmith/python/managed-deep-agents-subagents#answer-approvals-in-channels)。

我们预计这一模式会从子代理**推广到各类工具**。OpenAI 最近加入了[异步工具调用（async tool calling）](https://developers.openai.com/api/docs/guides/async-tool-calling) 支持：模型调用工具之后可以继续工作，由你的应用在后续请求中把结果送回去。

## 使用异步子代理（Use async subagents）

异步子代理已在 Deep Agents 的 [Python](https://docs.langchain.com/oss/python/deepagents/async-subagents) 与 [JavaScript](https://docs.langchain.com/oss/javascript/deepagents/async-subagents) 版本中提供，也在 [Managed Deep Agents](https://docs.langchain.com/langsmith/python/managed-deep-agents-subagents) 中提供——在那里，把子代理变成异步只需要**一个字段**：

```python
from managed_deepagents import define_deep_agent

agent = define_deep_agent(
    name="research-assistant",
    model="openai:gpt-5.5",
    subagents=[
        {
            "name": "researcher",
            "description": "Researches a topic in the background.",
            "system_prompt": "Research the topic and report your findings.",
            "async": True,
        },
    ],
)
```

在 Managed Deep Agents 中，每一个被服务的 agent 还会额外获得一份 `general-purpose` 子代理的**异步副本**，因此它可以在运行时决定：把委派出去的工作放在前台跑，还是放到后台跑。

任务通知功能目前处于 **beta**，API 仍可能变化。[async-deep-agents](https://github.com/langchain-ai/async-deep-agents) 仓库里有一个可运行的 supervisor，配有 researcher 与 coder 两个子代理，Python 与 TypeScript 版本俱全。

欢迎试用异步子代理，并通过 [GitHub issues](https://github.com/langchain-ai/deepagents/issues) 或[论坛](https://forum.langchain.com/)告诉我们你的想法。

---

### 相关内容（Related content）

- **How We Optimized Browser Use for Deep Agents** — Sydney Runkle，2026 年 11 月 3 日，10 分钟
- **Managed Deep Agents v0.10: Browser use and asynchronous subagents** — N. Drezner、S. Runkle，2026 年 10 月 29 日，7 分钟
- **Browser Use in Managed Deep Agents** — Sydney Runkle，2026 年 10 月 29 日，7 分钟
