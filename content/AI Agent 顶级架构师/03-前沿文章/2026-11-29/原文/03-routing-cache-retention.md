# Routing and Cache Retention for Multi-Turn LLM Inference: Theory and Implementation

TBD Sentao Miao11 1 The co-first authors contributed equally to this work and are listed in alphabetical order. Tianjiao Nie11 1 The co-first authors contributed equally to this work and are listed in alphabetical order. Yuan Zhou11 1 The co-first authors contributed equally to this work and are listed in alphabetical order.22 2 Corresponding author. Song Yuan Yuanwei Lu Yibo Zhu November 25, 2026

###### Abstract

Multi-turn AI agents execute iterative loops of large language model (LLM) inference and external tool calls, transforming cluster serving into a dynamic resource-allocation problem where routing and key–value (KV) cache retention jointly govern prefix reuse across inter-turn delays. We formulate a fluid approximation of this system and show that optimal admission, routing, and eviction are governed by endpoint-specific shadow prices for computation and memory together with session continuation values. Building on this structure, we propose an asymptotically optimal buffer-reserve policy that absorbs stochastic fluctuations using a vanishing share of capacity. To handle asynchronous arrivals, delayed load reports, and engine-local memory management in production clusters, we translate these principles into a practical controller named PARK, which pairs online projected subgradient price updates and one-turn migration lookahead with a local KV retention index ranked by expected reuse value per byte-epoch. In real GPU cluster experiments serving a 197-billion-parameter mixture-of-experts model on multi-turn software-engineering agent benchmarks (SWE and Terminal-Bench), PARK outperforms all five load-balancing and prefix-aware baselines across contrasting traffic regimes. On 16 H200 GPUs, PARK raises output throughput by 24.2%24.2\% over the strongest baseline (336.9%336.9\% over round robin) on turn-intensive SWE trajectories and by 40.0%40.0\% over the strongest baseline (63.3%63.3\% over round robin) on generation-intensive Terminal-Bench trajectories. Controlled single-replica ablations show that our retention index alone cuts prior-prefix token loss from 13.26%13.26\% to 2.17%2.17\% and increases throughput by 36.7%36.7\% over least-recently-used (LRU) eviction, while 128-GPU scale-up experiments sustain 50,78950{,}789 to 67,36367{,}363 output tokens/s across 16 replicas with prefix cache hit rates of 91.3%91.3\% to 97.4%97.4\%.

Keywords: multi-turn LLM inference, KV cache retention, online resource allocation, fluid approximation

††runningauthor: TBD††runningtitle: Multi-Turn LLM Inference Optimization††authors:  Leeds School of Business, University of Colorado Boulder, Boulder, CO 80309, USA, sentao.miao@colorado.edu Qiuzhen College, Tsinghua University, Beijing 100084, China, nietj21@mails.tsinghua.edu.cn Yau Mathematical Sciences Center & Department of Mathematical Sciences, Tsinghua University, Beijing 100084, China; Beijing Institute of Mathematical Sciences and Applications, Beijing 101408, China, yuan-zhou@tsinghua.edu.cn StepFun Intelligence, Shanghai 200232, China, oliveryuan@stepfun.com StepFun Intelligence, Shanghai 200232, China, luyuanwei@stepfun.com StepFun Intelligence, Shanghai 200232, China, zhuyibo@stepfun.com ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation: ††affiliation:

## 1 Introduction

