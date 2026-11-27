# 03｜用 MCP 加代码执行，做更高效的智能体

> **来源**：Anthropic ｜ **发布**：2025-11-04 ｜ **作者**：Adam Jones、Conor Kelly
> **原文**：https://www.anthropic.com/research/code-execution-with-mcp
> **原文存档**：[原文/03-code-exec-mcp.md](原文/03-code-exec-mcp.md)
> **翻译方式**：全文翻译
> **挂接知识点**：A4-03、A1-02

## 为什么今天读这篇

因为它把"MCP 工具太多会拖垮智能体"这件事量化了，并给出了一个不需要换模型的解法：把 MCP 服务器呈现成文件系统上的代码 API，让模型写代码去调，而不是把上千条工具定义一次性灌进上下文。文中那条最硬的数字——同一任务从 150,000 token 降到 2,000 token，省 98.7%——正是 A1-02 里"上下文是 n² 注意力预算"最直接的工程后果。它同时给出四个衍生收益：结果在沙箱里先过滤再回模型、PII 在到达模型前被令牌化、状态可以落盘、写好的代码可以存成技能复用。最后一个收益把 A4-03 的沙箱和 01 篇的技能机制接在了一起——技能不必是"指令文档"，也可以是"能跑的脚本"。

## 三句话摘要

1. MCP 规模化后有两个吃 token 的地方：工具定义一次性占满上下文（连上千个工具时，模型读完请求前要先处理数十万 token），以及每一步的中间结果都要穿过模型（两小时的会议转写会在上下文中流两遍，约多出 50,000 token）。
2. 解法是把每台 MCP 服务器生成为一个目录（如 `servers/google-drive/getDocument.ts`），智能体通过浏览文件系统来发现工具，只加载当前任务需要的那几个定义；同一份 Google Drive → Salesforce 的任务因此从 150,000 token 降到 2,000 token，时间与成本节省 98.7%。Cloudflare 用"Code Mode"这个名字报告了相似结论。
3. 除省 token 外还有三项结构性收益：中间结果默认留在执行环境里（只回传你显式 log 或 return 的东西）、敏感数据可在到达模型前被自动令牌化再在工具调用时还原、文件系统让状态可持久化且代码可沉淀为技能；代价是必须提供带沙箱、资源限制与监控的安全执行环境。

## 译文

## 工具消耗过多 token 让智能体效率下降

