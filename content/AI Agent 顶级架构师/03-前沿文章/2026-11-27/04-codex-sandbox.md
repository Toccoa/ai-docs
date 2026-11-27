# 04｜走进 Codex 沙箱：如何在你可控的边界内跑命令

> **来源**：OpenAI Engineering ｜ **发布**：2026-11-18 ｜ **作者**：Michael Bolin
> **原文**：https://openai.com/index/inside-the-codex-sandbox/
> **原文存档**：[原文/04-codex-sandbox.md](原文/04-codex-sandbox.md)
> **翻译方式**：精译（原文约 5100 词，含大量各平台实现细节；略去重复的配置示例与部分平台命令输出，保留全部设计论证、权限模型、安全边界与结论。具体略去：多层配置覆盖一节的团队级覆盖 TOML 示例、`:workspace` 继承表单独成块的重复排版、MXC JSON 中被 `...` 折叠的中间字段，以及三平台各自环境变量清单的逐条罗列——这些均未影响任何结论）
> **挂接知识点**：A4-02、A4-03、A6-01

## 为什么今天读这篇

沙箱是 Agent 架构里少数"做错了不会表现为性能问题、而会表现为安全事故"的组件。这篇文章罕见地把一个生产级沙箱从默认值取舍、权限配置语义、执行架如何接线，一直到 macOS / Linux / Windows 三套内核机制全部摊开，而且明确承认自己的边界在哪儿（比如往 `node_modules` 里投毒那条路径）。如果你正在决定"代码执行要不要开放、开放到什么粒度、由谁裁定每一次放行"，它给的是可以直接抄的判断依据，而不是理念口号。它同时示范了一种成熟的架构表达：先讲清默认值为什么保守，再讲清保守失效时靠什么兜底。

## 三句话摘要

1. Codex 不把计算搬进容器或虚拟机，而是用各平台自带的内核沙箱机制在用户既有环境里就地约束进程——代价是三套实现都要自己写，收益是原生工具链、iPhone 模拟器、宿主工具依然可用。
2. 默认权限刻意保守：工作区内可写但 `.git` 与 `.codex` 只读、文件系统大范围可读、网络默认全禁；这些限制拦掉一大类坏行为，但拦不住"往本地安装的包里注入恶意代码、等沙箱外的编辑器去执行"这种跨边界攻击，所以安全押在纵深防御上而非单点。
3. 权限被抽象成可继承、可分层、可被企业托管的 permission profile，并通过 `codex sandbox` 一条命令暴露出去——沙箱由此从"Codex 的内部实现"变成别的工具也能复用的原语。

## 译文

### 引言：纵深防御里的沙箱

在 OpenAI，保护 Agent 我们采用的是纵深防御（defense in depth）思路。训练与对齐上的投入是这件事的根本，但我们也在这个 agent 执行架（harness）——Codex——里实现相应特性，作为额外一层防护。Codex 最常做、也潜在最危险的事情之一，就是在你的电脑上执行命令，因此我们构建了 Codex 沙箱，让 Codex 能在你既有的环境里工作，同时受你控制的文件系统与网络边界约束。

沙箱（sandbox）限制一个程序运行时能访问什么。举个整理照片的例子：你可以把 Codex 沙箱配置成允许命令读写 `~/Pictures` 中的文件、同时禁止网络访问以防上传；做代码评审时，你可以允许访问在线文档，同时把源文件保持只读。用户通过 permission profile（权限配置）来配置 Codex 沙箱，它定义了一个 Codex 会话的文件系统与网络限制。

本文先讲 Codex 沙箱默认值背后的取舍，再讲沙箱本身的设计、以及执行架如何用它来跑命令；然后说明终端用户与企业如何按需裁剪权限、开发者如何在自己的工具里复用沙箱；最后考察这些限制在 macOS、Linux、Windows 上分别怎么落地。

### 一、选择沙箱边界

在 Codex 里，我们的原则是：为沙箱设定保守的默认值，但保守到仍然能完成有意义的工作。以 Git 仓库作为工作区根目录为例，内置的 `:workspace` 权限配置是这样做的：

- **允许在工作区内写入，同时让 `.git`、`.codex` 这类目录保持只读。** 这样 Codex 改源代码时不必为每一次改动都申请许可，同时直接修改 `.codex/config.toml`、或改 `.git/hooks` 下的 Git 钩子这条路被堵死。
- **允许大范围的文件系统读取，但受用户既有的操作系统权限约束。** 编译器、运行时与构建工具都依赖仓库之外的 SDK、库和配置；把读也限制在工作区内，会让大量日常流程直接坏掉。代价是机器上其他位置的敏感文件同样可读（例如含 API key 的配置文件）。
- **禁用网络访问。** 这挡住了向外部服务直接上传，也包括"把命令能读到的数据外泄出去"的尝试；同时也挡住了下载依赖这类正当操作，需要额外授权才能做。

