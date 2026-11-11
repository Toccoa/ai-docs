# 深度精讲：Agents Are Going Async（LangChain · 11-05）

> **原文**：*Agents Are Going Async* — Sydney Runkle & Thushanth Bengre，LangChain Blog，2026-11-05，约 5 分钟阅读（短文，信息密度高）
> 🔗 https://www.langchain.com/blog/agents-are-going-async
> **配套文档**：[Async subagents](https://docs.langchain.com/oss/python/deepagents/async-subagents) ｜ [Managed Deep Agents · Subagents](https://docs.langchain.com/langsmith/python/managed-deep-agents-subagents) ｜ [async-deep-agents 参考实现](https://github.com/langchain-ai/async-deep-agents) ｜ [OpenAI Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling)
> **一句话**：把 agent 从"一个会卡住的 ReAct 循环"改成"一个永远在线的前台 + 一群后台 worker"，并给出工程上把这件事做对的五个工具、三条回传路径和一整套踩坑清单。

---

## 0. 先看结论（如果你只读 60 秒）

1. **问题不是"慢"，是"耦合"**。ReAct 循环里 `tool → wait → result` 是同步等待，一次 30 秒的搜索就把**对话**和**其他所有任务**都锁住了。用户改需求要靠"打断"或者"等它跑完"。
2. **解法是角色拆分**：orchestrator（编排者）只负责**对人**、维护上下文；async subagent（后台 worker）负责**干活**。工作量上限从"一条循环能跑多长"变成"能开多少 worker"。
3. **语言层已经收敛**：像 `asyncio.create_task` / 不 await 的 `Promise`——调用**立刻返回任务 ID**，结果**稍后回来**。
4. **成败取决于"监督"而不是"并发"**（这是原文明说、社区文章反复强调的部分）：任务台账、状态新鲜度、interrupt vs enqueue 的取舍、审批归属、失败去处。
5. **已经产品化**：Deep Agents（Python/JS）+ Managed Deep Agents，一个字段 `"async": True` 就能把子 agent 变后台；通知/`waiting`/fork 等能力**仍在 beta**。

---

## 1. 这篇文章为什么重要：从"单循环 agent"到"组织化 agent"

### 1.1 开篇那个比喻其实定义了两个硬指标

原文用"幕僚长（chief of staff）"开篇：**一个接到大项目就消失、做完才回来的幕僚长，你应该立刻解雇他。** 好的幕僚长同时具备两件事：

| 性质 | 英文原文 | 工程含义 | 被什么破坏 |
|---|---|---|---|
| **响应性**（Responsive） | act on a new instruction right away **with the context of everything before it** | 用户随时能说话，且新指令带着完整的历史上下文生效 | 同步阻塞的 tool 调用；上下文被清空/丢失 |
| **生产力**（Productive） | make progress on **many long tasks at once** | 多个长任务真并行，而不是排队 | 一条循环只能串行推进；批处理式 fan-out 要等整批返回 |

注意后半句 "with the context of everything before it"——**响应性是"有上下文的响应"**，不是"秒回一个空话"。这解释了为什么后面要专门做 `mode="fork"`：让后台 worker 也能带上上下文。

### 1.2 为什么"旧架构做不到"——用一张时间线说清楚

同步 ReAct 的一次请求（用户"A"之后插了用户"B"）：

```
t=0s   User:  "调研 A 市场，写个报告"
t=1s   Orchestrator: call task(researcher, "调研 A")   ← 循环阻塞
t=1s..35s  [Orchestrator 忙；其它任务全部排队]
t=12s  User:  "其实改成 B 市场"     ← 用户的话没人接
t=30s   用户不耐烦："还在吗？"       ← 还是没人接
t=35s  Researcher 返回
t=36s  Orchestrator: "好的，我重新查 B……"  ← 白干 35 秒
```

异步化之后：

```
t=0s   User:  "调研 A 市场，写个报告"
t=1s   Orchestrator: start_async_task(researcher, A) → task_id=abc123  ← 立刻返回
t=1s   Orchestrator → User: "已开工 abc123，你先忙别的"
t=12s  User:  "其实改成 B 市场"
t=13s  Orchestrator: update_async_task(abc123, "改用 B")  ← interrupt：停在 A，带历史重启做 B
t=13s  Orchestrator → User: "已调整"
t=..   用户可以继续派新任务（并行开第二个 worker）
t=完成  Researcher 回报 → orchestrator 在"下一次模型调用前"领走结果
```

关键差异：**在同步世界，"用户的下一句话"只能等循环空出来；在异步世界，"用户的话"走的是 orchestrator 自己的循环，与 worker 的循环解耦。**

### 1.3 生态信号：这不是 LangChain 一家的发明

原文点名三家，说明这是**正在收敛的行业共识**，而不是单一框架的品味：

- **Claude Code**：subagent **默认跑在后台**（文档：code.claude.com/docs/en/sub-agents）。
- **OpenAI dots**：把活交给 background workers，以便"同时推进多件事"。
- **DeepSeek Assistant**：超级 agent 用"**router 对人 + 后台 worker 并行干活**"的结构（就是你现在正在用的这套工具形态——你在对话里说话时，后台有 `subagent` / `workflow` / 后台 job 在跑，且不阻塞你继续输入）。

> 延伸判断：LangChain 这篇的价值不在于"提出了新概念"，而在于**把分布式系统里"任务提交 / 状态查询 / 取消 / 通知"这套老配方，翻译成 LLM 能用的 5 个工具**，并给出了"模型会在哪里搞砸"的经验清单。

---

## 2. 机制解剖：五个工具 + 两套策略 + 三条回传路径

### 2.1 编程语言类比（原文最精准的一句）

> An async subagent works like a task started with `asyncio.create_task` or a `Promise` you don't await yet.

对应关系：

| 语言世界 | Agent 世界 |
|---|---|
| `asyncio.create_task(coro)` 返回 `Task` | `start_async_task(...)` 返回 `task_id` |
| `task.done()` / `await task` | `check_async_task(task_id)` |
| 重新 `create_task`（带新参数）或往队列里塞消息 | `update_async_task(task_id, instruction)` |
| `task.cancel()` | `cancel_async_task(task_id)` |
| `asyncio.all_tasks()` | `list_async_tasks()` |
| 回调 / 事件总线 | completion notification（回传 `HumanMessage`） |

**但有一个关键不对称**：普通协程之间共享内存；agent 之间**只共享文本**。所以"状态"必须显式存在某个地方（见 §2.4 的 `async_tasks` 状态通道），否则 context compaction 一压缩，agent 就把自己派出去的任务忘了。

### 2.2 五个工具（原文 + 官方文档对齐）

| 工具 | 作用 | 返回 | 底层动作（文档补充） |
|---|---|---|---|
| `start_async_task` | 在**独立 thread** 上启动 subagent，立即返回 | task ID（= thread ID） | 建 thread（`metadata={"parent_thread_id": ...}`）→ 起 run |
| `check_async_task` | 查状态；完成则取结果 | status + result | 取 run status；若成功再取 thread state 抽最终输出 |
| `update_async_task` | 给**正在跑的任务**发新指令 | 确认 + 新状态 | **同 thread 起新 run**（`update_strategy` 决定 interrupt / enqueue） |
| `cancel_async_task` | 停止任务 | 确认 | `runs.cancel()`，状态置 `cancelled` |
| `list_async_tasks` | 列出全部任务与实时状态 | 任务汇总 | 非终态任务**并行**从服务端拉实时状态；终态走缓存 |

**状态机**（综合 OSS 文档 + Managed 文档）：

```
            start
              │
              ▼
   ┌──────► pending ──(run 开始)──► running ──┬──► success  (终态)
   │         (仅 enqueue 时出现)              ├──► error    (终态)
   │                                         ├──► cancelled(终态)
   │                                         ├──► timeout  (终态)
   │                                         └──► waiting  (等审批/输入，非终态)
   │                                                │
   │   update（interrupt：停当前 run，同 thread 重启，task_id 不变）
   └────────────────────────────────────────────────┘
```

**几个容易忽略的细节**（都来自官方文档，工程上很要命）：
- `cancel` 一个 `waiting` 任务**只会把它标记为 cancelled**——因为它没有活跃 run，"取消"等于"放弃这次等审批"。同样，`update` 一个 `waiting` 任务会**丢掉它挂起的请求**。
- `list` 的实时刷新**只针对非终态任务**；终态直接从缓存返回（省调用，但这意味着"缓存一致性"的责任在你这边）。
- Managed Deep Agents 里，每次模型调用前对**每个未完成任务做一次状态检查，上限 5 秒**——这是"轮询兜底"，不是"无限等"。
- 每个结果**只回报一次**（`Each result is reported once`），避免重复注入。

### 2.3 `interrupt` vs `enqueue`：真正需要"判断力"的地方

原文只用两句话给了原则，但这是整套设计里唯一**必须由模型做价值判断**的开关：

```python
AsyncSubAgent(
    name="researcher",
    ...
    update_strategy="interrupt",   # 默认：停当前 run，带全历史重启
    # 或
    update_strategy="enqueue",     # 排队：当前 run 跑完再接手
)
```

| 维度 | `interrupt`（默认） | `enqueue` |
|---|---|---|
| 语义 | 打断重来 | 追加执行 |
| 适用 | **纠错**："别用 MySQL，换 Postgres" | **追加**："跑完顺手把测试也跑了" |
| 已做工作的命运 | 丢失（但历史被带进新 run，模型理论上"知道做过什么"） | 保留 |
| 时长代价 | 可能反复重启（"抖动"） | 延迟生效；积压时排队 |
| 用户感知 | 快但是"又重来" | 慢但是"结果更完整" |
| 文档细节 | 重启时带完整对话历史 + 新指令，**task_id 不变**（内部 run_id 变） | 任务先 `pending`；若当前 run 在等审批，**审批请求会被丢弃**，后续 run 照常开始 |

> **判断口诀**：改的是"方向/前提" → interrupt；改的是"范围/补充项" → enqueue。
> **反模式**：把 `interrupt` 当默认值无脑用，用户每补一句需求就重启一次长任务——累计浪费（重读文件、重跑搜索）可能比串行还贵。

### 2.4 记忆放在哪：`async_tasks` 状态通道（整套设计里最"工程"的一笔）

Deep Agents 会在上下文将满时**压缩（summarize）消息历史**。如果 task_id 只存在于 tool message 里，压缩一次就**丢了**——于是 agent 会忘记自己派出去的任务，甚至重复派单。

解法：**任务元数据存在 supervisor 图的一个独立状态通道 `async_tasks`**，与 `messages` 分离：

```python
# 参考实现里的 schema 形态（async-deep-agents 仓库）
class AsyncSubAgentState(AgentState):
    async_subagent_jobs: Annotated[
        NotRequired[dict[str, AsyncSubAgentJob]],
        _jobs_reducer,
    ]

def _jobs_reducer(existing, update):
    merged = dict(existing or {})
    merged.update(update)   # 只覆盖 update 里出现的 key
    return merged
```

每条任务记录（官方字段）：`task_id`、`agent_name`、`thread_id`、`run_id`、`status`、`created_at`、`last_checked_at`、`last_updated_at`。
工具返回的不是字符串，而是 `Command(update={...})`，**同时**写消息和任务台账：

```python
return Command(
    update={
        "messages": [ToolMessage(msg, tool_call_id=runtime.tool_call_id)],
        "async_subagent_jobs": {job_id: job},
    }
)
```

> **可迁移的设计原则**：「**协调状态（去哪里、到哪一步）必须比对话内容更持久**」。任何长任务系统（工作流引擎、多 agent 平台、你自己的 job 队列）都应把"台账"与"聊天记录"分表存。

时间戳三件套（created / last_checked / last_updated）看着琐碎，其实是**判断"陈旧"的唯一依据**：没有 `last_updated_at`，你无法区分"还在跑"和"卡死了"。

### 2.5 三条回传路径：结果怎么"找到"已经走开的 orchestrator

这是全文最精妙的细节：**worker 完成时，orchestrator 可能处于三种状态**，处理方式必须不同，否则就会出现"把中断当普通消息"或"把结果吞掉"：

| Orchestrator 状态 | 行为 | 为什么这么设计 |
|---|---|---|
| **Busy**（自己的循环在跑） | 在**每次模型调用前**检查未完成任务，中途领走结果 | 不打断当前推理，但保证下一跳就拿到 |
| **Idle**（在等用户） | worker **唤醒**它（新起一个 run），主动汇报 | 用户不必"问一下进度"；这是 async 相对"轮询"的核心增益 |
| **Paused on approval**（等人审批） | **不动它**；审批保持挂起，结果等用户答完再送达 | 绝不能用"任务完成"覆盖"待审批状态"——否则审批被静默吃掉 |

另外两条**独立**的送达通道：
- `webhook="https://my-app.example.com/hooks/..."`：Agent Server 在每次 run 结束时回调你的应用（带 `thread_id`、`run_id`、`status`、`parent_thread_id`、`subagent_name`）；配 `notify_parent=False` 表示"**结果由我的应用来展示**，别叫醒 supervisor"。
- 通知消息形态：作为 `HumanMessage` 注入，但带 `additional_kwargs["deepagents_notification"]`（内含 `TaskEvent`：`task_id`、`agent_name`、`status`、`run_id`），**可以带图片等多模态内容**，你的 UI 可据此与"真人消息"区分渲染：

```python
for message in state["messages"]:
    if event := message.additional_kwargs.get("deepagents_notification"):
        print(event["agent_name"], event["status"])   # success / error / timeout / cancelled / waiting
```

> **可借鉴**：区分"谁说的"（人 / 系统事件 / 其他 agent）不能靠自然语言前缀，必须靠**结构化字段**。这是能否把后台事件做成可信 UI 的分水岭。

### 2.6 审批怎么落到"对的线程"

原文一句：a subagent that needs approval shows up as `waiting`，用户**在子 agent 自己的 thread 上**回答，**不打断 orchestrator**。

文档给了完整落地代码——**task_id 就是 subagent 的 thread_id**，所以审批是一条独立通道：

```python
async def answer_waiting_subagent(task_id: str, graph_id: str, answer: object) -> None:
    client = get_client()  # 另一个部署时传 url=...
    thread = await client.threads.get(task_id)
    interrupt = next(iter(thread["interrupts"].values()))[0]
    await client.runs.create(
        task_id, graph_id,
        command={"resume": {interrupt["id"]: answer}},
    )
```

**关键约束（原文明确）**：`The supervisor cannot answer or approve on the user's behalf.` —— 审批权只能属于人。如果子 agent 需要的是**编排者**的信息而不是用户的信息，应该"**把问题写进结果里**"，编排者读到后再 `update_async_task` 回复。这是一条非常重要的"职责边界"设计。

在 Managed Deep Agents + Slack 场景：审批请求**发回原 thread**，用户在 Slack 里点完即恢复子 agent；其他渠道不自动发审批请求，需要经 Studio / API 恢复。

---

## 3. 关键配置与部署拓扑（把"能跑"和"跑得好"区分开）

### 3.1 `AsyncSubAgent` 规格全字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | `str` | 必需，唯一名；supervisor 用它启动任务 |
| `description` | `str` | 必需，**supervisor 靠它决定派给谁**（写不好 = 派错单） |
| `graph_id` | `str` | 必需，Agent Protocol 服务上的图 ID（LangGraph 部署需出现在 `langgraph.json`） |
| `url` | `str` | 可选。**省略 = ASGI（进程内）**；设置 = HTTP（远程） |
| `headers` | `dict` | 可选，远程自定义鉴权 |
| `mode` | `"isolated" \| "fork"` | 启动时带不带父对话上下文；默认 `isolated` |
| `update_strategy` | `"interrupt" \| "enqueue"` | 见 §2.3 |
| `webhook` | `str` | run 结束回调到你的应用 |
| `notify_parent` | `bool` | 默认 `True`；空闲时是否唤醒 supervisor |

> 版本门槛（beta 阶段最容易踩的）：
> `update_strategy` / `webhook` / `notify_parent` 需 **`deepagents>=0.7.30`**；`waiting` 状态与 thread 打标需 **`>=0.7.26`**；Managed 侧 `async` 需 **`managed-deepagents>=0.10.0`**。

### 3.2 三种拓扑 + 传输层

| 拓扑 | 结构 | 适用 | 代价 |
|---|---|---|---|
| **Single（推荐起点）** | 全部同部署，**ASGI** 进程内调用 | 一个团队、统一资源 | 共用一个 worker 池 |
| **Split** | supervisor 一处，subagent 另一处（HTTP） | 需要独立扩容 / 不同算力 | 网络延迟、鉴权（`LANGSMITH_API_KEY`/`LANGGRAPH_API_KEY`） |
| **Hybrid** | 一部分 ASGI、一部分 HTTP | 生产常见（如 Agent Builder：通用子 agent 同部署，专用 agent 远程） | 配置复杂度 |

**ASGI 的真正意义**：不是"更快"这么简单，而是**去掉了鉴权与网络故障两个失败源**——SDK 调用变成进程内函数调用，但**子 agent 仍然是独立 thread、独立 state**。所以"隔离"来自 LangGraph 的 thread 模型，不来自进程边界。

### 3.3 `isolated` vs `fork`：启动时给不给上下文

| 模式 | 子 agent 看到什么 | 典型用法 | 代价 |
|---|---|---|---|
| `isolated`（默认） | 只有任务描述 | **上下文检疫**（context quarantine）：把搜索/读文件带来的几十条 tool call 挡在主编排者之外 | 子 agent 需要自己重新建立必要背景 |
| `fork` | 父对话的**有效快照** + 任务描述（尾部这次的 `task` 调用会被剥掉，换成"继续做"的前言） | 承接"已经诊断好的工作"：按既定语气写稿、接着修已定位的 bug | 上下文 token 翻倍；**prompt cache 需要严格对齐**（同模型/同 system prompt/同工具/同中间件，且渲染前缀一致，且取决于 provider） |

原文**没有**展开 fork；这是文档里的重要补充，但在深讲里必须点出来——因为"响应性=带上下文的响应"正是靠这条实现的。

文档给的一条 fork 陷阱值得抄走：**不要在 `wrap_model_call` 里往**继承前缀的**前面**拼字**（例如把 "You are a security auditor." 放到最前），这会让**整个前缀**无法命中缓存；追加在**尾部**的指令则通常不影响前缀复用。

### 3.4 一段可以直接跑的最小样例（Managed Deep Agents）

```python
from managed_deepagents import define_deep_agent

agent = define_deep_agent(
    name="research-assistant",
    model="openai:gpt-5.5",
    subagents=[
        {
            "name": "researcher",
            "description": "Researches a topic in the background.",   # ← 决定派单准确率
            "system_prompt": "Research the topic and report your findings.",
            "async": True,                                             # ← 唯一开关
        },
    ],
)
```

Managed 侧额外福利：**每个被服务的 agent 自带一个 `general-purpose` 的异步副本**，让模型**运行时**决定"前台等"还是"后台跑"。（`mda eval` 例外：无 Agent Server，因此**不能评估声明了 async subagents 的 agent**——这反过来提醒你：**异步 agent 的 eval 必须先有 server**。）

**Managed 侧的硬约束**：不要给 async subagent 设 `graph_id` / `url` / `headers` / `runnable`（它自己建图）；并且 async subagent 必须在 `subagents` 里**直接字面量**或变量里定义（`name` 与 `async` 值固定）——**用函数或循环生成的 async subagent 拿不到图，agent 启动会失败**（因为 MDA 是**读文件**构建，而不是运行文件）。

---

## 4. 原文没写透、但决定成败的「监督层」（结合社区批评与文档）

LangChain 原文是一篇"**发布性质的架构宣言**"，讲清了机制，但对**异步化带来的新故障**着墨很少。外部评论（Trida AI《Async Agents Move the Failure Modes》）切中要害：

> **Async removes a waiting problem. In exchange it creates a supervision problem.**

失败没有消失，**只是换了地址**——从"你眼前卡住"变成"你没看的线程里凌晨两点失败"。

### 4.1 四个换址后的故障模式

| 故障 | 同步世界的表现 | 异步世界的新形态 | 产物级对策 |
|---|---|---|---|
| **失败无去处** | 报错就在对话里，用户立刻看到 | worker 在没人打开的 thread 里 error；用户只在"该到的结果没到"时才发现 | 失败必须有**收件箱**：记录任务是什么、怎么失败、停之前动过什么（`status=error` + 摘要 + 副作用清单） |
| **等待烂掉** | 审批就在用户面前 | 后台 thread 上的审批**没有天然主人**；`waiting` 不是错误态，仪表盘全绿 | 给 `waiting` **加年纪**，超时升级到人；给每个等待项指定 owner |
| **权限超出会话** | 会话结束=权限结束 | 用户下线后 worker 继续跑，**凭的是已经结束的对话里授予的权限** | **授权生命周期绑定任务**，不绑定会话；任务结束即回收凭证 |
| **结果迟到且无凭据** | 结果即时、当场可核 | 第二天早上才回来的结果，用户上下文早已转移 | 结果必须**自带票据（receipts）**：读了什么、何时读、哪条结论依赖哪个来源 |

### 4.2 Trida 的"验收测试"：让用户看到一张台账

> **Show the user a single list of everything running in their name**：每个任务、何时开始、当前状态、在等什么、失败会怎样。

这是判断"你的异步 agent 是真产品还是黑盒"的单条标准。若唯一获取进度的方式是**问编排者并相信它的回答**，那么"后台是有礼貌的黑盒"。

> **映射到 LangChain 实现**：`list_async_tasks` 是"给模型的台账"，但在 UI 上你还需要**给用户的台账**。最省事的做法：把 §2.5 的 `deepagents_notification` 事件与 `async_tasks` 状态**流式渲染**成面板（Deep Agents 也有 `stream.subagents` 可以逐个子 agent 跟踪 `.name/.messages/.tool_calls/.output`）。

### 4.3 什么时候**不该**异步（原文未明确，但必须讲）

- **短任务**：付出协调成本（拆任务、传 ID、追状态）却没有任何收益。经验线：**<10s 的确定性任务走同步 `task`**。
- **过程即产品**：如果用户要"看它怎么想"，把推理搬下台就是产品降级。
- **不可报告进度、不可取消的工具**：无法被监督，只能被"发射"，做后台 worker 很危险。
- **强顺序依赖的链式任务**：异步只会增加"结果乱序抵达"的合并成本。

---

## 5. 工程踩坑清单（来自官方 Troubleshooting，逐条给"为什么"）

| 现象 | 根因（官方说法） | 修复 |
|---|---|---|
| **launch 后立刻疯狂 `check`** | 模型把异步"退化"成阻塞 | 中间件已注入规则；不行就在 system prompt 写死："After launching an async subagent, ALWAYS return control to the user. Never call `check_async_task` immediately after launch." |
| **报告了过时状态** | 模型引用对话历史里的旧状态 | 提示模型："**task statuses in conversation history are always stale**"；汇报前必须 `check`/`list` |
| **task_id 查找失败** | 模型截断/改写 UUID，甚至拆成 `thread::run` 两段 | 用**纯 UUID** 作为 ID（参考实现特意放弃 `thread_id::run_id` 格式，就是因为模型会拆）；提示"always show the full task_id, never truncate" |
| **launch 卡住/排队** | worker 池耗尽：**每个活跃 run 占一个槽**；1 supervisor + 3 并发 subagent = **4 槽** | `langgraph dev --n-jobs-per-worker 10`（参考实现甚至用 20） |
| **上下文压缩后"忘了"任务** | 任务信息只在 messages 里 | 用独立 `async_tasks` 通道 + `Command` 更新（§2.4） |
| **派错 agent** | `description` 写得太泛（官方反例：`"helps with stuff"`） | 写"动作 + 场景"：`"Conducts in-depth research using web search. Use for questions requiring multiple searches and synthesis."` |
| **审批被吞** | 对 `waiting` 任务做了 `update`/`cancel` | 审批走独立 thread resume；编排者不得代答 |
| **trace 对不上** | 一次请求在 LangSmith 里被拆成多条 trace | 用 **thread_id（=task_id）** 关联 supervisor trace 与子 agent trace |

**参考实现的一个额外判断（值得学）**：`completion_notifier` **故意不放进 `AsyncSubAgentMiddleware`**，理由是——中间件跑在 supervisor 侧，通知器跑在 subagent 侧；父 ID 怎么传是**部署相关**的（config / input metadata / store 三种）；**反转依赖**（子 → 父）在 split 部署里可能根本不存在网络通路；错误处理策略（重试？告警？写库？）是应用相关的。→ **框架只提供原语，策略留给应用**，这是一种很成熟的边界感。

---

## 6. 更大的图景：从"子 agent 异步"到"工具全面异步"

原文最后给了一个**超出本文范围的判断**：

> We expect this pattern to generalize beyond subagents to tools across the board. OpenAI recently added support for **async tool calling**.

对照 OpenAI 的 *Async tool calling* 文档，可以看到两条路线在**同一件事上的不同抽象层级**：

| 维度 | LangChain async subagent | OpenAI async tool calling |
|---|---|---|
| 异步对象 | 一个**有状态 agent**（独立 thread + 自己的循环） | 一个**工具调用**（`function_call` / `custom_tool_call`） |
| 回传方式 | 通知消息 / webhook / 轮询 | 在**后续 Responses 请求**里用原 `call_id` 交回 `function_call_output` |
| 中途改指令 | `update_async_task`（interrupt/enqueue） | 无内置；需自行设计（可借 wait 工具 + 句柄） |
| 取消 | `cancel_async_task` → `runs.cancel()` | 无内置（应用侧 job 管理层自己管） |
| 状态 | 服务端 thread | 你的应用 + 响应链 |
| 阻塞语义 | 模型可继续与用户交互 | **同一次响应里模型继续干活**（"边查天气边说打包清单"） |
| 关键原语 | task_id | `task_handle` 注册表 + 可选 `wait_for_tasks` / `request_user_input_async` |

一个很有启发的细节：OpenAI 的 wait 工具**不是内置工具**，而是要你**自己定义**（omit `async` 或设 `false`），并且**只返回状态、不返回结果**——结果仍必须落在**原始 call_id** 上，且要求"**先交付结果、再交付 wait 状态**"。这背后是同一个原则：

> **结果必须回到它被发起的位置，而"等待"只是一次询问，不是一次交付。**

再放大一层：这不只是 API 问题，而是**传输层不匹配**问题——聊天产品长期建立在 "HTTP 请求 + SSE 流" 上，而一个**比调用者活得久、会主动推送、可能跨设备、甚至服务多个用户**的 agent，与这种传输假设天然冲突。这也解释了为什么 Managed Deep Agents 要把结果**发回 Slack thread**、要做 `webhook`、要做"唤醒 idle supervisor"——都是在给"长时间运行"补传输与生命周期语义。

---

## 7. 落地路线（如果你明天就要在自己的产品里做这件事）

### 7.1 五个决策，按顺序做

1. **先定"什么是前台"**：哪个 agent 直接对人说话？它的上下文预算最宝贵——原则上**只放编排所需的信息**，领域细节全部外派。
2. **定 worker 边界**：按"可独立取消 + 可独立交付"切分，而不是按"技术模块"切分。每个 worker 应该能回答"我做完的判据是什么"。
3. **定策略矩阵**（写进 system prompt 或代码）：

   | 用户意图形态 | 策略 |
   |---|---|
   | 纠正前提（"换城市/换库"） | `interrupt` |
   | 追加范围（"顺带跑测试"） | `enqueue` |
   | 取消（"不要了"） | `cancel_async_task` |
   | 只是问进度 | `check`（**禁止循环轮询**） |

4. **定回传与审批通道**：busy / idle / paused 三态行为要显式实现（LangChain 已内置，自研时必须自己写）；审批**必须绑人**。
5. **定台账与可观测性**：`async_tasks` 作为权威状态；UI 有一张用户可读的清单；LangSmith 里用 thread_id 串联。

### 7.2 一页实施检查表（可直接当 PR 评审项）

- [ ] 任务台账与消息历史**分离存储**，压缩后仍可用
- [ ] 所有任务记录含 `created_at / last_checked_at / last_updated_at`
- [ ] `status` 包含 `waiting`，且 `waiting` 有**超时升级**策略
- [ ] 失败有**去处**（告警 / 收件箱 / 工单），不只是 `status=error`
- [ ] 后台任务的**凭证生命周期 ≤ 任务生命周期**
- [ ] worker 池容量 ≥ 1 + 预期最大并发（并压测排队行为）
- [ ] 汇总结果**自带来源票据**（读了什么、何时读）
- [ ] 通知消息带**结构化字段**（可用 `deepagents_notification` 或自建），UI 与人消息区分
- [ ] 子 agent `description` 具体到"动作+触发场景"
- [ ] 有"别 launch 后立刻轮询"的提示
- [ ] 有 thread 清理/归档策略（thread 不会自己消失）
- [ ] eval 环境具备 Agent Server（`mda eval` 无法评估 async agent）

### 7.3 参考实现动线（想动手就照这个走）

```bash
git clone https://github.com/langchain-ai/async-deep-agents.git
cd async-deep-agents
make bootstrap
cp .env.example .env      # 填 key
make dev-py               # 或 make dev-ts
```

仓库结构就是一张架构图：`supervisor.py`（`create_deep_agent` + `AsyncSubAgentMiddleware`）、`researcher.py` / `coder.py`（普通 `create_agent`，两处差别只在是否被"异步调用"）、`middleware/completion_notifier.py`（BYO 通知器，默认注释掉）。**这个仓库最有价值的不是代码量，而是"同一份图既可以是同步 subagent 也可以是异步 subagent"这件事本身**——异步是**调用方式**，不是另一种 agent。

---

## 8. 我的锐评：这篇文的分量与盲区

**分量**
- 把"多 agent"从**一次性 fan-out**（`workflow` 式：全发全付、等 barrier）推进到**长驻、可干预、可取消**的形态——这是 agent 从"任务"走向"同事/系统"的关键一步。
- 五个工具的设计**教科书级**：提交 / 查询 / 修改 / 取消 / 列举，恰好是分布式任务 API 的最小完备集；再配合"状态外置 + 三态回传 + 审批独立线程"，几乎没有多余概念。
- `async_tasks` 独立通道这一笔，体现了对 **context compaction** 这个 agent 特有问题的真实理解——很多框架在这一点上栽跟头。

**盲区（原文确实是发布稿口径）**
- 只讲**能干什么**，几乎不讲**会怎么坏**：失败去处、等待腐烂、权限越期、结果迟到，全靠社区补完。
- **成本**只在隐含处体现（interrupt 重启、fork 上下文翻倍、轮询请求量），没有量化 guidance。发布稿里 5 分钟阅读的体量，也确实装不下。
- **多 agent × 异步 × 审批**的组合爆炸（如"父在等审批，子在等输入，用户在睡觉"）没有状态图级的说明，只给了单点规则。
- **"数量即能力"的乐观**：`the amount of work the agent can take on then grows with the number of background workers`——这在算力足够时成立，但 coordinator 的**注意力**（上下文、决策质量）并不会随 worker 数线性扩张，管理者本身会成为瓶颈（这正是它自己开篇的"幕僚长"比喻里没说破的那半句）。

**一句话总结**：这篇文章真正交付的不是"更快的 agent"，而是**一套把 agent 变成"可被管理的组织"的最小契约**——谁对人负责、谁干活、活到哪一步、谁有权叫停、结果怎么回到该到的地方。异步只是形式，**监督才是内容**。

---

## 9. 延伸阅读

| 类型 | 材料 | 为什么读 |
|---|---|---|
| 官方文档（必读） | [Async subagents（OSS）](https://docs.langchain.com/oss/python/deepagents/async-subagents) | 状态机、配置字段、版本门槛、troubleshooting 全文 |
| 官方文档（托管） | [Managed Deep Agents · Subagents](https://docs.langchain.com/langsmith/python/managed-deep-agents-subagents) | `async: True`、busy/idle/paused 表、Slack 审批、sandbox 共享 |
| 参考实现 | [langchain-ai/async-deep-agents](https://github.com/langchain-ai/async-deep-agents) | 任务台账 schema、`Command` 更新、completion notifier、部署拓扑 |
| 对照组 | [OpenAI Async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling) | 工具级异步；`task_handle` + `wait_for_tasks` 设计 |
| 批判视角 | [Async Agents Move the Failure Modes（Trida AI）](https://dev.to/tridaai/async-agents-move-the-failure-modes-23hg) | 故障迁移、台账验收测试、不该异步的场景 |
| 上手实践 | [Your Agent Can Talk While It Works（Level Up）](https://levelup.gitconnected.com/your-agent-can-talk-while-it-works-testing-langchains-async-subagents-474ab1c85882) | 把"波特兰→西雅图"中途改单走一遍 |
| 相邻里程碑 | [Managed Deep Agents v0.10](https://www.langchain.com/blog/managed-deep-agents-browser-use-and-asynchronous-subagents)｜[Subagents 文档](https://docs.langchain.com/oss/python/deepagents/subagents) | 首次上线异步（10-29）、同步/fork/动态 subagent 全貌 |

> 易混淆：HN 上另有 **"All your agents are going async"**（`/dev/knill`），讲的是"**传输层不匹配**"（HTTP+SSE 装不下长驻 agent），**不是 LangChain 这篇**，但可以对照读——一个讲"协议"，一个讲"调度"。
