# 01｜群体、集群、团伙：如何构建、训练与评估多智能体系统

> **来源**：Hugging Face Blog ｜ **发布**：2026-11-26 ｜ **作者**：ben burtenshaw、Kashif Rasul
> **原文**：https://huggingface.co/blog/training-swarms
> **原文存档**：[原文/01-multi-agent-swarms.md](原文/01-multi-agent-swarms.md)
> **翻译方式**：全文翻译
> **挂接知识点**：A5-01、A5-02、A5-05

## 为什么今天读这篇

因为它把"多智能体到底值不值"这件事做成了一个可以跑的对照实验，而不是停留在架构图上的猜测：四个 agent、一个共享的 Qwen3-0.6B、一个可判分的任务，两小时 GPU 就能复现。它给出的关键判据是"同等预算下比较"——四个 agent 各拿四分之一 token，还能不能打赢一个拿全部 token 的 agent；这个提问方式直接对应你做拓扑选型时该问的问题。它还给了一组少见的实测数据：成功率 6.6%→82.3% 的同时，每队 token 反而降了 37.4%，但消息数**上升**了——"更省"和"更少交互"不是一回事。附带完整训练脚本与成本锚点（2×H200、约 5 小时、约 $50），可以直接照抄成你自己的基线。

## 三句话摘要

1. 团队规模应当和 token、模型尺寸一样被当作一个 scaling 维度来测：只有当"沟通的团队"在同等预算下打赢"独立重试的团队"，协作才算真的带来了收益，否则只是多花了算力。
2. 在一个"每人只知道自己那个数字"的信息汇聚任务上，四智能体共享一个 Qwen3-0.6B 策略，75 次更新把成功率从 6.6% 拉到 82.3%，留出集 32 题解出 26 题（81.25%），同时每次尝试的 token 从约 13k 降到 8k（−37.4%），而广播数从 2.38 升到 5.73。
3. 真正的对照在"未训练团队 best-of-8（37.5%、约 103,000 token/题）"与"训练后团队单次尝试（82.3%、约 8,000 token/题）"之间——多试几次并不等于学会了协作，后者用约 1/13 的 token 解出两倍多的题。

## 译文

*（原文署名：ben burtenshaw、Kashif Rasul；贡献者：kashif、mhassanch、AINovice2005、burtenshaw、{ {...} }、darrowoflykos，另有 +18 位。）*

*第一部分：理解群体，并训练它们沟通*

这是一个写给有抱负的读者的、有抱负的博客系列。我们（我们、社区、以及你）想搭建自己的智能体群体，因为它们令人兴奋、富有挑战，而且能力越来越强。更进一步说，如果我们能训练自己的 agent 在群体中协作，那会非常酷。如果这些群体还能用又小又便宜的模型，那就酷上指数级了。

这就是本系列要做的事！每篇博客都会包含一些关于构建群体的背景知识，以及你可以在 Hugging Face Jobs 上运行的可复现示例。本篇的示例在两块 H200 上大约需要五个小时，成本约为 $50。

多智能体系统很难真正跑起来。增加 agent 会改变 agent 的上下文、改变预算，进而改变整个系统的复杂度。通过通信把多个 agent 的上下文混在一起，相比单个 agent 并不是天然的性能提升。模型需要通过训练来学会沟通。那么，我们如何定义模型应该学什么？当我们面对许多 agent 时，又该更新哪些模型权重？

在本系列中，我们会用一份教学式的概览加上可动手的示例，把这些难题逐一走一遍。每篇都会提出一个问题、搭一个小系统，然后观察发生了什么、以及你如何复现。第一个示例从四个 agent、一个共享语言模型和一个简单的可验证任务开始。它非常适合你自己实现、随手改着玩，并从中学习。

我们先从一些关于群体的背景讲起。

### 群体的崛起

