# RegHarness: Regulating What Code-as-Policy Agents Keep from Steps to Skills

Shengming Liu Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia Yunyi Gao Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia Xinyi Wang Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia Jianyong Sun Affiliation: Embodied AI, Beijing Zhongke Huiling Robot Technology Co., Ltd., Beijing, China Shuai Wang Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia Yi Deng Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia Li Chenye Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia Mingcai Zhou Affiliation: Institute of Automation, Chinese Academy of Sciences, Beijing, China Sim Kuan Goh Affiliation: School of Artificial Intelligence and Robotics, Xiamen University Malaysia, Sepang, Selangor, Malaysia

###### Abstract

Code-as-Policy agents generate, execute, and revise robot programs, but often lack explicit mechanisms to govern what persists across executions: which actions are retained within a trial and which code modifications carry over to subsequent runs. This leaves two critical aspects of agent behavior insufficiently controlled: step-level execution and cross-run adaptation. We present RegHarness, a two-level harness that governs both forms of persistence for the RATs agent team, without relying on a vision-language-action (VLA) policy or demonstrations. Within each trial, run-time governance evaluates each proposed step from a reset scene, replaying the committed steps, while a fixed-rule controller commits the step only when both RATs’ verifier and a task-long LLM auditor approve it. Between runs, a coding agent uses logged failures to develop and test revisions to skills, primitives, and rules, which remain disabled by default until explicitly enabled by the authors. Using a single low-cost model across all run-time roles, RegHarness achieves an 87.8% success rate (158/180) on paired LIBERO-PRO trials, compared with 39.4% for RATs, and a 72.0% success rate on MolmoSpaces trials. A 2×\times2 ablation study of RegHarness’s two levels shows that its skill refinement alone increases RATs’ successful trials from 71 to 135, whereas run-time governance alone achieves 105 and RATs’ native stepwise reset-and-replay mode achieves only 46. These findings suggest that, for Code-as-Policy agents operating with low-cost models, task success depends not only on how generated programs are executed, but also on the quality of the reusable skills they invoke and how those skills evolve across runs.

