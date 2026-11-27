# 02｜Claude 的高级工具调用能力发布

> **来源**：Anthropic ｜ **发布**：2025-11-24 ｜ **作者**：Bin Wu（致谢名单见文末）
> **原文**：https://www.anthropic.com/research/advanced-tool-use
> **原文存档**：[原文/02-advanced-tool-use.md](原文/02-advanced-tool-use.md)
> **翻译方式**：全文翻译（略去网页上的"Copy"按钮文字；原文开头的重复小节"工具搜索工具"照原文保留，已加译者注。代码块中的注释原样保留）
> **挂接知识点**：A1-04、A2-05、A6-05

## 为什么今天读这篇

因为它把"工具多了会撑爆上下文"这件定性抱怨，换成了三组可核对的数字与三个可开关的机制：五台 MCP 服务器的工具定义在对话开始前就吃掉约 55K token，Anthropic 内部见过 134K；而按需发现能把起始消耗压到约 8.7K、保留 95% 的窗口。更重要的是它区分了三种不同的瓶颈——定义占位（工具搜索工具）、中间结果污染（程序化工具调用）、参数用错（工具调用示例）——并且明确说这三者的 ROI 条件不同，不该无脑全开。对做架构决策的人来说，这篇的价值在于它给出了"在什么条件下这个机制才划算"的门槛，例如工具定义超过 10K token、或工具数达到 10 个以上。

## 三句话摘要

1. 工具搜索工具（Tool Search Tool）把工具定义从"预加载"改成"按需发现"：只把约 500 token 的搜索工具放进初始上下文，其余用 `defer_loading: true` 延后，实测把起始消耗从约 77K 压到约 8.7K token（降 85%），同时 Opus 4 在 MCP 评测上的准确率从 49% 升到 74%、Opus 4.5 从 79.5% 升到 88.1%。
2. 程序化工具调用（Programmatic Tool Calling）让 Claude 写 Python 代码来编排工具，工具结果在代码执行环境里被处理而不进入模型上下文——复杂研究任务的平均 token 从 43,588 降到 27,297（降 37%），并靠消除 19 次以上的推理往返来降延迟，知识检索准确率从 25.6% 升到 28.5%、GIA 从 46.5% 升到 51.2%。
3. 工具调用示例（Tool Use Examples）补上了 JSON Schema 表达不了的东西——格式约定、ID 规范、可选参数的组合规律；三个示例就让复杂参数处理的准确率从 72% 升到 90%，代价只是工具定义多花一点 token。

## 译文

*（原文署名：Bin Wu 撰写；Adam Jones、Artur Renault、Henry Tay、Jake Noble、Noah Picard、Sam Jiang 以及 Claude 开发者平台团队有贡献；本工作建立在 Chris Gorgolewski、Daniel Jiang、Jeremy Fox、Mike Lambert 的基础研究之上，并受到 Joel Pobar 的 LLMVM、Cloudflare 的 Code Mode 以及 Code Execution as MCP 的启发。）*

### 工具搜索工具

> **译者注**：原文此处先出现一个"工具搜索工具"标题作为开篇导语段落的小标题，正文后文又出现同名正式小节。为保留原文结构，下面照原文译出。

AI agent 的未来，是模型能在成百上千个工具之间无缝工作。一个 IDE 助手，集成 git 操作、文件操作、包管理器、测试框架与部署流水线；一个运维协调者，同时连接 Slack、GitHub、Google Drive、Jira、公司数据库以及几十个 MCP 服务器。