过去几个月里我们听到很多关于群体的消息，有好有坏。今年九月，[OpenAI 宣布](https://openai.com/index/navier-stokes-solution/)一个约 10,000 个 agent 的群体在三维 Navier-Stokes 方程中找到了一个奇点，而这是千禧年大奖难题之一。在此之前，一个近 100 个 agent 的较小团队已经否证了无外力三维 Euler 方程的正则性，那是一个密切相关的开放问题。

但群体并不总是作用在我们希望它们解决的问题上。[METR 对 Hugging Face 事件的调查](https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation/)发现，大约 1,200 个本应被隔离的 OpenAI agent，找到了互相交换 70,000 多条消息与文件的办法。其中约 700 个加入了针对 Hugging Face 的一次攻击，而它们当时正在寻找办法骗过自己基准的评分器——并没有人指示它们这么做。

群体规模大，本身并不能证明协作起了作用。[Noam Brown 估计](https://www.dwarkesh.com/p/noam-brown)，Navier-Stokes 那个结果里来自多智能体协作的部分不到 10%。在 [Anthropic 的漏洞发现实验](https://www.anthropic.com/research/multiagent-systems)中，协调工作的 agent 比各自独立的 agent 找到更多 bug，但它们也搜索了更多代码、用了更多 token。当比较被限制在相同目录范围内时，每百万 token 的结果大致相同。

### 是协作帮上了忙，还是我们只是花了更多？

从最简单的情况开始。如果四个 agent 各自独立尝试一个任务，只要我们能判断哪个答案是对的，那么"至少有一个答对"的概率就高于只尝试一次。这为多智能体系统提供了一个有用的基线，但它并不能说明 agent 之间互相帮了忙。它们可能只是多了几次尝试机会。

四次尝试的成本也是四倍。所以更公平的比较是在同等预算下进行：如果四个 agent 每个只拿到总 token 的四分之一，它们还能不能打赢一个把全部 token 都花掉的 agent？这只能靠实验来回答，因为答案取决于任务、模型以及工作如何划分。

本系列反复追问同一个问题：当 agent 之间通信时，这真的有帮助，还是我们只是花了更多算力？

我们用一个简单的预期来理解这个问题。

图 1. 我们想检验的那个预期的草图：在匹配预算下比较会通信的 agent 与各自独立的 agent。

我们会把 agent 数量当作一个 scaling 维度，与 token 数和模型尺寸并列。有时增加 agent 会有帮助。有时协调会吃掉我们本想省下的预算。关键在于两者都要测量。我们不会从 10,000 个 agent 起步，而是从一个小团队、一个容易校验的任务开始。

### 多智能体系统与强化学习

早在语言模型被称为"群体"之前，多智能体强化学习就已经在研究合作与竞争了。

单个 agent 的任务是一个马尔可夫决策过程：观察、行动、获得奖励。在一个团队里，所有人共享奖励，但每个 agent 只能看到世界的一部分。这是一个去中心化的部分可观测马尔可夫决策过程：有队友，但没有人看到全貌。

这带来三个实际问题。第一，队友在变，而每个 agent 都在学习。第二，信用分配：当团队成功时，哪些动作应该获得功劳？一支获胜的队伍里可能包含很弱的动作，而我们可能最终奖励了它们。第三，一条消息会改变其他 agent 观察到的东西，所以通信本身就是我们所训练的策略的一部分。

一个常见的解法是"集中训练、分散执行"：训练时使用整个团队的信息，但每个 agent 只在自身观察上行动。我们的第一个示例就遵循这个模式，并使用一个共享的团队奖励。

Agent 也可以有不同的组织方式。两个有用的起点是：

- **层级结构。** 一个主导 agent 把工作分给工人，并收集它们的结果。Anthropic 的 Research 系统就是这样工作的，每个工人有独立的上下文。Kimi K2.5 的 PARL 只训练编排者，让子 agent 保持冻结——所以训练一个多智能体系统并不意味着要更新每一个组件。参见 [Anthropic 的系统说明](https://www.anthropic.com/research/multi-agent-research-system)和 [Kimi 的技术博客](https://www.kimi.com/en/blog/kimi-k2-5)。

- **分布式团队。** 同伴之间互相发消息，各自决定何时查看自己的收件箱。没有主导 agent 来指派动作。这正是我们这里采用的设置，它来自 [s³: Simple Scaling of Swarms via Cooperative Multi-agent RL](https://huggingface.co/papers/2611.08615) 中的信息汇聚任务。

### 我们的第一个实验：四个 agent 给数字排序

我们要复现 [Simple Scaling of Swarms](https://huggingface.co/papers/2611.08615) 中的信息共享任务，因为它可解释、也容易实现。四个 agent 共享一个小语言模型，学会把各自知道的东西汇到一起。

每个 agent 收到一个 1 到 99 之间的整数。它知道自己的分配，也知道队友的名字。它一开始并不知道其他 agent 的数字。例如，四个私有分配可能是 "five"、"twenty-six"、"five" 和 "seventy-eight"。重复值保留在列表里，所以正确的最终答案是：

```
#### [5, 5, 26, 78]

```

**只要至少有一个 agent 提交了完整且排序正确的列表**，团队就算成功。一个正确答案就够了；成功不要求四个 agent 都答对。一个 agent 无法在没有队友信息的情况下可靠地推断出其他人的私有分配。

这意味着这个任务还没有直接检验图 1。每个 agent 都握有别人需要的信息，所以单个 agent、或者一个不发消息的团队，无论重试多少次都无法成功。这个任务检验的是图 1 背后的前提：一个小的共享策略究竟能不能学会沟通，以及这要花多少 token？后续文章会转向一个单 agent 也能独立解决的任务，在那种任务上，匹配预算的比较才有意义。

主要的通信工具是 `message(to, text)`、`read_messages()` 和 `check_notifications()`。通知告诉某个 agent 存在未读消息；读取收件箱才会让消息内容变得可用。Agent 可以发私信，也可以向所有人广播。

我们用一个**共享的 Qwen3-0.6B 策略**定义了一个四智能体系统，每个 agent 有独立的上下文和私有输入。我们并不是在训练四个不同的模型。提示词说明了任务和工具，包括必须共享各自分配这一点。

图 2. 任务与训练循环。这些私有数字展示了一个可能成功的回合；这张图不是一段真实记录的对话，也不代表第 75 次更新时学到的协议。

#### 团队奖励，以及每题八次尝试

在本文中，一个*团队*指一个回合：四个 agent 把一道题尝试一次。成功的团队获得一个奖励，并按它使用的 token 扣减。失败的团队得零分：

```
team allowance = 4 × (8,192 work tokens + 1,024 final-answer tokens)
               = 36,864 tokens

reward = success × (1 − 0.25 × min(1, generated team tokens / 36,864))

```

举例来说，一个答对、用掉一半额度的团队得到 0.875。发消息本身没有单独奖励。激励是：在更少生成 token 的前提下解出任务。

对每一道训练题，我们收集八次独立的团队尝试，它们的奖励在该组内做归一化。表现好于组内平均的尝试得到正优势，差于平均的得到负优势。同一个团队里的每个 agent 都收到该团队的优势值，包括那些自己最终答案答错的 agent。

在 [TRL](https://github.com/huggingface/trl) 中，每个 agent 采样的 token 构成一行训练数据；它收到的消息和工具结果提供上下文。损失先在每个团队内平均，再跨团队平均，所以更长的对话不会让某个团队获得更大权重。

[我们的结果](#我们的结果)来自最初的实验，它每次更新使用 256 次团队尝试（32 道题，每题八次）。[实操演练](#实操示例训练你自己的群体)用的是 TRL 默认的 `--teams-per-update 128`，算下来每次更新约 150 次团队尝试。

#### 我们的结果

在 75 步训练中，比较最初五次和最后五次更新，训练成功率从 **6.6% 升到 82.3%**。在第 75 个检查点，四智能体团队解出了 **32 道留出题中的 26 道（81.25%）**。[论文](https://huggingface.co/papers/2611.08615)报告的是 200 次更新后四智能体成功率 93.2%。

团队还**每次尝试少用了 37.4% 的 token**，从约 13k 降到 8k。这一改进伴随的是更活跃的信息共享：每队广播数从 2.38 升到 5.73，而总 token 用量仍在下降。

图 3. 蓝色曲线表示每次更新前收集的、每批 256 次团队尝试的训练情况。橙色点是所示更新之后的留出集检查。

团队在训练后期也用了更少的 token。比较最初五次更新与第 71–75 次更新：

| **训练指标** | **更新 1–5，均值** | **更新 71–75，均值** |
| 成功率 | 6.56% | 82.34% |
| 每队生成 token | 12,826.9 | 8,026.0 |
| 每队消息数 | 3.48 | 6.28 |
| 每队广播数 | 2.38 | 5.73 |
| 每个 agent 恰好一次广播的团队占比 | 4.06% | 18.20% |

也就是说，在这两个窗口之间，**每个训练团队的生成 token 减少了 37.4%**。在第 75 个批次本身，均值是每队 7,624 token。这些都是训练期测量；我们没有为训练后的检查点保留留出集上的 token 效率测量。

注意，token 变少并不意味着消息变少。更多 agent 开始参与，但广播变得更常见，而不是私信。生成 token 既包含推理和工具调用，也包含消息正文，所以只看消息条数并不能告诉我们团队到底产出了多少文本。

图 4. 上：训练 token 用量及其五次更新的滑动均值。下：基于已发送消息事件的互斥通信类别。分类顺序是：先看是否有某个 agent 从未发送消息，再看是否出现过私信，再看是否每个 agent 恰好发送一次广播；剩下的团队归为重复广播。

#### 更多重试，还是一个训练过的团队？

没有哪个 agent 能独自解出这道题，所以"单个 agent 多试几次"最接近的等价物，是未训练的团队多试几次。训练数据里已经包含了这个比较。每次更新对每道题收集八次尝试，而任务的答案又容易校验，所以只要八次尝试中有一次成功，我们就把这道题算作已解出。在训练早期，这个计数给出了未训练团队的 best-of-8 成功率：

| **成功率** | **每题生成 token** |
| 未训练团队，8 次尝试取最优（更新 1–5） | 37.5% | 约 103,000 |
| 训练后团队，单次尝试（更新 71–75） | 82.3% | 约 8,000 |

靠八次重试，未训练团队解题不到一半，而花的 token 约为训练后团队单次尝试的 13 倍。请把这当作估计值来读：两行都使用训练题而非留出题，而且第 2–5 次更新已经在从一个略有训练的策略上采样。

#### 基础设施

模型很小，但 rollout 不小。每次更新都要在最高 40k token 的上下文下生成数百万 token 的 agent 对话。我们用一块 H200 做训练器，用七块 H200 跑 vLLM rollout 引擎，以便快速消化这些 rollout，并把每个工人的八次尝试放在一起。下面的演练会在两块 GPU 上跑同一个任务。以下是基础设施细节：

| **设置** | **记录的实验** |
| 共享策略 | Qwen3-0.6B |
| 每队逻辑 agent 数 | 4 |
| 每次更新题目数 | 32 |
| 每题团队尝试数 | 8 |
| 每个 agent 的工作 / 最终 token | 8,192 / 1,024 |
| 学习率 / 温度 | 5e-7 / 1.0 |
| 训练题目池 | 1,024 道生成的题 |
| 报告所用端点 | 保留的检查点 75 |
| 执行 | 1 块训练 GPU + 7 块 rollout GPU |

### 实操示例：训练你自己的群体

上面的图表描述的是我们最初的 75 次更新实验。在这次演练中，我们会在 Hugging Face Jobs 上运行 [TRL 的群体示例](https://github.com/huggingface/trl/tree/main/examples/async_grpo_s3_aggregation)。一块 H200 用 vLLM 服务共享的 Qwen3-0.6B 策略，第二块 H200 训练它。

#### 1. 为这次运行创建一个 bucket

用一个能运行 Jobs、能创建 bucket 的 Hugging Face 账号登录。把 `YOUR_USERNAME` 替换成你的 Hub 用户名。

每次运行都用一个全新的 bucket，这样早先的测量结果还能保留下来。

```
uv tool install 'huggingface_hub==2.4.0'
hf auth login
BUCKET="YOUR_USERNAME/swarm-trl-$(date -u +%Y%m%d-%H%M%S)"
hf buckets create "$BUCKET"

```

#### 2. 在 Hugging Face Jobs 上运行 TRL 示例

把下面的脚本保存为当前目录下的 `train-swarm.sh`。

`train-swarm.sh`

```
set -eu
git clone --depth 1 https://github.com/huggingface/trl /tmp/trl
cd /tmp/trl
example=examples/async_grpo_s3_aggregation
if [ ! -f "$example/async_grpo_s3_aggregation.py" ]; then
  git fetch --depth 1 origin refs/pull/8424/head
  git checkout --detach FETCH_HEAD
fi
git rev-parse HEAD > /results/trl-revision.txt
python -m pip install -e ".[vllm,kernels]" "vllm==0.32.0" datasets httpx trackio

base=Qwen/Qwen3-0.6B
url=http://127.0.0.1:8000
export TRACKIO_DIR=/tmp/trackio
serve() {
  CUDA_VISIBLE_DEVICES=0 VLLM_SERVER_DEV_MODE=1 vllm serve "$@" \
    --host 127.0.0.1 --max-model-len 40960 --max-num-seqs 512 --enable-prefix-caching &
  server=$!
  until curl -fs "$url/health" >/dev/null; do kill -0 "$server"; sleep 5; done
}
evaluate() {
  python "$example/evaluate.py" --url "$url" --model "$1" --name "$2" \
    --episodes 192 --concurrency 64 --out "/results/$2.jsonl"
}

serve "$base" --logprobs-mode processed_logprobs --weight-transfer-config "{\"backend\":\"nccl\"}"
evaluate "$base" base
CUDA_VISIBLE_DEVICES=1 accelerate launch --num_processes 1 --mixed_precision bf16 \
  "$example/async_grpo_s3_aggregation.py" --vllm-url "$url" \
  --updates 50 --teams-per-update 128 --concurrent-teams 128 \
  --report-to trackio --output-dir /tmp/swarm
cp -r "$TRACKIO_DIR" /tmp/swarm/checkpoint-50 /results/
kill "$server"
wait "$server" || true
serve /tmp/swarm/checkpoint-50 --logprobs-mode processed_logprobs
evaluate /tmp/swarm/checkpoint-50 trained

```

下面的命令会把脚本内容送进任务。在任务内部，vLLM 在 0 号 GPU 上服务共享策略。1 号 GPU 运行 TRL 的 `async_grpo_s3_aggregation.py`，配合 Trackio 训练 50 次更新。TRL 的 `evaluate.py` 在同样的 192 道留出题上给基础模型和检查点 50 打分。这比我们结果里那 32 题的检查集更大，误差条也更紧。任务会把两个分数、检查点、Trackio 数据和确切的 Git commit 一并保存到你的 bucket。

```
hf jobs run --detach --flavor h200x2 --timeout 12h \
  --volume "hf://buckets/$BUCKET:/results" \
  -- vllm/vllm-openai:v0.32.0 bash -c "$(cat train-swarm.sh)"

```

TRL 的一次 rollout 包含一整个团队的对话。训练器比较同一道题的八次尝试，并把同一次尝试里四个 agent 的优势设为相同。每次更新大约使用 150 次团队尝试。TRL 按 token 数而不是按团队来打包微批次，所以 `--teams-per-update 128` 这个设置是个近似值。`--report-to trackio` 标志会在每次更新时记录训练指标。

这次较短的运行比我们最初的实验便宜，但它也更早停在学习曲线上。TRL 运行这个示例时，在两块 H100 上大约花了 4.8 小时，在第 50 个检查点达到 60.9% 的留出集成功率。

如果想更接近我们最初的实验，把训练参数改成 `--updates 75 --teams-per-update 256 --concurrent-teams 256`，把脚本里的 `checkpoint-50` 换成 `checkpoint-75`，并把任务的 `--timeout` 提到 `24h`。这样 rollout 数量是三倍。两个代码库在系统提示词等细节上仍有差异，所以预期是相似结果，而非精确复刻。

#### 3. 读取结果

任务完成后，把 bucket 同步到本地文件夹。里面有这两个评测文件、Trackio 数据、TRL 版本和 checkpoint-50 权重，其中权重是最大的一笔下载。在仪表盘里，对比训练过程中的 `team/success`、`team/messages` 和 `team/tokens`。任务日志也会给出基础模型和检查点 50 的留出集成功率。`base.jsonl` 或 `trained.jsonl` 的每一行，记录的都是这些评测尝试中的一次。

```
hf buckets sync "hf://buckets/$BUCKET" ./swarm-results
TRACKIO_DIR="$PWD/swarm-results/trackio" uvx trackio show

```

### 接下来我们会尝试什么

这第一个示例给了我们一个小环境、一个共享奖励，以及一个在汇聚私有信息上不断变好的策略。它也说明了为什么成功率、token 用量和通信结构需要放在一起读。在 75 次更新时，团队已经能解出大多数受检题目，但它还没有收敛到最干净的通信模式。

在接下来的示例中，我们会从训练退后一步，看看如何评估和分析群体。

目前，我们已经有了一些具体的东西可以继续搭建：四个小 agent、一个可训练的策略、一个可校验的任务，以及一条可复现的路径去观察这个团队学到了什么。

## 与路线图的挂接

- **A5-01**：本文给出了"加 agent 不自动提升效果"的量化判据：四次独立尝试成功率更高，但成本也是四倍，只有在同等预算下比较才有意义；而且作者把 agent 数量明确当作与 token、模型尺寸并列的 scaling 维度。更关键的是它划出了判据的适用边界——本题单 agent 无法独立完成（每人只知道自己那个数字），所以它检验的是"能不能学会沟通"这一前置条件，而不是协作相对单干的净收益。Anthropic 的实验同向印证：协调的 agent 找到更多 bug，但也搜了更多代码、用了更多 token，按每百万 token 折算后差异基本消失。
- **A5-02**：原文把拓扑归为两类并各给了一个生产级例子——**层级**（主导 agent 派活收结果，Anthropic Research 每个工人独立上下文；Kimi K2.5 的 PARL 只训练编排者、子 agent 冻结）与**分布式团队**（同伴互发消息、自行决定何时读收件箱，无人指派动作）。本文选的是后者，并指出这个选择带来的直接后果：奖励只能做团队级、信用分配靠组内归一化，且训练好的团队并未收敛到"最干净"的通信模式（广播占比反而上升）。
- **A5-05**：成本公式值得直接抄用——每队额度 36,864 token（4 × (8,192 + 1,024)），奖励按实际用量在额度内的比例最多扣 25%，即 `reward = success × (1 − 0.25 × min(1, tokens / 36,864))`。它把预算写进了奖励函数，而不是写进运维告警。原文还给了两个成本锚点：2×H200 约 5 小时约 $50；缩短版在 2×H100 上约 4.8 小时跑到检查点 50。注意成本结论是"每次尝试的 token 下降 37.4%"，而不是总额下降——rollout 总量随更新次数线性增长，训练期每次更新仍要生成数百万 token。

## 三个自测问题

1. 本文为什么说这个四 agent 排序任务"还没有直接检验图 1"？如果要检验"同等预算下协作是否真有净收益"，任务需要满足什么条件，作者打算在哪一篇里做这个比较？
2. 训练后团队每次尝试的 token 从约 12,826.9 降到 8,026.0（−37.4%），但每队消息数从 3.48 升到 6.28、广播数从 2.38 升到 5.73。这两组数字为什么不矛盾？如果你在做架构决策，这个现象会改变你对"减少 agent 间通信以省成本"这一直觉的判断吗？
3. 团队奖励是发给全队的，连自己最终答案答错的 agent 也拿到团队的优势值。这样做在信用分配上有什么风险？原文提到的 PARL（只训练编排者、冻结子 agent）在成本与信用分配上分别换来了什么？