Figure 1: RATs fails this trial in all six attempts; run-time governance and RegHarness both solve it. RATs [[26](#bib.bib26)], run with our low-cost model, writes six programs; none lifts the bowl. With the released skills, run-time governance (+ Harness) replans after a grasp knocks the bowl off the cabinet and succeeds on its third plan; RegHarness succeeds on its first. Blue marks a reset scene with the committed steps replayed; orange borders mark rejected executions (for RATs, failed task checks), green ones commits, and row-end marks show the task check. Right: success of all five configurations on the 180 paired trials, with gray bars for the RATs loop, purple bars for run-time governance and dark bars for the refined skills, and of RegHarness on its 300. 11footnotetext: These authors contributed equally.22footnotetext: Corresponding authors.

## 1 Introduction

Consider the task in : pick the black bowl on top of a cabinet and place it on a plate. RATs [[26](#bib.bib26)], a Code-as-Policy [[15](#bib.bib15)] agent team that we run with a low-cost language model, makes six attempts at this LIBERO-PRO [[32](#bib.bib32)] task, each a program for the whole plan. Its static checker rejects one program before it runs, and none of the five that run lifts the bowl: the first leaves it on the cabinet, the last two knock it onto the table.

Over the 180 paired LIBERO-PRO trials, RATs solves 39.4% (71/180) within six attempts but only 13 on the first. In its published loop, RATs judges each step only after the whole program has run; a retry, though prompted to keep what worked, is a complete program run again from the reset scene, so a passed step can change and must pass again. All 692 retries are complete programs, and 86% (493/574) of those that follow a diagnosed failure change code outside the failed step (criteria in the supplementary material). Nor does a clean verdict mean the work is done: in 117 of the 670 failed executions, the verifier flags no failed step.

What these agents lack is a rule for what to keep: which executed steps stay committed within a trial, and which code changes carry over to the next run. Testing one step at a time does not supply it by itself: the released RATs code already contains a stepwise mode, off by default and not described in its paper, that resets the scene and replays the passed steps before every try, but it commits a step on the verifier’s pass alone and, once a step’s tries run out, commits the step unverified so that the plan can go on. A reset protects a retried step from what the failed test left behind, but it also erases what that test revealed; a trial therefore needs a memory that outlives the reset, and a commit rule that never keeps an unverified step instead of letting the coder’s next program decide which code survives. Between runs, the code itself must change: even after we add such a commit rule to RATs (+ Harness, [Sec. 4.3](#S4.SS3)), 75 of the 180 trials still fail, 30 of them at a grasp that never lifts a non-flat object (19) or at a placement off target (11).

RegHarness regulates what persists at these two time scales ([Fig. 2](#S1.F2)). Within a trial, it wraps RATs’ planner, coder and verifier and reuses the executor of the stepwise mode, so every step test resets the scene and replays the committed steps (reset-and-replay); one LLM auditor per trial audits plans, code, step tests and finished plans that fail the benchmark’s task check, and a controller of six fixed rules turns its proposal and the remaining budget into commit, retry, replan or abort, never committing a step that the verifier has not passed. Between runs, a coding agent (Claude Opus 5.5 in Claude Code) reads full trial logs and frames and turns each fix to skills, primitives or rules into a default-off switch that must pass tests, and a byte-for-byte equivalence check when off, before the authors can enable it. Reset-and-replay, which needs a scene that software can reset, is confined to simulation.

Coding agents and optimizers already revise robot harnesses and skills between runs [[6](#bib.bib6), [18](#bib.bib18), [25](#bib.bib25), [4](#bib.bib4), [29](#bib.bib29), [5](#bib.bib5)], most of them behind an automatic acceptance test that our author-gated loop lacks, and the concurrent RegenHarness separates a model’s proposal from a deterministic commit gate on a quadruped [[23](#bib.bib23)]. RegHarness is a new harness framework that improves RATs in two ways, without a VLA policy or demonstrations: within a trial it replaces RATs’ loop with a commit rule over steps tested from a reset scene, and between runs it refines the skill library that RATs shares across tasks.

With one low-cost model in every role, RegHarness solves 158 of the 180 LIBERO-PRO trials on initial states 0–2 (87.8%), where RATs solves 71 (39.4%), and 260 of 300 (86.7%) over five initial states; on MolmoSpaces it solves 72.0% (144/200). The 2×\times2 splits this gain unevenly between RegHarness’s two levels: its refined skills add 64 trials under RATs’ loop and 53 under run-time governance, whereas replacing RATs’ loop with run-time governance adds 34 trials with the released skills and 23 with the refined ones (exact McNemar p=1.2×10−4p=1.2\times 10^{-4} and 2.9×10−42.9\times 10^{-4}). RATs’ own stepwise mode solves 46, fewer than RATs itself, so the reset alone does not explain the margin of run-time governance. A RegHarness trial costs an estimated CNY 2.16 (about US$0.32 at CNY 6.67 per US$) in model calls, against 1.51 (US$0.23) for RATs ([Sec. 4.5](#S4.SS5)). Both levels were debugged on initial state 0 only and tested directly on states 1–4 ([Sec. 4.1](#S4.SS1)).

Our contributions are:

- •

Rule-decided commits over steps tested from a reset scene, paired with author-gated refinement of a shared skill library, around an existing Code-as-Policy agent and without a VLA policy or demonstrations ([Sec. 3](#S3)).

- •

A 2×\times2 over the control loop and the skill library on the same 180 paired LIBERO-PRO trials, with RATs’ own stepwise mode as a control ([Secs. 4.2](#S4.SS2) and [4.3](#S4.SS3)).

- •

An account of what happens inside trials, what still fails and what it costs, failures caused by run-time governance included ([Secs. 4.4](#S4.SS4), [4.5](#S4.SS5) and [4.6](#S4.SS6)).

Figure 2: RegHarness regulates what persists within a trial and between runs. (a) The auditor audits plans ➊, drafts ➋, step tests ➌ and finished plans that fail the task check ➍. Each step test resets the scene and replays the committed steps on the executor of RATs’ stepwise mode. The controller commits a step only if the verifier passes it and the auditor proposes commit. (b) The coding agent (Claude Opus 5.5) turns failures into default-off switches that the authors enable.

## 2 Related work

#### Code-as-Policy agents

Language-model agents write robot programs against perception and control APIs [[15](#bib.bib15), [11](#bib.bib11), [19](#bib.bib19)] and revise them from execution feedback, one program at a time. Voyager commits a program to its skill library only after a self-verification module confirms the task [[22](#bib.bib22)]. CaP-X never resets the environment within a trial, so each new program starts in the scene the previous one left [[7](#bib.bib7)]. RATs instead reruns a complete program from a reset scene and judges its steps after the run, whereas RegHarness makes the step the unit that is tested and committed ([Sec. 3.1](#S3.SS1)).

#### Run-time verification and commit gates

The harnesses closest to run-time governance shape what the model perceives [[14](#bib.bib14), [28](#bib.bib28), [3](#bib.bib3)] or check outcomes during execution [[31](#bib.bib31), [8](#bib.bib8), [10](#bib.bib10), [9](#bib.bib9), [21](#bib.bib21), [4](#bib.bib4)], and recover in whatever scene a failure leaves; Recova first restores that scene with recovery skills [[17](#bib.bib17)]. The concurrent RegenHarness goes furthest in separating proposal from commitment: its models only propose, and a deterministic gate advances a quadruped’s trusted task state only after checking the verifier’s verdict [[23](#bib.bib23)], but the paper does not describe undoing a rejected execution. We instead test each step from a reset scene, as RE-0 restores simulator snapshots to check code corrections before distilling them [[27](#bib.bib27)], but inside the evaluated trial: a rejected test is discarded by the next reset, and passed steps persist as code that is replayed ([Sec. 3.2](#S3.SS2)).

#### Between-run refinement by coding agents

ASPIRE has Claude Code repair programs and admit validated repairs to a skill library [[18](#bib.bib18)], SHAPER has the frozen planner revise its own skills and context code [[24](#bib.bib24)], and HarnessPAI already separates two timescales, revising across rollouts a fixed program that checks each step within one [[4](#bib.bib4)]. Concurrent systems bring this loop to LIBERO-PRO around a frozen π0.5\pi_{0.5} policy [[1](#bib.bib1)], driven by a Codex meta-agent that explores failures in VISTA [[29](#bib.bib29)], by failure attribution to harness layers in DynaHarness [[5](#bib.bib5)] and by a self-generated curriculum in RoboACE [[30](#bib.bib30)]; EmbodiedEvo instead lets the acting agent write its own code skills [[13](#bib.bib13)]. RHO’s training-time search over policy repositories [[6](#bib.bib6)], Scale and Selection [[25](#bib.bib25)], TinyAstral [[9](#bib.bib9)], VISTA, DynaHarness and RoboACE keep a change only after a fixed comparison with its predecessor, and the first three, like ASPIRE, score the result on held-out seeds or tasks. Our between-run refinement lacks the first safeguard, since the authors choose which tested, default-off switches to enable; it draws only on initial state 0, and states 1–4 are held out ([Secs. 3.6](#S3.SS6) and [4.1](#S4.SS1)).

#### Concurrent work and our position

Without a VLA policy or demonstrations, AMP1 has a frontier model write code against a motion interface and solves most LIBERO-PRO episodes in one attempt [[2](#bib.bib2)], and RURL trains a reasoning model to act with no harness at all [[20](#bib.bib20)]. On what each paper reports, none of the concurrent systems above commits steps tested from a reset scene, shares one skill library across tasks without a VLA policy and splits its gain between two levels on one set of paired trials: RegenHarness gates commits without a reset, AMP1 writes code afresh per episode and AMP1+ adds an agent-written library but no commit decisions, and those that refine code between runs report component ablations at most (comparison table in the supplementary material). Their tasks, budgets, models and success rules differ from ours, so their published rates ([Tab. 2](#S3.T2)) serve only as context.

## 3 Method

RegHarness reuses RATs’ planner, coder and verifier [[26](#bib.bib26)] and adds an auditor, which can rewrite plans or drafts before they run but after a step test only proposes, and a controller, which decides; between runs it refines skills ([Fig. 2](#S1.F2)).

### 3.1 Setting and notation

A trial runs one task instruction gg from one saved initial state s0s_{0} with P=4P=4 plans and J=4J=4 tries per step. The pp-th plan π(p)=(σ1,…,σnp)\pi^{(p)}=(\sigma_{1},\dots,\sigma_{n_{p} }) lists steps, the jj-th try of step kk is a draft c~k(j)\tilde{c}_{k}^{(j)} of its code, and a draft that runs is executed once, in a step test that resets the simulator and replays the code Ck−1=(c1,…,ck−1)C_{k-1}=(c_{1},\dots,c_{k-1}) of the committed steps:

| (sk(j),ek(j))=Exec⁡(reset⁡(s0),c1⊕⋯⊕ck−1⊕c~k(j)),\bigl(s_{k}^{(j)},e_{k}^{(j)}\bigr)=\mathrm{Exec}\bigl(\mathrm{reset}(s_{0}),\;c_{1}\oplus\cdots\oplus c_{k-1}\oplus\tilde{c}_{k}^{(j)}\bigr), | (1) |

where ⊕\oplus joins step code into one program after the skill preamble and ek(j)e_{k}^{(j)} is the execution record, for which ok⁡(e)\mathrm{ok}(e) holds when the reset succeeds and the program ends without an exception, a timeout or an uncertain change to the scene. The verifier returns v∈{succeeded,failed,ambiguous}v\in\{\textsf{succeeded},\textsf{failed},\textsf{ambiguous}\}, and the benchmark’s task check T⁡(s)∈{0,1}T(s)\in\{0,1\} is read by the controller and shown to no model while a plan runs.

RegHarness keeps RATs’ planner, coder (now asked for one step at a time), static checker and Per-Step Verifier, all on the auditor’s language model and with the skills frozen within a trial. It drops RATs’ outer retry loop, Planner Verifier, rehearsal ([Sec. 4.1](#S4.SS1)), feedback generator and SubAgent, and adds planning rules, read by the planner and the plan audit, that RATs does not have.

Run-time governance reuses the executor of the stepwise mode of the released RATs code (--multiturn-reset, [Sec. 1](#S1)) but not the mode’s commit loop.

### 3.2 Testing a step from a reset scene

A draft can be judged only by running it, and a failed run has already changed the scene: in the task of , a grasp try in the first plan of run-time governance with the released skills knocks the bowl off the cabinet. Every step test therefore starts from s0s_{0} with the committed steps replayed ([Eq. 1](#S3.E1)), so the next reset discards what a rejected test did, and the second plan’s first step finds the bowl back on the cabinet. Replay re-executes code instead of restoring a saved state and is not checked against the run it repeats, although a replayed step reuses the grasp sample it drew when committed. Like RATs’ own reset between attempts, reset-and-replay needs a scene that can be reset, and even there a cabinet settles differently after each reset in two LIBERO-PRO tasks (scene comparisons in the supplementary material).

Testing every try from a reset scene costs re-execution, not language-model calls: a trial of NN step tests, the tt-th testing step ktk_{t} after replaying kt−1k_{t}-1 committed steps, executes BB steps of code,

| B=∑t=1Nkt,replayed share=B−NB,B=\sum_{t=1}^{N}k_{t},\qquad\text{replayed share}=\frac{B-N}{B}, | (2) |

and each step test adds a reset, perception on the replayed steps, a verifier call and a step audit call.

### 3.3 A task-long auditor

The reset also erases what the failed test showed, unless something outlives it: the scene lasts one step test, the committed steps one plan, the auditor’s context the whole trial, and the code until the next run, which only between-run refinement changes (lifetime labels in [Fig. 2](#S1.F2)). The auditor is one resumed Codex CLI conversation per trial, on the language model of the other roles, so what a failed try revealed reaches the next draft and plan after its scene is gone. It cannot call tools, cannot reach the environment and answers each audit in a fixed JSON schema (prompts and schemas in the supplementary material).

The plan audit ➊ reads each plan with the task, a text summary of the scene and the API and skill interfaces, and the code audit ➋ reads each draft with the static checker’s findings; neither sees an image. Both accept, rewrite or reject: a rewrite runs in place of the original, and a rejection, like a block by the static checker, uses up the plan or the try. After each step test the step audit ➌ reads the executed code, an excerpt of its output, the verifier’s verdict, the remaining budget and the first and last camera frames, and proposes commit, retry, replan or abort with a correction ([Fig. 3](#S4.F3)). Apart from what the code prints, no audit receives the reward, the completion flag, depth, point clouds, masks or simulator state; the final audit ➍ is told that the task is not complete. Since the auditor is the same model that writes the code, its rewrites can introduce errors of their own ([Sec. 4.5](#S4.SS5)).

Table 1: RegHarness solves 158 of the 180 paired LIBERO-PRO trials, against 71 for RATs and 135 for RATs with the refined skills, and 86.7% (260/300) over five initial states. All rows use deepseek-flash in every role, score one run per task and initial state and count successes (of 30 per cell; of 50 in the last row); initial state 0 is the development state and states 1–4 are test states, and RATs counts scored executions only ([Sec. 4.1](#S4.SS1)). *Step commit*: –, none; forced, a step whose tries run out is kept unverified.

| Setting | Object | Goal | Spatial |  | Method | Skills | Step commit | Trials | Pos | Task | Pos | Task | Pos | Task | All |
| RATs | released | – | 180 | 18 | 12 | 12 | 12 | 9 | 8 | 71/180 (39.4) |
| RATs + stepwise replay | released | verifier, forced | 180 | 11 | 15 | 7 | 8 | 1 | 4 | 46/180 (25.6) |
| RATs + refined skills | refined | – | 180 | 25 | 24 | 21 | 19 | 20 | 26 | 135/180 (75.0) |
| + Harness | released | verifier + auditor | 180 | 21 | 15 | 18 | 15 | 19 | 17 | 105/180 (58.3) |
| RegHarness | refined | verifier + auditor | 180 | 27 | 26 | 26 | 23 | 27 | 29 | 158/180 (87.8) |
| RegHarness, initial states 0–4 | refined | verifier + auditor | 300 | 43 | 42 | 44 | 38 | 45 | 48 | 260/300 (86.7) |

Table 2: Published LIBERO-PRO success rates (%), for context. Rows marked † use other models, trial counts and protocols and are not a controlled comparison with [Tab. 2](#S3.T2); RHO† evolves on unperturbed LIBERO tasks and HarnessPAI† on 15 of its 50 evaluation seeds.

| Method | Setting | Obj. Pos | Obj. Task | Goal Pos | Goal Task | Spa. Pos | Spa. Task | All |
| CaP-Agent0† [[7](#bib.bib7)] | rerun in [[26](#bib.bib26)] | 27.0 | 31.0 | 29.0 | 16.0 | 13.0 | 23.0 | 23.2 |
| RATs† [[26](#bib.bib26)] | Play skills; model not stated | 61.0 | 63.0 | 43.0 | 36.0 | 29.0 | 31.0 | 43.8 |
| SPARK† [[10](#bib.bib10)] | Qwen3.8-27B | 86.4 | 82.4 | 71.6 | 61.8 | 65.4 | 83.0 | 75.1 |
| OpenRUA† [[3](#bib.bib3)] | Claude Opus 5 | 98.0 | 97.0 | 79.0 | 79.0 | 98.0 | 100.0 | 91.8 |
| RHO† [[6](#bib.bib6)] | no LLM at test time | 12.2 | 37.2 | 50.6 | 55.6 | 53.0 | 61.6 | 45.0 |
| HarnessPAI† [[4](#bib.bib4)] | drives π0.5\pi_{0.5}-LIBERO | 98.6 | 99.2 | 94.6 | 97.8 | 93.8 | 95.2 | 96.5 |

### 3.4 A controller of fixed rules

The controller turns every proposal into a decision by fixed rules, so the same proposal, checks and budget always lead to the same action. Step kk is committed only when

| κ=ok⁡(e)∧(v=succeeded),commit⇔κ∧(a=commit),\begin{gathered}\kappa=\mathrm{ok}(e)\wedge\bigl(v=\textsf{succeeded}\bigr),\\ \text{commit}\iff\kappa\wedge\bigl(a=\textsf{commit}\bigr),\end{gathered} | (3) |

where aa is the auditor’s proposal. One deterministic check can overturn vv: the *holding check* fails a step that should grasp or hold an object but ends with the gripper commanded closed and a reading below 0.03, if the step has a try left; the coding agent set this threshold from gripper readings in earlier runs on initial state 0, so it is tuned on the benchmark and can misfire on a grasp that holds.

Six rules, applied in order, map aa, κ\kappa and the remaining budget to a decision, and a task check that holds ends the trial as a success before any rule applies (rules and pseudocode in the supplementary material). Whatever the auditor proposes, no step is committed unless the verifier passes it, even when its tries run out, and only the budget or the task check ends a trial; in practice the rules rarely override the auditor ([Sec. 4.4](#S4.SS4)), so they add this guarantee rather than decisions of their own.

### 3.5 When a finished plan fails the task check

A plan whose steps are all committed can still fail the task check, because each step is verified only against its own goal; when it does and a plan is left, the final audit ➍ reads the verdicts and the last output and names the step and the measurement that let the error through. It lists at most five changes, which open the next plan, but it cannot change the outcome or request an execution. In the trial of [Fig. 2](#S1.F2), the first plan, finding no “tomato sauce”, commits all eight steps with a bottle; the audit traces the failure to “object selection, not transport”, and the second plan takes the can.

### 3.6 Between-run refinement

Run-time governance decides which code is committed, but what that code can do depends on the skills, primitives and rules it calls, which change only between runs. In between-run refinement, sub-agents of the coding agent, Claude Opus 5.5 in Claude Code, read the full log and frames of every failed trial in a batch, name the earliest step and mechanism that failed, and turn each refinement into a default-off switch in a new copy of the code. A switch must pass unit tests, be byte-for-byte equivalent to the previous version when off, survive an adversarial check by further agents and pass a leakage audit, which from the fourth round on forbids reading object positions or other data directly from the simulator in anything the run-time models see or execute, the task check excepted (leakage checks in the supplementary material). The authors choose which switches to enable before the code is frozen and evaluated, in five rounds on LIBERO-PRO; in the third they enabled 41 of 55 proposed switches.

Of the 194 changes registered against the released code, 78 make it run consistently with our model and scoring, 49 implement run-time governance itself, 40 revise skills and primitives, and 27 are undecided (change register in the supplementary material); run-time governance with the released skills keeps the first two groups and three undecided items. The skill revisions, such as grasp checks that require fingers stopped on an object, camera-frame point clouds for the grasp network and numbered look-alike instances, grow the library from 59 to 71 entries.

This loop is gated by the authors and lacks the automatic acceptance test of [Sec. 2](#S2); the coding agent also reads success checks, full logs and, on MolmoSpaces during design, the benchmark’s ground truth, of which the run-time models receive only the final audit’s notice that the task is not complete.

## 4 Experiments

### 4.1 Setup

#### Benchmarks

LIBERO-PRO [[32](#bib.bib32)] supplies the 60 tasks used by CaP-X [[7](#bib.bib7)] and RATs [[26](#bib.bib26)], ten from each of the Object, Goal and Spatial suites of LIBERO [[16](#bib.bib16)] under position and ten under task perturbations. We use the stored initial states s=0,…,4s=0,\dots,4 of each task, and each task–state pair is one trial, scored once per system, and voided runs were rerun in full, none after a success.

#### Compared systems

For RATs we rerun the released code and skills, with the changes needed to run them, at the code’s defaults of six attempts per trial and 180 s per execution, which its paper does not state. RATs with its built-in stepwise reset-and-replay (RATs + stepwise replay) switches on --multiturn-reset in the same code ([Sec. 3.1](#S3.SS1)), with four attempts, four tries per step, no rehearsal and a two-line fix to the step index its per-step verifier receives. RATs with the refined skills (RATs + refined skills), RegHarness’s between-run level alone, keeps the default loop and carries 51 of the 64 skill-level refinements, the rest belonging to run-time governance or never reaching the model. Run-time governance with the released skills (+ Harness), the within-trial level alone, uses 5,844 characters of planning rules, four plans of four tries per step and 480 s per execution; RegHarness adds the refined skills and extends the rules to 10,380 characters. All five systems run initial states 0–2, the 180 paired trials, on which one trial is worth 0.56 points, and RegHarness also runs states 3 and 4; the supplementary material lists every difference between the systems.

#### Metric and protocol

Success is the benchmark’s task check under the RATs protocol [[26](#bib.bib26)]: the agent retries within a trial until the check passes or the budget is spent, and only the environment decides. The released code also rehearses each program from the reset scene before its scored execution, checking only for errors, a step its paper does not describe; a rehearsal that ends with the task check true, as in 65 of 180 RATs trials, does not count, since the released loop discards it and runs the scored execution (rehearsal details in the supplementary material). All five systems read the task check during execution, as do the main SPARK results [[10](#bib.bib10)], and we ran no control without it; under run-time governance an error raised after the check has passed does not undo a success (3 of 105 successes for + Harness, 4 of 260 for RegHarness), whereas the RATs paper counts every policy crash as a failure. The per-step verifier that all five systems run is meant to judge a step from its goal, code, printed values and frames, but the released code cannot locate a step’s code, mostly when the step’s description contains a closing parenthesis, and the verifier then judges from frames alone, in 7.7% of RATs’ per-step verdicts and 45.8% of RegHarness’s; RATs + stepwise replay runs it with a two-line fix to the step index and the harness systems with their own input format, so its evidence differs between systems in a way whose effect we did not measure, although only the task check decides success.

#### Development exposure and model

We debugged both levels on initial state 0 only and ran initial states 1–4 as test states; which changes + Harness drops was decided after the results of RegHarness and RATs were known. State 0 is thus a development state and a third of the paired trials, so the gain of the refined skills on these trials is an upper estimate, and RATs + refined skills inherits this exposure through its skills. Every role in every trial uses the provider alias deepseek-flash at high thinking effort.

Figure 3: Selected successes in which run-time governance stops an execution that the verifier accepts or redirects one that it rejects. Each row is one trial, labelled with its configuration; borders mark stopped (amber, red) and corrected (green) executions, and the other pills are controller decisions. In rows 1–3 (LIBERO-PRO), a step audit ➌ rejects a wrong-bowl grasp, the holding check overturns an accepted empty grasp before a step audit retry, and a final audit ➍ traces a failed task check to the wrong object. In row 4 (MolmoSpaces), the step audit turns three tries the verifier rejects into retries.

### 4.2 Main results on LIBERO-PRO

#### RegHarness solves 86.7% of LIBERO-PRO trials with one low-cost model

Over five initial states RegHarness solves 260 of 300 trials ([Tab. 2](#S3.T2); 95% CI [79.7, 93.0][79.7,\,93.0], bootstrap over the 60 tasks), with 54, 53, 51, 53 and 49 of 60 from states 0 to 4. State 0, whose failures drove all refinements, is highest, but a paired test over the 60 tasks does not separate the five states (Cochran’s QQ, p=0.32p=0.32); on the test states 1 and 2, RegHarness solves 104 of 120 and RATs 49. RegHarness solves 158 (87.8%) of the 180 paired trials and keeps all but 3 of the 71 that RATs solves. The published rates in [Tab. 2](#S3.T2) give context, not a controlled comparison, and we do not rerun RHO or HarnessPAI, whose evolved LIBERO-PRO solvers are not released.

### 4.3 Where the gain comes from

Figure 4: Real-robot setup and an example task. (a) The Kinova Gen3 arm with its two-finger gripper, and color and depth images from the single fixed RGB-D camera. (b) Task 2, “put the cream cheese on the bowl”: the initial scene, the grasp, the transport and the final state.

#### Both levels of RegHarness raise success, and between-run refinement adds the larger share

Replacing the released skills with the refined ones ([Fig. 5](#S4.F5)) raises success from 71 to 135 trials in RATs’ loop and from 105 to 158 under run-time governance (+35.6+35.6 and +29.4+29.4 points; exact McNemar p=3.3×10−13p=3.3\times 10^{-13} and 4.9×10−134.9\times 10^{-13}; 95% CIs, bootstrapped over tasks, in the supplementary material). Replacing RATs’ loop with run-time governance raises it from 71 to 105 with the released skills and from 135 to 158 with the refined ones (+18.9+18.9 and +12.8+12.8; p=1.2×10−4p=1.2\times 10^{-4} and 2.9×10−42.9\times 10^{-4}). Each level gains 11 trials less when the other is present, so on these trials the two levels overlap in part; the skill gains are upper estimates ([Sec. 4.1](#S4.SS1)), and the one under run-time governance also contains the longer planning rules and two further sentences of audit instructions.

These compare whole configurations: against RATs’ loop, run-time governance has four plans instead of six attempts, 480 instead of 180 s per execution, its own prompts, planning rules and consistency fixes, and it reads the task check after 17.7 step tests per trial where RATs reads it after 4.1 scored executions. Since a RATs program’s rehearsal and scored execution end differently in 76 of 741 cases, single flips mean little.

#### RATs’ own stepwise reset-and-replay solves 46 of 180 trials

With the skills, code and model of RATs and the executor that run-time governance reuses, RATs + stepwise replay gains 18 trials and loses 43 against RATs (−13.9-13.9 points; p=0.0019p=0.0019), and RATs solves 56 within its first four attempts, the budget of RATs + stepwise replay. Against run-time governance with the released skills it gains 10 and loses 69 (p=5.5×10−12p=5.5\times 10^{-12}). Its logs show where the mode departs from [Eq. 3](#S3.E3): of the 4,181 steps it commits, 1,924 (46.0%) are committed unverified after their four tries, and 243 of its 10,699 step executions (2.3%) reach the 180 s limit that the replayed steps share with the step under test. Testing steps from a reset scene therefore does not by itself explain the margin of run-time governance; since RATs + stepwise replay also lacks the planning rules, the holding check, our consistency fixes and the longer time limit, the 59 trials between the two are not owed to the auditor and controller alone.

Figure 5: Both levels of RegHarness raise success, each by less when the other is present, while RATs’ own stepwise replay lowers success. Success (%) on the 180 paired LIBERO-PRO trials for each pairing of skill library (lines) and control loop (columns), and for RATs + stepwise replay (triangle); slopes give the change from run-time governance and brackets the change from the refined skills, in points.

### 4.4 Inside a trial

#### Rejected tests and rewrites are routine, changed proposals and final audits rare

We did not ablate the auditor’s context, the replay or the controller’s rules, so the counts below show how often each mechanism acts, not what it contributes (full counts, replay failures and false commits in the supplementary material). Over its 300 trials, RegHarness rejects 1,119 of 4,440 step tests, 452 of them after the arm has moved, and 87 of its 260 successes contain at least one of these 452. The auditor rewrites 67.3% of the plans and 48.5% of the drafts before they run, and after a step test it withholds commit from 135 of the 3,400 that the verifier passes (row 1 of [Fig. 3](#S4.F3)) but never proposes commit for a step the verifier has not passed. The controller changes only 62 of 4,440 proposals, all because no plan is left; the final audit runs in 25 trials, 16 of which a later plan solves (row 3); and in 56 of the 260 successes the task check ends the trial after a step test that the auditor did not propose to commit. On the paired trials a RegHarness step test replays 3.1 committed steps on average, so 75.8% of executed step segments are replays ([Eq. 2](#S3.E2)).

### 4.5 What still fails, and the cost

#### What still fails is object identity, flat plates and a low handle

An LLM agent assigns each failed trial the first error that no later plan overcomes (procedure and per-trial classes in the supplementary material). Of RegHarness’s 40 failures over five initial states, 20 come from the wrong object or part (16) or a misread instruction or target region (4), and 16 from a flat plate not grasped or pushed (11, in three tasks) or a drawer handle too low to reach (5, in one task); 4 have other causes. Of the 75 failures of run-time governance alone, 5 are its own: two follow a rewrite by the auditor (low confidence), and in three the holding check, which catches the empty grasp in row 2 of [Fig. 3](#S4.F3), overturns a grasp that had lifted the bowl. Of RegHarness’s 40 failures, we checked 13 and found none caused by run-time governance; two of the other 27 may be.

#### The system is not free

On the paired trials a RegHarness trial costs an estimated CNY 2.16 (US$0.32), 65.6% of it for the auditor, against 1.51 (US$0.23) for RATs, and takes 66 minutes on average against 50. The refined skills make a success cheaper with either loop, CNY 1.38 (US$0.21) for RATs + refined skills against 3.83 (US$0.57) for RATs and 2.46 (US$0.37) for RegHarness against 3.85 (US$0.58) for + Harness, while run-time governance makes a trial dearer with either library, CNY 2.25 (US$0.34) against 1.51 with the released skills and 2.16 against 1.04 (US$0.16) with the refined ones (cost estimation in the supplementary material). RATs + stepwise replay is the most expensive, CNY 3.24 (US$0.49) per trial and 12.68 (US$1.90) per success, since every try of every step is written and judged on its own.

### 4.6 MolmoSpaces

#### RegHarness solves 72.0% (144/200) of MolmoSpaces trials

The 40-entry skill library that RATs released for MolmoSpaces [[12](#bib.bib12)] stays byte-identical, while the grasp and perception functions it calls, the interface documentation and the rules were refined against the 25 failures of a first port that solved 15 of 40; all 200 trials, five repeats of those scenes with 26 to 30 solved per repeat, are therefore in-sample (95% CI [60.0, 83.0][60.0,\,83.0], bootstrap over scenes). Six pick-and-place instructions name no placement target and count as 30 failures, and in 12 successes the program raised an error after the task check had passed; the RATs paper reports 38.0%† on them (task-level results in the supplementary material).

### 4.7 Real robot

We ported RATs and RegHarness to a 7-DoF Kinova Gen3 arm with one fixed RGB-D camera ([Fig. 4](#S4.F4)a) and use three tasks: (1) put a ketchup bottle in a basket, (2) put a cream-cheese package on a bowl, and (3) swap a cube on a platform with the cube below it. With 15 trials per task and system ([Tab. 3](#S4.T3); protocol, and how RegHarness runs without a software reset, in the supplementary material), RegHarness solves 28 of 45 trials against 21 for RATs, a difference not significant at this sample size (Fisher’s exact test, p=0.20p=0.20).

Table 3: Real-robot successes out of 15 trials per task.

| Task | 1 | 2 | 3 | All |
| RATs | 8 | 7 | 6 | 21/45 |
| RegHarness | 12 | 9 | 7 | 28/45 |

## 5 Conclusion

On the 180 paired LIBERO-PRO trials, RegHarness’s refined skills alone lift RATs from 71 to 135 successful trials, its run-time governance alone achieves 105, and their combination reaches 158, compared with 46 for RATs’ own stepwise replay. These results highlight the importance of skill quality in Code-as-Policy agents, particularly when operating with low-cost models. While testing steps from reset scenes provides additional benefits, its contribution is most evident when integrated with the broader run-time governance framework. In our experiments, both levels were debugged on initial state 0 and evaluated directly on states 1–4. Since state 0 accounts for a third of the paired trials, the observed gain from skill refinement may be an upper estimate. We also evaluated RegHarness on a Kinova Gen3 arm, where it solves 28 of 45 trials, compared with 21 for RATs. Although preliminary, this result provides an initial indication of its potential beyond simulation. Reset-and-replay is currently limited to simulation. As a next step, we will evaluate the frozen systems on initial states 5–9 and investigate replacing reset-based execution on the robot with a recovery skill [[17](#bib.bib17)].

## Appendix

[Appendices A](#A1) and [B](#A2) detail RegHarness’s two levels, [Appendices C](#A3) and [D](#A4) the five LIBERO-PRO systems and the comparisons behind the attribution, and [Appendices E](#A5) and [F](#A6) failures, cost, MolmoSpaces and the real robot; [Appendix G](#A7) compares concurrent work. Unless stated otherwise, LIBERO-PRO numbers refer to the 180 paired trials on initial states 0–2.

## Appendix A Run-time governance

#### Auditor

The auditor is one Codex CLI conversation per trial, backed by deepseek-flash at thinking effort “high”; each audit is one turn, whose reply must validate against that audit’s JSON schema ([Tab. S1](#A1.T1)). The client compacts the conversation automatically at 900,000 tokens, so “task-long” means the same conversation, not a verbatim record.

Table S1: The four audits. All are turns of one auditor conversation per trial; only the step audit receives images.

| Audit  | Shown  | JSON reply  |
| ➊Plan  | task, scene summary, API documentation, the plan (skills by interface only), the planning rules  | decision (accept, revise, reject), rationale, defects, output_plan  |
| ➋Code  | task, API documentation, the step and its skill records, the draft, the static checker’s report  | decision, rationale, defects, final_body  |
| ➌Step  | the step, executed code, test output (first 1,000 and last 3,000 characters), verifier status and reason, tries and plans left, first and last frames  | action (commit, retry_step, replan, abort), rationale, corrective_action, edit_scale  |
| ➍Final  | that the task check is false; committed steps’ verdicts; end of the last output; last gripper reading  | process_consistent, findings, evidence_gaps, next_attempt (1–5), recommendation = close  |

#### Audit instructions

We quote fragments of RegHarness’s instructions (… marks an omission); + Harness receives the same fragments but lacks the further sentences listed in [Tab. S4](#A3.T4).

Every audit: “You are the bounded control-audit layer around a code-as-policy robot system. Preserve the native candidate unless there is a concrete, checkable defect. Do not invent observations, simulator state, APIs, or success labels. … You may only return the JSON object required by the supplied schema.”

plan audit: “Audit only the native plan’s semantics under the rules below. ACCEPT unchanged, REVISE by returning the complete replacement output_plan, or REJECT with concrete plan-level defects. A revised plan must remain grounded in the visible native context.”

code audit: “Audit one plan-step body. ACCEPT unchanged, REVISE with final_body, or REJECT. The final_body value itself must be bare executable step code: never put a wrapper function or RESULT assignment inside final_body.”

step audit: “Choose COMMIT only when sandbox success and native per-step status is exactly succeeded; otherwise retry, replan, or abort with a concrete correction.” On a plan’s last step also: “This is the plan’s last step: committing it ends the episode and claims that the task is complete. This execution’s printed output also holds the checks of the earlier steps, which were replayed before this one. If any of those checks, or this step’s own, reports that an intended effect did not occur, do not COMMIT, even when the per-step status is succeeded; retry when the cause lies in this step’s own action, replan when it lies in an earlier committed step.”

final audit: “Audit process consistency after this plan attempt’s native outcome, and analyse its failure. Every step of the plan was committed, but the environment’s own check reports that the task is not complete; the harness will start another plan attempt and pass it your findings. … Do not guess hidden simulator state. You cannot change benchmark_success or request execution. Always return recommendation=close.”

#### Controller

[Table S2](#A1.T2) gives the rules and [Alg. S1](#alg1) the loop of one trial.

Table S2: The controller’s rules, read top to bottom after every step test. aa: the auditor’s proposal; κ\kappa: [Eq. 3](#S3.E3); rr, qq: tries left for the step and plans left after this one. ∗The coder is also asked to redo the step and check the effects of the earlier ones.

| Predicate | Decision  |
| T⁡(s)=1T(s)=1 | trial succeeds  |
| R1 | a=commit∧¬κa=\textsf{commit}\wedge\neg\kappa | retry, then R2–R3  |
| R2 | a=retry∧r=0∧q>0a=\textsf{retry}\wedge r=0\wedge q>0 | replan  |
| R3 | a=retry∧r=0∧q=0a=\textsf{retry}\wedge r=0\wedge q=0 | abort  |
| R4 | a=abort∧q>0a=\textsf{abort}\wedge q>0 | replan  |
| R5 | a∈{replan,abort}∧q=0∧r>0a\in\{\textsf{replan},\textsf{abort}\}\wedge q=0\wedge r>0 | retry∗  |
| R6 | a=replan∧r=0∧q=0a=\textsf{replan}\wedge r=0\wedge q=0 | abort  |
| otherwise | aa  |

Algorithm S1  Step-level commit within one trial ([Sec. 3.4](#S3.SS4)); r=J−jr=J-j, q=P−pq=P-p; outcome: success. 1: task gg, initial state s0s_{0}, frozen code, budgets PP, JJ 2: open one auditor conversation AA; 𝑖𝑠𝑠𝑢𝑒←∅\mathit{issue}\leftarrow\emptyset 3: for p=1,…,Pp=1,\dots,P do 4: π←PlanAuditA​(Planner⁡(g,𝑖𝑠𝑠𝑢𝑒))\pi\leftarrow\mathrm{PlanAudit}_{A}(\mathrm{Planner}(g,\mathit{issue})) ⊳\triangleright ➊ 5: if π\pi rejected then next plan 6: C←()C\leftarrow(); 𝑓𝑏←∅\mathit{fb}\leftarrow\emptyset 7: for k=1,…,|π|k=1,\dots,|\pi| do 8: for j=1,…,Jj=1,\dots,J do 9: c~←CodeAuditA​(Coder⁡(σk,C,𝑓𝑏))\tilde{c}\leftarrow\mathrm{CodeAudit}_{A}(\mathrm{Coder}(\sigma_{k},C,\mathit{fb})) ⊳\triangleright ➋ 10: if c~\tilde{c} rejected or blocked then 𝑓𝑏←\mathit{fb}\leftarrow defects; continue 11: (s,e)←Exec⁡(reset⁡(s0),C⊕c~)(s,e)\leftarrow\mathrm{Exec}(\mathrm{reset}(s_{0}),C\oplus\tilde{c}) ⊳\triangleright [Eq. 1](#S3.E1) 12: v←HoldingCheck⁡(Verifier⁡(σk,c~,s,e))v\leftarrow\mathrm{HoldingCheck}(\mathrm{Verifier}(\sigma_{k},\tilde{c},s,e)) 13: a←StepAuditA​(σk,c~,e,v,r,q)a\leftarrow\mathrm{StepAudit}_{A}(\sigma_{k},\tilde{c},e,v,r,q) ⊳\triangleright ➌ 14: d←Controller⁡(a,κ,r,q)d\leftarrow\mathrm{Controller}(a,\kappa,r,q) ⊳\triangleright [Tab. S2](#A1.T2), R1–R6 15: if d=commitd=\textsf{commit} then C←C⊕c~C\leftarrow C\oplus\tilde{c} 16: if T⁡(s)=1T(s)=1 then return outcome 17: if d=commitd=\textsf{commit} then 𝑓𝑏←∅\mathit{fb}\leftarrow\emptyset; next step 18: if d=retryd=\textsf{retry} then 𝑓𝑏←\mathit{fb}\leftarrow correction 19: if d=repland=\textsf{replan} then 𝑖𝑠𝑠𝑢𝑒←\mathit{issue}\leftarrow correction; next plan 20: if d=abortd=\textsf{abort} then return failure    21: if step kk uncommitted then 𝑖𝑠𝑠𝑢𝑒←\mathit{issue}\leftarrow reason; next plan 22: if p<Pp<P then 𝑖𝑠𝑠𝑢𝑒←FinalAuditA​(⋅)\mathit{issue}\leftarrow\mathrm{FinalAudit}_{A}(\cdot) ⊳\triangleright ➍ 23: return failure

## Appendix B Between-run refinement and privileged information

[Table S3](#A2.T3) lists the changes to the released code.

Table S3: The change register on LIBERO-PRO. The 194 changes of RegHarness relative to the released RATs code, by class, and what + Harness keeps. The refined library has 71 entries: the 59 released ones, patched, plus 2 guidance entries, 6 new skills and 4 new perception primitives, written by the coding agent.

| Class  | Items | Contents  | In + Harness  |
| Consistency fixes  | 78 | success read only from the task check; correct initial-state loading; infrastructure faults discarded; an error after the task check passed counts as a success  | all kept (4 rewritten)  |
| Harness wrapper  | 49 | rule text (13), skill-interface view (5), control layer (31): audits, controller, holding check, final audit  | all kept (2 rewritten)  |
| Skill revisions  | 40 | library and runtime patches (9), new skills and perception interfaces (15), primitive fixes incl. the grasp-network frame (12), prompt text (4)  | all removed  |
| Undecided  | 27 | documentation fact corrections (13), manipulation principles (8), six others  | 3 kept, incl. grasp-sample reuse  |

#### Privileged information

Leakage is privileged data that reaches the text a run-time model sees or the code the policy executes: object poses and sizes, articulation states, success thresholds and intermediate quantities of the task check, numbers tuned against ground truth, and facts about a single episode that only the benchmark’s files hold. The final success signal (also per predicate), proprioception, camera data and quantities perceived from them, the task text as the released bridge passes it, the suite name and task type, what a type of task requires in words, and constants set with reference to, but not copied from, asset geometry or the success code are not leakage. Under this definition we found no leakage in + Harness or RegHarness.

## Appendix C Compared systems and protocol

[Table S4](#A3.T4) lists every difference we know of between the five LIBERO-PRO systems, so each comparison of [Sec. 4.3](#S4.SS3) is between complete systems; the settings of RATs + stepwise replay and RATs + refined skills were fixed before any of their results was seen.

Figure S1: RegHarness solves 55.0% of the paired trials with its first plan, more than RATs with its whole budget, and 87.8% within four; RATs + refined skills reaches 75.0% with six attempts. An attempt is one whole program for RATs and RATs + refined skills, one stepwise pass through a plan for RATs + stepwise replay, and one plan of up to four tries per step for + Harness and RegHarness, so attempts are not equal work; dotted: the four-attempt budget of the last three. Table S4: Every known difference between the five LIBERO-PRO systems. “As X”: as in system X.

| RATs  | RATs + stepwise replay  | RATs + refined skills  | + Harness  | RegHarness  |
| Loop  | plan, write the whole program, static check, rehearse, execute, verify, diagnose, retry  | RATs’ loop with --multiturn-reset: each step tested from a reset, committed steps replayed  | as RATs  | run-time governance ([Sec. 3](#S3))  | as + Harness  |
| Roles  | planner, planner verifier, whole-program coder, static checker, per-step verifier, diagnoser, goal verifier, SubAgent  | as RATs; the coder writes one step at a time  | as RATs  | coder writes one step at a time; drops planner verifier, rehearsal, SubAgent, feedback generator and the goal verifier’s LLM analysis; diagnoser on ambiguous verdicts only; adds the auditor  | as + Harness  |
| Budget; time per execution  | 6 attempts; 180 s  | 4 attempts, ≤4{\leq}4 tries per step (code default 10); 180 s per step test incl. replay  | 6 attempts; 180 s  | 4 plans, ≤4{\leq}4 tries per step; 480 s per step test  | as + Harness  |
| Rehearsal  | yes, unscored  | no  | yes  | no  | no  |
| task check read  | after each scored execution  | once, at the end of each attempt; reaching the goal mid-attempt does not end it  | as RATs  | after every step test; the trial ends when it holds  | as + Harness  |
| Commit  | none; a retry is a new whole program, prompted with the previous program, the diagnosis and segments marked as working  | on verifier *succeeded*, also after an error; forced after the last try  | as RATs  | [Eq. 3](#S3.E3)  | as + Harness  |
| Static checker  | whole program, incl. three checks only for whole programs (release or placement gated on a verification result, grasp with no later release or placement, missing result report); a block uses an attempt  | per step, without them  | as RATs  | each draft and the composed program, without them; a block uses a try  | as + Harness  |
| Audits  | none  | none  | none  | plan, code, step, final  | as + Harness, plus two sentences, on lost instances and on re-measuring a target while holding, and a mention of instance identifiers  |
| Holding check  | no  | no  | no  | yes; recognizes only the released way of reading the gripper  | yes  |
| Skills  | released, 59 entries; its loop writes usage statistics back to the library file  | released  | refined, 69 entries  | released, frozen  | refined, 71 entries, frozen, byte-identical in all 300 trials  |
| Primitives and documentation  | released (9 exported functions)  | as RATs; the step writer sees the first 6,000 characters of the documentation  | refined; documentation of 18,546 characters against 6,228  | released  | refined  |
| Planning rules  | none  | none  | none  | 5,844 characters  | 10,380 characters  |
| Consistency  | fixture reset after every reset  | as RATs  | as RATs  | replay reuses grasp samples; inverse-kinematics state cleared at reset; seeded random numbers; no fixture reset  | as + Harness  |
| Images  | video, one timestamped frame per second  | as RATs; diagnoser: first and last frames  | as RATs  | verifier: first and last, or sampled, frames; step audit: first and last agent-view frames; other audits: none  | as + Harness  |
| Initial states; parallel trials  | 0–2; 6 or 8  | 0–2; 6 to 10  | 0–2; about 10  | 0–2; 12  | 0–4; 12  |
| Shared by all  | Franka arm in LIBERO-PRO at 20 Hz; agent-view and wrist RGB-D; perception (pointing with Molmo2-8B, segmentation with SAM3, depth back-projection) with simulator camera extrinsics and noise-free depth; Contact-GraspNet and PyRoki; saved initial state ss with reset seed s+1s{+}1; failure memory off; every role on the provider alias deepseek-flash, thinking effort “high”, no temperature.  |

Table S5: Per-task outcomes on the Object, Goal and Spatial suites, by initial state. ✓ success, ⋅\cdot failure; for + Harness and RegHarness a failed trial shows its class ([Tab. S8](#A5.T8)). Object instructions read “Pick the ⟨\langleobject⟩\rangle and place it in the basket”, Spatial ones “Pick the akita black bowl ⟨\langlelocation⟩\rangle and place it on the plate”.

|  | RATs | RATs + stepwise replay  | RATs + refined skills  | + Harness | RegHarness |
| # | Instruction | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 3 | 4 |
| Obj-Pos |
| 0 | alphabet soup | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | G | ✓ | ✓ |
| 1 | cream cheese | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | salad dressing | ✓ | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | A | A | A | ✓ | ✓ | ✓ | ✓ | A |
| 3 | bbq sauce | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | A | A | A |
| 4 | ketchup | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | S | A | ✓ | ✓ | A | ✓ | ✓ | A |
| 5 | tomato sauce | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | butter | ✓ | ✓ | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | milk | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | chocolate pudding | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | S | S | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | orange juice | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Obj-Pos total (of 10) | 5 | 8 | 5 | 4 | 3 | 4 | 8 | 8 | 9 | 8 | 5 | 8 | 10 | 9 | 8 | 9 | 7 |
| Obj-Task |
| 0 | cream cheese | ✓ | ✓ | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | S | ✓ | S | ✓ | ✓ | ✓ | ✓ | A |
| 1 | alphabet soup | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ⋅\cdot | S | A | ✓ | ✓ | ✓ | A | ✓ | ✓ |
| 2 | tomato sauce | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ⋅\cdot | U | S | A | ✓ | ✓ | A | ✓ | ✓ |
| 3 | ketchup | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| 4 | milk | ✓ | ✓ | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | bbq sauce | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | orange juice | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | butter | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | S | A | S | A | A | ✓ | A | A |
| 8 | salad dressing | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | S | A | A | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | chocolate pudding | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | S | ✓ | ✓ | ✓ | ✓ | ✓ |
| Obj-Task total (of 10) | 4 | 5 | 3 | 4 | 4 | 7 | 8 | 9 | 7 | 4 | 6 | 5 | 9 | 9 | 8 | 9 | 7 |
| Goal-Pos |
| 0 | Open the middle layer of the drawer | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | U | U | U | ✓ | G | ✓ | ✓ | A |
| 1 | Put the bowl on the stove | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | H1 | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | Put the wine bottle on the top of the drawer | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | Open the top layer of the drawer and put the bowl inside | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ✓ | F | U | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | Put the bowl on the top of the drawer | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | Push the plate to the front of the stove | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | U | U | C | C | C | C | C | ✓ |
| 6 | Put the cream cheese on the bowl | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Turn on the stove | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | Put the bowl on the plate | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | Put the wine bottle on the rack | ✓ | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Goal-Pos total (of 10) | 2 | 4 | 6 | 3 | 3 | 1 | 7 | 8 | 6 | 5 | 6 | 7 | 9 | 8 | 9 | 9 | 9 |
| Goal-Task |
| 0 | open the bottom drawer of the cabinet | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | D | D | D | D | D | D | D | D |
| 1 | Put the plate on the stove | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | C | ✓ | ✓ | C | C | ✓ | ✓ | C |
| 2 | put the wine bottle in the bowl | ✓ | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | Open the top layer of the drawer and put the cream cheese inside | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | S | U | S | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | Put the plate on the top of the drawer | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | C | ✓ | C | C | ✓ | C | C | C |
| 5 | Push the cream cheese to the front of the stove | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | U | B | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | put the wine bottle in the bowl | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | U | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Turn off the stove | ✓ | ✓ | ✓ | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | Put the wine bottle on the plate | ✓ | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | Put the cream cheese on the rack | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | S | S | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Goal-Task total (of 10) | 6 | 2 | 4 | 4 | 2 | 2 | 7 | 5 | 7 | 3 | 5 | 7 | 7 | 8 | 8 | 8 | 7 |

Table S5: (continued) Spatial suite, and totals over all 60 tasks.

|  | RATs | RATs + stepwise replay  | RATs + refined skills  | + Harness | RegHarness |
| # | Instruction | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 3 | 4 |
| Spa-Pos |
| 0 | between the plate and the ramekin | ✓ | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | next to the ramekin | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | from table center | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | S | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | on the cookies box | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | A | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | in the top layer of the wooden cabinet | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | B | B | B | B | B | B | E | B |
| 5 | on the ramekin | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | next to the cookies box | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | A | H1 | A | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | on the stove | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | H2 | A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | next to the plate | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | on the wooden cabinet | ✓ | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Spa-Pos total (of 10) | 3 | 3 | 3 | 0 | 0 | 1 | 7 | 6 | 7 | 6 | 7 | 6 | 9 | 9 | 9 | 9 | 9 |
| Spa-Task |
| 0 | not between the plate and the ramekin | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1 | next to the cookie box | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ⋅\cdot | S | S | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | next to the plate | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | on the top of the cabinet | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | on the top of the wooden cabinet | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | U | S | U | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | on the cookie box | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | on the stove | ⋅\cdot | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | ✓ | H2 | H2 | ✓ | ✓ | F | ✓ | ✓ |
| 7 | on the top of the cabinet | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ⋅\cdot | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | next to the ramekin | ✓ | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ⋅\cdot | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | on the stove | ✓ | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ⋅\cdot | ✓ | ✓ | ✓ | F | ✓ | ✓ | ✓ | ✓ | ✓ | A | ✓ |
| Spa-Task total (of 10) | 2 | 2 | 4 | 1 | 1 | 2 | 10 | 8 | 8 | 5 | 4 | 8 | 10 | 10 | 9 | 9 | 10 |
| All 60 tasks | 22 | 24 | 25 | 16 | 13 | 17 | 47 | 44 | 44 | 31 | 33 | 41 | 54 | 53 | 51 | 53 | 49 |

#### Running RATs

Our RATs baseline is the released code [[26](#bib.bib26)] with five files changed and a local proxy added. It uses the full perception API with a Contact-GraspNet grasp sampler, because under the default evaluation interface 36 of the 45 released skills in use cannot be called.

#### Rehearsal

The released configuration runs every program that passes the static checker once from the reset scene before its scored execution, a stage the RATs paper does not describe; both runs execute the same program string from the same reset scene and seed, and the rehearsal’s task check is not used. It was true at the end of 77 of the 782 rehearsals, in 65 of the 180 trials. Over the 741 pairs of a rehearsal and the scored execution of the same program (the other 41 rehearsals raised an error), the outcome differs in 76 (exact McNemar p=0.57p=0.57).

#### RATs + stepwise replay

In the stepwise mode, the released per-step verifier indexes a single step as the first. RATs + stepwise replay corrects this indexing error in the per-step verifier and changes no other code. Executions in goal tasks reach the 180 s limit more often when more trials share the machine, which may lower its result.

#### RATs + refined skills

It carries 51 of the 64 changes that + Harness removes from RegHarness, 43 verbatim and 8 rewritten; one more, the pair of guidance entries, never reaches the model in either framework, and twelve exist only in the planning rules, audit instructions or modified planner that RATs lacks. RATs’ static checker rejects programs that gate a release or placement on a verification result, which the holding-verification skills’ documentation encourages, and each rejection, for whatever reason, uses up an attempt (139 of this system’s 680 checked programs); the SubAgent cannot call the new skills.

#### Voided runs

Each trial is scored once: a process stopped by an infrastructure or protocol fault was discarded, and the trial was rerun from the start with a full budget. On LIBERO-PRO this voided 13 of the 493 processes of the two harness systems, none after the task check had passed; 10 reruns succeeded, two of them with more than four plans over both processes. No RATs process was voided, and interrupted RATs + stepwise replay and RATs + refined skills trials were rerun the same way. On MolmoSpaces six trials were rerun and all six succeeded, one of them after an out-of-memory kill caused by the policy’s own code, which we counted as an infrastructure fault; MolmoSpaces trials run with an earlier set of switches are not reported.

#### Statistics

Intervals for rates and paired differences come from a bootstrap that resamples the 60 tasks with all initial states of a task together; we report the 2.5th and 97.5th percentiles. Paired tests are two-sided exact McNemar tests on the discordant trials.

## Appendix D Additional LIBERO-PRO results

[Table S5](#A3.T5) gives the outcome of every trial and, for + Harness and RegHarness, the class of every failed one; [Tab. S6](#A4.T6) gives the paired comparisons of [Sec. 4.3](#S4.SS3), and [Fig. S1](#A3.F1) shows when the successes arrive.

Table S6: Paired comparisons on the 180 paired trials: discordant trials, exact two-sided McNemar pp, and the difference in points with its task-clustered bootstrap 95% interval ([Appendix C](#A3)).

| First →\rightarrow second | Only 2nd | Only 1st | pp | Diff. | 95% interval |
| Run-time governance |
| RATs →\rightarrow + Harness | 55 | 21 | 1.2×10−41.2{\times}10^{-4} | +18.9+18.9 | [+9.4+9.4, +28.3+28.3] |
| RATs + refined skills →\rightarrow RegHarness | 31 | 8 | 2.9×10−42.9{\times}10^{-4} | +12.8+12.8 | [+5.6+5.6, +20.6+20.6] |
| Refined skills |
| RATs →\rightarrow RATs + refined skills | 74 | 10 | 3.3×10−133.3{\times}10^{-13} | +35.6+35.6 | [+26.1+26.1, +45.0+45.0] |
| + Harness →\rightarrow RegHarness | 57 | 4 | 4.9×10−134.9{\times}10^{-13} | +29.4+29.4 | [+21.1+21.1, +38.3+38.3] |
| RATs’ stepwise mode |
| RATs →\rightarrow RATs + stepwise replay | 18 | 43 | 0.0019 | −13.9-13.9 | [−22.8-22.8, −5.0-5.0] |
| RATs + stepwise replay →\rightarrow + Harness | 69 | 10 | 5.5×10−125.5{\times}10^{-12} | +32.8+32.8 | [+22.8+22.8, +42.8+42.8] |
| Other pairs |
| + Harness →\rightarrow RATs + refined skills | 50 | 20 | 4.4×10−44.4{\times}10^{-4} | +16.7+16.7 | [+6.7+6.7, +26.7+26.7] |
| RATs →\rightarrow RegHarness | 90 | 3 | 2.7×10−232.7{\times}10^{-23} | +48.3+48.3 | [+40.0+40.0, +56.7+56.7] |

#### How RATs retries

For the 574 retries whose previous attempt was executed and diagnosed with a failed step, we split both programs at the step markers into a preamble and one segment per step, ignore comments and indentation, and count a segment as changed when its similarity to the previous version of the same step is below 0.9; in 493 (86%) a segment other than the failed step’s changes.

### D.1 Scene consistency under reset

Replay re-executes committed code without restoring the simulator state ([Sec. 3.2](#S3.SS2)), so we compared rendered frames pixel by pixel. RATs, + Harness and RegHarness start a trial from the same scene (states 0 and 1), and within a trial of either harness system the scene is the same after every reset (fewer than 0.4% of the pixels differ), apart from the arm’s starting pose in two trials and from Spa-Pos 4 and Spa-Task 4, whose cabinet, with an open drawer, settles in a different pose after every reset ([Fig. S2](#A4.F2)) for a reason we have not found. These two tasks are 6 of the 180 paired trials, of which RegHarness solves three and RATs and + Harness none.

(a) Spa-Pos 4, first step test (b) Spa-Pos 4, second plan (c) Spa-Task 4, first step test (d) Spa-Task 4, fourth plan Figure S2: In two tasks the cabinet settles differently after each reset. Each row: the first frames of two step tests with no committed steps in one + Harness trial. The cabinet, with the bowls on and in it, is displaced; the plate and the box are not.

### D.2 Inside a trial

[Table S7](#A4.T7) gives the counts behind [Sec. 4.4](#S4.SS4). A step test is rejected when it leads to a retry, a new plan or an abort; the arm has moved when at least one motion command of the step under test, not of a replayed step, advanced the simulation by at least one frame.

Table S7: How often each mechanism of run-time governance acts, on the 180 paired trials and, in the last column, all 300 trials of RegHarness. “Passed” refers to the per-step verifier and “proposed” to the step audit.

| + Harness | RegHarness |
| Trials | 180 | 180 | 300 |
| Plans audited | 530 | 327 | 544 |
| rewritten | 52.8% | 67.6% | 67.3% |
| Drafts audited | 3,207 | 2,660 | 4,460 |
| rewritten | 56.5% | 48.5% | 48.5% |
| Step tests (per trial) | 3,185 (17.7) | 2,648 (14.7) | 4,440 (14.8) |
| committed | 1,620 | 1,973 | 3,265 |
| rejected | 1,547 | 642 | 1,119 |
| rejected, arm had moved | 1,157 | 264 | 452 |
| Solved trials with such a test | 84/105 | 55/158 | 87/260 |
| Passed, commit not proposed | 91/1,712 | 84/2,057 | 135/3,400 |
| Holding check overturned a pass | 19 | 0 | 3 |
| Proposals changed by controller | 56 | 33 | 62 |
| Closed by task check, no commit | 18 | 33 | 56 |
| Final audits (trials; solved later) | 46 (44; 29) | 19 (15; 11) | 30 (25; 16) |
| Replayed steps per step test | 1.8 | 3.1 | 3.1 |
| Replayed share of step segments | 63.9% | 75.8% | 75.7% |
| Prefix-replay aborts (trials) | 30 (16) | 4 (4) | 9 (6) |
| False-commit plans (trials) | 54/141 (50) | 22/147 (17) | 34/238 (27) |

#### Prefix-replay aborts

A step test aborts in its prefix when replaying the committed steps raises an error, so the step under test never runs. The count is a lower bound, since a replay that ends with a different outcome is not counted, and the lower rate of RegHarness does not show more faithful replays, because the skill libraries differ in how many checks can raise.

#### False-commit proxy

A plan in which every step that ran was committed while the task check failed contains at least one false commit. We count such plans among all plans whose executed steps were all committed; the count is a lower bound and does not say which step was wrong.

## Appendix E Failures and cost

#### Classification

Each failed trial receives one class ([Tab. S8](#A5.T8); per trial in [Tab. S5](#A3.T5)): the first error, in time order, that no later plan overcomes, or U when no single error dominates or can be attributed. An LLM agent assigns the class from the trial’s logs and, for some trials, from step-audit frames, and the authors checked every label. Classes S and H1–H4 were considered for 13 of RegHarness’s 40 failures only, and the + Harness failures on state 0 were classified from text, so some of them classed S may be misidentifications.

Table S8: Failure classes, one per failed trial. –: none among the 13 RegHarness failures checked for these classes; the other 27 were not checked. No trial is classed H3 (budget used up on a feasible task) or H4 (other error caused by run-time governance).

|  | + Harness | RegHarness |
| Class  | 180 | 180 | 300 |
| A | Misidentified object or part  | 17 | 6 | 16 |
| B | Instruction or target region misread  | 4 | 3 | 4 |
| C | Flat plate not grasped or pushed  | 4 | 7 | 11 |
| D | Low handle out of reach  | 3 | 3 | 5 |
| E | Holding-verification false negative taken as a stop  | 0 | 0 | 1 |
| F | Grasped but placed off target  | 11 | 1 | 1 |
| G | One-off physical or planning slip  | 0 | 2 | 2 |
| S | Released skill fails to grasp a non-flat object  | 19 | – | – |
| H1 | auditor’s rewrite introduced the error  | 2 | – | – |
| H2 | A correct step was not committed  | 3 | – | – |
| U | Undetermined  | 12 | 0 | 0 |
| Failed trials  | 75 | 22 | 40 |

Table S9: Estimated model cost (CNY) and wall-clock time per trial on the 180 paired LIBERO-PRO trials. Parentheses: the auditor’s calls, the cached share of the input, medians. Costs include discarded processes; times depend on how many trials ran in parallel ([Tab. S4](#A3.T4)).

| RATs | + Harness | RegHarness |
| Calls per trial (auditor) | 57.3 | 79.5 (39.8) | 65.6 (33.0) |
| Input tokens, M (cached) | 0.54 (23.2%) | 5.75 (89.5%) | 5.56 (87.4%) |
| Output tokens, M | 0.274 | 0.386 | 0.341 |
| Cost per trial | 1.51 (1.51) | 2.25 (2.25) | 2.16 (1.42) |
| Cost per success | 3.83 | 3.85 | 2.46 |
| Minutes per trial | 50 (46) | 70 (72) | 66 (43) |

#### Failures caused by run-time governance

Five + Harness failures fall into the H classes. Spa-Pos 5 on state 2 is a borderline case that we count as F; counted as H2, it would make them six. Two of RegHarness’s other 27 failures, both classed A, may belong to H2. Of the nine undetermined + Harness trials on states 0 and 1, seven mostly stop at a pose check that cannot pass, which traces to the documentation and to audits that asked for it.

#### Cost

Costs are estimated from the logged tokens of every model call of a trial, the auditor’s and those of discarded processes included, at the provider’s off-peak list prices (CNY 0.02, 1.0 and 4.0 per million cached input, uncached input and output tokens). [Table S9](#A5.T9) gives the cost per trial; RegHarness’s 300 trials cost CNY 663.27, and the 180 trials of RATs + stepwise replay and of RATs + refined skills 583.46 and 186.53.

#### Coding-agent usage

Between-run refinement as a whole (diagnosing failures; designing, implementing, reviewing and testing changes, dropped ones included; leakage audits, equivalence checks and freezing) took the coding agent, Claude Opus 5.5, an estimated 9.9 billion input tokens on LIBERO-PRO and 2.8 billion on MolmoSpaces, over 97% of them prompt-cache reads, and at least 33.6 and 13.7 million output tokens. Reports, deployment and run tools, protocol and score analyses are not counted; on MolmoSpaces only sub-agents are.

Table S10: Outcome of every MolmoSpaces task in the five repeats (columns 0–4). ✓ success; ✗ failure; – counted as a failure (the instruction names no placement target); e error after the task check had passed (a success); r rerun after an infrastructure fault; ∗ reaches the agent rewritten ([Appendix F](#A6)). By category: close 46/50, open 42/50, pick 41/50 and pick-and-place 15/50; the RATs paper reports 73.0, 20.0, 37.0 and 22.0% (400 trials, not run by us).

| Instruction  | 0 | 1 | 2 | 3 | 4 |  | Close |
| 0 | close the table.  | ✓ | ✓r | ✓ | ✓ | ✓ | 5/5 |
| 1 | close the dresser.  | ✗ | ✓ | ✓ | ✓ | ✓e | 4/5 |
| 2 | close the table.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 3 | close the dresser.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 4 | Open the drawer∗  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 5 | close the drawer.  | ✓ | ✓e,r | ✓ | ✓ | ✓ | 5/5 |
| 6 | Open the dark wood dresser with drawers∗  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 7 | close the table.  | ✓e | ✗ | ✓ | ✓e | ✓ | 4/5 |
| 8 | close the table.  | ✓ | ✓ | ✗ | ✓ | ✗ | 3/5 |
| 9 | Open the dark floral dresser∗  | ✓r | ✓ | ✓ | ✓ | ✓ | 5/5 |
| Open |
| 10 | Open the cabinet  | ✗ | ✓ | ✓ | ✓ | ✓ | 4/5 |
| 11 | open the cabinet.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 12 | open the dresser.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 13 | open the cabinet.  | ✓ | ✓r | ✓ | ✓ | ✓ | 5/5 |
| 14 | open the cabinet.  | ✓ | ✓r | ✓ | ✓ | ✓ | 5/5 |
| 15 | open the table.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 16 | open the drawer.  | ✓ | ✗ | ✓ | ✗ | ✗ | 2/5 |
| 17 | Open the drawer  | ✓ | ✓ | ✓ | ✓ | ✗ | 4/5 |
| 18 | open the table.  | ✗ | ✓ | ✓ | ✗ | ✗ | 2/5 |
| 19 | open the cabinet.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |

| Instruction  | 0 | 1 | 2 | 3 | 4 |  | Pick |
| 20 | Pick up the cylindrical dark fabric nhl pencilcase  | ✓ | ✗ | ✗ | ✗ | ✓ | 2/5 |
| 21 | Pick up the vintage yellow track shoe with spikes  | ✓ | ✓ | ✓ | ✓ | ✓e | 5/5 |
| 22 | Pick up the black grenade with red panels  | ✓ | ✓e | ✓ | ✓e | ✓ | 5/5 |
| 23 | Pick up the curved green handle knife with black blade  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 24 | pick up the colorful mosaic.  | ✓ | ✓ | ✓ | ✗ | ✗ | 3/5 |
| 25 | pick up the black lens.  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 26 | Pick up the blocky wooden rifle wrapped in green  | ✓r | ✓e | ✓ | ✓ | ✓ | 5/5 |
| 27 | Pick up the smooth golden bell with knob  | ✓ | ✓e | ✓e | ✓e | ✓ | 5/5 |
| 28 | pick up the packet.  | ✗ | ✓ | ✗ | ✓ | ✗ | 2/5 |
| 29 | Pick up the black high heel  | ✓ | ✓ | ✗ | ✓ | ✓ | 4/5 |
| Pick-and-place (P&P) |
| 30 | Pick up the electronic equipment and place it in or on the gray bowl  | ✗ | ✓ | ✓ | ✓ | ✗ | 3/5 |
| 31 | Pick up the spanner and place it in or on the white bowl blue  | ✓ | ✓ | ✓e | ✓ | ✓ | 5/5 |
| 32 | pick up the clock.  | ✗ | – | – | – | – | 0/5 |
| 33 | pick up the heart-shaped pink key.  | ✗ | – | – | – | – | 0/5 |
| 34 | pick up the gray shackle.  | ✗ | – | – | – | – | 0/5 |
| 35 | Pick up the red futuristic blaster and place it in or on the gray bowl  | ✗ | ✗ | ✓ | ✓ | ✗ | 2/5 |
| 36 | Pick up the black digital camcorder and place it in or on the simple light brown ceramic bowl  | ✓ | ✓ | ✓ | ✓ | ✓ | 5/5 |
| 37 | pick up the origami paper crane.  | ✗ | – | – | – | – | 0/5 |
| 38 | pick up the red onion bulb.  | ✗ | – | – | – | – | 0/5 |
| 39 | pick up the green sponge.  | ✗ | – | – | – | – | 0/5 |
| Successes per repeat (of 40) | 28 | 30 | 30 | 30 | 26 | 144/200 |

## Appendix F MolmoSpaces and the real robot

### F.1 MolmoSpaces

We use the 40-episode subset of the RATs paper [[26](#bib.bib26)], ten test-split episodes each of opening, closing, picking and pick-and-place, and score only the simulator’s judge_success() predicate, as that paper does. The five repeats rebuild the same 40 scenes; they are repetitions, not different initial states. All repeats ran with the same code, switches and prompts, with two plans per trial, up to four tries per step and RATs’ own retry loop disabled (results in [Tab. S10](#A5.T10)).

#### Three rewritten instructions

For close tasks 4, 6 and 9 the upstream generator writes “Open the …”; the bridge released with RATs replaces “Open” with “Close” before the agent sees the instruction, and we keep it as released. All 15 of these trials succeed; we treat the rewrite as part of the RATs protocol and keep the score.

Table S11: Real-robot tasks. Success is judged once the objects have been still for 3 s; an object still in the gripper is a failure.

| Task | Instruction  | Success criterion  |
| 1 | “Pick the ketchup and place it in the basket”  | The bottle does not touch the table and is supported by the basket (its rim included), with its midpoint inside the rim seen from above; the distractor bottle is not in the basket; the basket does not tip over  |
| 2 | “Put the cream cheese on the bowl”  | The package is still and touches only the bowl, not the table; the bowl is upright (looser than in simulation, since the real package may only fit across the rim)  |
| 3 | “pick up the cube on the platform, move it off the platform, and exchange it with the cube initially placed below the platform”  | The red cube rests on top of the box; the green cube rests on the table and does not touch the top of the box; the box neither tips over nor moves more than 5 cm  |

Table S12: Concurrent harnesses, compared on what each paper reports. ✓ reported; ∘\circ in part; ✗ not reported.

| Run-time | Between-run | Automatic | Shared skills, | Matched | Real |
| commit gate | skill/harness edits | acceptance | no VLA or demos | attribution | robot |
| Auriga [[21](#bib.bib21)] | ∘a\circ^{a} | ∘b\circ^{b} | ✗ | ∘c\circ^{c} | ∘d\circ^{d} | ✗ |
| RegenHarness [[23](#bib.bib23)] | ✓ | ∘e\circ^{e} | ✗ | ∘f\circ^{f} | ✗ | ✓ |
| DynaHarness [[5](#bib.bib5)] | ∘a\circ^{a} | ✓ | ✓ | ✗ | ∘d\circ^{d} | ✓ |
| VISTA [[29](#bib.bib29)] | ∘a\circ^{a} | ✓ | ✓ | ✗ | ∘d\circ^{d} | ✗ |
| AMP1 [[2](#bib.bib2)] | ∘a\circ^{a} | ∘g\circ^{g} | ✗ | ∘h\circ^{h} | ∘d\circ^{d} | ✓ |
| RegHarness (ours) | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |

Commit gate: fixed rules decide whether an executed step is committed. Automatic acceptance: an edit is kept only after a fixed comparison or held-out test. Matched attribution: gains split between the two levels on paired trials. aMotion checks, no commit decision. bWho revised it is not stated. cNo library shared across tasks. dComponent ablations. eProtocol only, no results. fQuadruped skills. gAgent-written memory. hOnly AMP1+ carries a code library across tasks.

### F.2 Real robot

Both systems run on a 7-DoF Kinova Gen3 arm with a ChangingTek CTAG2F90C two-finger gripper and one fixed Orbbec Gemini 336L RGB-D camera, without a wrist camera ([Fig. 4](#S4.F4)). Both use deepseek-flash, observe only the camera stream and the joint and gripper readings, and reach the hardware through the same perception and motion services and the same bridge, which rejects commands outside its workspace and motion limits.

#### Manual reset

Each step normally continues from the state left by the previous step. If a problem arises, the operator can reset the scene by hand and retry within the same step submission. A failed step can be retried up to three times. After each trial and before a second attempt, the operator resets the scene and the arm returns to its initial configuration.

#### Protocol

Each system ran 15 trials per task (tasks in [Tab. S11](#A6.T11), results in [Tab. 3](#S4.T3)), each of at most two attempts, with its skill library fixed across trials, an empty cross-trial memory at the start of every trial and the diagnosis of the first attempt passed to the second. The operator judges success on site by the criteria of [Tab. S11](#A6.T11); this verdict decides whether a second attempt follows and is the only signal returned to the system. The frames of [Fig. 4](#S4.F4)(b) come from a run recorded while we set up the tasks, not from the evaluated trials; it replayed, with two distractors added, a program RATs wrote on site. In the real-robot runs we observed that success depended strongly on where the objects were initially placed and on the randomness of the language model’s strategy in a run; more real-robot analysis is left to future work, since here the robot serves only to verify the feasibility of our method.

## Appendix G Comparison with concurrent work

[Table S12](#A6.T12) compares RegHarness with five of the concurrent harnesses of [Sec. 2](#S2), on what each paper reports.