Large language models (LLMs) support a growing range of activities, including customer service, writing, software development, and tool-using AI agents. Delivering these benefits requires *inference*: the computation performed by a trained model to generate a response to a user’s request. Whereas training develops a model’s capabilities once, inference puts those capabilities to use each time a request is served, consuming processing capacity, memory, and energy on graphics processing units (GPUs). Inference is therefore a recurring operating requirement with substantial costs: OpenAI reportedly spent $8.4 billion on inference in 2025 ([Muppidi, 2026](#bib.bib15)), and [McKinsey & Company (2026)](#bib.bib38) projects that inference will account for about 60% of AI data-center demand by 2030. At this scale, modest reductions in the resources required per request can yield substantial operating savings or allow existing infrastructure to serve more demand. Realizing these gains poses a natural operations research problem: how can a provider complete more useful work with limited resources and uncertain demand?

We study a provider operating multiple inference servers, each of which may contain several GPUs. Requests arrive sequentially, and the provider must immediately decide whether to admit each request and which server should process it. Admitted requests occupy computation and memory resources while their responses are generated, sharing those resources with unfinished work from earlier admissions. Memory is particularly important because generating a response requires storing intermediate computations whose size grows with the amount of text being processed ([Kwon et al., 2023](#bib.bib12)).

This allocation problem is further complicated because many requests belong to *multi-turn* conversations, where each turn consists of a prompt and its response. A later prompt builds on the conversation’s earlier text, creating an opportunity to reuse previous computation. The saved intermediate computations are called the *key–value (KV) cache*. Keeping this cache reduces the work required for the next turn, but occupies GPU memory while the user reads a response or executes external tools. Therefore, the provider must also decide which idle conversations deserve continued storage and which caches to evict, meaning remove from memory. Eviction frees capacity for other work, at the cost of rebuilding the lost computations if the conversation resumes.

Crucially, request routing and cache eviction are closely coupled in multi-turn conversations. Serving a turn creates an updated cache at the chosen server, while eviction determines whether that cache remains available to reduce the cost of subsequent requests. Consider a conversation whose cache resides at a busy server while another server has spare capacity. Routing the next request to the cache-holding server avoids recomputation but adds to its load; routing it to the other server uses spare capacity and establishes an updated cache there, but requires rebuilding the prefix. Whether routing elsewhere is preferable depends on how long the destination’s congestion advantage persists and how likely the conversation is to continue. The eviction decision, in turn, determines which idle caches to retain by weighing the memory freed by eviction against the potential savings from future reuse. A retained cache occupies memory that could support other requests and saves computation only if the next request arrives before eviction and is routed to the server holding it.

Existing inference systems demonstrate the practical value of preserving caches across conversation turns ([Gao et al., 2024](#bib.bib13)) and coordinating distributed routing to balance cache reuse and server load ([Srivatsa et al., 2025](#bib.bib14)). Related optimization studies develop bid-price admission and routing in a single-turn model under resource constraints ([Chen et al., 2026](#bib.bib30)) and cache eviction policies for stochastic multi-turn conversations ([Zhang et al., 2025](#bib.bib31)). These developments motivate a unified optimization and analysis of routing and cache retention. As the preceding discussion illustrates, the central challenge is to coordinate these decisions while accounting for how each shapes the costs and benefits of the other across conversation turns. We therefore ask:

How should a scheduler jointly optimize admission, routing, and idle-cache retention to maximize the throughput under server-specific computation and memory constraints?

We formulate this problem as a stochastic control model and develop a tractable fluid relaxation that links active service, idle waiting, and cache ownership across conversation turns. Resource shadow prices and session continuation values provide a common basis for coordinating these decisions, yielding structural characterizations of optimal fluid routing and retention. We further develop a fluid-based policy with an asymptotic performance guarantee and translate the theoretical principles into PARK, a practical controller for multi-turn inference. Our main contributions are as follows.

- •

A fluid framework for jointly managing service and future cache reuse. We formulate a stochastic control model for admission, routing, and cache retention in multi-turn conversations that tracks each session’s service status, idle age, and cache location. Because continuous relaxations of routing and retention fractions yield nonlinear capacity constraints, we develop a fluid approximation expressed through state–action flow volumes. This formulation yields a tractable linear program while preserving the link between current service and future cache availability.

- •

Structural characterization of routing and cache eviction. The fluid solution provides a common economic basis for evaluating routing and retention decisions: dual resource prices measure the cost of computation and memory, while continuation values capture the consequences for later turns. Their comparison explains when routing should follow an existing cache and when rebuilding it elsewhere is worthwhile. For retention, we derive sufficient conditions connecting cache length, storage cost, and the conditional time until the next prompt. These conditions show why intermediate-length caches can offer a better trade-off than short caches (which are cheap to rebuild) or very long caches (which occupy more memory than their future reuse justifies), and characterize how idle age should govern eviction through the session’s return prospect and rebuild cost, yielding a mechanism distinct from that of the traditional LRU policy.

- •

A fluid-based policy with an asymptotic performance guarantee. We turn the fluid solution into an online buffer-reserve policy that makes immediate routing decisions and periodically updates its admission and cache-retention quotas while reserving capacity buffers against stochastic fluctuations. Letting arrival rates and server capacities grow proportionally with a scale parameter nn, we prove an O⁡(n​log⁡n)O(\sqrt{n\log n}) shortfall in expected completed turns relative to the fluid benchmark. Thus, the shortfall per unit of scale vanishes, providing a performance guarantee in large stochastic systems.

- •

A practical controller (PARK) informed by the theory and evaluated at scale. To handle asynchronous arrivals, delayed server snapshots, and engine-local memory reclamation in production clusters, we translate our routing and retention principles into an event-driven controller, PARK (Price-based Admission and Routing with KV-cache Retention). We evaluate PARK on two multi-turn software-engineering agent workloads, serving a 197-billion-parameter mixture-of-experts model on up to 128 H200 GPUs with a concurrency cap of 4,096 sessions. In three-hour evaluations at this scale, PARK sustains approximately 51,000–67,000 output tokens/s across the two workloads. PARK outperforms standard routing and caching baselines, while controlled single-replica experiments show that its retention index mechanism reduces prior-prefix token loss from 13.26% to 2.17%.

The remainder of the paper is organized as follows. Section [2](#S2) reviews the related literature. Section [3](#S3) introduces the stochastic model. Section [4](#S4) develops the fluid formulation and structural results. Section [5](#S5) presents the policy, its performance guarantee, and its implementation. Section [6](#S6) reports the experiments, and Section [7](#S7) concludes. Proofs appear in the electronic companion.

## 2 Related Literature

Our work relates to three streams of research: LLM inference systems and cache management, optimization for LLM inference, and dynamic resource allocation.

##### LLM inference systems and cache management.

Modern serving engines improve GPU memory efficiency and reuse earlier computations across calls. PagedAttention reduces KV-cache fragmentation and enables memory sharing ([Kwon et al., 2023](#bib.bib12)), SGLang reuses shared prompt prefixes across calls ([Zheng et al., 2024](#bib.bib35)), CachedAttention preserves multi-turn KV caches across a storage hierarchy ([Gao et al., 2024](#bib.bib13)), and Preble coordinates distributed routing to balance cache locality and server load ([Srivatsa et al., 2025](#bib.bib14)). While these systems establish the practical importance of cache reuse, we provide a unified theoretical framework that jointly prices current resource use and future conversation turns, explaining when routing and eviction should depart from myopic heuristics.

Classical caching models also study retention decisions: [Dehghan et al. (2016)](#bib.bib25) optimize content-specific cache utilities, and [Ferragut et al. (2016)](#bib.bib26) link optimal time-to-live timers to inter-request time distributions. In multi-turn LLM inference, however, idle caches compete directly with active requests for GPU memory, and reuse value depends on whether and where future turns are admitted. Our retention comparisons incorporate these service decisions to characterize how cache length, idle age, and return timing govern eviction.

##### Optimization and stochastic control for LLM inference.

Recent work builds mathematical foundations for inference scheduling. [Mitzenmacher and Shahout (2025)](#bib.bib16) survey connections among queueing, service-time predictions, and LLM serving. [Dai et al. (2026)](#bib.bib27) establish throughput optimality in batched processing networks, including dependent AI-agent workflows. [Ao et al. (2026)](#bib.bib28) develop fluid-guided admission and scheduling policies accounting for KV-memory growth during generation, while [Lin et al. (2026)](#bib.bib29) derive asymptotically optimal admission and routing policies for competing prompt and generation stages. Related studies examine online batching under KV-memory limits ([Jaillet et al., 2026](#bib.bib17)), non-clairvoyant scheduling without advance output lengths ([Feng et al., 2026](#bib.bib18)), and cache-aware preemption for tail latency ([Li et al., 2026](#bib.bib19)).

Two closely related studies address routing and eviction separately: [Chen et al. (2026)](#bib.bib30) develop online bid-price routing in a single-turn model under concurrent-request and KV-memory limits, and [Zhang et al. (2025)](#bib.bib31) propose a length-aware variant of least-recently-used eviction that is optimal for a tail-latency objective under a stochastic model of multi-turn conversations. [Wu et al. (2026)](#bib.bib39) model routing–eviction interactions, but their routing algorithm greedily minimizes predicted latency for the current request, and their competitive guarantees apply to eviction rather than the combined policy. In contrast, our fluid framework jointly optimizes admission, routing, and retention across conversation turns: routing determines where future caches reside, while retention governs the cost of future routing choices. By accounting for these intertemporal effects, our framework yields structural characterizations of the joint decisions and an asymptotic optimality guarantee for our buffer-reserve policy.

##### Dynamic resource allocation.

Methodologically, our approach builds on bid-price control ([Talluri and van Ryzin, 1998](#bib.bib37)) and fluid reoptimization ([Jasin and Kumar, 2012](#bib.bib32); [Bumpensanti and Wang, 2020](#bib.bib20)). Reusable-resource models track capacity occupied for stochastic service durations and released upon completion ([Goyal et al., 2025](#bib.bib33)). Multi-turn inference adds a post-service state effect: completing a turn can leave behind a cache that continues to consume memory while reducing future execution work, both of which our routing and retention rules price.

Our state-based LP also connects to weakly coupled Markov decision processes, where local session dynamics share global capacity constraints ([Adelman and Mersereau, 2008](#bib.bib21); [Bertsimas and Mišić, 2016](#bib.bib22)). In this literature, [Brown and Zhang (2022)](#bib.bib23) incorporate shared external signals, and [Brown and Zhang (2025)](#bib.bib24) and [Gast et al. (2024)](#bib.bib34) establish finite-horizon asymptotic optimality guarantees for fluid reoptimization with heterogeneous components. Building on these ideas, we link session states across turns to connect resource shadow prices with cache-ownership values, accommodating immediate routing, random service requirements, and post-service retention decisions to achieve an O⁡(n​log⁡n)O(\sqrt{n\log n}) shortfall from the fluid benchmark.

## 3 Model and Decision Problem

### 3.1 Sessions, Endpoints, and Cache States

We consider a discrete-time LLM inference system operating over a finite horizon of HH epochs, indexed by t=0,…,H−1t=0,\ldots,H-1, with terminal time HH. The system serves conversation sessions across a set of endpoints ℰ={1,…,E}\mathcal{E}=\{1,\ldots,E\}, where each endpoint represents a server housing one or more GPUs (processors used for LLM computation) with per-epoch execution capacity BeB_{e} and memory capacity GeG_{e}. Upon arrival, each prompt must be immediately assigned to an endpoint or rejected; we write ℰ0={0}∪ℰ\mathcal{E}_{0}=\{0\}\cup\mathcal{E}, where action 00 denotes rejection. After a rejection, the session may depart or remain idle without a cache, in which case it may submit a new prompt or retry the rejected one in a later epoch.

We call a submitted prompt a request. Each session consists of a sequence of turns, where a turn comprises an admitted request and its generated response. Each completed request therefore corresponds to one completed turn. Serving a turn involves processing the prompt and generating the response, which may span multiple epochs. A session is *active* while its admitted turn is unfinished and *idle* while waiting to submit another prompt. After a turn completes, its *key–value (KV) cache* stores intermediate computations that can be reused by a later turn. Retaining an idle cache consumes endpoint memory between turns but reduces computation when the session returns. Each idle session has at most one retained cache: routing its next prompt to the endpoint holding that cache is a *warm route*, whereas routing elsewhere, or routing without a retained cache, is a *cold route* that requires recomputation.

Each live session has a state s=(k,a,d,o,x)s=(k,a,d,o,x) in a finite set 𝒮\mathcal{S} (departed sessions are excluded), where:

- •

kk records the session type or conversation phase, such as its context length, number of completed turns, or idle cache size;

- •

aa is the idle age (number of epochs elapsed since the previous turn completed), with a=0a=0 for active sessions;

- •

dd is the attained service (number of epochs spent serving the unfinished turn), with d=0d=0 for idle sessions;

- •

o∈ℰ0o\in\mathcal{E}_{0} is the endpoint holding an idle session’s retained cache, with o=0o=0 indicating no retained cache;

- •

x∈ℰ0x\in\mathcal{E}_{0} is the endpoint serving an unfinished turn, with x=0x=0 for idle sessions.

Together, these coordinates capture all workload information needed to determine service requirements and return behavior. We partition 𝒮=𝒮I∪˙𝒮A\mathcal{S}=\mathcal{S}^{I}\mathbin{\dot{\cup} }\mathcal{S}^{A} into idle states (𝒮I\mathcal{S}^{I}, where d=x=0d=x=0) and active states (𝒮A\mathcal{S}^{A}, where a=0a=0); the cache-location coordinate oo is relevant only in 𝒮I\mathcal{S}^{I}.

Finally, let Ms​(t)M_{s}(t) be the number of sessions in state ss at the beginning of epoch tt, and write M⁡(t)=(Ms​(t))s∈𝒮M(t)=(M_{s}(t))_{s\in\mathcal{S} }. When a turn completes at endpoint ee, a continuing session becomes idle with its updated cache stored at ee. Thus, the current routing decision directly determines where the next turn can reuse earlier computations.

### 3.2 Decisions and Session Dynamics

In each epoch tt, decisions and state transitions occur in four steps:

1. (1)

Observe the population. The controller observes M⁡(t)M(t), including the serving endpoints of active sessions and the cache locations of idle sessions.

2. (2)

Route each arriving prompt. Each beginning-of-epoch idle session in state ss independently submits a prompt with probability ps​(t)p_{s}(t), while new sessions may enter with an initial prompt and no retained cache. Active sessions submit no prompts, so every session submits at most one prompt per epoch. Arrival times and new-session counts follow specified distributions, with new-session arrivals bounded per epoch.

Indexing arrivals by j=1,…,Jtj=1,\ldots,J_{t} with session states st,js_{t,j}, the controller immediately chooses an action et,j∈ℰ0e_{t,j}\in\mathcal{E}_{0} upon each arrival, using all information observed up to that moment (including earlier arrivals and routing decisions in epoch tt). Assigning et,j∈ℰe_{t,j}\in\mathcal{E} admits the prompt to endpoint et,je_{t,j}, where it remains until completion; action 00 rejects it.

3. (3)

Observe service outcomes at the boundary. Previously active and newly admitted turns receive service, yielding pre-retention states s~i​(t+1)\widetilde{s}_{i}(t+1) at the epoch boundary according to three state–action transition kernels:

  - •

QtA​(s,s′)Q_{t}^{A}(s,s^{\prime}) for an initially active session;

  - •

QtI​(s,s′)Q_{t}^{I}(s,s^{\prime}) for an idle session that submits no prompt;

  - •

Pte​(s,s′)P_{t}^{e}(s,s^{\prime}) for an arriving session assigned action e∈ℰ0e\in\mathcal{E}_{0}.

Here s′s^{\prime} denotes the pre-retention state, and any probability mass unassigned to live states corresponds to session departure. Specifically, an unfinished turn remains active with attained service d′=d+1d^{\prime}=d+1; a completed turn either departs or becomes idle at its serving endpoint ee with (a′,d′,x′,o′)=(0,0,0,e)(a^{\prime},d^{\prime},x^{\prime},o^{\prime})=(0,0,0,e); an unprompted idle session remains idle with age a′=a+1a^{\prime}=a+1; and a rejected prompt releases any existing cache without starting service. Conditional on the beginning-of-epoch state and arrival sequence, transition and resource outcomes are independent across sessions and depend only on each session’s current state and action, though computation, memory use, and completion may be correlated within a session.

4. (4)

Retain caches and update the population. Let ℐ~e​(t)\widetilde{\mathcal{I} }_{e}(t) be the set of idle sessions with a cache available at endpoint ee at the boundary (including newly completed turns). After observing service outcomes and cache sizes, the controller selects a subset ℐe​(t)⊆ℐ~e​(t)\mathcal{I}_{e}(t)\subseteq\widetilde{\mathcal{I} }_{e}(t) to retain and evicts the rest. Eviction clears only the cache location via 𝖤⁡(k,a,0,o,0)=(k,a,0,0,0)\mathsf{E}(k,a,0,o,0)=(k,a,0,0,0) without altering user conversation behavior. Post-retention states and the next population are then

| si​(t+1)\displaystyle s_{i}(t+1) | ={𝖤​(s~i​(t+1)),i∈⋃e∈ℰ(ℐ~e​(t)∖ℐe​(t)),s~i​(t+1),otherwise,\displaystyle=\begin{cases}\mathsf{E}\bigl(\widetilde{s}_{i}(t+1)\bigr),&i\in\displaystyle\bigcup_{e\in\mathcal{E} }\bigl(\widetilde{\mathcal{I} }_{e}(t)\setminus\mathcal{I}_{e}(t)\bigr),\\ \widetilde{s}_{i}(t+1),&\text{otherwise},\end{cases} |  |  | Ms​(t+1)\displaystyle M_{s}(t+1) | =∑i𝟏{si(t+1)=s},s∈𝒮,\displaystyle=\sum_{i}\mathbf{1}\{s_{i}(t+1)=s\},\qquad s\in\mathcal{S}, |  |

where the sum ranges over all surviving and newly entering sessions.

### 3.3 Capacity Constraints and Optimization

Let 𝒜t\mathcal{A}_{t} be the set of active sessions at the beginning of epoch tt. During epoch tt, an initially active session i∈𝒜ti\in\mathcal{A}_{t} incurs execution requirement Lt,i,eL_{t,i,e} at endpoint ee (with Lt,i,e=0L_{t,i,e}=0 if served elsewhere), and arrival jj incurs execution requirement Ct,j,eC_{t,j,e} if admitted to endpoint ee. We enforce memory capacity at epoch boundaries as a discrete-time approximation: an initially active turn and a newly admitted turn occupy boundary memory Kt,i,eactK_{t,i,e}^{\mathrm{act} } and Kt,j,eadmK_{t,j,e}^{\mathrm{adm} } at endpoint ee, respectively (equal to zero if the turn completes during the epoch), whereas completed turns consume boundary memory only through their retained idle caches of observed size bi​(t)b_{i}(t).

All per-session execution requirements and active-memory footprints are nonnegative and uniformly bounded. Conditional on the beginning-of-epoch state and arrival sequence, these random quantities are independent across sessions and follow known distributions determined by each session’s state and action, though their realizations are unknown at the time of routing.

A nonanticipative policy π\pi specifies the routing actions et,je_{t,j} and retained cache sets ℐe​(t)\mathcal{I}_{e}(t) using only the information observed up to each decision time. Letting Ncmp​(t)N^{\mathrm{cmp} }(t) denote the number of turns completed during epoch tt, our objective from initial state M⁡(0)=M0M(0)=M^{0} is to maximize expected completions:

| V0(M0)=supπ\displaystyle V_{0}(M^{0})=\sup_{\pi} | 𝔼π​[∑t=0H−1Ncmp​(t)]\displaystyle\mathbb{E}^{\pi}\!\left[\sum_{t=0}^{H-1}N^{\mathrm{cmp} }(t)\right] | (3.1) |
| subject to\displaystyle\text{subject to} | ∑i∈𝒜tLt,i,e+∑j=1JtCt,j,e𝟏{et,j=e}≤Be,\displaystyle\sum_{i\in\mathcal{A}_{t} }L_{t,i,e}+\sum_{j=1}^{J_{t} }C_{t,j,e}\mathbf{1}\{e_{t,j}=e\}\leq B_{e}, |  |  | ∑i∈𝒜tKt,i,eact+∑j=1JtKt,j,eadm𝟏{et,j=e}+∑i∈ℐe​(t)bi(t)≤Ge,\displaystyle\sum_{i\in\mathcal{A}_{t} }K_{t,i,e}^{\mathrm{act} }+\sum_{j=1}^{J_{t} }K_{t,j,e}^{\mathrm{adm} }\mathbf{1}\{e_{t,j}=e\}+\sum_{i\in\mathcal{I}_{e}(t)}b_{i}(t)\leq G_{e}, |  |

where both constraints must hold almost surely for every e∈ℰe\in\mathcal{E} and t=0,…,H−1t=0,\ldots,H-1. The first constraint bounds computation within epoch tt, while the second allocates boundary memory between unfinished turns and retained idle caches.

The objective also admits a useful accounting identity. Define NA​(M)=∑s∈𝒮AMsN_{A}(M)=\sum_{s\in\mathcal{S}^{A} }M_{s} as the total active population. Because every admitted turn either completes during the epoch or remains active at the next boundary,

| Ncmp(t)=NA(M(t))+∑j=1Jt𝟏{et,j≠0}−NA(M(t+1)).N^{\mathrm{cmp} }(t)=N_{A}(M(t))+\sum_{j=1}^{J_{t} }\mathbf{1}\{e_{t,j}\neq 0\}-N_{A}(M(t+1)). |  |

Summing over t=0,…,H−1t=0,\ldots,H-1 yields

| V0(M0)=NA(M0)+supπ𝔼π[∑t=0H−1∑j=1Jt𝟏{et,j≠0}−NA(M(H))].V_{0}(M^{0})=N_{A}(M^{0})+\sup_{\pi}\mathbb{E}^{\pi}\!\left[\sum_{t=0}^{H-1}\sum_{j=1}^{J_{t} }\mathbf{1}\{e_{t,j}\neq 0\}-N_{A}(M(H))\right]. |  |

Maximizing completions is therefore equivalent to maximizing admissions minus the unfinished turns remaining at the terminal time HH.

Solving ([3.1](#S3.E1)) requires trading off immediate service against future cache reuse: routing determines where subsequent turns can reuse computations, while retention determines whether those caches remain available. Because these decisions interact across sessions through shared computation and memory limits, exact dynamic programming is intractable. The next section develops a fluid approximation that preserves these intertemporal interactions and leads to a tractable policy.

###### Remark 3.1 (Emergency intervention)

The formulation in ([3.1](#S3.E1)) describes normal operation. For theoretical analysis, we assume that a causal emergency rule can halt admissions and interrupt active turns before any endpoint exceeds capacity, with interrupted turns earning no completion reward. This rule serves solely to keep the policy well defined on exceptional sample paths and is not intended for practical implementation; our policy reserves capacity to make such interventions rare, and we bound their impact on performance separately.

## 4 The Fluid Approximation and Structural Insights

We develop a fluid approximation to characterize how anticipated cache reuse should govern current admission, routing, and retention decisions. Routing a turn determines where a conversation’s history can next be reused, whereas retention determines whether that history survives until the conversation returns. Theorem [4.1](#S4.Thmtheorem1) couples these decisions through endpoint-specific shadow prices for computation and memory together with each conversation’s continuation value.

For routing, the fluid model favors the endpoint with the highest bid, combining the value of serving the current turn, the cost of the resources it consumes, and the resulting change in continuation value. When endpoints face similar congestion, keeping a conversation at its cached endpoint avoids rebuilding its prefix. By contrast, a persistent congestion imbalance can justify migrating a conversation even when doing so makes the current turn more expensive: the rebuild penalty is incurred once, whereas lower congestion yields recurring savings over subsequent turns. Consequently, two conversations facing the same load imbalance may warrant different routes depending on their remaining turn horizons.

For retention, the fluid model preserves an idle cache whenever the continuation value it protects exceeds the one-epoch opportunity cost of the memory it occupies. This trade-off explains why intermediate-length prefixes can deserve priority: short prefixes are inexpensive to rebuild, whereas very long prefixes may consume more memory than a conversation’s remaining turns can justify. Return timing matters as well: when tool execution takes a predictable amount of time, a session that has already been idle for several epochs may be the closest to returning.

These structural insights directly guide the design of the practical algorithm PARK in Section [5.3](#S5.SS3) later. Its admission and routing controller updates resource prices online and approximates the continuation benefit of migration by comparing the cost of one subsequent warm turn across endpoints. Meanwhile, its cache manager ranks idle prefixes by their estimated reuse benefit per unit of memory and time, accounting for both prefix length and the effective waiting time per successful reuse.

### 4.1 The Fluid Linear Program

Replacing random quantities with their expectations and discrete decisions with continuous fractions does not immediately yield a linear program. To see why, let ms​(t)m_{s}(t) denote the fluid population in state ss (with ms​(0)=Ms0m_{s}(0)=M_{s}^{0}), and let αs,e​(t)\alpha_{s,e}(t) be the fraction of arriving state-ss prompts routed to endpoint ee. The resulting execution load is cs,e​(t)​[ps​(t)​ms​(t)+νs​(t)]​αs,e​(t),c_{s,e}(t)\bigl[p_{s}(t)m_{s}(t)+\nu_{s}(t)\bigr]\alpha_{s,e}(t), where νs​(t)\nu_{s}(t) is the expected number of new state-ss arrivals and cs,e​(t)c_{s,e}(t) is the conditional mean execution requirement of a state-ss prompt admitted to ee. Because both the future population ms​(t)m_{s}(t) and the routing fraction αs,e​(t)\alpha_{s,e}(t) depend on policy decisions, their product is bilinear. An analogous nonlinearity arises when multiplying the post-service idle population by the fraction of caches retained.

To restore linearity, we instead optimize directly over state–action flow volumes: the total mass of prompts routed and caches retained in each state. This reformulation makes both resource consumption and population dynamics linear while preserving how current decisions govern future cache availability. We first present the resulting linear program, and then use its dual prices to derive routing and retention principles that account for a conversation’s future turns.

##### Arrival and routing flows.

Let ys,e​(t)y_{s,e}(t) denote the volume of state-ss prompts assigned to action e∈ℰ0e\in\mathcal{E}_{0} in epoch tt, where e=0e=0 represents rejection. Arrival conservation requires

| ∑e∈ℰ0ys,e​(t)=ps​(t)​ms​(t)+νs​(t),s∈𝒮I.\sum_{e\in\mathcal{E}_{0} }y_{s,e}(t)=p_{s}(t)m_{s}(t)+\nu_{s}(t),\qquad s\in\mathcal{S}^{I}. | (4.1) |

Because new sessions enter without a cache, νs​(t)=0\nu_{s}(t)=0 whenever o⁡(s)≠0o(s)\neq 0. The remaining population (1−ps​(t))​ms​(t)(1-p_{s}(t))m_{s}(t) consists of idle sessions that submit no prompt during epoch tt.

##### Population after service.

Let m~s′​(t+1)\widetilde{m}_{s^{\prime} }(t+1) be the pre-retention population in live state s′s^{\prime} at the end of epoch tt, after service and session transitions. Applying the transition kernels from Section [3](#S3) gives

| m~s′​(t+1)=\displaystyle\widetilde{m}_{s^{\prime} }(t+1)={} | ∑s∈𝒮Ams​(t)​QtA​(s,s′)+∑s∈𝒮I(1−ps​(t))​ms​(t)​QtI​(s,s′)\displaystyle\sum_{s\in\mathcal{S}^{A} }m_{s}(t)Q_{t}^{A}(s,s^{\prime})+\sum_{s\in\mathcal{S}^{I} }(1-p_{s}(t))m_{s}(t)Q_{t}^{I}(s,s^{\prime}) |  |  | +∑s∈𝒮I∑e∈ℰ0ys,e(t)Pte(s,s′),s′∈𝒮.\displaystyle+\sum_{s\in\mathcal{S}^{I} }\sum_{e\in\mathcal{E}_{0} }y_{s,e}(t)P_{t}^{e}(s,s^{\prime}),\qquad s^{\prime}\in\mathcal{S}. | (4.2) |

The three sums track transitions from initially active sessions, unprompted idle sessions, and sessions with arriving prompts, respectively.

##### Cache retention and the next population.

For each idle state s∈𝒮Is\in\mathcal{S}^{I}, let zs,K​(t)z_{s,\mathrm{K} }(t) and zs,D​(t)z_{s,\mathrm{D} }(t) denote the flow volumes retained and evicted at the epoch boundary, satisfying

| zs,K​(t)+zs,D​(t)=m~s​(t+1),s∈𝒮I.z_{s,\mathrm{K} }(t)+z_{s,\mathrm{D} }(t)=\widetilde{m}_{s}(t+1),\qquad s\in\mathcal{S}^{I}. | (4.3) |

Cache-free states satisfy zs,K​(t)=0z_{s,\mathrm{K} }(t)=0, so all mass is assigned to eviction and remains unchanged. Recalling that 𝖤⁡(s)\mathsf{E}(s) maps an idle state ss to its cache-free counterpart with o=0o=0, the post-retention population is

| ms′(t+1)={m~s′​(t+1),s′∈𝒮A,zs′,K(t)+∑s∈𝒮I:𝖤⁡(s)=s′zs,D(t),s′∈𝒮I.m_{s^{\prime} }(t+1)=\begin{cases}\widetilde{m}_{s^{\prime} }(t+1),&s^{\prime}\in\mathcal{S}^{A},\\[3.0pt] z_{s^{\prime},\mathrm{K} }(t)+\displaystyle\sum_{\begin{subarray}{c}s\in\mathcal{S}^{I}:\\ \mathsf{E}(s)=s^{\prime}\end{subarray} }z_{s,\mathrm{D} }(t),&s^{\prime}\in\mathcal{S}^{I}.\end{cases} | (4.4) |

Retention thus preserves a session’s cache location, whereas eviction shifts its mass into the corresponding cache-free state.

##### Resource constraints.

Let ℓs,e​(t)\ell_{s,e}(t) denote the conditional mean execution requirement of an initially active state-ss session at endpoint ee, and recall that cs,e​(t)c_{s,e}(t) is the conditional mean execution requirement of a state-ss prompt admitted to ee. Per-epoch execution capacity requires

| ∑s∈𝒮Aℓs,e​(t)​ms​(t)+∑s∈𝒮Ics,e​(t)​ys,e​(t)≤Be,e∈ℰ.\sum_{s\in\mathcal{S}^{A} }\ell_{s,e}(t)m_{s}(t)+\sum_{s\in\mathcal{S}^{I} }c_{s,e}(t)y_{s,e}(t)\leq B_{e},\qquad e\in\mathcal{E}. | (4.5) |

Similarly, let κs,eact​(t)\kappa_{s,e}^{\mathrm{act} }(t) and κs,eadm​(t)\kappa_{s,e}^{\mathrm{adm} }(t) denote the conditional mean boundary-memory footprints of an initially active state-ss turn at endpoint ee and a state-ss prompt admitted to ee, respectively (both equal zero if the turn completes during the epoch). Letting bsb_{s} denote the idle cache size recorded in state ss, boundary memory capacity requires

| ∑s∈𝒮Aκs,eact(t)ms(t)+∑s∈𝒮Iκs,eadm(t)ys,e(t)+∑s∈𝒮I:o⁡(s)=ebszs,K(t)≤Ge,e∈ℰ.\sum_{s\in\mathcal{S}^{A} }\kappa_{s,e}^{\mathrm{act} }(t)m_{s}(t)+\sum_{s\in\mathcal{S}^{I} }\kappa_{s,e}^{\mathrm{adm} }(t)y_{s,e}(t)+\sum_{\begin{subarray}{c}s\in\mathcal{S}^{I}:\\ o(s)=e\end{subarray} }b_{s}z_{s,\mathrm{K} }(t)\leq G_{e},\qquad e\in\mathcal{E}. | (4.6) |

The three terms account for initially active turns, newly admitted turns, and retained idle caches, mirroring the stochastic memory constraint in ([3.1](#S3.E1)).

##### The remaining-horizon optimization problem.

Consider the remaining-horizon planning problem starting at epoch tt with population vector MM. Applying the completion accounting identity from Section [3](#S3), we maximize total admissions minus the terminal active population:

| 𝒱t​(M)=maxm,m~,y,z\displaystyle\mathcal{V}_{t}(M)=\max_{m,\widetilde{m},y,z} | ∑τ=tH−1∑s∈𝒮I∑e∈ℰys,e​(τ)−NA​(m⁡(H))\displaystyle\sum_{\tau=t}^{H-1}\sum_{s\in\mathcal{S}^{I} }\sum_{e\in\mathcal{E} }y_{s,e}(\tau)-N_{A}(m(H)) | (4.7) |
| subject to\displaystyle\text{subject to} | m⁡(t)=M,\displaystyle m(t)=M, |  |  | ([4.1](#S4.E1))–([4.6](#S4.E6)),\displaystyle\eqref{eq:fluid-routing-conservation}\text{--}\eqref{eq:fluid-memory}, | τ=t,…,H−1,\displaystyle\tau=t,\ldots,H-1, |  |  | zs,K​(τ)=0,\displaystyle z_{s,\mathrm{K} }(\tau)=0, | s∈𝒮I:o(s)=0,τ=t,…,H−1,\displaystyle s\in\mathcal{S}^{I}:\ o(s)=0,\quad\tau=t,\ldots,H-1, |  |  | m,m~,y,z≥0.\displaystyle m,\widetilde{m},y,z\geq 0. |  |

Total fluid completions equal NA​(M)+𝒱t​(M)N_{A}(M)+\mathcal{V}_{t}(M), and setting t=0t=0 and M=M0M=M^{0} recovers the initial planning problem.

This linear program links current routing and retention decisions to future service requirements through the evolving distribution of cache locations. Its dual shadow prices allow us to weigh the immediate resource cost of each action against the continuation value of the session state it creates, and we formalize this comparison next to derive routing and retention principles.

### 4.2 Bid Prices and the Value of Future Cache Reuse

Fix a feasible remaining-horizon LP ([4.7](#S4.E7)) starting at epoch t0t_{0} with population MM, and let

| λe​(t),γe​(t)≥0,e∈ℰ,t=t0,…,H−1,\lambda_{e}(t),\gamma_{e}(t)\geq 0,\qquad e\in\mathcal{E},\quad t=t_{0},\ldots,H-1, |  |

denote its optimal dual shadow prices for execution and memory capacity, respectively. All prices and values below refer to this same LP and may vary across epochs.

At these prices, let vs​(t+1)v_{s}(t+1) denote the continuation value of a session in state ss at the start of epoch t+1t+1, net of future dual resource charges and inclusive of the terminal penalty for unfinished turns in ([4.7](#S4.E7)). Let ws​(t)w_{s}(t) denote its pre-retention value at the end of epoch tt; Appendix [8.1](#S8.SS1) gives the backward recursion defining both value functions. For an idle state ss with cache owner ee, let s0=𝖤⁡(s)s^{0}=\mathsf{E}(s) be the corresponding cache-free state. Retaining the cache yields continuation gain Δs​(t+1)=vs​(t+1)−vs0​(t+1)\Delta_{s}(t+1)=v_{s}(t+1)-v_{s^{0} }(t+1) at boundary memory cost γe​(t)​bs\gamma_{e}(t)b_{s}, whereas eviction transitions the session to s0s^{0}. Consequently,

| ws​(t)=max⁡{vs0​(t+1),vs​(t+1)−γe​(t)​bs}.w_{s}(t)=\max\bigl\{v_{s^{0} }(t+1),\,v_{s}(t+1)-\gamma_{e}(t)b_{s}\bigr\}. | (4.8) |

For active and cache-free idle states, ws​(t)=vs​(t+1)w_{s}(t)=v_{s}(t+1).

##### The bid-price characterization.

For a state-ss prompt routed to endpoint e∈ℰe\in\mathcal{E}, define its immediate dual resource cost by

| rs,e​(t)=λe​(t)​cs,e​(t)+γe​(t)​κs,eadm​(t).r_{s,e}(t)=\lambda_{e}(t)c_{s,e}(t)+\gamma_{e}(t)\kappa_{s,e}^{\mathrm{adm} }(t). | (4.9) |

The net value of admitting the prompt to endpoint ee relative to rejection, termed its *bid*, is

| ℬs,e​(t)=1−rs,e​(t)+∑s′∈𝒮[Pte​(s,s′)−Pt0​(s,s′)]​ws′​(t),e∈ℰ,\mathcal{B}_{s,e}(t)=1-r_{s,e}(t)+\sum_{s^{\prime}\in\mathcal{S} }\bigl[P_{t}^{e}(s,s^{\prime})-P_{t}^{0}(s,s^{\prime})\bigr]w_{s^{\prime} }(t),\qquad e\in\mathcal{E}, | (4.10) |

with ℬs,0​(t)=0\mathcal{B}_{s,0}(t)=0. The three terms in ([4.10](#S4.E10)) capture the unit admission reward, the immediate dual resource cost, and the net change in expected continuation value relative to rejection.

The next theorem characterizes optimal fluid routing and retention decisions in terms of these bids and shadow prices; its proof appears in Appendix [8.2](#S8.SS2).

###### Theorem 4.1 (Optimal routing and retention rules)

For any optimal fluid solution and the dual prices above:

1. a.

A positive routing flow ys,e​(t)>0y_{s,e}(t)>0 uses an action maximizing ℬs,e​(t)\mathcal{B}_{s,e}(t) over ℰ0\mathcal{E}_{0}.

2. b.

For a cached idle state with positive pre-retention population, its cache is retained if Δs​(t+1)>γo⁡(s)​(t)​bs\Delta_{s}(t+1)>\gamma_{o(s)}(t)b_{s} and evicted if the inequality is reversed.

At equality, the flow and capacity constraints determine the feasible allocation among tied actions.

##### When routing should follow the existing cache.

For any two endpoints e1,e2∈ℰe_{1},e_{2}\in\mathcal{E}, define their continuation-value differential by Θs;e1,e2​(t)=∑s′∈𝒮[Pte1​(s,s′)−Pte2​(s,s′)]​ws′​(t).\Theta_{s;e_{1},e_{2} }(t)=\sum_{s^{\prime}\in\mathcal{S} }\bigl[P_{t}^{e_{1} }(s,s^{\prime})-P_{t}^{e_{2} }(s,s^{\prime})\bigr]w_{s^{\prime} }(t). Comparing bids via ([4.10](#S4.E10)) gives

| ℬs,e1(t)≥ℬs,e2(t)⟺Θs;e1,e2(t)≥rs,e1(t)−rs,e2(t).\mathcal{B}_{s,e_{1} }(t)\geq\mathcal{B}_{s,e_{2} }(t)\quad\Longleftrightarrow\quad\Theta_{s;e_{1},e_{2} }(t)\geq r_{s,e_{1} }(t)-r_{s,e_{2} }(t). | (4.11) |

Thus, routing to e1e_{1} rather than e2e_{2} is optimal whenever its continuation-value advantage outweighs any higher immediate resource cost.

Suppose endpoint e2e_{2} holds the session’s cache. When shadow prices and future service conditions are similar across endpoints, cache reuse lowers cs,e2​(t)c_{s,e_{2} }(t) and makes e2e_{2} cheaper to use, favoring warm routing. However, if e2e_{2} becomes sufficiently congested, its higher shadow prices raise rs,e2​(t)r_{s,e_{2} }(t) and depress future continuation values there, making migration to a less loaded endpoint e1e_{1} worthwhile despite the upfront cost of rebuilding the cache. This trade-off mirrors the intuition behind SGLang’s cache_aware routing rule [SGLang (2026)](#bib.bib9), which prioritizes cache locality when server loads are balanced but switches to the least-loaded endpoint once load imbalance exceeds a threshold.

Condition ([4.11](#S4.E11)) also highlights the role of remaining conversation length. Serving the current turn at e1e_{1} establishes a warm cache there for subsequent turns; if e1e_{1} is expected to remain less congested, those future turns yield recurring savings that amortize the one-time rebuild cost. Migration is therefore attractive for a conversation with many turns remaining, whereas it will not pay off for a session nearing completion. Consequently, the congestion gap needed to justify rerouting depends jointly on expected remaining turns, the persistence of the destination’s cost advantage, and the memory price of retaining the newly built cache.

While routing determines where the next cache is created, retention determines whether it remains available for reuse. The next subsection uses Theorem [4.1](#S4.Thmtheorem1).b to examine how cache length, idle age, and return timing govern which caches should be retained.

### 4.3 Which Idle Caches Should Be Retained?

An idle cache occupies memory now to save computation when the next prompt arrives. Theorem [4.1](#S4.Thmtheorem1).b compares this future benefit against the boundary memory charge: retain the cache when Δs​(t+1)>γo⁡(s)​(t)​bs\Delta_{s}(t+1)>\gamma_{o(s)}(t)b_{s}, and evict it when the inequality is reversed. We use this comparison to examine how *cache length*, *return timing*, and *idle age* govern the value of retaining an idle cache.

Fix an idle cache at endpoint ee at the boundary ending epoch tt, with prefix length L>0L>0 and memory footprint bs=β​Lb_{s}=\beta L (β>0\beta>0). There are N=H−t−1≥1N=H-t-1\geq 1 remaining prompt epochs. Let TT denote the number of epochs until the next prompt, with T=∞T=\infty if the session does not return within the horizon. For tractability, suppose the endpoint’s memory shadow price remains constant at γ>0\gamma>0 across waiting boundaries; Appendix [8.3](#S8.SS3) provides exact conditions and extends the analysis to time-varying prices.

##### The cost of waiting for reuse.

Suppose we retain the cache for at most uu epochs, evicting it if no prompt arrives by then. Over this waiting window, the expected storage duration is 𝔼⁡[min⁡(T,u)]\mathbb{E}[\min(T,u)] and the probability of reusing the cache before eviction is ℙ⁡(T≤u)\mathbb{P}(T\leq u). Define the *effective waiting time* per cached return by

| deff=min1≤u≤Nℙ⁡(T≤u)>0⁡𝔼⁡[min⁡(T,u)]ℙ⁡(T≤u),d_{\mathrm{eff} }=\min_{\begin{subarray}{c}1\leq u\leq N\\ \mathbb{P}(T\leq u)>0\end{subarray} }\frac{\mathbb{E}[\min(T,u)]}{\mathbb{P}(T\leq u)}, | (4.12) |

with deff=∞d_{\mathrm{eff} }=\infty when no return is possible (in which case immediate eviction is optimal). Thus, deffd_{\mathrm{eff} } measures the minimum expected storage time per successful cache reuse across all stopping deadlines uu. For example, if a prompt arrives deterministically in five epochs, then deff=5d_{\mathrm{eff} }=5, so retaining the cache can be optimal even when an immediate return in the next epoch has probability zero. For random return times, deffd_{\mathrm{eff} } incorporates the option to abandon waiting early and therefore differs from the unconditional mean 𝔼⁡[T]\mathbb{E}[T].

##### Conditions for keeping or evicting a cache.

For a session with a positive probability of return, let R<∞R<\infty uniformly bound its expected remaining completions under any admissible policy, conditional on the history and chosen route at a cached return or at the first cold admission after eviction. Suppose further that, following eviction, the first cold admission incurs an expected execution charge of at least

| λ¯​(a1​L+a2​L2),a1≥0,a2>0,λ¯≥0,\underline{\lambda}(a_{1}L+a_{2}L^{2}),\qquad a_{1}\geq 0,\quad a_{2}>0,\quad\underline{\lambda}\geq 0, | (4.13) |

where λ¯\underline{\lambda} lower-bounds the execution shadow price and the linear and quadratic terms capture the computation required to rebuild the lost prefix (see, e.g., [Vaswani et al. 2017](#bib.bib7); [Hoffmann et al. 2022](#bib.bib8)). When the session instead returns with its cache intact, its continuation value equals expected future completions minus future execution and memory charges; let ε⁡(L)\varepsilon(L) uniformly bound how far this value falls below RR across all feasible return dates. A smaller ε⁡(L)\varepsilon(L) thus indicates that retaining the cache preserves more of the session’s potential completion value (Appendix [8.3.1](#S8.SS3.SSS1) formalizes ε⁡(L)\varepsilon(L) and provides explicit upper bounds).

The following proposition establishes sufficient conditions for fluid retention and eviction, showing how cache length and return timing jointly govern eviction; its proof appears in Appendix [8.3.2](#S8.SS3.SSS2).

###### Proposition 4.2

Under the preceding setting, the following are sufficient conditions for the fluid retention decision.

- •

For long cache,

| γ​bs​deff>R⟹evict.\gamma b_{s}d_{\mathrm{eff} }>R\quad\Longrightarrow\quad\text{evict}. | (4.14) |

- •

For cache with intermediate length,

| γ​bs​deff+ε⁡(L)<min⁡{λ¯​(a1​L+a2​L2),R}⟹retain.\gamma b_{s}d_{\mathrm{eff} }+\varepsilon(L)<\min\{\underline{\lambda}(a_{1}L+a_{2}L^{2}),R\}\quad\Longrightarrow\quad\text{retain}. | (4.15) |

- •

For short cache, additionally suppose that, under each fixed routing action, cache reuse changes only execution cost, with savings at most λ¯e​(a1​L+a2​L2)\bar{\lambda}_{e}(a_{1}L+a_{2}L^{2}), where λ¯e≥0\bar{\lambda}_{e}\geq 0. Then

| λ¯e​(a1+a2​L)<β​γ​deff⟹evict.\bar{\lambda}_{e}(a_{1}+a_{2}L)<\beta\gamma d_{\mathrm{eff} }\quad\Longrightarrow\quad\text{evict}. | (4.16) |

Condition ([4.15](#S4.E15)) compares the minimum storage cost per cached return against a lower bound on the net value preserved by the cache, whereas ([4.14](#S4.E14)) and ([4.16](#S4.E16)) reverse this comparison using upper bounds on that benefit. Proposition [4.2](#S4.Thmtheorem2) yields three structural implications.

##### Why intermediate lengths can be worth protecting.

- •

Short caches save too little computation. When prefix-recomputation savings are primarily quadratic in length (a1≈0a_{1}\approx 0), reuse savings shrink faster than linear storage costs as LL decreases. Under the additional service assumption, ([4.16](#S4.E16)) implies that sufficiently short caches are cheaper to rebuild than to retain, holding return prospects and shadow prices fixed.

- •

Very long caches consume too much memory. By ([4.14](#S4.E14)), retaining a cache is suboptimal whenever L>R/(β​γ​deff)L>R/(\beta\gamma d_{\mathrm{eff} }). Even a costly rebuild cannot justify storage if the remaining conversation offers too few expected completions RR to amortize the memory rent.

- •

Intermediate-length caches merit highest retention priority. Caches of moderate length are expensive enough to rebuild yet compact enough to store profitably. Appendix [8.3.3](#S8.SS3.SSS3) derives an explicit interval of protected cache lengths under simple service-cost bounds.

##### How waiting for reuse affects retention.

Cache value also depends on how long memory must be held before the next prompt arrives. Holding cache length, continuation bounds, and shadow prices fixed, a larger deffd_{\mathrm{eff} } increases the storage cost per return, tightening the retention condition ([4.15](#S4.E15)) and relaxing the eviction conditions ([4.14](#S4.E14))–([4.16](#S4.E16)). In particular, the maximum justifiable cache length R/(β​γ​deff)R/(\beta\gamma d_{\mathrm{eff} }) shrinks as deffd_{\mathrm{eff} } grows, so even a cache that is expensive to rebuild should be evicted if capturing its reuse requires excessive waiting.

##### When idle age is a useful guide.

An older cache is not automatically less valuable; what matters is what its idle age reveals about the residual time until the next prompt. For a given session class, let UU denote the total idle duration (in epochs) from the previous turn’s completion to the next prompt, possibly infinite. For a session already idle for aa epochs, define its conditional return probability (hazard rate) in the next epoch by

| p⁡(a,L)=ℙ⁡(U=a+1∣U>a,L).p(a,L)=\mathbb{P}(U=a+1\mid U>a,L). |  |

The following corollary characterizes how the effective waiting time deff​(a,L)d_{\mathrm{eff} }(a,L) varies with a session’s idle age aa under decreasing, increasing, and constant return-probability regimes.

###### Corollary 4.3

Compare idle ages at a fixed cache length and remaining horizon. If p⁡(a,L)p(a,L) is nonincreasing in aa, then

| deff​(a,L)=1/p⁡(a,L),d_{\mathrm{eff} }(a,L)=1/p(a,L), |  |

with 1/0=∞1/0=\infty, and deffd_{\mathrm{eff} } is nondecreasing in age. If p⁡(a,L)p(a,L) is nondecreasing in aa, then deffd_{\mathrm{eff} } is nonincreasing in age. If p⁡(a,L)p(a,L) is constant in aa, then deffd_{\mathrm{eff} } is independent of age.

Because a larger deffd_{\mathrm{eff} } favors eviction, Corollary [4.3](#S4.Thmtheorem3) explains when *least-recently-used* (LRU; see, e.g., [Mattson et al. 1970](#bib.bib36); [Zheng et al. 2024](#bib.bib35)) eviction is effective and when it fails. When the return hazard p⁡(a,L)p(a,L) decreases with idle age, meaning longer inactivity signals a less imminent return, deffd_{\mathrm{eff} } increases with aa, making LRU sensible. Conversely, when a prompt is expected after a bounded processing or tool-execution delay, the return hazard increases with age: an older session is closer to returning, so LRU can prematurely evict a cache that is about to be reused. Combining cache length with return-time behavior therefore provides a sharper eviction criterion than recency alone.

The routing and retention principles developed in this section characterize optimal decisions in the deterministic fluid model. Implementing these insights in a stochastic system requires safeguarding against random fluctuations in arrivals, service durations, and memory footprints. The next section introduces a buffer-reserve policy that translates the fluid solution into online decisions and proves that its performance loss relative to the fluid benchmark grows sublinearly with system scale.

## 5 A Fluid-Based Policy: Theory and Implementation

In this section, we first present a buffer-reserve policy that implements the fluid solution and establish its asymptotic performance guarantee, and we then adapt its decision rules for practical cluster deployment. The buffer-reserve policy inherits the fluid model’s bid-price structure. For routing, an endpoint’s bid weighs the value of serving a turn, including future cache reuse, against its shadow cost of computation and memory. For retention, an idle cache is kept whenever its continuation benefit exceeds the shadow cost of the memory it occupies. Building on this logic, our practical algorithm, PARK (described in Section [5.3](#S5.SS3)), approximates these comparisons using online resource prices and a one-turn lookahead for admission and routing, alongside an index of expected reuse benefit per unit of memory and time for cache retention.

### 5.1 The Buffer-Reserve Policy

The fluid LP plans resource allocation using conditional expectations, whereas actual arrivals, execution requirements, and memory footprints fluctuate around their means. Allocating full nominal capacity can therefore trigger an overload within the current epoch that re-solving at the next epoch cannot undo. Multi-turn service compounds this risk across epochs: unfinished turns carry inherited resource commitments into future epochs that cannot be shed by rejecting new prompts, while random completions govern when and where idle caches appear. To guard against both within-epoch spikes and multi-turn population drift, we pair progressive capacity reserves with epoch-by-epoch reoptimization.

Fix a reserve parameter r>0r>0. When solving the fluid LP at epoch tt, we reduce the available capacities at each remaining epoch τ\tau to

| Be−,t(τ)=Be−(τ−t+1)r,Ge−,t(τ)=Ge−(τ−t+1)r,τ=t,…,H−1.B_{e}^{-,t}(\tau)=B_{e}-(\tau-t+1)r,\qquad G_{e}^{-,t}(\tau)=G_{e}-(\tau-t+1)r,\qquad\tau=t,\ldots,H-1. | (5.1) |

Thus, epoch tt holds back rr units of each resource, and the buffer grows linearly across future epochs. When the LP is re-solved at t+1t+1 from the observed population M⁡(t+1)M(t+1), each future epoch τ≥t+1\tau\geq t+1 regains rr units of capacity relative to the previous plan. This released slack ensures recourse feasibility when realized populations, particularly ongoing active turns, exceed their fluid predictions, while reoptimization adapts routing and retention quotas to realized cache locations.

Algorithm [1](#algorithm1) converts the current-epoch fluid flows into rounded integer quotas, making immediate routing decisions upon arrival and boundary retention decisions after service outcomes are observed. Whenever a capacity intervention is required or the re-solved LP becomes infeasible, the causal emergency rule from Section 3 applies.

Algorithm 1  Buffer-reserve fluid policy

At each epoch tt, until an emergency occurs:

1. 1.

Plan. Solve ([4.7](#S4.E7)) from M⁡(t)M(t) with capacities ([5.1](#S5.E1)). If infeasible, invoke the emergency rule. Otherwise, select an optimal solution via a fixed deterministic tie-breaking rule, and denote its current-epoch flows by ys,e​(t)y_{s,e}(t) and zs,K​(t)z_{s,\mathrm{K} }(t).

2. 2.

Route. Upon arrival jj in state st,js_{t,j}, assign et,j=ee_{t,j}=e to the first endpoint e∈ℰe\in\mathcal{E} in a fixed state-specific order that has remaining quota:

| ∑i=1j−1𝟏​{st,i=st,j,et,i=e}<⌊yst,j,e​(t)⌋.\sum_{i=1}^{j-1}\mathbf{1}\{s_{t,i}=s_{t,j},\ e_{t,i}=e\}<\lfloor y_{s_{t,j},e}(t)\rfloor. |  |

If no such endpoint exists, reject the prompt (et,j=0e_{t,j}=0). Unused quotas expire at the epoch boundary.

3. 3.

Retain. Observe the pre-retention states s~i​(t+1)\widetilde{s}_{i}(t+1), including newly completed sessions. For each idle state ss with o⁡(s)=e≠0o(s)=e\neq 0, retain ⌊zs,K​(t)⌋\lfloor z_{s,\mathrm{K} }(t)\rfloor caches (or all available caches if fewer exist) in a fixed session order, forming ℐe​(t)\mathcal{I}_{e}(t). Evict all remaining idle caches, update M⁡(t+1)M(t+1), and proceed to epoch t+1t+1.

##### Connection to bid-price control.

By Theorem [4.1](#S4.Thmtheorem1), positive flows in the buffered LP follow the optimal bid-price routing and retention comparisons under the buffered dual prices, while the flow magnitudes resolve ties among indifferent actions and enforce capacity limits. Algorithm [1](#algorithm1) implements these primal–dual decisions through rounded quotas that are refreshed at every reoptimization.

### 5.2 Scaling and Performance Guarantee

To evaluate the policy in large-scale deployments where servers house multiple GPUs and support many concurrent sessions, we analyze an asymptotic regime in which demand and capacity grow proportionally with a scale parameter n≥2n\geq 2. Specifically, in system nn, endpoint capacities and expected new-session arrivals scale as

| Be(n)=n​Be,Ge(n)=n​Ge,𝔼⁡[Ξs(n)​(τ)∣ℱτ]=n​νs​(τ),B_{e}^{(n)}=nB_{e},\qquad G_{e}^{(n)}=nG_{e},\qquad\mathbb{E}[\Xi_{s}^{(n)}(\tau)\mid\mathcal{F}_{\tau}]=n\nu_{s}(\tau), | (5.2) |

where Ξs(n)​(τ)\Xi_{s}^{(n)}(\tau) counts new state-ss sessions entering in epoch τ\tau and ℱτ\mathcal{F}_{\tau} denotes the history observed up to the start of epoch τ\tau. The set of endpoints ℰ\mathcal{E}, state space 𝒮\mathcal{S}, horizon HH, and all per-session resource and transition laws remain fixed, while normalized initial populations lie in a bounded set ‖m‖1≤K0\|m\|_{1}\leq K_{0} independent of nn.

The following assumption bounds tail fluctuations in new-session arrivals.

###### Assumption 5.1

For every state ss, epoch τ\tau, and u≥0u\geq 0,

| ℙ⁡(|Ξs(n)​(τ)−n​νs​(τ)|>u|ℱτ)≤C0​exp⁡{−u2C0​n},\mathbb{P}\!\left(|\Xi_{s}^{(n)}(\tau)-n\nu_{s}(\tau)|>u\,\middle|\,\mathcal{F}_{\tau}\right)\leq C_{0}\exp\!\left\{-\frac{u^{2} }{C_{0}n}\right\}, |  |

where C0>0C_{0}>0 is independent of nn and the observed history.

This sub-Gaussian concentration holds, for instance, when arrivals originate from O⁡(n)O(n) independent user sources, each generating a bounded number of new sessions per epoch conditional on ℱτ\mathcal{F}_{\tau}, in which case Hoeffding’s inequality yields the bound.

In system nn, we set the capacity reserve to

| rn=b​n​log⁡n,r_{n}=b\sqrt{n\log n}, | (5.3) |

for a fixed constant b>0b>0, and apply Algorithm [1](#algorithm1) with scaled capacities n​BenB_{e} and n​GenG_{e} and reserve r=rnr=r_{n} in ([5.1](#S5.E1)). Starting at epoch tt from population M=n​mM=nm, let Vt,nBR​(n​m)V_{t,n}^{\mathrm{BR} }(nm) denote the policy’s expected completions through horizon HH, and let 𝖤n\mathsf{E}_{n} be the event that an emergency intervention occurs at any point over this period (including the terminal boundary). We benchmark performance against the unbuffered fluid value

| 𝒲t​(m)=NA​(m)+𝒱t​(m),\mathcal{W}_{t}(m)=N_{A}(m)+\mathcal{V}_{t}(m), |  |

where 𝒱t​(m)\mathcal{V}_{t}(m) is the optimal value of ([4.7](#S4.E7)) under nominal capacities Be,GeB_{e},G_{e} and arrival rates νs​(τ)\nu_{s}(\tau) without reserves. By linearity, n​𝒲t​(m)n\mathcal{W}_{t}(m) is the fluid benchmark for system nn. The following theorem shows that the buffer-reserve policy avoids capacity emergencies with high probability and tracks this fluid benchmark within O~​(n)\widetilde{O}(\sqrt{n}) completions.

###### Theorem 5.2

Under Assumption [5.1](#S5.Thmtheorem1), choose bb sufficiently large. Then for all sufficiently large nn and any normalized initial population mm for which the initial buffered LP is feasible:

1. (i)

The policy is nonanticipative, satisfies all resource capacities (with the emergency rule), and incurs an emergency intervention with probability at most ℙBR​(𝖤n)≤n−2\mathbb{P}^{\mathrm{BR} }(\mathsf{E}_{n})\leq n^{-2}.

2. (ii)

Its expected completions satisfy

| n​𝒲t​(m)−Vt,nBR​(n​m)≤C​n​log⁡n,n\mathcal{W}_{t}(m)-V_{t,n}^{\mathrm{BR} }(nm)\leq C\sqrt{n\log n}, | (5.4) |

where C>0C>0 is independent of nn and mm.

Theorem [5.2](#S5.Thmtheorem2) establishes an O~​(n)\widetilde{O}(\sqrt{n}) additive shortfall relative to the fluid benchmark; dividing ([5.4](#S5.E4)) by nn gives

| 𝒲t​(m)−Vt,nBR​(n​m)n≤C​log⁡nn,\mathcal{W}_{t}(m)-\frac{V_{t,n}^{\mathrm{BR} }(nm)}{n}\leq C\sqrt{\frac{\log n}{n} }, |  |

so the per-unit performance loss vanishes as nn grows. The proof in Appendix [9](#S9) decomposes the performance gap into three components: quota rounding and stochastic fluctuations in arrivals and transitions contribute O⁡(n)O(\sqrt{n}), the capacity reserve rnr_{n} sacrifices O⁡(n​log⁡n)O(\sqrt{n\log n}), and rare emergency interventions contribute O⁡(1/n)O(1/n). Setting rn=b​n​log⁡nr_{n}=b\sqrt{n\log n} balances these effects: it provides enough slack at each reoptimization to absorb drift in unfinished work and preserve LP feasibility with high probability, while adapting routing and retention quotas to realized cache locations.

###### Remark 5.3 (Asymptotic optimality)

Theorem [5.2](#S5.Thmtheorem2) can also yield an asymptotic optimality guarantee when all policies have access to the same emergency rule. For this comparison, we charge each policy a fixed penalty per interrupted turn, large enough to cover the benefit of freeing capacity. The emergency rule is a theoretical safeguard: the buffer-reserve policy reserves enough capacity that it needs to interrupt service only on rare sample paths. Its expected total penalty therefore vanishes as the system grows, and its expected completions net of penalties are within O⁡(n​log⁡n)O(\sqrt{n\log n}) of the best feasible policy. Appendix [9](#S9) gives the proof.

### 5.3 Practical Implementation: Asynchronous Primal–Dual Control and Index Eviction

The buffer-reserve policy (Algorithm [1](#algorithm1)) operates in synchronous epochs, observes the full system state before each decision, re-solves a multi-epoch linear program at every step, and directly enforces both routing and cache eviction. While these abstractions facilitate theoretical analysis, production LLM serving clusters differ in three operational respects:

1. (i)

*Asynchronous arrivals and delayed state updates:* Prompts arrive continuously between control updates, while endpoint utilization snapshots arrive with delay, making it computationally prohibitive to re-solve a multi-epoch LP at every arrival.

2. (ii)

*Decoupled admission and dispatch:* Because routing decisions precede actual client dispatch, the controller must reserve capacity through short-lived *admission offers* to prevent concurrent requests from double-booking resources.

3. (iii)

*Engine-local cache reclamation:* In production inference engines (such as vLLM; see, e.g., [vLLM 2026](#bib.bib11)), the central router does not forcibly evict KV blocks; instead, each endpoint’s local memory manager reclaims unpinned idle blocks on demand whenever active generation requires space.

To bridge these gaps while preserving the economic structure of Theorem [4.1](#S4.Thmtheorem1) and Algorithm [1](#algorithm1), we pair an event-driven admission and routing controller (approximating the bid-price rule in Theorem [4.1](#S4.Thmtheorem1).a) with an endpoint-local retention index (approximating the retention rule in Theorem [4.1](#S4.Thmtheorem1).b). Rather than re-solving the full fluid LP, the central controller maintains shadow prices λe≥0\lambda_{e}\geq 0 for computation and γe≥0\gamma_{e}\geq 0 for active memory at each endpoint e∈ℰe\in\mathcal{E}, uses them to evaluate bid scores, and updates them via projected subgradient steps on excess desired demand. Simultaneously, each endpoint ranks reclaimable idle caches using a Gittins-style value-per-byte-epoch index derived from Section [4.3](#S4.SS3). We refer to the resulting integrated policy as PARK (summarized in Algorithm [2](#algorithm2)), with experimental parameter values listed in Table [7](#S10.T7), and full implementation details included in Section [10.2](#S10.SS2), both in the Appendix. Table [1](#S5.T1) contrasts how PARK and the buffer-reserve policy translate the two bid-price comparisons of Theorem [4.1](#S4.Thmtheorem1) into serving decisions.

Table 1: The buffer-reserve policy and PARK. Both charge for scarce resources and account for the value of future cache reuse.

| Decision  | Buffer-reserve policy (Algorithm [1](#algorithm1))  | PARK (Algorithm [2](#algorithm2))  |
| Resource prices  | Re-solving the buffered fluid LP each epoch yields shadow prices for computation and memory.  | Updated online via projected subgradient steps driven by excess desired demand for work and active KV memory.  |
| Routing  | The fluid bid accounts for current resource use and the change in continuation value over the remaining horizon.  | The bid accounts for predicted prefix reuse now and the priced cost of one subsequent warm turn after a migration.  |
| Admission  | Use the buffered plan to route arrivals, rejecting an arrival when its routes have no remaining quota.  | Offer an eligible endpoint with sufficient residual capacity; requests without a qualifying offer wait for reconsideration.  |
| Retention  | At each epoch boundary, weigh the continuation value of an idle cache against the memory charge for keeping it.  | When active work needs memory, reclaim the lowest-priority blocks, where priorities reflect reuse value per byte-epoch.  |

##### Admission and routing.

For a ready request ii and endpoint ee, let wi​ew_{ie} denote the estimated computation work for the uncached prompt and generated reply, and let mi​em_{ie} denote the estimated active KV-memory footprint. For a returning session, the controller credits expected prefix reuse only at its current cache owner oio_{i}. It assigns endpoint ee the bid score

| si​e=1+ωi−λe​wi​e−γe​mi​e+Δi​e.s_{ie}=1+\omega_{i}-\lambda_{e}w_{ie}-\gamma_{e}m_{ie}+\Delta_{ie}. | (5.5) |

Here, 11 represents the unit reward for serving the turn, ωi\omega_{i} is a bounded bonus that increases with waiting time prior to admission, and λe\lambda_{e} and γe\gamma_{e} price computation work and active memory, respectively. For a new session or a return to the current owner, Δi​e=0\Delta_{ie}=0. For a migration away from the owner, Δi​e=α⁡(Fi​oi−Fi​e)\Delta_{ie}=\alpha(F_{io_{i} }-F_{ie}), where Fi​eF_{ie} is the priced resource cost of serving one subsequent warm turn at endpoint ee and α\alpha is a lookahead weight. Thus, migrating a session incurs the immediate cost of rebuilding its prefix, but earns credit for lower congestion on the next turn.

The controller restricts eligibility to endpoints with recent status reports. A returning session may migrate only when the candidate destination exhibits a sustained load advantage, offers a sufficiently higher bid than the current owner, and has elapsed a minimum cooldown since its previous endpoint binding. Standard requests are processed in decreasing order of their best eligible bid: each receives an offer for its highest-bidding eligible route that has a nonnegative bid and sufficient residual capacity after accounting for ongoing work and outstanding offers, while unplaced requests remain held in queue. Overdue requests are processed first in arrival order and may bypass the bid nonnegativity check, subject to the same capacity limits.

##### Updating prices.

For each resource jj (computation work or active memory), let Ce​jC_{ej} denote the capacity budget at endpoint ee and De​jD_{ej} its desired load, comprising ongoing work, outstanding offers, and the demand of every ready request whose best eligible bid is nonnegative and selects ee, which is measured *before* capacity checks. Writing pe​jp_{ej} for the unit shadow price (λe\lambda_{e} or γe\gamma_{e}) and ze​j=Ce​j​pe​jz_{ej}=C_{ej}p_{ej} for its budget-scaled value, the controller updates prices with step size η>0\eta>0 via

| ze​j+=[ze​j+η⁡(De​j/Ce​j−1)]+.z_{ej}^{+}=\bigl[z_{ej}+\eta(D_{ej}/C_{ej}-1)\bigr]_{+}. | (5.6) |

Measuring desired demand prior to capacity filtering allows an endpoint’s shadow price to keep rising even after its admissions are capped.

##### KV cache retention and eviction.

For an idle prefix of length LL and idle age aa, let bs=β​Lb_{s}=\beta L denote its memory footprint and deff^​(a,L)\widehat{d_{\mathrm{eff} }}(a,L) the estimated holding time per successful reuse, as defined in ([4.12](#S4.E12)). Each endpoint evaluates the retention index

| I^​(L,a)=g^​(L,a)bs​deff^​(a,L),g^​(L,a)=min⁡{R^,λe​(a1​L+a2​L2)}.\widehat{I}(L,a)=\frac{\widehat{g}(L,a)}{b_{s}\,\widehat{d_{\mathrm{eff} }}(a,L)},\qquad\widehat{g}(L,a)=\min\{\widehat{R},\,\lambda_{e}(a_{1}L+a_{2}L^{2})\}. | (5.7) |

The numerator prices the work saved upon reuse at the estimated execution shadow price λe\lambda_{e}, using linear and quadratic rebuild-cost coefficients a1a_{1} and a2a_{2}, and caps the resulting benefit at a fixed reference value; the index is set to zero if no useful return is forecast. Because the memory allocator reclaims physical KV blocks rather than whole sessions, it quantizes each session’s index into a discrete priority and sums those priorities across all sessions sharing a given block. Unpinned, reclaimable blocks are bucketed by aggregate priority and evicted from the lowest nonempty bucket first, allowing shared prefix blocks to survive eviction even when individual sharing sessions have modest standalone priority.

Algorithm 2 PARK (Price-based Admission and Routing with KV-cache Retention)

*Central controller, each control round.*

1. 1.

Refresh endpoint loads and outstanding offers, and estimate the work and active memory for each ready request at each eligible destination.

2. 2.

Compute route bids using ([5.5](#S5.E5)), and record desired load at each request’s highest-bidding eligible destination whenever that bid is nonnegative, prior to capacity filtering.

3. 3.

Process overdue requests in arrival order, followed by standard requests in decreasing order of best eligible bid; issue an offer for each request’s highest-bidding qualifying route, reserve its capacity, and hold unplaced requests.

4. 4.

Update work and memory prices using ([5.6](#S5.E6)). When a client acts on an offer, recheck eligibility and capacity before dispatch, and release unused offers upon expiry.

*Endpoint allocator, whenever active work needs KV blocks.* Reclaim unpinned blocks from the lowest nonempty priority bucket until sufficient blocks are available or none remain eligible.

## 6 Experimental Results

We evaluate our framework using real multi-turn AI-agent workloads on large-scale GPU clusters. Section [6.1](#S6.SS1) describes the experimental environment, workload characteristics, benchmark policies, and performance metrics. Section [6.2](#S6.SS2) compares PARK (Algorithm [2](#algorithm2)) against standard routing and caching baselines across 16- and 128-GPU deployments. Finally, Section [6.3](#S6.SS3) isolates the two mechanisms driving these gains: value-aware cache retention and session-affine routing.

### 6.1 Experimental Setting, Workloads, and Benchmarks

##### Agent execution and cluster architecture.

In each experiment, a bounded-concurrency client manages a pool of *sessions*, each corresponding to one execution, or *rollout*, of an agent task. Within each session, the agent alternates between LLM inference calls and external tool execution, such as running shell commands or tests in containerized environments. Each admitted inference *request* initiates a turn, and all requests within a session carry the same persistent identifier.

All cluster experiments serve the same fixed Step 3.7 Flash checkpoint ([StepFun, 2026](#bib.bib2)), a mixture-of-experts (MoE) model with approximately 197 billion parameters, 45 decoder layers, and hidden dimension 4,096 (its 42 MoE layers each activate eight of 288 routed experts per token alongside one shared expert). Each serving replica spans eight H200 GPUs using tensor parallelism (TP8). Consequently, the 8-, 16-, and 128-GPU deployments provide one, two, and sixteen independently routable endpoints, respectively. No model weights are updated during measurement. A central CPU router queries the request-scheduler over gRPC for admission and endpoint selection, while vLLM manages token-level batching and physical KV blocks locally on each replica. Additional telemetry, instrumentation, and hyperparameter details appear in Appendix [10](#S10).

##### Workloads.

We evaluate two multi-turn software-engineering benchmarks:

- •

SWE: A production mixture of 2,645 software-engineering tasks drawn from SWE-Factory (1,632) ([Guo et al., 2026](#bib.bib3)), SWE-rebench-v2 (975) ([Badertdinov et al., 2026](#bib.bib4)), and Multi-SWE-RL (38) ([Zan et al., 2025](#bib.bib5); [ByteDance Seed, 2025](#bib.bib1)), spanning 2,641 distinct task identifiers across multiple programming languages.

- •

TB: A corpus of 1,468 distinct hard software-engineering tasks packaged in the Terminal-Bench 2.0 task format ([Merrill et al., 2026](#bib.bib6)) and run on the Terminus scaffold ([Merrill et al., 2026](#bib.bib6), Section 3).

Table [2](#S6.T2) and Figure [2](#S6.T2) summarize the two workloads in the three-hour PARK runs used for Table [4](#S6.T4). Although both workloads accumulate long prompt histories (averaging 43,168 prompt tokens per request on SWE and 36,254 on TB), their interaction patterns differ sharply. Completed SWE sessions average 71.87 turns with relatively short responses (mean 433.46 output tokens), creating frequent opportunities to reuse the conversation’s prefix across rapid tool calls. By contrast, completed TB sessions average 16.52 turns with responses approximately 5.3 times as long on average (2,290.16 output tokens), placing substantially heavier pressure on active decode concurrency and KV-cache capacity per turn.

| Statistic | SWE | TB |
| Total sessions | 2,244 | 2,521 |
| Completed sessions | 1,769 | 2,045 |
| Completed turns | 162,894 | 39,667 |
| Prompt tokens per turn | 40,841 / 95,359 | 35,373 / 91,361 |
| Output tokens per turn | 147 / 1,014 | 808 / 5,589 |

Table 2: Workload trajectories in the 16-GPU PARK runs of Table [4](#S6.T4). Paired entries give the median / 90th percentile. Figure 1: Empirical cumulative distributions of (left) model turns per completed session, and (right) output tokens per turn on SWE and TB.

##### Benchmark policies.

Table [3](#S6.T3) summarizes the six serving policies compared in our cluster experiments. All five baseline policies admit every arriving prompt immediately without holding and rely on vLLM’s native least-recently-used (LRU) eviction when an endpoint needs KV blocks; they differ only in how they select an endpoint. Let ReR_{e} and WeW_{e} denote running and waiting requests at endpoint ee, BeB_{e} its reported pending-prefill tokens, and Ue=P−min⁡{He,P−1}U_{e}=P-\min\{H_{e},P-1\} the estimated uncached prefill tokens for a prompt of length PP given longest witnessed local prefix HeH_{e}. The three queue- and prefill-based baselines minimize Re+WeR_{e}+W_{e} (*Shortest queue*), Re+4​WeR_{e}+4W_{e} (*Weighted queue*), and BeB_{e} (*Least prefill*), respectively. *SGLang routing* ports SGLang’s cache_aware_zmq endpoint-selection rule [SGLang (2026)](#bib.bib9) into our shared vLLM serving stack: it routes to the endpoint with the longest cached prefix match whenever the relative match exceeds 50%50\% and server load imbalance remains within configured thresholds, and otherwise selects the least-loaded endpoint. In contrast, PARK (Algorithm [2](#algorithm2)) couples shadow-price admission and routing with priority-bucket KV eviction. Exact tie-breaking and staleness rules appear in Appendix [10](#S10).

Table 3: Summary of evaluated policies.

| Policy | Admission and Routing Rule | KV Eviction Rule |
| Round robin | cyclic rotation across replicas | Native LRU |
| Shortest queue | arg⁡mine⁡(Re+We)\arg\min_{e}(R_{e}+W_{e}) | Native LRU |
| Weighted queue | arg⁡mine⁡(Re+4​We)\arg\min_{e}(R_{e}+4W_{e}) | Native LRU |
| Least prefill | arg⁡mine⁡Be\arg\min_{e}B_{e} | Native LRU |
| SGLang routing (port) | prefix-match threshold with load fallback | Native LRU |
| PARK (Algorithm [2](#algorithm2)) | Bid-price session-affine routing | Priority-bucket index |

##### Performance metrics.

Our primary serving metric is *output throughput* (generated tokens/s), defined as the aggregate rate at which output tokens are produced across all replicas—computed from each replica’s cumulative generated-token counter divided by elapsed wall-clock time, as recorded by an independent monitor (Appendix [10](#S10)). Because output throughput tracks continuous token generation while requests are decoding, whereas *turn throughput* (completed turns/min) registers only when a turn finishes, the two rates can diverge over a run: synchronized client release rounds or short tool-call replies produce sharp early spikes in completed turns/min with modest token/s, whereas long generations sustain high token/s at lower turn-completion rates. We therefore report output tokens/s alongside completed turns/min and completed sessions.

### 6.2 PARK Performance on Real Agent Workloads

##### 16-GPU policy comparison.

Table [4](#S6.T4) reports full-window performance across all six policies on the two-replica (16-GPU) deployment (three hours of measurement), and Figures [2](#S6.F2) and [3](#S6.F3) show the corresponding time-series trajectories on SWE and TB. On both workloads, PARK achieves the highest output throughput, delivering 6,575 tokens/s on SWE and 8,590 tokens/s on TB.

Table 4: Full-window performance on 16 H200 GPUs (two TP8 replicas). Each three-hour window starts at the first request admission.

| SWE | TB |
| Policy | Tokens/s | vs. Best Base | Turns/min | Tokens/s | vs. Best Base | Turns/min |
| Round robin | 1,505 | −71.6%-71.6\% | 215.8 | 5,261 | −14.2%-14.2\% | 136.9 |
| Shortest queue | 1,551 | −70.7%-70.7\% | 221.7 | 6,135 | 0.0%0.0\% | 156.9 |
| Weighted queue | 1,946 | −63.3%-63.3\% | 290.3 | 5,204 | −15.2%-15.2\% | 136.7 |
| Least prefill | 1,959 | −63.0%-63.0\% | 283.3 | 5,920 | −3.5%-3.5\% | 151.1 |
| SGLang routing (port) | 5,296 | 0.0%0.0\% | 716.9 | 5,509 | −10.2%-10.2\% | 140.6 |
| PARK | 6,575 | +24.2%\mathbf{+24.2\%} | 905.0 | 8,590 | +40.0%\mathbf{+40.0\%} | 220.4 |

Over the full three-hour window (Table [4](#S6.T4)), PARK outperforms the strongest measured baseline on each workload. On SWE, it reaches 6,575 tokens/s, 24.2%24.2\% above *SGLang routing* and 336.9%336.9\% above *Round robin*. On TB, it reaches 8,590 tokens/s, 40.0%40.0\% above *Shortest queue* and 63.3%63.3\% above *Round robin*. The identity of the strongest baseline changes with the workload, consistent with the trajectory differences in Table [2](#S6.T2). SWE sessions average about 72 turns, with short responses and repeated opportunities to reuse a conversation prefix. On SWE, *SGLang routing* achieves a 97.8%97.8\% prefix hit rate and 5,296 tokens/s, compared with 1,551–1,946 tokens/s for the two queue-based policies. On TB, where responses average 2,290 output tokens, *Shortest queue* leads the baselines at 6,135 tokens/s, ahead of *SGLang routing* at 5,509 tokens/s. Across these two regimes, PARK’s joint admission and routing policy also achieves the highest turn throughput, completing 905.0 turns/min on SWE and 220.4 turns/min on TB.

Figure 2: Time-series trajectories of output throughput, turn throughput, KV cache occupancy, and KV prefix hit rate on SWE (16 GPUs). Figure 3: Time-series trajectories of output throughput, turn throughput, KV cache occupancy, and KV prefix hit rate on TB (16 GPUs).

##### 128-GPU deployment.

To verify that PARK’s centralized primal–dual control and local eviction coordinate larger clusters under real agent traffic, we scale the deployment eightfold from two to sixteen TP8 replicas (128 GPUs) and increase the maximum number of concurrent sessions eightfold from 512 to 4,096 (Table [5](#S6.T5)). Over a three-hour measurement window, PARK sustains approximately 50,789 output tokens/s on SWE, substantially outperforming the baselines (Figure [4](#S6.F4)). The cluster completes 6,473 turns/min with a 97.42%97.42\% prefix cache hit rate and an average KV occupancy of 56.15%56.15\%, and during this window, 12,295 sessions finished. In a separate three-hour evaluation on TB at the same scale, PARK achieves 67,363 output tokens/s and 1,575 turns/min, with 13,563 completed sessions, while maintaining a 91.32%91.32\% prefix cache hit rate at an average KV occupancy of 41.04%41.04\%.

Table 5: Cluster configurations for the PARK scale-up evaluation.

| 16-GPU Deployment | 128-GPU Deployment |
| Inference GPUs | 16 | 128 |
| Routable TP8 replicas | 2 | 16 |
| GPUs per replica | 8 | 8 |
| Maximum pending sessions | 512 | 4,096 |
| Permitted sessions per replica | 256 | 256 |

Figure 4: Time-series trajectories of output throughput, turn throughput, KV cache occupancy, and KV prefix hit rate on SWE (128 GPUs).

### 6.3 Cache Retention and Routing Behavior

##### Single-replica cache-retention ablation.

To isolate the impact of index-based eviction from routing, we evaluate a single eight-GPU replica (E=1E=1) on SWE with fixed round-robin dispatch and a maximum of 256 pending sessions (five-minute warmup followed by 30 minutes of measurement). Both arms use identical vLLM asynchronous scheduling and chunked prefill; only the selection of reclaimable idle KV blocks differs between native LRU and our priority-bucket retention index (Section [5.3](#S5.SS3)).

Table 6: Single-replica (8-GPU) cache-retention ablation on SWE (30-minute measurement window).

| Metric | Native LRU | Retention Index |
| *Cache preservation* |
| Prior-prefix token loss (%) | 13.26 | 2.17 |
| Returning turns experiencing prefix loss (%) | 9.48 | 2.72 |
| Verified prefix rebuild (M tokens) | 30.77 | 6.62 |
| *Prefill computation* |
| Total scheduled prefill (M tokens) | 55.52 | 29.70 |
| Local prefill tokens per output token | 13.26 | 5.19 |
| *Throughput and latency* |
| Output throughput (tokens/s) | 2,326 | 3,179 |
| Completed model turns/min | 275.6 | 373.5 |
| Mean TTFT (s) | 25.56 | 16.49 |
| Mean ITL (ms) | 50.54 | 39.90 |
| Mean request latency (s) | 48.09 | 36.00 |

Table [6](#S6.T6) traces the causal chain from cache survival to serving throughput:

1. 1.

*Reduced prior-prefix loss:* By prioritizing intermediate-length prefixes with high expected reuse value per byte-epoch rather than evicting purely by recency, the retention index cuts prior-prefix token loss—the token-weighted share of previously verified prefix tokens missing when a session returns—from 13.26%13.26\% to 2.17%2.17\%, reducing verified prefix recomputation from 30.77M to 6.62M tokens.

2. 2.

*Lower prefill overhead:* Preserving resident prefixes cuts total scheduled prefill nearly in half (from 55.52M to 29.70M tokens), reducing prefill tokens processed per generated output token from 13.26 to 5.19.

3. 3.

*Higher throughput and lower latency:* Freeing compute capacity from redundant prefill raises output throughput by 36.7%36.7\% (from 2,326 to 3,179 tokens/s) and reduces mean time-to-first-token (TTFT) by 35.5%35.5\% (from 25.56 s to 16.49 s).

##### Multi-replica endpoint affinity and cache thrashing.

In multi-replica clusters, routing and retention reinforce one another: returning a session to its cache owner creates an opportunity for prefix reuse, which generates savings only if the prefix survives the inter-turn tool delay. In the three-hour, 16-GPU SWE runs, PARK switched replicas on 0.14%0.14\% of returning requests (222 of 161,218), compared with 50.14%50.14\% for *Round robin* (19,310 of 38,515). Panels C and D of Figures [2](#S6.F2) and [3](#S6.F3) illustrate the operational consequence across time: baselines such as *Shortest queue* accumulate high KV occupancy (Panel C) while suffering near-zero prefix hit rates (Panel D) because cross-replica switching and recency eviction continually thrash cached prefixes, whereas PARK maintains moderate KV occupancy (≈50%\approx 50\% on SWE) alongside a ≈98%\approx 98\% prefix hit rate.

## 7 Conclusion

Multi-turn AI agents transform LLM serving from stateless request dispatch into a dynamic resource-allocation problem with endogenous state: routing determines where a conversation’s prefix can next be reused, whereas cache retention determines whether that prefix survives inter-turn delays. By formulating a fluid approximation of this joint system, we characterized optimal admission, routing, and eviction through endpoint-specific shadow prices for computation and memory coupled with session continuation values (Theorem [4.1](#S4.Thmtheorem1)). Building on this decomposition, we developed a synchronous buffer-reserve policy (Algorithm [1](#algorithm1)) and proved that setting aside a capacity reserve of order n​log⁡n\sqrt{n\log n} keeps emergency interventions rare and achieves an O⁡(n​log⁡n)O(\sqrt{n\log n}) completion shortfall relative to the fluid benchmark (Theorem [5.2](#S5.Thmtheorem2)).

To bring these structural principles to production clusters characterized by asynchronous arrivals, delayed load reports, and engine-local memory management, we designed PARK (Algorithm [2](#algorithm2)). PARK pairs projected subgradient price updates and one-turn migration lookahead at a central controller with a priority-bucket KV retention index based on reuse value per byte-epoch at each endpoint. Across 16- and 128-GPU deployments serving multi-turn software-engineering workloads (Section [6](#S6)), PARK outperforms both load-balancing and prefix-aware baselines across contrasting interaction regimes, adapting between long-horizon, short-reply trajectories (SWE) and memory-intensive, long-generation trajectories (TB). The single-replica ablation demonstrates the benefit of value-aware cache retention, while the multi-replica measurements document PARK’s high prefix-reuse rates.