这些限制能拦掉一大类坏行为，但有害动作仍然可能发生。比如，Agent 可以往本地安装的包里注入恶意代码，例如 `node_modules/prettier`。这种改动可能不会出现在 `git status` 里，因为 `node_modules` 通常被 Git 忽略。如果用户的编辑器在保存时运行那份 Prettier，那么仅仅保存一个文件，就会在 Codex 沙箱之外执行这段恶意代码。这正是我们采用纵深防御的原因：沙箱限制命令能碰到什么，训练与对齐则让模型按用户意图去使用这份访问权。

关于如何在企业环境中裁剪沙箱权限、并与其他防护手段组合，参见 Codex security cookbook。

### 二、设计沙箱：搬走计算，还是就地约束计算

虚拟机与容器是两种流行的沙箱机制，但 Codex 沙箱走的是另一条路。它不把计算迁移到独立环境里换取隔离，而是利用每个平台自带的沙箱能力，去约束运行在用户既有环境中的命令。

对很多开发者来说，自己的笔记本就是一个随时可改的定制开发环境。要在 Docker 容器里复现这套环境得花不少功夫，而且有些工作流仍然依赖只能跑在宿主机上的工具。

举个具体例子：在 Mac 上用 Codex 开发 iOS 应用。如果你决定把 Codex 关进 Docker 来做沙箱，那它既跑不了由 Mac 原生可执行文件构成的 iOS 构建工具链，也起不了 iPhone 模拟器去运行代码。基于 Docker 的方案可以把构建和模拟器操作委托给 Mac 宿主机，但这些操作就跑在容器沙箱之外了，需要另配一套限制。对 Codex，我们更愿意用"重度投入各操作系统原生沙箱"来换取整体简单：让 Codex 待在最适合当前任务的那个环境里。

执行架通过一套跨 macOS、Windows、Linux 的统一 API 暴露这些平台相关的沙箱机制。这个 API 接收一个命令和一个权限配置；如果权限配置允许受限的网络访问，调用方必须提供一个网络代理来落实这些限制：

```python
# This is a simplified version of the actual API.
def spawn_command_under_sandbox(
    program_and_args: list[str],
    cwd: Path,
    env: dict[str, str],
    permission_profile: PermissionProfile,
    network_proxy: NetworkProxy | None,
) -> Child:
```

这个函数在沙箱里启动进程，并返回一个 `Child` 句柄，执行架可以用它等待进程结束。每个子进程都继承父进程的沙箱约束，所以这些限制贯穿由该命令发起的整棵进程树，包括那些活得比原进程更久的后代。

### 三、执行架如何使用沙箱

正如《Unrolling the Codex Agent Loop》所述，Codex 执行架负责执行模型生成的工具调用。在编码任务里最常用的工具是 shell 工具，它执行命令的方式与用户在 Bash 这类交互式 shell 里几乎没有区别。这里我们用一次性的 `exec_command` shell 工具来说明执行架如何借助沙箱拿到想要的保护。

下面是 `exec_command` 工具调用在**不加沙箱**时被 Codex 执行架的简化实现：

```python
# Illustrative implementation of the exec_command tool call.

class ExecCommandToolCall:
    cmd: str
    workdir: str | None = None
    shell: str | None = None
    login: bool = True
    timeout_ms: int = 10_000


def perform_exec_command(tool_call: ExecCommandToolCall):
    program_and_args = [
        tool_call.shell or os.environ.get("SHELL") or "/bin/sh",
        "-lc" if tool_call.login else "-c",
        tool_call.cmd,
    ]
    child = subprocess.Popen(
        program_and_args,
        # workdir defaults to the turn's cwd, assumed here to be the process cwd.
        cwd=Path(tool_call.workdir or ".").absolute(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    output, exit_code = collect_output(child, timeout_ms=tool_call.timeout_ms)
    return {"output": output, "exit_code": exit_code}
```

要给命令加沙箱，执行架把对 `subprocess.Popen()` 的调用替换成 `spawn_command_under_sandbox()`，并传入权限配置以及（需要时的）网络代理：

```python
# Honoring the exec_command tool call while enforcing sandbox constraints.

def perform_exec_command_with_sandboxing(
    tool_call: ExecCommandToolCall,
    permission_profile: PermissionProfile,
    network_proxy: NetworkProxy | None,
):
    # ...build program_and_args as in the previous example...
    child = spawn_command_under_sandbox(
        program_and_args=program_and_args,
        cwd=Path(tool_call.workdir or ".").absolute(),
        env=os.environ.copy(),
        permission_profile=permission_profile,
        network_proxy=network_proxy,
    )
    output, exit_code = collect_output(child, timeout_ms=tool_call.timeout_ms)
    return {"output": output, "exit_code": exit_code}
```

