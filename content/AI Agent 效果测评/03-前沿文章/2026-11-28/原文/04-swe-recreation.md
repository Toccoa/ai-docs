# 原文存档｜SWE-Recreation: Benchmarking Coding Agents for Software Recreation

> 来源：arXiv:2611.26311v1（cs.SE）　｜　日期：2026-11-19
> 原文链接：https://arxiv.org/abs/2611.26311
> 说明：本文件为原文存档（arXiv HTML 清洗后的纯文本，止于 References 之前），供与中文译文对照。

---

Abstract
Agents increasingly operate software and even write it, yet they are almost always told what to achieve: given a goal, a mock-up, or a demonstration. We ask whether an agent can instead understand an unfamiliar product by using it, and then rebuild it. The agent sees only rendered pixels and acts through pointer and keyboard, without access to the DOM, source, logs, or back-end. Within this interface, it explores, generates a replica, and checks its own work before evaluation. We present SWE-Recreation, a benchmark of 54 real applications (28 websites and 26 Android apps) with 1,446 hidden requirements describing multi-step, stateful workflows and explicit exclusions for behavior outside the reconstruction scope. A fixed judge grades workflows with pixel evidence; a separate post-hoc judge estimates exploration coverage. Across 54 evaluated applications, five frontier systems reach at most 0.530 weighted fidelity and 22.9% fully reproduced requirements under application-equal averaging. These descriptive results expose both exploration-evidence gaps and implementation shortfalls. Code and data are available at https://github.com/nologistic/recreate-anything.

1 Introduction
Language-model agents are learning to work with software from both sides. On one side, web and computer-use agents carry out long instructions inside live interfaces (Zhou et al., 2024; He et al., 2024; Xie et al., 2024; Deng et al., 2023; Qin et al., 2025; Xu et al., 2026b; Zhou et al., 2026); on the other, coding agents turn screenshots Zhao et al. (2026); Tang et al. (2025); Tang et al. (2026), specifications, and issues Xiao et al. (2026c) into working programs (Si et al., 2025; Lu et al., 2025; Jimenez et al., 2024). Both lines, however, rest on a quiet assumption: the agent is told what to achieve, whether through a stated goal, a supplied mock-up, or a demonstrated behavior. Human developers routinely face a harder situation—an unfamiliar product with no manual—and resolve it by using the product until they understand it well enough to build it themselves. Whether agents can do the same remains largely untested.
Figure 1: Comparison between SWE-Recreation and prior works.
Recent work has moved toward this setting but stops short in one of two ways. Interactive-reconstruction benchmarks replace the static screenshot with a recorded interaction video or annotated state transitions, then score a replica along a fixed trajectory (Xiao et al., 2025a; Chen et al., 2026; Xu et al., 2026a; Dai et al., 2026); the evidence is richer, but someone else has already chosen which behavior to show. Concurrent work lets the agent probe a running reference itself, but through code- and tool-level access to its internals (Alibaba Token Hub, 2026). The former relieves the agent of deciding what to look at; the latter lets it read the machine rather than the screen. Neither asks whether an agent can come to understand software the way a person does.
We study exactly this question through active black-box application reconstruction. An agent is given a running application it has never seen and may engage with it only as a human user can: it sees rendered pixels and acts through pointer and keyboard, with no access to the DOM, source, logs, or back-end. Within this human-like interface, it explores the application, builds a runnable replica, and checks its own work before the result is evaluated. Pixels and pointer input are the one interface every website and application exposes, whereas structured hooks are often missing or unusable in native, canvas-based, remote, or protected front ends; an agent that does without them can, in principle, operate wherever a person can. Withholding these shortcuts is also what makes the task a genuine test of autonomy: with no structured map of the interface and no human-authored hints, the agent must plan its own exploration and decide for itself when it has learned enough to build.
The same freedom that makes the task realistic also makes it hard, in ways that a supplied trajectory would conceal. Because the agent chooses its own observations, failure can enter at three distinct points: it may never discover a capability, misread what it observed, or understand a behavior yet fail to implement it. Each risk is aggravated by partial observability, by visual feedback whose cause is ambiguous—the same change on screen may reflect local UI state, shared data, validation, or persistence—and by a horizon that is long twice over, first in the exploration session and then in the stateful workflows to be rebuilt. Success therefore depends on autonomous exploration, sustained long-horizon planning and tool use, and the ability to compile scattered observations into a functionally faithful program.
To measure these abilities, we introduce SWE-Recreation, a benchmark built on real websites and mobile applications. Each target comes with a hidden, human-authored checklist of complete functional workflows. Each requirement specifies a concrete functionality, an ordered sequence of interaction steps, and the expected observable outcomes and state changes upon successful completion—such as filtering and then editing a persistent collection, or creating an object and confirming it across views. An explicit exclusion set covers behaviors that no single machine can faithfully reproduce, such as multi-user, payment, real-time, or generative features. A single fixed judge model evaluates each replica through the same human-like interface, but its interaction is adaptive: rather than replaying predefined scripts or fixed trajectories, the judge autonomously navigates the replica, exercises each specified workflow, and verifies the resulting behavior against the expected outcomes, citing pixel evidence for its grades. This adaptive evaluation accommodates diverse application structures and behaviorally equivalent implementations without requiring manually tailored evaluation scripts for individual tasks, while distinguishing functional replicas from static mock-ups. Beyond this headline fidelity, our metrics distinguish what an agent discovered from what it implemented and expose output that merely appears to work, making it possible to locate where, on the path from perception to code, an agent breaks down.
Evaluating five frontier agent systems shows that the task is far from solved: the strongest reaches a combined weighted fidelity of 0.530 and fully reproduces fewer than one requirement in four under application-equal averaging. Kimi and DeepSeek lead both platform strata, but the remaining ordering changes with the application mix. On the web, requirement-level analysis separates low credit from low exploration evidence: automation and recurrence receive the lowest mean credit, browsing and navigation the highest, and mathematical dependencies can fail even when exploration is evidenced.
Our contributions are threefold:
•	• A task. We formulate active black-box application reconstruction, in which an agent must discover an unfamiliar application’s functionality and rebuild it through a human-like interface alone, without privileged access or human-authored guidance.