要[构建有效的 agent](https://www.anthropic.com/research/building-effective-agents)，它们必须能在不被预先塞入每一条工具定义的前提下，使用无限大的工具库。我们那篇关于[在 MCP 中使用代码执行](https://www.anthropic.com/engineering/code-execution-with-mcp)的博客讨论过：工具结果与工具定义有时会在 agent 读到请求之前就消耗掉 50,000 以上 token。agent 应当按需发现并加载工具，只保留与当前任务相关的那部分。

agent 还需要从代码里调用工具的能力。使用自然语言做工具调用时，每次调用都需要一次完整的推理过程，而中间结果无论有没有用都会堆在上下文里。代码天然适合承载编排逻辑，比如循环、条件与数据变换。agent 需要能根据手头任务，在代码执行与推理之间灵活选择。

agent 还需要从示例中学习正确的工具用法，而不只是从模式定义里学。JSON 模式定义了什么是结构上合法的，但表达不了使用习惯：什么时候该填可选参数、哪些参数组合才合理、你的 API 期待什么约定。

今天我们发布三项让上述能力成为可能的功能：

- **工具搜索工具（Tool Search Tool）**，让 Claude 通过搜索工具访问成千上万个工具，而不消耗它的上下文窗口；
- **程序化工具调用（Programmatic Tool Calling）**，让 Claude 在代码执行环境中调用工具，减少对模型上下文窗口的占用；
- **工具调用示例（Tool Use Examples）**，提供一个通用标准，用来示范如何有效地使用某个工具。

在内部测试中，我们发现这些功能帮助我们构建了用常规工具调用模式不可能做出来的东西。例如，**[Claude for Excel](https://www.claude.com/claude-for-excel)** 用程序化工具调用来读写有数千行的电子表格，而不会把模型的上下文窗口撑爆。

基于我们的经验，我们相信这些功能为你用 Claude 能构建的东西打开了新的可能。

### 工具搜索工具

#### 挑战

MCP 工具定义提供了重要的上下文，但随着接入的服务器变多，这些 token 会累积起来。考虑一个五服务器的配置：

- GitHub：35 个工具（约 26K token）
- Slack：11 个工具（约 21K token）
- Sentry：5 个工具（约 3K token）
- Grafana：5 个工具（约 3K token）
- Splunk：2 个工具（约 2K token）

这就是 58 个工具，在对话还没开始前就消耗约 55K token。再加更多服务器，比如 Jira（仅它就约占 17K token），你很快就接近 100K 以上的 token 开销。在 Anthropic，我们见过工具定义在优化前消耗 134K token。

但 token 成本并不是唯一的问题。最常见的失败是选错工具和用错参数，尤其是当工具名字很像的时候，比如 `notification-send-user` 和 `notification-send-channel`。

#### 我们的方案

工具搜索工具不预先加载全部工具定义，而是按需发现工具。Claude 只会看到当前任务真正需要的那几个工具。

〔图〕与传统方案相比，工具搜索工具保留了 191,300 token 的上下文，而 Claude 传统方案只有 122,800 token。

传统方案：

- 所有工具定义预先加载（50 个以上 MCP 工具约 72K token）
- 对话历史与系统提示争夺剩余空间
- 总上下文消耗：任何工作开始之前就约 77K token

使用工具搜索工具：

- 预先只加载工具搜索工具本身（约 500 token）
- 工具按需发现（3–5 个相关工具，约 3K token）
- 总上下文消耗：约 8.7K token，保留 95% 的上下文窗口

这意味着在保持完整工具库可用的情况下，token 用量降低了 85%。内部测试显示，面对大型工具库时，MCP 评测上的准确率有显著提升。启用工具搜索工具后，Opus 4 从 49% 提升到 74%，Opus 4.5 从 79.5% 提升到 88.1%。

#### 工具搜索工具是怎么工作的

工具搜索工具让 Claude 动态发现工具，而不是预先加载所有定义。你把全部工具定义都交给 API，但用 `defer_loading: true` 标记那些可以按需发现的工具。被延后的工具初始不会加载进 Claude 的上下文。Claude 只会看到工具搜索工具本身，以及所有 `defer_loading: false` 的工具（也就是你最核心、最常用的那几个）。

当 Claude 需要某项具体能力时，它会搜索相关工具。工具搜索工具返回匹配工具的引用，这些引用随后在 Claude 的上下文中展开为完整定义。

例如，如果 Claude 需要操作 GitHub，它会搜索 "github"，那么只有 `github.createPullRequest` 和 `github.listIssues` 会被加载——而不是你在 Slack、Jira、Google Drive 里的其他 50 多个工具。

这样，Claude 既能访问你的完整工具库，又只为真正用到的工具支付 token 成本。

**关于提示缓存的说明**：工具搜索工具不会破坏提示缓存，因为被延后的工具被完全排除在初始提示之外。它们只有在 Claude 搜索之后才进入上下文，所以你的系统提示与核心工具定义仍然可缓存。

**实现方式：**

```
{
  "tools": [
    // Include a tool search tool (regex, BM25, or custom)
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},

    // Mark tools for on-demand discovery
    {
      "name": "github.createPullRequest",
      "description": "Create a pull request",
      "input_schema": {...},
      "defer_loading": true
    }
    // ... hundreds more deferred tools with defer_loading: true
  ]
}
```

对 MCP 服务器，你可以延后整个服务器的加载，同时保留某些高频工具为已加载：

```
{
  "type": "mcp_toolset",
  "mcp_server_name": "google-drive",
  "default_config": {"defer_loading": true}, # defer loading the entire server
  "configs": {
    "search_files": {
"defer_loading": false
    }  // Keep most used tool loaded
  }
}
```

Claude 开发者平台开箱提供了基于正则和基于 BM25 的搜索工具，但你也可以实现基于嵌入或其他策略的自定义搜索工具。

#### 什么时候该用工具搜索工具

和任何架构决策一样，启用工具搜索工具是有取舍的。这个功能在调用工具前增加了一步搜索，所以只有当节省的上下文与准确率提升超过额外延迟时，它才有最好的 ROI。

**适用于：**

- 工具定义消耗超过 10K token
- 正在遭遇工具选择准确率问题
- 构建接入多个服务器的 MCP 系统
- 可用工具在 10 个以上

**收益较小的情况：**

- 工具库很小（少于 10 个工具）
- 所有工具在每个会话里都频繁使用
- 工具定义本身很紧凑

### 程序化工具调用

#### 挑战

随着工作流变复杂，传统工具调用带来两个根本问题：

- **中间结果造成上下文污染**：当 Claude 分析一个 10MB 的日志文件找错误模式时，整个文件都会进入它的上下文窗口，尽管 Claude 只需要错误频率的汇总。当跨多张表拉取客户数据时，每条记录都会累积进上下文，无论相关与否。这些中间结果消耗了巨大的 token 预算，甚至可能把重要信息完全挤出上下文窗口。
- **推理开销与手工综合**：每次工具调用都需要一次完整的模型推理。收到结果后，Claude 必须"用眼睛"扫一遍数据来提取相关信息、推理各片段如何拼接、再决定下一步做什么——全都要通过自然语言处理完成。一个五步的工具工作流意味着五次推理过程，外加 Claude 逐个解析结果、比较数值、综合结论。这既慢又容易出错。

#### 我们的方案

程序化工具调用让 Claude 通过代码来编排工具，而不是通过一次次 API 往返。Claude 不再一次请求一个工具、让每个结果都回到自己的上下文，而是写一段代码来调用多个工具、处理它们的输出，并控制到底哪些信息进入它的上下文窗口。

Claude 擅长写代码；让它用 Python 而不是自然语言工具调用来表达编排逻辑，你就能得到更可靠、更精确的控制流。循环、条件、数据变换与错误处理都显式写在代码里，而不是隐含在 Claude 的推理中。

##### 例子：预算合规检查

考虑一个常见的业务任务："哪些团队成员超出了第三季度的差旅预算？"

你有三个工具可用：

- `get_team_members(department)` —— 返回团队成员列表，含 ID 与职级
- `get_expenses(user_id, quarter)` —— 返回某用户的费用明细行
- `get_budget_by_level(level)` —— 返回某个员工职级的预算上限

**传统方案**：

- 拉取团队成员 → 20 人
- 对每个人拉取其 Q3 费用 → 20 次工具调用，每次返回 50–100 条明细（机票、酒店、餐饮、收据）
- 按员工职级拉取预算上限
- 所有这些都进入 Claude 的上下文：2,000 条以上费用明细（50 KB 以上）
- Claude 手工加总每个人的费用、查找其预算、把费用与预算上限比较
- 更多与模型之间的往返，显著的上下文消耗

**使用程序化工具调用**：

每个工具结果不再回到 Claude；Claude 写一段 Python 脚本编排整个工作流。脚本在代码执行工具（一个沙箱环境）中运行，当需要你这些工具的结果时会暂停。当你通过 API 返回工具结果时，它们由脚本处理，而不是被模型消费。脚本继续执行，Claude 只看到最终输出。

〔图〕程序化工具调用让 Claude 通过代码而非一次次 API 往返来编排工具，从而实现工具的并行执行。

下面是 Claude 为预算合规任务写出的编排代码：

```
team = await get_team_members("engineering")

# Fetch budgets for each unique level
levels = list(set(m["level"] for m in team))
budget_results = await asyncio.gather(*[
    get_budget_by_level(level) for level in levels
])

# Create a lookup dictionary: {"junior": budget1, "senior": budget2, ...}
budgets = {level: budget for level, budget in zip(levels, budget_results)}

# Fetch all expenses in parallel
expenses = await asyncio.gather(*[
    get_expenses(m["id"], "Q3") for m in team
])

# Find employees who exceeded their travel budget
exceeded = []
for member, exp in zip(team, expenses):
    budget = budgets[member["level"]]
    total = sum(e["amount"] for e in exp)
    if total > budget["travel_limit"]:
        exceeded.append({
            "name": member["name"],
            "spent": total,
            "limit": budget["travel_limit"]
        })

print(json.dumps(exceeded))
```

Claude 的上下文只收到最终结果：那两三个超预算的人。2,000 多条明细、中间加总、预算查找都不影响 Claude 的上下文，把消耗从 200KB 的原始费用数据压到仅 1KB 的结果。

效率收益是实质性的：

- **节省 token**：把中间结果挡在 Claude 的上下文之外，PTC 大幅降低 token 消耗。在复杂研究任务上，平均用量从 43,588 token 降到 27,297 token，降幅 37%。
- **降低延迟**：每次 API 往返都需要模型推理（数百毫秒到数秒）。当 Claude 在一个代码块里编排 20 次以上工具调用时，你省掉了 19 次以上的推理过程。API 处理工具执行，无需每次都回到模型。
- **提升准确率**：通过写出显式的编排逻辑，Claude 比在自然语言里同时应付多个工具结果时犯的错更少。内部知识检索从 25.6% 提升到 28.5%；[GIA 基准](https://arxiv.org/abs/2311.12983)从 46.5% 提升到 51.2%。

生产工作流涉及脏数据、条件逻辑，以及需要扩展的运算。程序化工具调用让 Claude 以程序化方式处理这种复杂度，同时把注意力保持在可执行的结果上，而不是原始数据的处理过程。

#### 程序化工具调用是怎么工作的

##### 1. 把工具标记为可从代码调用

把 `code_execution` 加入工具列表，并用 `allowed_callers` 让工具选择加入程序化执行：

```
{
  "tools": [
    {
      "type": "code_execution_20250825",
      "name": "code_execution"
    },
    {
      "name": "get_team_members",
      "description": "Get all members of a department...",
      "input_schema": {...},
      "allowed_callers": ["code_execution_20250825"] # opt-in to programmatic tool calling
    },
    {
      "name": "get_expenses",
  	...
    },
    {
      "name": "get_budget_by_level",
	...
    }
  ]
}
```

API 会把这些工具定义转换成 Claude 可以调用的 Python 函数。

##### 2. Claude 写出编排代码

Claude 不再一次请求一个工具，而是生成 Python 代码：

```
{
  "type": "server_tool_use",
  "id": "srvtoolu_abc",
  "name": "code_execution",
  "input": {
    "code": "team = get_team_members('engineering')\n..." # the code example above
  }
}
```

##### 3. 工具执行时不经过 Claude 的上下文

当代码调用 `get_expenses()` 时，你会收到一个带 `caller` 字段的工具请求：

```
{
  "type": "tool_use",
  "id": "toolu_xyz",
  "name": "get_expenses",
  "input": {"user_id": "emp_123", "quarter": "Q3"},
  "caller": {
    "type": "code_execution_20250825",
    "tool_id": "srvtoolu_abc"
  }
}
```

你提供结果，该结果在代码执行环境中被处理，而不是进入 Claude 的上下文。这个"请求—响应"循环会对代码中的每次工具调用重复。

##### 4. 只有最终输出进入上下文

代码运行结束后，只有代码的结果会返回给 Claude：

```
{
  "type": "code_execution_tool_result",
  "tool_use_id": "srvtoolu_abc",
  "content": {
    "stdout": "[{\"name\": \"Alice\", \"spent\": 12500, \"limit\": 10000}...]"
  }
}
```

这就是 Claude 看到的全部内容，而不是沿途处理过的 2,000 多条费用明细。

#### 什么时候该用程序化工具调用

程序化工具调用会给你的工作流增加一个代码执行步骤。只有当节省的 token、改善的延迟与准确率收益足够大时，这份额外开销才划算。

**收益最大的是：**

- 处理大数据集、而你只需要聚合值或汇总
- 运行含三步以上相互依赖工具调用的多步工作流
- 在 Claude 看到之前对工具结果做过滤、排序或变换
- 处理那些"中间数据不应该影响 Claude 推理"的任务
- 对许多条目做并行操作（例如检查 50 个端点）

**收益较小的情况：**

- 只做简单的单工具调用
- 任务本身要求 Claude 看到并推理所有中间结果
- 运行响应体积很小的快速查询

### 工具调用示例

#### 挑战

JSON Schema 擅长定义结构——类型、必填字段、允许的枚举——但它表达不了使用习惯：什么时候该填可选参数、哪些参数组合才合理、你的 API 期待什么约定。

考虑一个工单 API：

```
{
  "name": "create_ticket",
  "input_schema": {
    "properties": {
      "title": {"type": "string"},
      "priority": {"enum": ["low", "medium", "high", "critical"]},
      "labels": {"type": "array", "items": {"type": "string"} },
      "reporter": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "name": {"type": "string"},
          "contact": {
            "type": "object",
            "properties": {
              "email": {"type": "string"},
              "phone": {"type": "string"}
            }
          }
        }
      },
      "due_date": {"type": "string"},
      "escalation": {
        "type": "object",
        "properties": {
          "level": {"type": "integer"},
          "notify_manager": {"type": "boolean"},
          "sla_hours": {"type": "integer"}
        }
      }
    },
    "required": ["title"]
  }
}
```

这个模式定义了什么是合法的，但留下了关键问题没有回答：

- **格式歧义**：`due_date` 应该用 "2024-11-06"、"Nov 6, 2024"，还是 "2024-11-06T00:00:00Z"？
- **ID 规范**：`reporter.id` 是 UUID、"USR-12345"，还是就是 "12345"？
- **嵌套结构的用法**：Claude 什么时候应该填 `reporter.contact`？
- **参数相关性**：`escalation.level` 和 `escalation.sla_hours` 与优先级是什么关系？

这些歧义会导致工具调用格式错误、参数用法不一致。

#### 我们的方案

工具调用示例让你直接在工具定义里提供示例调用。不再只依赖模式，而是向 Claude 展示具体的用法：

```
{
    "name": "create_ticket",
    "input_schema": { /* same schema as above */ },
    "input_examples": [
      {
        "title": "Login page returns 500 error",
        "priority": "critical",
        "labels": ["bug", "authentication", "production"],
        "reporter": {
          "id": "USR-12345",
          "name": "Jane Smith",
          "contact": {
            "email": "jane@acme.com",
            "phone": "+1-555-0123"
          }
        },
        "due_date": "2024-11-06",
        "escalation": {
          "level": 2,
          "notify_manager": true,
          "sla_hours": 4
        }
      },
      {
        "title": "Add dark mode support",
        "labels": ["feature-request", "ui"],
        "reporter": {
          "id": "USR-67890",
          "name": "Alex Chen"
        }
      },
      {
        "title": "Update API documentation"
      }
    ]
  }
```

从这三个示例里，Claude 学到了：

- **格式约定**：日期用 YYYY-MM-DD，用户 ID 遵循 USR-XXXXX，标签用 kebab-case
- **嵌套结构模式**：如何构造 reporter 对象及其嵌套的 contact 对象
- **可选参数的相关性**：严重 bug 带完整联系信息 + 带紧 SLA 的升级；功能请求带 reporter 但没有 contact/escalation；内部任务只有 title

在我们自己的内部测试中，工具调用示例把复杂参数处理的准确率从 72% 提升到 90%。

#### 什么时候该用工具调用示例

工具调用示例会给你的工具定义增加 token，所以它们在准确率提升超过额外成本时才最有价值。

**收益最大的是：**

- 复杂嵌套结构，且"合法 JSON"并不等于"用法正确"
- 可选参数很多、且参数是否出现的规律很重要的工具
- 带有领域特定约定、模式里表达不出来的 API
- 相似工具之间需要用示例澄清该用哪个（例如 `create_ticket` 与 `create_incident`）

**收益较小的情况：**

- 简单的单参数工具，用法一目了然
- Claude 已经理解的标准格式，如 URL 或邮箱
- 校验问题更适合交给 JSON Schema 约束处理

### 最佳实践

构建会采取真实世界动作的 agent，意味着要同时处理规模、复杂度与精确性。这三个功能协同解决工具调用工作流中不同的瓶颈。下面讲怎么有效组合它们。

#### 有策略地叠加功能

不是每个 agent 在给定任务上都需要用到全部三个功能。从你最大的瓶颈开始：

- 工具定义造成的上下文膨胀 → 工具搜索工具
- 中间结果过大污染上下文 → 程序化工具调用
- 参数错误与格式错误的调用 → 工具调用示例

这种聚焦做法让你针对限制 agent 表现的那个具体约束，而不是一开始就增加复杂度。

然后按需叠加其他功能。它们是互补的：工具搜索工具确保找到正确的工具，程序化工具调用确保高效执行，工具调用示例确保正确调用。

#### 配置工具搜索工具以获得更好的发现效果

工具搜索是拿名字和描述做匹配的，所以清晰、描述性的定义能提升发现准确率。

```
// Good
{
    "name": "search_customer_orders",
    "description": "Search for customer orders by date range, status, or total amount. Returns order details including items, shipping, and payment info."
}

// Bad
{
    "name": "query_db_orders",
    "description": "Execute order query"
}
```

再加系统提示引导，让 Claude 知道有什么可用：

```
You have access to tools for Slack messaging, Google Drive file management,
Jira ticket tracking, and GitHub repository operations. Use the tool search
to find specific capabilities.
```

把你最常用的三到五个工具保持常驻加载，其余延后。这样既保证了常见操作的即时可用，又让其他一切走按需发现。

#### 配置程序化工具调用以确保正确执行

由于 Claude 要写代码来解析工具输出，所以要清楚记录返回格式。这有助于 Claude 写出正确的解析逻辑：

```
{
    "name": "get_orders",
    "description": "Retrieve orders for a customer.
Returns:
    List of order objects, each containing:
    - id (str): Order identifier
    - total (float): Order total in USD
    - status (str): One of 'pending', 'shipped', 'delivered'
    - items (list): Array of {sku, quantity, price}
    - created_at (str): ISO 8601 timestamp"
}
```

以下这些工具适合选择加入程序化编排：

- 可以并行运行的工具（相互独立的操作）
- 可以安全重试的操作（幂等）

#### 配置工具调用示例以确保参数准确

为行为清晰度精心设计示例：

- 使用真实数据（真实的城市名、看似合理的价格，而不是 "string" 或 "value"）
- 展现多样性：最小指定、部分指定、完整指定三种模式
- 保持简洁：每个工具 1–5 个示例
- 聚焦歧义（只在"正确用法无法从模式看出"的地方加示例）

### 开始使用

这些功能目前处于 beta。要启用它们，加上 beta 头并包含你需要的工具：

```
client.beta.messages.create(
    betas=["advanced-tool-use-2025-11-20"],
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=[
        {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
        {"type": "code_execution_20250825", "name": "code_execution"},
        # Your tools with defer_loading, allowed_callers, and input_examples
    ]
)
```

详细的 API 文档与 SDK 示例见：

- 工具搜索工具的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)与 [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/tool_search_with_embeddings.ipynb)
- 程序化工具调用的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)与 [cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/programmatic_tool_calling_ptc.ipynb)
- 工具调用示例的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use#providing-tool-use-examples)

这些功能把工具调用从简单的函数调用推进到智能编排。当 agent 处理跨几十个工具、涉及大数据集的更复杂工作流时，动态发现、高效执行与可靠调用会成为基础能力。

我们很期待看到你构建的东西。

### 作者与致谢

#### 致谢

由 Bin Wu 撰写，Adam Jones、Artur Renault、Henry Tay、Jake Noble、Noah Picard、Sam Jiang 以及 Claude 开发者平台团队有贡献。本工作建立在 Chris Gorgolewski、Daniel Jiang、Jeremy Fox 与 Mike Lambert 的基础研究之上。我们也从整个 AI 生态中汲取了灵感，包括 [Joel Pobar 的 LLMVM](https://github.com/9600dev/llmvm)、[Cloudflare 的 Code Mode](https://blog.cloudflare.com/code-mode/) 以及 [Code Execution as MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)。特别感谢 Andy Schumeister、Hamish Kerr、Keir Bradwell、Matt Bleifer 与 Molly Vorwerck 的支持。

## 与路线图的挂接

- **A1-04（结构化输出与工具调用协议）**：本文给出"schema 是契约"的三个补丁。第一，契约的表达能力有边界——JSON Schema 只能定结构，定不了约定，所以需要 `input_examples` 这层"用示例表达的契约"，实测把复杂参数处理从 72% 提到 90%；第二，契约的执行位置可以改变——`allowed_callers` + `code_execution` 把调用从"模型逐个预言"改成"模型写代码、代码调工具"，模型不再逐次消费结果；第三，契约的加载策略本身是协议设计的一部分——`defer_loading` 与 `mcp_toolset` 的 `default_config`/`configs` 让"哪些定义进入初始提示"变成可配置项，而且因为被延后的定义完全不在初始提示里，提示缓存不会被破坏。
- **A2-05（工具接口设计）**：这篇是 01 那篇的工程化续集，把"工具接口"从命名/粒度推进到**发现**与**执行**两个新维度。关键可操作结论：工具描述要写成"能被检索命中"的形式（`search_customer_orders` 胜过 `query_db_orders`），最常用的 3–5 个工具常驻、其余延后；让工具进入程序化调用名单的两个条件是"可并行"与"幂等"；返回格式必须在描述里写清字段与类型，因为解析逻辑现在由模型写的代码承担。它同时给了一组明确的反向条件（工具库小于 10 个、所有工具每会话都用、定义本身紧凑时不划算），这比"建议启用"更有用。
- **A6-05（延迟工程）**：文中把延迟拆成了两个可分别优化的来源。工具搜索工具**增加**一次搜索步骤（因此只在上下文收益与准确率收益超过这份延迟时才划算）；程序化工具调用**消除**往返——20 次以上工具调用被收进一个代码块，省掉 19 次以上推理过程，每次往返原本是数百毫秒到数秒。这条"用代码块把 N 次串行往返压成 1 次"的手法可以直接搬到任何多步工具工作流上；但要注意它牺牲的是"模型看见中间结果"的能力，所以文中把它列为"中间数据不应该影响推理"时的适用条件。

## 三个自测问题

1. 工具搜索工具把起始上下文从约 77K 压到约 8.7K token，但内部评测的准确率同时从 49% 升到 74%（Opus 4）。请解释：省 token 为什么会导致准确率**上升**，而不是仅持平？这个机制在什么情况下会反过来拉低准确率？
2. 程序化工具调用的收益来自"中间结果不进上下文"。请说明它与"把工具返回值截断到 25,000 token"这两种做法在语义上的区别：一个 10MB 日志文件在两种方案下分别会发生什么，各自丢失了什么能力？
3. 文中说三个功能"互补"，但也明确给了各自"收益较小"的条件。如果你只能启用一个，而你的实际情况是"32 个工具、定义共约 12K token、参数经常填错"，你会如何排序？请给出判断依据与验证方案。