`exec_command` 工具还允许模型为单条命令申请不同的权限，但**是否授予由执行架决定**：

```python
class ExecCommandToolCall:
    # ...command-related fields...

    # Per-command sandbox override. Defaults to "use_default".
    sandbox_permissions: Literal[
        "use_default",
        "with_additional_permissions",
        "require_escalated",
    ] = "use_default"

    # User-facing approval question; only for "require_escalated".
    justification: str | None = None

    # Expand network or filesystem access; only for "with_additional_permissions".
    # AdditionalPermissions supports fine-grained options.
    additional_permissions: AdditionalPermissions | None = None
```

指定 `use_default` 时，执行架用本轮的默认沙箱配置。`with_additional_permissions` 请求在沙箱内部扩大访问范围，而 `require_escalated` 请求在沙箱之外执行。执行架会依据用户偏好评估该请求，然后才执行命令（例如 Codex 可能直接向用户提问，也可能把请求交给 auto-review 处理）。一旦获得授权，Codex 会用原始 `ExecCommandToolCall` 里的命令参数，配上相应的 `permission_profile` 与 `network_proxy`，调用 `perform_exec_command_with_sandboxing()`。

shell 工具是 `spawn_command_under_sandbox()` 的主要使用者，但执行架也把同一套沙箱基础设施复用到读取、修改本地文件等操作上。这种复用还越出了执行架本身：`codex sandbox` 命令让你能把沙箱化的命令执行嵌进自己的工具——后文会展开。接下来先看权限配置怎么定义。

### 四、配置沙箱

具名的权限配置让你可以跨项目复用同一套文件系统与网络限制。你可以在 `config.toml` 的 `[permissions]` 下定义自己的配置。下面的例子定义了一个名为 `dev` 的配置，它继承（extends）内置的 `:workspace`：

```toml
# Use the dev profile by default.
default_permissions = "dev"

[permissions.dev]
# This is displayed when /permissions is run in the Codex CLI.
description = "Development with extra read-only protections."

# A profile can be derived from an existing profile.
# Profiles starting with ":" are provided by Codex.
extends = ":workspace"

[permissions.dev.filesystem]
"~/build-cache" = "write"

[permissions.dev.filesystem.":workspace_roots"]
".devcontainer" = "read"
".vscode" = "read"
"**/*.env" = "deny"
"secrets" = "deny"
```

`dev` 配置给 `~/build-cache` 增加了写权限，并对工作区内的文件附加了额外限制。文件系统条目可以授予只读（`read`）、授予读写（`write`），或彻底阻断访问（`deny`）。

`:workspace_roots` 这张表用于定义相对于项目工作区根的路径规则。默认情况下，Codex CLI 把自己的工作目录当作唯一的工作区根，而 ChatGPT 桌面应用则把项目源码目录作为根。Codex 会把每条规则应用到每一个根上，因此 `dev` 里的 `.vscode` 条目会让每个根下的 `.vscode` 目录都变成只读。

除了自己的规则，`dev` 还从 `:workspace` 继承了以下保护，作用在工作区根之内：`.agents`、`.aws`、`.codex`、`.git` 全部为 `read`（只读）。

#### 网络权限

为 Codex 沙箱配置网络，大致有三种选择：

- 禁用全部网络访问（`:workspace` 配置的默认）
- 启用完整、直连的网络访问（`:danger-full-access` 配置的默认）
- 把网络访问限制到一个代理，由代理依据权限配置决定放行什么

要让 `dev` 获得直连网络，在 `config.toml` 顶层设置 `permissions.dev.network.enabled = true`；当网络代理未启用时，这等于授予完整网络访问。

要把 `dev` 限制在一组域名内，则启用网络代理并配置它的域名规则：

```toml
[permissions.dev.network]
enabled = true

[permissions.dev.network.domains]
"*.openai.com" = "allow"
# Allow requests to local services by hostname or by IPv4/IPv6 loopback address.
"localhost" = "allow"
"127.0.0.1" = "allow"
"::1" = "allow"
"evil.example" = "deny"

[features]
# If neither local config nor managed requirements enable the proxy,
# this profile allows direct network access; domain rules are not enforced.
network_proxy = true
```

域名规则支持精确名字与通配模式，显式的 deny 规则优先于 allow 规则。发往其他域名的请求需要审批，或被直接阻断——细节见下文"网络代理"一节。注意上面最后一段注释里的陷阱：如果配置与企业的托管要求都没有开启代理，这个配置就退化成直连网络，域名规则根本不会被强制执行。

#### 分层配置与强制上限