•	• A benchmark. We build SWE-Recreation on 54 real web and mobile applications with 1,446 hidden requirements that stress multi-step state change, cross-view consistency, and persistence, together with an exclusion boundary for behavior that cannot be reproduced on a single machine.

•	• An evaluation protocol and study. We combine functional grading with post-hoc exploration estimates, and provide auditable requirement-level analyses of functional difficulty, exploration evidence, and implementation conditional on evidenced reach.

2 Related Work
Agents that use software.
Powered by strong multimodal models (Hurst et al., 2024; Bai et al., 2025), agents increasingly operate real software through its interface. Web agents follow instructions across live and reproducible websites (Deng et al., 2023; Zhou et al., 2024; Koh et al., 2024; He et al., 2024; Furuta et al., 2023), computer-use agents extend this to the desktop and to long-horizon, cross-application tasks (Xie et al., 2024; Yuan et al., 2026), and parallel efforts target mobile applications and general assistants (Rawles et al., 2024; Mialon et al., 2024). A supporting line builds the perception such control needs—screen parsing, web-page grounding, and native GUI action models (Lee et al., 2023; Liu et al., 2024; Wu et al., 2024; Qin et al., 2025)—typically organized around reason-and-act loops (Yao et al., 2023). In all of these, the agent is handed a goal and judged on whether it can execute that goal in an interface that already exists; it is never asked to recover, and then reproduce, the interface’s underlying specification.
Agents that build software.
A complementary line asks agents to produce software, but from an explicit specification. UI-to-code work turns a screenshot or design into front-end code and scores it against the original (Beltramelli, 2017; Laurençon et al., 2024; Si et al., 2025; Yun et al., 2024; Gui et al., 2025; Guo et al., 2024; Wan et al., 2024; Xiao et al., 2025b; Jiang et al., 2025; Yang et al., 2025; Xiao et al., 2026d; Xiao et al., 2026b; Le et al., 2026; Dang et al., 2025; Zhang et al., 2026); website- and application-generation benchmarks start from natural-language requirements or product briefs (Lu et al., 2025; He et al., 2026; Tran et al., 2026; Ran et al., 2025); and coding agents resolve issues or implement features in existing repositories (Jimenez et al., 2024; Yang et al., 2024a; Xia et al., 2025; Wang et al., 2025; Yang et al., 2024b; Yao et al., 2025; Jain et al., 2025). Across these settings the target is supplied—as a screenshot, a prototype, a requirement document, or an issue—so the challenge is faithful implementation of a known specification. In ours the specification is withheld and hidden inside a running application, so an agent must first discover it by interacting and only then implement it.
Reconstruction from observation, and our setting.
Closest to us is reconstruction from observed behavior. Interaction2Code (Xiao et al., 2025a) and InterWebCoder (Xiao et al., 2026a) condition on annotated state transitions, while IWR-Bench, Video2Code, and WebVR supply a recorded interaction video and score the replica along a fixed trajectory or visual rubric (Chen et al., 2026; Xu et al., 2026a; Dai et al., 2026); in each, the observations have already been chosen for the model. RecreationWorld instead lets an agent probe a running reference, but through code- and tool-level access (Alibaba Token Hub, 2026), in line with a broader push toward scalable agent environments (Aggarwal et al., 2026). SWE-Recreation differs in that the agent works solely through a human-like interface and receives no human-authored scaffolding, so exploration and planning are themselves under test; our metrics further separate discovery from implementation. For grading, we build on LLM- and agent-as-judge evaluation (Zheng et al., 2023; Zhuge et al., 2024; Gou et al., 2025), with a single judge agent with a consistent model and configuration whose every grade cites pixel evidence.