[模型上下文协议（MCP）](https://modelcontextprotocol.io/)是一个把 AI 智能体连接到外部系统的开放标准。传统上，把智能体接上工具和数据，需要为每一对组合写一次定制集成，这造成碎片化与重复劳动，让真正互联的系统难以规模化。MCP 提供了一个通用协议——开发者只需在自己的智能体里实现一次 MCP，就能解锁整个集成生态。

自 2024 年 11 月发布 MCP 以来，采用速度很快：社区已经构建了数千个 [MCP 服务器](https://github.com/modelcontextprotocol/servers)，[SDK](https://modelcontextprotocol.io/docs/sdk) 覆盖所有主流编程语言，业界也已把 MCP 采纳为连接智能体与工具、数据的事实标准。

今天，开发者例行构建的智能体可以访问数十个 MCP 服务器上的数百乃至数千个工具。然而，随着接入工具数量增长，把所有工具定义前置加载、并让中间结果穿过上下文窗口，会拖慢智能体并提高成本。

本文探讨代码执行如何让智能体更高效地与 MCP 服务器交互：处理更多工具，同时用更少的 token。

## 工具消耗过多 token 让智能体效率下降

随着 MCP 使用规模扩大，有两种常见模式会抬高智能体的成本与延迟：

1. 工具定义压垮上下文窗口；
2. 中间工具结果消耗额外 token。

### 1. 工具定义压垮上下文窗口

大多数 MCP 客户端会把所有工具定义前置加载进上下文，用直接的工具调用语法把它们暴露给模型。这些工具定义大致长这样：

```
gdrive.getDocument
     Description: Retrieves a document from Google Drive
     Parameters:
                documentId (required, string): The ID of the document to retrieve
                fields (optional, string): Specific fields to return
     Returns: Document object with title, body content, metadata, permissions, etc.
```

```
salesforce.updateRecord
    Description: Updates a record in Salesforce
    Parameters:
               objectType (required, string): Type of Salesforce object (Lead, Contact,      Account, etc.)
               recordId (required, string): The ID of the record to update
               data (required, object): Fields to update with their new values
     Returns: Updated record object with confirmation
```

工具描述占用更多上下文窗口空间，增加响应时间与成本。当智能体接了数千个工具时，它们在读到请求之前就需要先处理数十万 token。

### 2. 中间工具结果消耗额外 token

大多数 MCP 客户端允许模型直接调用 MCP 工具。例如，你可能会让你的智能体：“从 Google Drive 下载我的会议转写，并把它附到 Salesforce 的线索上。”

模型会发出这样的调用：

```
TOOL CALL: gdrive.getDocument(documentId: "abc123")
        → returns "Discussed Q4 goals...\n[full transcript text]"
           (loaded into model context)

TOOL CALL: salesforce.updateRecord(
			objectType: "SalesMeeting",
			recordId: "00Q5f000001abcXYZ",
  			data: { "Notes": "Discussed Q4 goals...\n[full transcript text written out]" }
		)
		(model needs to write entire transcript into context again)
```

每一个中间结果都必须穿过模型。在这个例子里，完整的会议转写在上下文中流了两遍。对于一场两小时的销售会议，这可能意味着额外处理 50,000 个 token。更大的文档甚至可能超出上下文窗口上限，让整条工作流崩掉。

面对大文档或复杂数据结构时，模型在工具调用之间搬运数据也更容易出错。

*MCP 客户端把工具定义载入模型的上下文窗口，并编排一个消息循环，其中每次工具调用与结果都要在两次操作之间穿过模型。*

## 用 MCP 加代码执行改善上下文效率

随着代码执行环境在智能体中越来越常见，一个解法是把 MCP 服务器呈现为代码 API，而不是直接的工具调用。于是智能体可以写代码与 MCP 服务器交互。这个做法同时解决两个挑战：智能体只加载它需要的工具，并在把结果回传给模型之前，先在执行环境里处理数据。

实现方式有很多种。其中一种是从已连接的 MCP 服务器生成所有可用工具的文件树。下面是一个用 TypeScript 的实现：

```
servers
├── google-drive
│   ├── getDocument.ts
│   ├── ... (other tools)
│   └── index.ts
├── salesforce
│   ├── updateRecord.ts
│   ├── ... (other tools)
│   └── index.ts
└── ... (other servers)
```

然后每个工具对应一个文件，大致如下：

```ts
// ./servers/google-drive/getDocument.ts
import { callMCPTool } from "../../../client.js";

interface GetDocumentInput {
  documentId: string;
}

interface GetDocumentResponse {
  content: string;
}

/* Read a document from Google Drive */
export async function getDocument(input: GetDocumentInput): Promise&lt;GetDocumentResponse&gt; {
  return callMCPTool&lt;GetDocumentResponse&gt;('google_drive__get_document', input);
}
```

上面那个 Google Drive 到 Salesforce 的例子，就变成了这段代码：

```ts
// Read transcript from Google Docs and add to Salesforce prospect
import * as gdrive from './servers/google-drive';
import * as salesforce from './servers/salesforce';

const transcript = (await gdrive.getDocument({ documentId: 'abc123' })).content;
await salesforce.updateRecord({
  objectType: 'SalesMeeting',
  recordId: '00Q5f000001abcXYZ',
  data: { Notes: transcript }
});
```

智能体通过探索文件系统来发现工具：列出 `./servers/` 目录以找到可用服务器（如 `google-drive` 和 `salesforce`），再读取它需要的具体工具文件（如 `getDocument.ts` 与 `updateRecord.ts`）以理解每个工具的接口。这让智能体只加载当前任务所需的定义。这把 token 用量从 150,000 降到 2,000——节省 98.7% 的时间与成本。

Cloudflare [报告了相似的发现](https://blog.cloudflare.com/code-mode/)，把这种“MCP 加代码执行”称为 “Code Mode”。核心洞见是一致的：LLM 擅长写代码，开发者应当利用这项长处，构建更高效地与 MCP 服务器交互的智能体。

## 用 MCP 加代码执行的好处

用 MCP 加代码执行，让智能体按需加载工具、在数据到达模型之前先过滤、并在单一步骤里执行复杂逻辑，从而更高效地使用上下文。这个做法在安全性与状态管理上也有好处。

### 渐进式披露

模型很擅长在文件系统中导航。把工具以代码形式放在文件系统上，允许模型按需读取工具定义，而不是一次性全部读完。

另一种做法是在服务器上加一个 `search_tools` 工具来查找相关定义。例如，使用上文假设的 Salesforce 服务器时，智能体搜索 "salesforce"，只加载当前任务需要的那些工具。在 `search_tools` 里再加一个细节层级参数，让智能体可以选择所需细节的程度（例如只有名字、名字加描述、或带 schema 的完整定义），也能帮智能体节省上下文并高效地找到工具。

### 上下文高效的工具结果

处理大数据集时，智能体可以在代码里先过滤和变换结果，再把它们返回。设想取一张 10,000 行的表格：

```
// Without code execution - all rows flow through context
TOOL CALL: gdrive.getSheet(sheetId: 'abc123')
        → returns 10,000 rows in context to filter manually

// With code execution - filter in the execution environment
const allRows = await gdrive.getSheet({ sheetId: 'abc123' });
const pendingOrders = allRows.filter(row =>
  row["Status"] === 'pending'
);
console.log(`Found ${pendingOrders.length} pending orders`);
console.log(pendingOrders.slice(0, 5)); // Only log first 5 for review
```

智能体看到的是 5 行而不是 10,000 行。类似的模式也适用于聚合、跨多个数据源的连接、或抽取特定字段——全都不必撑爆上下文窗口。

#### 更强也更省上下文的控制流

循环、条件与错误处理可以用熟悉的代码模式完成，而不必把单个工具调用串成链。例如，如果你需要一条 Slack 部署通知，智能体可以写：

```ts
let found = false;
while (!found) {
  const messages = await slack.getChannelHistory({ channel: 'C123456' });
  found = messages.some(m => m.text.includes('deployment complete'));
  if (!found) await new Promise(r => setTimeout(r, 5000));
}
console.log('Deployment notification received');
```

这比在智能体循环里交替使用 MCP 工具调用与 sleep 命令更高效。

此外，能把一棵条件树写出来并执行，也省下了“首 token 时间”的延迟：不必等模型去评估一个 if 语句，智能体可以让代码执行环境来做这件事。

### 保护隐私的操作

当智能体用 MCP 加代码执行时，中间结果默认留在执行环境里。这样智能体只看得到你显式 log 或 return 的内容，意味着你不希望共享给模型的数据可以在你的工作流里流动，而从不进入模型上下文。

对更敏感的工作负载，智能体运行框架可以自动令牌化敏感数据。例如，设想你需要把一张表格里的客户联系方式导入 Salesforce。智能体写：

```ts
const sheet = await gdrive.getSheet({ sheetId: 'abc123' });
for (const row of sheet.rows) {
  await salesforce.updateRecord({
    objectType: 'Lead',
    recordId: row.salesforceId,
    data: {
      Email: row.email,
      Phone: row.phone,
      Name: row.name
    }
  });
}
console.log(`Updated ${sheet.rows.length} leads`);
```

MCP 客户端拦截这些数据，并在它们到达模型之前把 PII 令牌化：

```
// What the agent would see, if it logged the sheet.rows:
[
  { salesforceId: '00Q...', email: '[EMAIL_1]', phone: '[PHONE_1]', name: '[NAME_1]' },
  { salesforceId: '00Q...', email: '[EMAIL_2]', phone: '[PHONE_2]', name: '[NAME_2]' },
  ...
]
```

之后，当这些数据在另一个 MCP 工具调用中被共享时，再通过 MCP 客户端里的一次查表还原。真实的邮箱、电话与姓名从 Google Sheets 流向 Salesforce，但从不穿过模型。这防止智能体意外记录或处理敏感数据。你也可以用它来定义确定性的安全规则，选择数据可以流向哪里、从哪里来。

### 状态持久化与技能

代码执行加上文件系统访问，让智能体可以跨操作维持状态。智能体可以把中间结果写入文件，从而能恢复工作、跟踪进度：

```ts
const leads = await salesforce.query({
  query: 'SELECT Id, Email FROM Lead LIMIT 1000'
});
const csvData = leads.map(l => `${l.Id},${l.Email}`).join('\n');
await fs.writeFile('./workspace/leads.csv', csvData);

// Later execution picks up where it left off
const saved = await fs.readFile('./workspace/leads.csv', 'utf-8');
```

智能体还可以把自己的代码持久化为可复用函数。一旦智能体为某个任务写出了可用的代码，它就能把这份实现存下来供以后使用：

```ts
// In ./skills/save-sheet-as-csv.ts
import * as gdrive from './servers/google-drive';
export async function saveSheetAsCsv(sheetId: string) {
  const data = await gdrive.getSheet({ sheetId });
  const csv = data.map(row => row.join(',')).join('\n');
  await fs.writeFile(`./workspace/sheet-${sheetId}.csv`, csv);
  return `./workspace/sheet-${sheetId}.csv`;
}

// Later, in any agent execution:
import { saveSheetAsCsv } from './skills/save-sheet-as-csv';
const csvPath = await saveSheetAsCsv('abc123');
```

这与[技能](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)的概念紧密相关——技能是让模型在专门任务上表现更好的、可复用的指令、脚本与资源文件夹。给这些保存下来的函数加一个 `SKILL.md` 文件，就创建了一项模型可以引用和使用的结构化技能。随着时间推移，这让你智能体的能力工具箱逐步上移到更高层级，并演进它高效工作所需的脚手架。

需要注意，代码执行自身也带来复杂性。运行智能体生成的代码，需要一个安全的执行环境，配以恰当的[沙箱](https://www.anthropic.com/engineering/claude-code-sandboxing)、资源限制与监控。这些基础设施要求带来了直接工具调用所没有的运维开销与安全考量。代码执行的好处——更低的 token 成本、更低的延迟、更好的工具组合——应当与这些实现成本一起权衡。

## 小结

MCP 为智能体连接众多工具与系统提供了基础协议。然而，一旦接上太多服务器，工具定义与结果就可能消耗过多 token，降低智能体效率。

尽管这里的许多问题听起来很新——上下文管理、工具组合、状态持久化——它们在软件工程里都有已知的解法。代码执行把这些成熟模式应用到智能体上，让它们用熟悉的编程构件更高效地与 MCP 服务器交互。如果你实现了这个做法，我们鼓励你把发现分享给 [MCP 社区](https://modelcontextprotocol.io/community/communication)。

## 作者与致谢

### 致谢

本文由 Adam Jones 与 Conor Kelly 撰写。感谢 Jeremy Fox、Jerome Swannack、Stuart Ritchie、Molly Vorwerck、Matt Samuels 与 Maggie Vo 对本文草稿的反馈。

## 与路线图的挂接

- **A4-03（沙箱与代码执行）**：本文是"代码执行是最强的工具"这一判断的成本侧论证。它把沙箱从"安全必需品"变成"效率杠杆"：工具以代码形式存在，模型按需读定义、在沙箱里过滤数据、把中间态落盘。但文末的自我限定同样重要——开放代码执行意味着必须配沙箱、资源上限与监控，这些是直接工具调用所没有的运维负担，隔离级别决定了你敢开放到什么程度。
- **A1-02（Token 经济学与上下文窗口的物理限制）**：150,000 → 2,000 token 这一组数字可以直接换算成延迟和账单。它给出的判断是：工具定义的固定开销与中间结果的传输开销，是两类不同性质的浪费，前者随工具数量线性增长、后者随数据体积增长，而代码执行恰好同时消掉两者——一处是"按需加载"，一处是"在模型之外处理"。

## 三个自测问题

1. 你的智能体接了 50 台 MCP 服务器、约 400 个工具。如果改成文件树 + 代码执行，省下的 token 主要来自哪一部分？又在哪一部分新增了开销（例如模型为了找到工具而多走的目录探索、以及写代码本身的 token）？
2. 中间结果"默认不进模型上下文"意味着模型可能对自己刚处理过的数据一无所知。这对可观测性和调试意味着什么？你需要在什么位置埋日志，才既能保持隐私又不至于让故障无法定位？
3. PII 令牌化依赖一个双向映射表，而映射表本身就在 MCP 客户端里。这个设计的信任边界画在哪儿？如果攻击者能影响智能体写出的代码，他能不能绕过令牌化把明文带出去？