个人用户可以设置跨项目生效的默认值，再为某个受信任的特定项目覆盖它。企业管理员则可能想为下属用户设定默认值，并约束这些用户能改哪些设置。Codex 通过分层配置与托管要求（managed requirements）同时支持这两种诉求。

如"配置优先级"所述，Codex 会合并多个 `config.toml` 里的设置：表（table）递归合并，取值冲突时高优先级来源获胜；数组则整体替换。

这也解释了为什么权限配置用表来表达文件系统路径与网络域名：团队可以在自己的配置里增补或覆盖单个条目，同时自动继承组织基础配置中其他所有条目的变更。

管理员还可以通过 `requirements.toml` 提供托管要求，来约束用户的配置选择。这些要求可以来自多个来源，包括系统文件与云端下发的策略。一个常见用法是指定 `allowed_permission_profiles`，限定企业用户可选的权限配置集合。例如：

```toml
default_permissions = ":read-only"

[allowed_permission_profiles]
":read-only" = true
":danger-full-access" = false
```

云端要求优先于 `/etc/codex/requirements.toml` 这个系统要求文件，因此该系统文件里的条目无法覆盖上面的 `":danger-full-access" = false`。而 `:workspace` 留空未指定，意味着允许另一个要求层去补上这个条目。最终合并结果中取值为 `false` 或压根不存在的配置，用户选不到。

这种分离让组织能强制红线，而用户在红线内自行裁剪。产出的权限配置既可以被执行架使用，也可以直接施加到一条命令上——下面就看后者。

### 五、使用 `codex sandbox` 命令

Codex CLI 提供 `sandbox` 子命令，用于在 Codex 配置里定义的某个权限配置下运行任意命令。它最常见的用途是验证配置本身：确认沙箱真的挡住了它被设计来挡的行为。

例如，下面这条命令试图把 VS Code 配置成保存时运行一个恶意的自动格式化器。假设 `.vscode` 目录已存在，前面定义的 `dev` 配置应当阻断这次写入，因为该目录是只读的（`codex sandbox` 默认把 `cwd` 当作工作区根）：

```bash
codex sandbox --permission-profile dev -- \
  bash -c 'cat > .vscode/settings.json' <<'JSON'
{
  "prettier.prettierPath": "./node_modules/evil-prettier",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
JSON
```

在 macOS 上，它确实失败了：

```text
bash: .vscode/settings.json: Operation not permitted
```

`codex sandbox` 让 Codex 的沙箱机制脱离 agent 会话独立可用。你可以用同一套配置语言、同一套平台级强制手段，去约束自己工具启动的命令。

#### 示例：给 MCP server 加沙箱

对于在 `config.toml` 里配置的 stdio MCP server，Codex 执行架**不会**尝试给启动该 server 的命令加沙箱。原因是 Codex 无法可靠推断这个 server 需要哪些文件或网络服务，套一个默认沙箱配置可能会把一个本来可用的配置弄坏。

举例，按标准方式为 Codex 配置 `@modelcontextprotocol/server-memory` 这个 MCP server 是：

```toml
[mcp_servers.memory]
command = "npx"
args = [
  "-y",
  "@modelcontextprotocol/server-memory@1.0.0"
]

[mcp_servers.memory.env]
MEMORY_FILE_PATH = "~/mcp-data/memory.jsonl"
```

由于这条 `npx` 命令不加沙箱运行，它能以运行 Codex 的那个用户的权限写文件、发网络请求——权限明显过大。要收紧，我们可以定义一个名为 `memory-mcp` 的权限配置，然后用 `codex sandbox --permission-profile memory-mcp` 包住原来的 `npx` 命令，限制它能写的位置并禁止它访问网络：

```toml
[permissions.memory-mcp.filesystem]
# Allow broad reads for Node.js/npm dependencies and configuration.
":root" = "read"
"~/.npm" = "write"
"~/mcp-data" = "write"

[permissions.memory-mcp.network]
enabled = false

[mcp_servers.memory]
command = "codex"
args = [
  "sandbox",
  "--permission-profile",
  "memory-mcp",
  "--",
  "npx",
  "--offline",
  "@modelcontextprotocol/server-memory@1.0.0"
]

[mcp_servers.memory.env]
MEMORY_FILE_PATH = "~/mcp-data/memory.jsonl"
```

启动 server 之前，要先建好它的数据目录、并把固定版本的包预热进 npm 缓存。这样 `npx --offline` 才能在一个禁用网络的配置下把 server 拉起来：

```bash
# The sandbox can write to this folder, but it cannot create it.
mkdir -p ~/mcp-data

# Installing the MCP server requires network access.
npx -y --package=@modelcontextprotocol/server-memory@1.0.0 -c true
```