Figure 2: Overview of the SWE-Recreation pipeline.
3 Task Formulation
Let
A
⋆
A^{\star}
be a source application and
W
=
{
w
…
w
N
}
W=\{w_{1},\dots,w_{N}\}
a hidden set of workflows that a faithful replica must support. An agent’s run typically comprises four parts: it explores
A
⋆
A^{\star}
, generates a runnable replica
A
^
\hat{A}
, and self-checks it, after which an evaluation stage grades
A
^
\hat{A}
against
W
W
(Section 5).
W
W
is never revealed to the agent.
Human-like interface.
At every step the agent observes only a rendered screenshot and the cursor position, and acts only through coordinate-level pointer and keyboard input (click, drag, scroll, and type on the web; tap, swipe, type, and back on mobile). It receives no DOM, accessibility tree, source code, network traffic, storage, URLs, or selectors, and action receipts report only whether an action was accepted, never what it hit. This boundary is enforced by the runtime rather than by instruction.
Autonomy.
Exploration is open-ended. No task list, demonstration, exploration plan, or note-taking format is provided, and only a generous, effectively non-binding cap on actions and time is imposed; what to probe, and when enough has been learned, is left entirely to the agent.
Output and scope.
The replica is built from what the agent observed, together with public fictional assets (Section 4), and is judged solely by observable behavior: whether each
w
i
w_{i}
, including its state changes and persistence, can be carried out on screen. Layout, wording, styling, and framework are out of scope, so behaviorally equivalent replicas pass while static mock-ups do not. Behavior that cannot be faithfully reproduced or verified on a single machine—multi-user collaboration, payments, real-time data, generative features, and external integrations—forms an exclusion set
X
X
that is neither expected of the agent nor scored.
4 Benchmark Construction
Targets.
SWE-Recreation covers 54 real applications: 28 live websites and 26 Android apps, grouped into six categories (Table 1). The web split spans social and content platforms (e.g., Zhihu, Reddit, YouTube), productivity and collaboration tools (e.g., Notion, Trello, Google Calendar), commerce and travel services, creative canvases (e.g., Excalidraw, diagrams.net, JS Paint), and math, map, and media applications (e.g., Desmos, Google Maps, Spotify); the mobile split adds open-source productivity, media, utility, and game apps (e.g., Joplin, VLC, AnkiDroid, Minesweeper). We select applications rich in stateful, long-horizon behavior—filtering, editing persistent objects, and keeping one record consistent across views—rather than static presentation. We discuss the resulting non-determinism and pretraining exposure in Section A.
Checklists and exclusions.
Checklists are built with a human-in-the-loop pipeline. An annotator exercises each application by hand and records 20–40 screenshots covering its main features and transitions; a vision-language model (gpt-6-astra) drafts a checklist from this trace, and a second annotator verifies it against the live application, removing ambiguous or untestable items. Each requirement specifies ordered steps, an expected outcome written in natural language rather than as a mechanical assertion, and flags for persistence and multi-user involvement. Web targets additionally carry an annotator-authored exclusion list recording each excluded surface, its treatment, and a reason; a single file defines both, so exploration and evaluation share the same boundary.
Environments.
Mobile targets run in a containerized Android system with the application preinstalled, and web targets in a locked-down browser. In both, an MCP server is the agent’s only bridge to the device, exposing primitive tools (screenshot, tap or click, swipe or scroll, type) while hiding all device-level mechanisms. For generation, the agent receives a fixed scaffold and an asset package of shared public assets plus fictional per-target content, so no real user data is needed. Network access is permitted but not required, and no web technology stack is prescribed; mobile replicas target a fixed native stack to yield an installable app.
Statistics.
Table 1 and Figure 8 summarize the dataset. The 54 applications carry 1,446 requirements in total, about 30 per website and 23 per mobile app, and roughly one in five requires persistence across a reload or restart. The 438 web exclusions comprise 213 hard, 113 default, and 96 conditional exclusions, plus 16 conditional inclusions that keep a narrowly testable part of an otherwise excluded surface; mobile targets are offline and single-user by construction and need none.
Statistic
Web
Mobile
Applications
Requirements
per application, mean
per application, range
Persistence requirements
Exclusion entries
Applications by category
Productivity & documents
Social & content
Creative & media
Commerce & travel
Math, maps & utilities
Games & puzzles
Table 1: SWE-Recreation dataset statistics.
Figure 3: Web and Android session-level associations. (a) Bubble area: WFS; stars: paired means; colors: systems. (b–c) WFS associations with descriptive fits and pair counts. D2I shares grades with WFS; correlations are not causal and platform mixes differ.
5 Evaluation Protocol and Metrics
5.1 Protocol
The judge exercises each hidden workflow
w
i
w_{i}
on the replica
A
^
\hat{A}
through the human-like interface and compares its behavior with a reference instance. Adaptive functional testing admits behaviorally equivalent implementations while exposing inert interfaces.
A code layer enforces cited observation frames, a closed grade vocabulary, complete requirement coverage, and a fixed report schema; semantic decisions remain with the judge. One fixed model grades every system, avoiding evaluator changes and self-evaluation without eliminating judge bias. Persistence requirements need before, changed, and post-reload/restart evidence for full credit.
5.2 Notation
For a given target, let
ℛ
\mathcal{R}
be its set of scored requirements, with
N
=
|
ℛ
|
N=|\mathcal{R}|
after exclusions are removed, and let
ℛ
p
⊆
ℛ
\mathcal{R}_{\mathrm{p}}\subseteq\mathcal{R}
be those flagged for persistence. For each
r
∈
ℛ
r\in\mathcal{R}
, the judge returns a grade
g
r
∈
𝒢
=
{
full
partial
placeholder
broken
}
g_{r}\in\mathcal{G}=\{\textsc{full},\textsc{partial},\textsc{placeholder},\textsc{broken}\}
, a rationale
ρ
r
\rho_{r}
, and a set
E
r
E_{r}
of replica screenshots cited as evidence. A separate coverage judge, run post hoc on exploration keyframes without affecting the agent, returns
c
r
∈
{
}
c_{r}\in\{0,1\}
for requirements with an available coverage judgment, and an evidence frame
f
r
f_{r}
for positive judgments. Here
c
r
=
c_{r}=0
means not evidenced as reached, not verified absence of exploration; missing judgments are undefined. Positive judgments may evidence an entry point or partial workflow rather than complete execution. Let
𝒪
⊆
ℛ
\mathcal{O}\subseteq\mathcal{R}
denote requirements with available judgments. Grades are converted to credit by