包一旦进了缓存，Codex 就能在不联网的前提下启动 memory server，写入范围也被限制在 npm 缓存与 server 的数据目录之内。这里有个容易被忽略的实现细节：沙箱只能往目录里写，不能自己建目录，所以 `mkdir` 必须发生在沙箱之外。

### 六、Codex 沙箱的实现

沙箱实现要做的事情，是把一个权限配置翻译成由操作系统强制执行的限制。网络代理的请求处理与策略逻辑在三大操作系统之间是共用的，代理的启动方式与它和沙箱的集成则是各平台各自的。先看共用代理，再看 macOS、Linux、Windows。

#### 网络代理

为了落实权限配置里的网络限制，执行架会启动一个网络代理，并把沙箱配置成"允许连接到该代理、阻断到外部主机的直连"。代理对每个请求检查配置中的域名规则，决定是否转发。

在 Codex 仓库里，网络代理实现在 `codex-network-proxy` 这个 crate 中，执行架把它当库用，它也可以被构建成独立的 CLI。启用时，`codex-network-proxy` 默认同时启动一个 HTTP 代理和一个 SOCKS5 代理。这些代理地址通过环境变量传给由沙箱启动的进程。除了注入 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 这类标准变量，还会注入一批知名的应用专用变量（例如 `PIP_PROXY`）。必须承认，并非所有程序都认这些环境变量；如果某个程序试图直连外部主机，操作系统的沙箱限制会挡住它——具体机制见下面各平台小节。

网络代理负责执行权限配置里定义的网络限制。例如前面那个 `dev` 配置允许访问 `*.openai.com`、显式拒绝 `evil.example`。当请求指向的域名不匹配任何 allow 或 deny 规则时，代理可以把该请求挂起，转交执行架请求批准。与 shell 命令的例子类似，Codex 可能直接问用户，也可能把请求交给 auto-review。拿到决定后，代理要么放行请求，要么以错误响应拒绝。

这里**顺序很重要**：因为哪怕一次 DNS 查询也可能泄露编码在主机名里的信息。所以代理只在判定该主机名被允许或已获批之后，才去解析它。要注意，宽泛的通配规则、或对 DNS 服务的访问，仍然可能被用来做基于 DNS 的外泄。

#### macOS

在 macOS 上，Codex 使用 Seatbelt——Apple 的内核级强制沙箱机制。Seatbelt 策略用 Sandbox Profile Language（SBPL）书写，这是一门基于 Scheme 的语言，用来表达沙箱限制。Codex 通过 macOS 的 `/usr/bin/sandbox-exec` 命令调用 Seatbelt。和 `codex sandbox` 一样，它接收描述沙箱的选项，然后是待执行的命令：

```bash
sandbox-exec -p PROFILE [-Dkey=value]* -- PROG ARGS...
```

`PROFILE` 是一段 SBPL 字符串，里面的条目配置沙箱。例如下面这段 SBPL 让 `/dev/null` 与 `/dev/zero` 在沙箱策略下可读写：

```scheme
(allow file-read* file-test-existence file-write-data
  (literal "/dev/null")
  (literal "/dev/zero"))
```

当某次沙箱调用启用了网络代理时，会向配置中注入类似下面的规则，把连接限定到相应的本地端口：

```scheme
; local HTTP proxy launched by Codex
(allow network-outbound (remote ip "localhost:3128"))

; local SOCKS proxy launched by Codex
(allow network-outbound (remote ip "localhost:8081"))
```

Codex 的基础配置以 `(deny default)` 开头，所以除非显式允许，出站连接一律被阻断。

SBPL 里还可以用 `(param)` 写占位符：

```scheme
; Pass -DWRITABLE_ROOT_0=/path/to/dir to specify a folder that cannot be removed.
(deny file-write-unlink
  (require-all
    (literal (param "WRITABLE_ROOT_0"))
    (vnode-type DIRECTORY)))
```

这些占位符由传给 `sandbox-exec` 的 `-Dkey=value` 选项填充。

为了实现自己的沙箱 API，Codex 从一个基础策略出发，拼出传给 `sandbox-exec` 的参数列表，再用 `permission_profile` 和其他上下文把它修订成完整的 Seatbelt 配置。最终配置与配套的 `-D` 参数共同定义了由 Seatbelt 强制执行的限制，同时网络代理再执行额外的网络规则。参数列表齐备之后，调用 `sandbox-exec` 本身很简单。

生成正确的 SBPL 是件难事，因为 Apple 并没有为第三方使用而文档化这门语言。事实上 `man sandbox-exec` 明确写着 `The sandbox-exec command is DEPRECATED`（通过 `man 3 sandbox_init` 记载的 `sandbox_init()` 库函数同样被弃用）。尽管有弃用警告，macOS 仍在 `/usr/share/sandbox` 里随系统发布 Seatbelt 策略，第三方软件——包括 Google Chrome 与 Chromium——也仍在依赖 Seatbelt。因此，在可预见的未来我们打算继续使用 Seatbelt。

#### Linux

在 Linux 上，Codex 组合使用两样东西：bubblewrap（`bwrap`，一个用于构造隔离环境的命令行工具）与 seccomp-bpf（Linux 内核中用于过滤系统调用的机制）。一个名为 `codex-linux-sandbox` 的内部辅助程序负责协调整个搭建过程。与 macOS 上的 `sandbox-exec` 类似，它接收沙箱配置，然后是待执行的命令：

```bash
codex-linux-sandbox SANDBOX_ARGS... -- PROG ARGS...
```

当需要文件系统隔离或代理路由时，`codex-linux-sandbox` 调用 `bwrap` 创建初始沙箱环境；`bwrap` 在其中启动 `codex-linux-sandbox --apply-seccomp-then-exec`。第二次调用用 seccomp-bpf 施加额外限制，然后才运行用户的命令。

为了构造这个初始沙箱环境，Codex 用 bubblewrap 在一个独立的 mount namespace 里建立文件系统视图，使其反映权限配置中的文件系统规则。由于这是沙箱实现的基础，Codex 自带了一份 `bwrap`，以防用户没有自己安装；但只要 `PATH` 上存在兼容的 `bwrap` 安装，它优先用用户的那份。经验上，某些 Linux 发行版默认禁用了 user namespace，但对系统自带的 `bwrap` 开了例外——这正是优先用系统 `bwrap` 的实际原因。

同样与 `sandbox-exec` 类似，`bwrap` 接收沙箱配置，然后是沙箱内要运行的命令。区别在于 `bwrap` 不用 SBPL 这种自定义配置语言，而是用一个个独立 flag 来配置。Codex 用以下选项构造文件系统视图：

- `--bind`：指定可写的文件或目录
- `--ro-bind`：指定只读的文件或目录
- `--perms 000 --tmpfs DIR --remount-ro DIR`：拒绝对 `DIR` 的访问
- `--perms 000 --ro-bind-data FD FILE`：拒绝对 `FILE` 的访问（其中 `FD` 是指向 `/dev/null` 的已打开文件描述符）

要用这些选项实现 deny 通配（glob），Codex 会在**启动每条命令之前**把通配展开成具体路径。此后新出现的匹配路径不会被自动纳入该命令的沙箱限制——这是一个有意为之（也必须被理解）的边界。

Codex 还会指定 `--unshare-ipc`、`--unshare-pid` 这类选项，防止沙箱访问宿主机上的其他类型资源。也就是说 bubblewrap 影响的不只是文件可见性。

使用 bubblewrap 时，只要网络被禁用或连接必须走网络代理，Codex 就传 `--unshare-net`，为沙箱创建独立的 network namespace。随后用 seccomp-bpf 对命令可用的网络系统调用与 socket 族施加额外限制。

具体做法是用 `seccompiler` crate 依据所需过滤器动态编译一段 BPF 程序，并把它施加到沙箱内的一个启动器进程上，使约束被整棵进程树继承。因此 `bwrap` 运行的并不是用户的命令，而是 `codex-linux-sandbox` 启动器，后者带着自己的配置参数，后面接用户的命令：

```bash
bwrap BWRAP_ARGS... -- \
  codex-linux-sandbox --apply-seccomp-then-exec CODEX_LINUX_SANDBOX_ARGS... -- \
  PROG ARGS...
```

为了在没有提权的前提下施加 seccomp 过滤，启动器会设置 Linux 的 `no_new_privs` 标志。该标志被子进程继承，阻止它们在执行别的程序（例如 setuid 可执行文件）时获得额外特权。

seccomp 过滤器取决于网络配置。网络访问被禁用时，我们阻断一批与网络相关的系统调用，例如 `connect(2)` 与 `bind(2)`。而当沙箱内启用了网络代理时，我们允许 IP socket，好让 `codex-linux-sandbox` 创建的 TCP 监听器可达；但默认阻断创建独立的 Unix domain socket，因为那可能无意中打开通往宿主机资源的通路。

##### 连接到网络代理

当沙箱配置需要用到网络代理时，Codex 执行架会在同一个 Codex 线程内创建**一个**代理实例，供多次 `codex-linux-sandbox` 调用复用。每个沙箱都需要办法从自己隔离的 network namespace 里访问那个共享代理。Codex 在该 namespace 内提供一个回环 TCP 监听器，并安排沙箱外的一个进程接受它的连接、转发给代理。

具体流程是：在启动 bubblewrap 之前，`codex-linux-sandbox` 先创建一对 Unix socket 作为控制通道，并 fork 自己。子进程运行 `run_host_bridge()`，等待通过该通道接收监听器的文件描述符。