ω
⁡
g
=
{
g
=
full
g
=
partial
g
=
placeholder
g
=
broken
\omega(g)=\begin{cases}1,&g=\textsc{full},\\ 0.5,&g=\textsc{partial},\\ 0.25,&g=\textsc{placeholder},\\ 0,&g=\textsc{broken},\end{cases}

5.3 Metrics
We group metrics by question: Fidelity assesses functional outcomes; Conversion relates exploration evidence to implementation; Grounding describes visual and interaction proxies; Process records exploration effort, self-checking, and platform reliability.
5.3.1 Fidelity
Weighted Fidelity Score (WFS) aggregates requirement credit:

WFS
=
N

∑
r
∈
ℛ
ω
⁡
g
r
\mathrm{WFS}=\frac{1}{N}\sum_{r\in\mathcal{R}}\omega(g_{r}).

Grade shares (F/P/Pl/B),
s
g
=
N
∑
r
∈
ℛ
[
g
r
=
g
]
s_{g}=\frac{1}{N}\sum_{r\in\mathcal{R}}\mathbf{1}[g_{r}=g]
for
g
∈
𝒢
g\in\mathcal{G}
, expose its composition.
Persistence Fidelity (P-WFS) restricts credit to persistence requirements:

P

WFS
=
|
ℛ
p
|

∑
r
∈
ℛ
p
ω
⁡
g
r
\mathrm{P\text{-}WFS}=\frac{1}{|\mathcal{R}_{\mathrm{p}}|}\sum_{r\in\mathcal{R}_{\mathrm{p}}}\omega(g_{r}),

It is undefined when
ℛ
p
\mathcal{R}_{\mathrm{p}}
is empty.
Nonfunctional Rate (NFR) is the fraction graded placeholder or broken, comparable across platforms. The supplementary web Illusion Rate (IR) additionally flags rationales describing fake, decorative, or inert behavior via
ψ
⁡
ρ
r
\psi(\rho_{r})
, with
𝒢
×
=
{
placeholder
broken
}
\mathcal{G}_{\times}=\{\textsc{placeholder},\textsc{broken}\}
:

IR
=
N
∑
r
∈
ℛ
[
g
r
∈
𝒢
×
∨
ψ
ρ
r
]
\mathrm{IR}=\frac{1}{N}\sum_{r\in\mathcal{R}}\mathbf{1}\bigl[g_{r}\in\mathcal{G}_{\times}\lor\psi(\rho_{r})\bigr]

5.3.2 Conversion
Exploration Coverage (ECov) is the fraction evidenced as reached among available judgments:

ECov
=
|
𝒪
|

∑
r
∈
𝒪
c
r
\mathrm{ECov}=\frac{1}{|\mathcal{O}|}\sum_{r\in\mathcal{O}}c_{r},

It is undefined for empty
𝒪
\mathcal{O}
; missing judgments are not zeros.
Discovery-to-Implementation Rate (D2I) is mean credit conditional on evidenced reach:

D2I
=
∑
r
∈
𝒪
c
r

ω

g
r
∑
r
∈
𝒪
c
r
\mathrm{D2I}=\frac{\sum_{r\in\mathcal{O}}c_{r}\,\omega(g_{r})}{\sum_{r\in\mathcal{O}}c_{r}},

D2I is undefined without positive reach judgments. These metrics do not attribute failures causally; WFS need not equal their product because unreached or unobserved requirements can earn credit.
5.3.3 Grounding
For
T
T
exploration actions and
M
M
observations, let
δ
m
\delta_{m}
be consecutive-frame pixel change and
ε
=
\varepsilon=0.002
. Frames,
∑
m
[
δ
m
>
ε
]
\sum_{m}\mathbf{1}[\delta_{m}>\varepsilon]
, counts changed observations, not globally unique states. Effective- and invalid-action rates (EAR/IAR) are

EAR
=
M
∑
m
=
M
[
δ
m
>
ε
]
\mathrm{EAR}=\frac{1}{M}\sum_{m=1}^{M}\mathbf{1}[\delta_{m}>\varepsilon],

IAR
=
T

∑
t
=
T
ι
t
\mathrm{IAR}=\frac{1}{T}\sum_{t=1}^{T}\iota_{t},

where
ι
t
=
\iota_{t}=1
for rejected or error-raising actions. EAR uses observations as its denominator; visual change need not indicate useful exploration, nor does accepted input guarantee correct targeting.
Coverage-discounted Visual Similarity (VSim) uses
ℓ
\ell_{2}
-normalized CLIP ViT-L/14 embeddings
ϕ
\phi
(Radford et al., 2021) and
b
r
=
[
g
r
≠
broken
]
b_{r}=\mathbf{1}[g_{r}\neq\textsc{broken}]
:

v
r
=
c
r

b
r

max
e
∈
E
r

ϕ

f
r
⊤

ϕ

e
v_{r}=c_{r}\,b_{r}\max_{e\in E_{r}}\phi(f_{r})^{\top}\phi(e),

with an empty maximum set to
and
VSim
=
N

∑
r
∈
ℛ
v
r
\mathrm{VSim}=\frac{1}{N}\sum_{r\in\mathcal{R}}v_{r}
. The exported scorer assigns zero without an exploration anchor, unlike ECov/D2I’s exclusion of missing judgments. We retain these scores without recomputing embeddings; this coverage- and grade-gated measure is not pure perceptual accuracy.
5.3.4 Process
Steps and Time count exploration actions and wall-clock minutes, measuring exploration interaction cost only. Self-correction rounds (SCR) count recorded replica revisions after the initial review. Platform-attributed failures (PAF) count crashes plus environment-degrading actions. Platform defects are repaired and rerun; failures with a correctly functioning platform remain capability outcomes. PAF describes evaluation reliability, not agent ability.
6 Experiments
6.1 Setup
We evaluate five model–framework pairs (Table 2) end to end under the same interface, assets, and effectively non-binding interaction cap, without task hints or privileged access. The fixed judge, GPT-6-Astra, is not among the evaluated systems. Scores characterize whole systems, including their planning, tool use, and context management. The balanced study covers 16 common websites and all 26 Android apps: 42 targets, 1,111 requirements, 210 runs and 5,555 grades, once per system and target. The benchmark itself remains 54 applications with 1,446 requirements. Targets receive equal weight, so complete combined means weight the web and Android strata 16:26, not 1:1. Three additional Opus web results are retained separately. Missing diagnostics are excluded. Explicit Android task-key joins extend D2I to both platforms; semantic taxonomy remains web-only without a verified Android specification-ID mapping.
6.2 Human validation of the LLM judge.
Four GUI-domain experts with master’s- or doctoral-level training manually review the LLM judge’s assessments by selecting 20 samples. More than 95% of the reviewed judgments were deemed correct by the experts, providing evidence for the reliability of the automated evaluator on the reviewed cases.
6.3 Fidelity
Table 2 reports combined application-macro results. Kimi leads at 0.530 WFS and 22.9% full credit, followed by DeepSeek (0.472), GLM (0.362), GPT-6-Sol (0.352), and Opus (0.277). Partial grades remain the largest share for the two leaders (Figures 4–5). P-WFS uses a different subset, so its proximity to WFS does not establish that working behavior generally survives reload.

Fidelity
Conversion
Grounding
System
F
P
Pl
B
WFS
↑
\uparrow
P-WFS
↑
\uparrow
NFR
↓
\downarrow
ECov
↑
\uparrow
D2I
↑
\uparrow
VSim
↑
\uparrow
Kimi Code + Kimi K3
DeepSeek Harness + V4.1-Flash
ZCode + GLM-5.3-Flash
Codex + GPT-6-Sol
Claude Code + Opus 4.8
Table 2: Combined application-macro results. F/P/Pl/B: grade shares (%). WFS, grade shares and NFR use 42 targets; P-WFS uses 38. In row order, ECov/D2I/VSim use 41/40/41, 42/42/42, 42/37/42, 42/42/42, 41/38/41 targets. NFR is grade-only nonfunctionality; other definitions in Section 5.3.
Figure 4: Combined WFS (bars), ECov (circles), and P-WFS (diamonds); denominators follow Table 2.
Figure 5: Application-macro grade shares (%); WFS weights are 1/0.5/0.25/0 for full/partial/placeholder/broken.
Partial credit dominates the strongest replicas, indicating substantial but incomplete functionality rather than consistently faithful workflows.
6.4 Conversion
Across platforms, WFS correlates with ECov at
r
=
r{=}0.53
n
=
n{=}208
) and D2I at
r
=
r{=}0.79
n
=
n{=}199
), partly because D2I shares its grades (Figure 3). These pooled associations also reflect different platform mixes and do not identify causal effects.
The joint distribution therefore distinguishes implementation shortfalls on observed behavior from gaps in exploration evidence, which aggregate fidelity alone cannot separate.
6.5 Grounding
Kimi has the highest combined VSim (0.295) and EAR (0.535), whereas Opus has VSim 0.118 and EAR 0.376 (Tables 2–3). These overlapping proxies do not isolate perceptual errors. GPT-6-Sol has higher EAR than DeepSeek (0.507 versus 0.484) but lower WFS (0.352 versus 0.472): visual change alone does not establish useful exploration. All 130 Android visual scores are available after the five pending cases were resolved.
Read together, the diagnostics reveal different interaction profiles even when individual rates appear favorable; no single proxy adequately summarizes the quality of exploration.
6.6 Process
DeepSeek averages 167.9 exploration steps and Kimi 133.9, versus 59.4–102.5 for the other systems (Table 3). Kimi averages 112.9 minutes, compared with DeepSeek’s 45.1, so longer action traces need not imply longer elapsed time. Recorded IAR is zero where available; combined PAF is at most 0.143 per target.
Longer action traces characterize the two leaders, but effort, iteration and fidelity require controlled study before interpreting their association causally.