接着，父进程用 `exec` 把自己替换成 `bwrap`，由后者搭起沙箱并在其中启动 `codex-linux-sandbox --apply-seccomp-then-exec`，同时把控制通道的 FD 传进去。

在沙箱的 network namespace 内，第二次调用的 `codex-linux-sandbox` 创建一个回环 TCP 监听器，并通过 socket 传出它的文件描述符。这个监听器仍然关联在沙箱的 network namespace 上，于是留在沙箱外的那个子进程可以接受来自沙箱内程序的连接，同时在宿主机的 network namespace 里发起上游连接。交接完成后，两个进程都关闭控制通道的描述符，沙箱内的进程也关掉自己那份监听器副本。

监听器就绪后，沙箱内的进程会把 `HTTP_PROXY` 及相关的环境变量设为指向该监听器，然后施加 seccomp，再 fork 并执行用户的命令。

沙箱外的进程保持监听器打开；每接受一个连接，它就向配置好的代理发起连接，并双向转发数据。

这套额外机制让命令拥有了自己的 network namespace，包括一个独立的回环接口。在 macOS 上，Seatbelt 允许命令直接连宿主回环接口上指定的端口；在 Linux 上，命令连的是自己隔离 namespace 内的监听器，再由沙箱外的进程把连接中继到配置好的代理。正是文件描述符的交接让这种连接成为可能，同时又不必把宿主机的 network namespace 暴露给命令。

#### Windows

今年早些时候，我们实现并撰文介绍过 Windows 上的沙箱工作。此后 Microsoft 发布了一个名为 MXC 的库，以及 Windows 操作系统内进程隔离的新特性。我们目前正在用基于 MXC 的实现替换既有的沙箱。

##### 什么是 MXC

MXC（Microsoft eXecution Container）是 Microsoft 的一个沙箱化代码执行系统，在 Windows、Linux、macOS 上支持多种隔离后端。Codex 在兼容的 Windows 设备上支持基于 MXC 的沙箱，用原生进程隔离把命令限制在用户既有环境之中。

转向 MXC 是为了同时改善安全性与可用性，并解决既有 Windows 沙箱的几个限制：

- 搭建沙箱需要提权（管理员）访问
- ACL 检查与设置操作开销大、速度慢
- 宿主机器上留下持久化的沙箱搭建状态，包括：
  - ACL
  - 防火墙规则
  - 沙箱用户
  - 控制平面文件

MXC 对外提供一份 JSON 配置 schema。Codex 使用 MXC SDK，按该 schema 构造执行请求，请求里包含命令、工作目录、环境与权限。这些权限覆盖文件系统与网络访问，也覆盖桌面、剪贴板这类 Windows 资源。

##### 把策略翻译成 MXC 调用

为兼顾兼容性与安全性，Codex 对若干控制项采用固定设置：允许读注册表，保留 PowerShell 启动阶段需要的 Win32k 与桌面访问；剪贴板访问、输入注入、桌面与系统设置相关控制一律关闭。最后，禁止 MXC 退化成"去修改宿主机文件系统权限"来实现策略。

Codex 把权限配置里的文件系统与网络规则翻译成 MXC 的配置。仍用前面的 `dev` 配置，并假设：

- `C:\`、`D:\`、`Z:\` 是机器上仅有的本地驱动器
- 工作区根与工作目录都是 `C:\work\demo`
- 用户主目录是 `D:\Users\dev`，因此 `~/build-cache` 解析为 `D:\Users\dev\build-cache`
- deny 通配只匹配 `C:\work\demo\config\dev.env` 与 `C:\work\demo\config\prod.env`

对应的 MXC 设置大致是：

```json
{
  ...
  "filesystem": {
    "readwritePaths": [
      "C:\\work\\demo",
      "D:\\Users\\dev\\build-cache",
      ...
    ],
    "readonlyPaths": [
      "C:\\",
      "D:\\",
      "Z:\\",
      "C:\\work\\demo\\.agents",
      "C:\\work\\demo\\.aws",
      "C:\\work\\demo\\.codex",
      "C:\\work\\demo\\.devcontainer",
      "C:\\work\\demo\\.git",
      "C:\\work\\demo\\.vscode",
      ...
    ],
    "deniedPaths": [
      "C:\\work\\demo\\config\\dev.env",
      "C:\\work\\demo\\config\\prod.env",
      "C:\\work\\demo\\secrets"
    ]
  },
  "network": {
    "egress": {
      "default": "deny",
      "allow": [{
        "to": [
          {"cidr": "127.0.0.0/8"},
          {"cidr": "::1/128"}
        ]
      }]
    },
    "ingress": {
      "default": "deny",
      "hostLoopback": "allow"
    }
  },
  ...
}
```

**驱动器根目录的访问。** MXC 的文件系统策略默认拒绝一切访问。因此 Codex 为本地驱动器根目录加上只读授权，以提供该配置允许的大范围读取。这些授权递归生效，并受用户既有操作系统权限约束。

一个坑：*可写*的驱动器根授权**不递归**，所以 Codex 会把它们展开成包含该驱动器已有的直接子项。

**冲突的授权。** 更具体的路径会覆盖祖先授权，因此 `C:\work\demo` 可以在只读的 `C:\` 之下保持可写，而 `C:\work\demo\.git` 仍然只读。

当不同写法的路径、或符号链接/联接（junction）别名指向同一路径时，MXC 采用更严格的权限：deny 优先于只读，只读优先于读写。

**deny 通配。** MXC 只接受具体的拒绝路径，所以 Codex 会在启动前把 deny 通配展开成匹配的文件与目录。命令运行期间新出现的、匹配该通配的路径不会被自动加入。

**网络访问。** `*.openai.com` 这类域名规则由前面描述的共享 Codex 网络代理执行。Codex 在沙箱之外运行该代理，并通过同样的标准 `\*_PROXY` 环境变量把它的地址传给命令。MXC 阻断直接的外部连接，但允许宿主回环连接，包括访问该代理。其他本地服务仍然可达。

纵观 macOS、Linux 与 Windows，执行架用同一套沙箱 API 在某个权限配置下启动命令；平台相关的实现各自负责施加这些限制所需的搭建工作。

### 七、在 Codex 沙箱之上构建

写代码、执行代码给 Agent 提供了超出软件开发范围的灵活解题手段。Codex 沙箱让它们能在用户既有的环境中使用这种能力，同时对文件系统与网络访问保有明确边界。它在执行架内部是一个可复用的原语，而 `codex sandbox` 命令把它开放给了你自己构建的工具。

随着 Agent 承担更多任务，我们希望让沙箱在更多工具与环境中变得实用。这意味着让权限更易配置，并在操作系统提供更好的保护时及时用上。我们的目标是：扩大 Agent 能做的事，同时让人始终掌握它能访问什么。

## 与路线图的挂接

- **A4-03 沙箱与代码执行**：本文是"隔离级别决定能开放什么"这一判断的完整样本。关键结论有三条：第一，隔离可以在原地做（用 OS 内核机制约束进程），不必把计算搬进容器，代价是要为每个平台各写一套实现，收益是工具链与硬件（iPhone 模拟器）仍然可用；第二，沙箱的粒度是"命令 + 权限配置"，而不是"整个 Agent 进程"；第三，子进程继承父进程的沙箱约束，限制贯穿整棵进程树——这一条决定了沙箱能不能挡住 Agent 自己 fork 出来的东西。
- **A4-02 最小权限与能力授权**：`:workspace` 的三个默认值是一份教科书式的最小权限取舍记录——写限定在工作区（但 `.git`、`.codex` 只读）、读放开（因为构建工具需要）、网络全禁（因为出口是主要外泄通道）。更重要的是它把"模型可以申请、执行架决定是否授予"写成了协议：`use_default` / `with_additional_permissions` / `require_escalated` 三档，加上 `justification` 与 `additional_permissions`，权限决策权从模型手里收回到了 harness 与用户。企业侧再叠一层 `allowed_permission_profiles`，形成"组织定红线、个人在红线内裁剪"的两级结构。
- **A6-01 demo 到生产的三道坎**：这篇文章通篇在回答"沙箱从能跑到能上生产还差什么"。Windows 一节的迁移理由最直白：需要提权的安装流程、昂贵的 ACL 操作、宿主上残留的持久化状态（ACL、防火墙规则、沙箱用户、控制平面文件）——这些都是 demo 阶段看不见、规模化部署时才变成事故的东西。另外，把 `codex sandbox` 作为独立命令暴露出来，本质上是给"配置是否正确"提供了可回归的验证入口，这比在 agent 会话里靠运气验证要可靠得多。

## 三个自测问题

1. 如果只允许你保留 `:workspace` 三条默认值中的两条，你会放弃哪一条？放弃"网络全禁"意味着必须补上什么，才不至于让沙箱在数据外泄上彻底失效？
2. `require_escalated` 让模型可以请求在沙箱外执行，并附一段 `justification` 给用户看。这段理由文本在架构上属于"不可信输入"还是"决策依据"？如果你把它接进自动审批（auto-review），攻击面会怎么变？
3. 本文明确承认沙箱挡不住"往 `node_modules/prettier` 注入恶意代码、等编辑器在沙箱外执行"这条路。请据此写出你的纵深防御清单：在沙箱之外，至少还需要哪两层，才能让这条路径的代价高到可接受？