Grounding
Process
System
Frames
EAR
↑
\uparrow
IAR
↓
\downarrow
Steps
Time (min)
SCR
PAF
↓
\downarrow
Kimi Code + Kimi K3
DeepSeek Harness + V4.1-Flash
ZCode + GLM-5.3-Flash
Codex + GPT-6-Sol
Claude Code + Opus 4.8
Table 3: Combined available-target process means. Frames/EAR/PAF use 42 targets; IAR uses 41 for GPT-6-Sol and 42 otherwise; Steps/Time use 39 for DeepSeek and 42 otherwise. SCR uses 40, 39, 42, 41, 42 targets in row order and counts revisions after the initial review; definitions in Section 5.3.
6.7 Target Analysis
Semantic coding of the 513 web requirements finds lowest micro credit for automation/recurrence (0.058) and highest for browsing/navigation (0.487). Automation has no reached pairs, hence undefined D2I; mathematical dependencies score 0.232 despite 31.7% coverage and D2I 0.333 (Figure 6). Application-equal averaging preserves these endpoints, not necessarily intermediate rankings (Appendix B).
Checklist composition limits difficulty claims: 26/36 Trello requirements concern automation, while Desmos Geometry’s mean 0.203 and range 0.066 indicate uniformly low scores. Its intersection chain earns zero credit despite 2/5 positive reach judgments; Squoosh’s return-and-load workflow earns full credit despite only 2/4. These illustrative contrasts do not identify causes; further requirement-level detail remains in Appendix C.2.
Figure 6: Web functional types: bars show micro credit, diamonds application-equal credit, circles ECov and crosses D2I (absent when undefined). Types are AI-assisted, without independent human validation.
Difficulty thus depends on the tested workflows as well as the application, motivating requirement-level reporting alongside application rankings.
7 Conclusion
SWE-Recreation tests whether agents can explore and rebuild unfamiliar software through a human-like interface. Five systems reach at most 0.530 combined WFS; Kimi and DeepSeek lead both platform strata, while other rankings depend on the application mix. Grades and joint reach evidence across both platforms separate implementation shortfalls from exploration-evidence gaps. Repeated runs, independent annotation, and controlled interventions are needed to explain these descriptive patterns.