# TransHarness: From Benchmark Overfitting to Transferable Harness Evolution

Tianze Xia Affiliation: Huazhong University of Science and Technology, Wuhan, China Zimo Wang Affiliation: Huazhong University of Science and Technology, Wuhan, China Heng Tong Affiliation: Huazhong University of Science and Technology, Wuhan, China Zhaoxiang Liu Affiliation: Unicom Data Intelligence, China Unicom, Beijing, China Shiguo Lian Affiliation: Unicom Data Intelligence, China Unicom, Beijing, China Fan Huang Affiliation: Xiamen University, Xiamen, China Wenyu Liu Affiliation: Huazhong University of Science and Technology, Wuhan, China Yunchao Wei Affiliation: Beijing Jiaotong University , Beijing, China Xinggang Wang Affiliation: Huazhong University of Science and Technology, Wuhan, China Correspondence to: [xgwang@hust.edu.cn](mailto:xgwang@hust.edu.cn)

###### Abstract

Harness evolution offers a path to improving coding agents without updating model weights. However, existing methods can overfit their evolution benchmarks, producing gains that fail to carry over to new tasks. To address this challenge, we introduce Transferable Harness Evolution (TransHarness), which evolves harness intervention policies from same-task success–failure contrasts. These policies couple execution-context triggers with diagnostic guidance, enabling task-dependent checks and corrections beyond the source executions. Cross-task replay and independent semantic selection retain policies that intervene selectively and ground corrections in current-task evidence rather than source-specific solutions. We further curate an independent evolution set for cross-distribution transfer and conduct a cross-benchmark evaluation covering multiple strong models and a range of lightweight and mature harnesses. Experiments show that, with only 300 source trajectories from outside the test distribution, TransHarness further improves strong agents across distinct target benchmarks, demonstrating transferable harness evolution beyond benchmark overfitting. Specifically, TransHarness achieves state-of-the-art scores of 76.4% on DeepSWE v1.1 and 95.5% on Terminal-Bench 2.1, surpassing the strongest baseline model, GPT-6 Astra, by 2.4 and 5.6 percentage points, respectively.

###### Keywords: 

agent harnesses, program evolution, language model agents, transfer ††affiliationnotice: †Equal contribution. *Corresponding author. Email to the first author: Tianze Xia <xiatianze@hust.edu.cn>. Figure 1: Challenges in transferable harness evolution. (a) Meta-Harness ([Lee et al., 2026](#bib.bib16)) improves on our independent evolution set but loses performance on DeepSWE v1.1 ([Huang & Jiang, 2026](#bib.bib12)). (b) In HarnessOpt-Bench ([Ursekar et al., 2026](#bib.bib27)), an evolved simple Python harness still trails mature OpenCode under the same model and held-out tasks. The evolved score is reconstructed from the reported normalized gain. (c) Recovery gains and regression losses determine the net change in DeepSWE success ([Table 3](#S3.T3)).

## 1 Introduction

Coding agents rely on harnesses to organize tool use, interpret feedback, and verify task outcomes ([Yang et al., 2024b](#bib.bib36); [Wang et al., 2025](#bib.bib29)). Harness evolution improves these execution mechanisms using experience from past tasks, offering a path to stronger agents without updating model weights ([Zhang et al., 2026b](#bib.bib43); [Lee et al., 2026](#bib.bib16); [Wu et al., 2026a](#bib.bib32)).

However, gains on the tasks that drive evolution may fail to carry over to new tasks. SICA selects agent versions on a fixed task suite ([Robeyns et al., 2025](#bib.bib23)), Meta-Harness searches for and evaluates coding harnesses on the same TerminalBench-2 tasks ([Lee et al., 2026](#bib.bib16)), and Self-Harness selects candidates using feedback from held-out tasks within the benchmark ([Zhang et al., 2026a](#bib.bib41)). Such feedback can favor adaptations to recurring benchmark characteristics, making benchmark overfitting difficult to distinguish from transferable improvement. DGM and ModularRSI test cross-benchmark transfer ([Zhang et al., 2026b](#bib.bib43); [Wu et al., 2026a](#bib.bib32)), yet sustaining gains under distribution shift remains challenging. Our Meta-Harness reproduction illustrates this gap. It improves on our independent evolution set, but its success rate falls on DeepSWE v1.1 ([Figure](#S0.F1) [1a](#S0.F1)).

To improve agents in practical settings, harness evolution must also benefit strong models running in mature harnesses. Existing methods can improve minimal starting systems, such as DGM’s harness with basic execution and editing tools and Self-Harness’s minimal DeepAgent ([Zhang et al., 2026b](#bib.bib43); [Zhang et al., 2026a](#bib.bib41)). How to improve mature systems remains an open question. In HarnessOpt-Bench, an evolved simple harness still trails mature OpenCode when both use the same model and evaluation tasks ([Ursekar et al., 2026](#bib.bib27)) ([Figure](#S0.F1) [1b](#S0.F1)). As baseline success increases, fewer failures remain to recover and more successful executions are at risk of regression. A positive net gain on strong agents therefore requires a lower ratio of the regression rate to the recovery rate. If the ratio is too high, overall performance can decline even when evolution recovers some failures ([Figure](#S0.F1) [1c](#S0.F1)). To transfer gains to strong agents, interventions must uncover overlooked problems while preserving behavior that already works.

A correction can be specific to its source task even when the underlying execution failure recurs across task distributions. To address this challenge, we introduce Transferable Harness Evolution (TransHarness), which evolves when and how a harness intervenes during execution. TransHarness derives intervention policies from contrasts between successful and failed executions of the same task. Each policy pairs a trigger based on observable execution context with diagnostic guidance. The guidance directs agents to task requirements and evidence, allowing the same decision problem to receive different corrections across tasks. Cross-task replay and independent semantic selection together retain policies that intervene selectively and guide corrections based on evidence from the current task, making them usable beyond the original source-task solution ([Figure 2](#S2.F2)).

To test whether harness evolution transfers across task distributions, we construct an independent evolution set and characterize how it differs from the target benchmarks in code repositories, task types, and application domains. For each model and harness configuration, we run the baseline agent on the evolution set and use the resulting trajectories to generate and select intervention policies. We then evaluate the evolved systems on the target benchmarks, covering multiple strong models and both lightweight and mature harnesses. TransHarness achieves state-of-the-art scores of 76.4% on DeepSWE v1.1 and 95.5% on Terminal-Bench 2.1 ([Huang & Jiang, 2026](#bib.bib12); [The Terminal-Bench Team, 2026](#bib.bib26)), exceeding GPT-6 Astra by 2.4 and 5.6 percentage points, respectively.

Our main contributions are as follows.

- •

We find that gains on source tasks can turn into losses when transferred to a new benchmark. We derive the condition for harness evolution to yield a positive net gain on target tasks. At a fixed recovery rate, a higher baseline success rate allows a lower regression rate.

- •

We propose TransHarness, which evolves harness intervention policies from same-task success–failure contrasts. In relevant contexts, these policies guide agents to reassess decisions using current-task evidence. Cross-task replay tests how selectively they activate, and independent semantic selection checks whether diagnoses are supported and whether guidance depends on source-task solutions.

- •

We construct an independent evolution set to evaluate transfer across task distributions. Experiments with multiple strong models in lightweight and mature harnesses demonstrate the transferable gains of TransHarness, which achieves state-of-the-art performance on both DeepSWE v1.1 and Terminal-Bench 2.1.

## 2 Related Work

Figure 2: Schematic overview of transferable intervention evolution with TransHarness. (a) Same-task contrasts motivate a candidate. (b) Authoring review refines the candidate. Candidates passing replay enter independent semantic selection of diagnosis, source independence, and evidence-grounded guidance; replay statistics are withheld. Gold nodes mark trigger activation. (c) Selected policies form a harness that responds to current events and history; arrows indicate runtime information flow.

#### Learning and evolving agent harnesses.

Harness evolution extends feedback-based optimization to executable agents ([Zhang et al., 2024](#bib.bib45); [Zhang et al., 2025](#bib.bib42); [Hu et al., 2025](#bib.bib11)). Meta-Harness searches historical code, scores, and traces ([Lee et al., 2026](#bib.bib16)); ModularRSI combines same-task contrasts, module-restricted updates, review, and task-aware composition ([Wu et al., 2026a](#bib.bib32)). TransHarness instead couples context-sensitive triggers with diagnostic guidance.

Validation and transfer of harness improvements. Self-Harness checks regressions ([Zhang et al., 2026a](#bib.bib41)), VERSE co-evolves verification and optimization ([Wang et al., 2026b](#bib.bib31)), and RRSI regularizes selection ([Xia et al., 2026](#bib.bib34)). Held-out evaluation separates search from testing ([Wang et al., 2026a](#bib.bib30); [Ursekar et al., 2026](#bib.bib27); [Wu et al., 2026b](#bib.bib33); [Ding et al., 2026](#bib.bib8)). AHE verifies predicted edit effects from trajectory evidence ([Lin et al., 2026](#bib.bib17)); HarnessCompass constrains edits to task-agnostic mechanisms ([Zhang et al., 2026c](#bib.bib44)); Meta2 learns knowledge for task-local evolution ([Yuan et al., 2026](#bib.bib38)). TransHarness instead freezes policies before deployment, using replay to test selectivity and semantic selection to examine source-specific assumptions. Further comparisons appear in [Appendix D](#A4).

## 3 Transferable Harness Evolution

TransHarness evolves policies that recognize recurring decision problems and guide reassessment under new task requirements. Candidate refinement is followed by selection on source evidence ([Figure 2](#S2.F2)). The selected policies are composed into the final harness.

Given a fixed model MM and base harness H0H_{0}, we learn an ordered intervention set BB on source distribution PP. The intervention set defines the evolved harness HBH_{B}, which uses the same execution model as the base harness for every new task. The objective is to improve success on tasks drawn from an independent target distribution QQ:

| ΔQ​(B)=𝔼x∼Q​[pHB​(x)−pH0​(x)],\Delta_{Q}(B)=\mathbb{E}_{x\sim Q}\!\left[p_{H_{B} }(x)-p_{H_{0} }(x)\right], | (1) |

Here, pH​(x)p_{H}(x) is the probability that HH solves xx. Construction and selection use source evidence alone; we freeze the resulting harness HBH_{B} before evaluating it on target tasks.

### 3.1 Evolving Intervention Policies

From a same-task success–failure pair ρ=(τ+,τ−)\rho=(\tau^{+},\tau^{-}) under H0H_{0}, an author diagnoses divergent decisions and derives a reusable principle. Each pair starts from H0H_{0}; diagnoses without a reusable principle can be declined. [Figure](#S2.F2) [2a](#S2.F2) contrasts repairing a bug with weakening a test. The resulting principle evaluates test changes against task requirements and the remaining defect, allowing task-dependent repairs.

Each policy u=(s,g,c)u=(s,g,c) specifies a harness location ss, executable trigger gg, and diagnostic guidance cc. When g⁡(ht,et)=1g(h_{t},e_{t})=1 for history hth_{t} and event ete_{t}, the harness supplies cc through ss to direct reassessment toward relevant requirements and evidence. Locations cover model calls, tools, context updates, and completion ([Section B.5](#A2.SS5)). Triggers use observable execution context; the policy transfers a diagnostic procedure whose resolution remains responsive to current requirements ([Figure 3](#S3.F3)).

Algorithm 1  TransHarness self-evolution 0:  Base harness H0H_{0}, source pairs Π\Pi, histories ℛ\mathcal{R} 1: I←[]I\leftarrow[\,] 2: for each ρi∈Π\rho_{i}\in\Pi in source order do 3: zi←Author⁡(ρi,H0)z_{i}\leftarrow\mathrm{Author}(\rho_{i},H_{0}) 4: (zi,di)←Review⁡(ρi,zi)(z_{i},d_{i})\leftarrow\mathrm{Review}(\rho_{i},z_{i}) 5: if di=reworkd_{i}=\mathrm{rework} then zi←Rework⁡(ρi,zi)z_{i}\leftarrow\mathrm{Rework}(\rho_{i},z_{i}) 6: (hi,𝐧i)←CheckReplay⁡(zi,ℛ)(h_{i},\mathbf{n}_{i})\leftarrow\mathrm{CheckReplay}(z_{i},\mathcal{R}) 7: if hi=1∧u⁡(zi)≠∅h_{i}=1\;\land\;u(z_{i})\neq\varnothing then 8: I←I∥[i]I\leftarrow I\mathbin{\|}[i] 9: end if 10: end for 11: IG←[i∈I:G(𝐧i)=1]I_{G}\leftarrow[i\in I:G(\mathbf{n}_{i})=1] 12: for each i∈IGi\in I_{G} do 13: (vd​i,vs​i,va​i)←SelectSemantic⁡(ρi,zi)(v_{\mathrm{d}i},v_{\mathrm{s}i},v_{\mathrm{a}i})\leftarrow\mathrm{SelectSemantic}(\rho_{i},z_{i}) 14: end for 15: J←[i∈IG:vd​ivs​iva​i=1]J\leftarrow[i\in I_{G}:v_{\mathrm{d}i}v_{\mathrm{s}i}v_{\mathrm{a}i}=1] 16: return Compose⁡([u⁡(zj)]j∈J,H0)\mathrm{Compose}([u(z_{j})]_{j\in J},H_{0})

### 3.2 Refining Intervention Scope and Semantics

Two properties determine whether a source-derived intervention remains useful: which executions it affects, and what its guidance induces in those executions. Consider HH and H+uH+u coupled through common randomness, with identical histories and resource-limit effects until uu first affects execution. Let AuA_{u} denote this event. For distribution D∈{P,Q}D\in\{P,Q\} with ℙD​(Au)>0\mathbb{P}_{D}(A_{u})>0, define exposure aD=ℙD​(Au)a_{D}=\mathbb{P}_{D}(A_{u}) and conditional value vD=𝔼D​[YH+u−YH∣Au]v_{D}=\mathbb{E}_{D}[Y_{H+u}-Y_{H}\mid A_{u}]. Only executions in AuA_{u} can contribute to the difference, giving

| ΔD​(u∣H)=aD​vD.\Delta_{D}(u\mid H)=a_{D}v_{D}. | (2) |

The source–target change therefore satisfies

| ΔQ​(u∣H)−ΔP​(u∣H)=(aQ−aP)​vP+aQ​(vQ−vP).\begin{multlined}\Delta_{Q}(u\mid H)-\Delta_{P}(u\mid H)\\ =(a_{Q}-a_{P})v_{P}+a_{Q}(v_{Q}-v_{P}).\end{multlined} | (3) |

Transfer can fail through either factor: an unchanged activation rate can accompany inappropriate corrections, while overly narrow activation misses recoverable failures. Both scope and guidance must generalize beyond the conditions encountered in the source task. The decomposition motivates two complementary checks: replay examines where a policy intervenes, while semantic selection examines whether its guidance remains valid under new requirements.

The consequences are sharper for strong baselines. Let (Y0,YB)(Y_{0},Y_{B}) be paired binary outcomes on QQ, with base success p0=ℙ⁡(Y0=1)p_{0}=\mathbb{P}(Y_{0}=1), rescue rate r=ℙ⁡(YB=1∣Y0=0)r=\mathbb{P}(Y_{B}=1\mid Y_{0}=0), and regression rate q=ℙ⁡(YB=0∣Y0=1)q=\mathbb{P}(Y_{B}=0\mid Y_{0}=1). Then

| Δ=(1−p0)​r−p0​q.\Delta=(1-p_{0})r-p_{0}q. | (4) |

Even perfect recovery is limited by the failures remaining under the base harness. For 0<p0<10<p_{0}<1, [Equation 4](#S3.E4) gives this ceiling and requires recovery gains to outweigh losses on originally successful executions:

| Δ≤1−p0,Δ>0⇔q<1−p0p0​r.\Delta\leq 1-p_{0},\qquad\Delta>0\iff q<\frac{1-p_{0} }{p_{0} }r. | (5) |

Higher baseline success leaves fewer failures to recover and lowers the allowable regression-to-rescue ratio. A fixed increase in qq then costs more success points. Useful interventions reach correctable decisions while preserving successful behavior. [Appendix A](#A1) gives the derivations and states the assumptions on coupled executions.

Authoring review refines each candidate against its motivating pair ([Figure](#S2.F2) [2b](#S2.F2)). The reviewer revises guidance wording or requests one author rework for changes to the diagnosis or trigger. Executable checks validate the implementation and record activation and control-flow effects on both successful and failed source histories.

For example, a completion intervention initially required running existing tests and “fixing any failures.” Review identified an appropriate execution that left an unrelated failure unresolved. The revised guidance repairs failures caused by the current change and reports unrelated ones, preserving verification without an unconditional repair obligation. Independent selection then assesses whether the completed candidate should enter the final composition.

Figure 3: Transfer of an evolved decision principle to a Koota task. (a) Target requirements. (b) Source-evolved code from the adapted Self-Harness candidate ([Zhang et al., 2026a](#bib.bib41)) and TransHarness. (c) Self-Harness checks verification evidence before submission; TransHarness prompts a requirement audit after passing checks, leading to a new NOT-update test and cache-key repair. (d) Native evaluation of independent executions on the same 43 task-specific tests; all executions pass the same 172 tests for regressions.

### 3.3 Transfer-Oriented Policy Selection

Selection screens event-triggered activation and assesses corrective obligations. For each policy uu, let 𝐧⁡(u)=(n−,n+,n±,N)\mathbf{n}(u)=(n_{-},n_{+},n_{\pm},N) summarize replay on N>0N>0 trajectory pairs from other source tasks. The first three counts indicate activation on failed executions only, successful executions only, or both, excluding session-start guidance. The replay gate is

| G(𝐧(u))=𝕀[n±N<0.9]𝕀[n−≥n+].G(\mathbf{n}(u))=\mathbb{I}\!\left[\frac{n_{\pm} }{N}<0.9\right]\mathbb{I}[n_{-}\geq n_{+}]. | (6) |

It rejects nearly indiscriminate event-triggered activation and policies that more often single out successful executions. Surviving policies, including session-start guidance, then undergo independent semantic assessment of the frozen candidate and its motivating pair, without replay statistics. Its three verdicts vd,vs,vav_{\mathrm{d} },v_{\mathrm{s} },v_{\mathrm{a} } require a supported diagnosis, independence from the source solution, and corrective actions grounded in failed checks or explicit task requirements. Selection retains

| 𝒰∗={u∈𝒰:G⁡(𝐧⁡(u))​vd​(u)​vs​(u)​va​(u)=1}.\mathcal{U}^{*}=\{u\in\mathcal{U}:G(\mathbf{n}(u))v_{\mathrm{d} }(u)v_{\mathrm{s} }(u)v_{\mathrm{a} }(u)=1\}. | (7) |

The two stages assess event-triggered selectivity and task-grounded guidance: a credible diagnosis can trigger indiscriminately, while a selective trigger can carry an unjustified correction. The selector accepts or rejects without editing. Selected policies are composed in source order within each interface ([Figure](#S2.F2) [2c](#S2.F2)) and frozen before target evaluation. Because interventions alter later contexts, we evaluate the complete harness ([Equation 19](#A1.E19)). Algorithm [1](#alg1) uses proposal ziz_{i}, checker acceptance hih_{i}, and replay counts 𝐧i=𝐧⁡(u⁡(zi))\mathbf{n}_{i}=\mathbf{n}(u(z_{i})); [Section B.2](#A2.SS2) details the judgments.

Table 1: Results on DeepSWE v1.1 (113 tasks) and Terminal-Bench 2.1 (89 tasks). Harnesses separated by a slash follow benchmark order. Public entries retain their reported settings ([Table 9](#A3.T9)).

| Model  | Harness  | Score (%) |
|  | DeepSWE v1.1  | Terminal-Bench 2.1  |
| Gemini 3.1 Pro  | Mini-SWE / Terminus 2  | 12.0  | 73.8  |
| Muse Spark 1.1  | Mini-SWE / Terminus 2  | 53.0  | 77.9  |
| Grok 4.5  | Mini-SWE / Terminus 2  | 54.0  | 81.6  |
| Claude Sonnet 5  | Mini-SWE / Terminus 2  | 54.0  | 80.5  |
| Claude Opus 4.8  | Mini-SWE / Terminus 2  | 59.0  | 84.6  |
| GPT-5.5  | Mini-SWE / Terminus 2  | 67.0  | 84.3  |
| Claude Fable 5  | Mini-SWE / Terminus 2  | 70.0  | 84.6  |
| GPT-5.6 Sol  | Mini-SWE / Terminus 2  | 73.0  | 89.5  |
| Claude Opus 5  | Mini-SWE / Terminus 2  | 74.0  | 89.1  |
| GPT-6 Astra  | Mini-SWE / Terminus 2  | 74.0  | 89.9  |
| Qwen3.8-Flash-Next  | Mini-SWE / Terminus 2  | 65.5  | 85.4  |
| +TransHarness  | 69.0 (+3.5)  | 86.5 (+1.1)  |
| Qwen Code  | 55.8  | 86.5  |
| +TransHarness  | 63.7 (+7.9)  | 89.9 (+3.4)  |
| GLM-5.3 Flash  | Mini-SWE / Terminus 2  | 63.4  | 77.5  |
| +TransHarness  | 67.3 (+3.9)  | 82.0 (+4.5)  |
| ZCode  | 60.2  | 82.0  |
| +TransHarness  | 61.9 (+1.7)  | 83.1 (+1.1)  |
| DeepSeek V4.1 Flash (1017)  | Mini-SWE / Terminus 2  | 73.2  | 84.3  |
| +TransHarness  | 76.4 (+3.2)  | 86.5 (+2.2)  |
| DeepSeek Harness  | 70.8  | 89.9  |
| +TransHarness  | 75.2 (+4.4)  | 95.5 (+5.6)  |

Table 2: Transfer to DeepSWE v1.1 after evolving Mini-SWE with a shared source archive and executor. Parentheses show changes from the base harness.

| Method  | Score ↑\uparrow  | Rec. ↑\uparrow  | Reg. ↑\uparrow  |
| Base harness  | 73.2  | —  | —  |
| Meta-Harness  | 69.0 (−4.1)  | +12.7  | −16.8  |
| Self-Harness  | 73.5 (+0.3)  | +13.3  | −13.0  |
| RRSI  | 73.5 (+0.3)  | +11.5  | −11.2  |
| TransHarness (Ours)  | 76.4 (+3.2)  | +13.0  | −9.7  |

Table 3: Transfer to DeepSWE v1.1 under source budgets ([Section C.8](#A3.SS8)). Each task supplies three trajectories; parentheses show changes from the base harness.

| Source tasks  | Score ↑\uparrow  | Rec. ↑\uparrow  | Reg. ↑\uparrow  |
| 0  | 73.2  | —  | —  |
| 25  | 69.9 (−3.2)  | +12.1  | −15.3  |
| 50  | 70.8 (−2.4)  | +14.7  | −17.1  |
| 75  | 74.3 (+1.2)  | +14.2  | −13.0  |
| 100  | 76.4 (+3.2)  | +13.0  | −9.7  |

### 3.4 Constructing Evolution Evidence

The evolution set must provide informative failures and varied contexts for examining whether a diagnosis extends beyond its motivating task. We construct it from SWE-bench Pro ([Deng et al., 2026](#bib.bib7)), combining difficulty-ranked selection with repository coverage. For repository pool 𝒫j\mathcal{P}_{j}, public multi-model solve rate rpub​(x)r_{\mathrm{pub} }(x), and fixed language offset βℓ⁡(x)\beta_{\ell(x)}, the ranking score and coverage constraints are

| κ⁡(x)=rpub​(x)+βℓ⁡(x),|𝒮|=n,|𝒮∩𝒫j|≥m∀j.\begin{gathered}\kappa(x)=r_{\mathrm{pub} }(x)+\beta_{\ell(x)},\\ |\mathcal{S}|=n,\qquad|\mathcal{S}\cap\mathcal{P}_{j}|\geq m\quad\forall j.\end{gathered} | (8) |

Low κ\kappa prioritizes low historical solve rates, adjusted by language preference. We select within repository difficulty bands, fill in ascending κ\kappa order, and enforce coverage. With n=100n=100 and m=4m=4, the set spans eleven repositories; three executions per task provide 300 trajectories for outcome contrasts and cross-task refinement.

The set retains SWE-bench Pro’s executable environments and verifiers ([Deng et al., 2026](#bib.bib7)). We check execution readiness for all 100 tasks and inspect instruction–test alignment in a language-stratified sample covering the four source-language groups. Selection parameters and quality checks appear in [Sections C.1](#A3.SS1) and [C.2](#A3.SS2).

After fixing 𝒮\mathcal{S}, we characterize its relationship to the target benchmarks through task type (the requested operation) and application domain (its intended use). Model-assisted annotation assigns these labels under a common codebook. For either view ff, category proportions pDf​(z)p_{D}^{f}(z) in task set DD define the total variation (TV) distance:

| DTVf​(𝒮,𝒯)=12​∑z|p𝒮f​(z)−p𝒯f​(z)|.D_{\mathrm{TV} }^{f}(\mathcal{S},\mathcal{T})=\frac{1}{2}\sum_{z}\left|p_{\mathcal{S} }^{f}(z)-p_{\mathcal{T} }^{f}(z)\right|. | (9) |

TV is zero for identical proportions and one for disjoint categories ([Figures 4](#S4.F4) and [4.2](#S4.SS2)).

## 4 Experiments

We first measure how well TransHarness transfers across benchmarks, models, and harnesses. We then compare evolution methods using the same model, source trajectories, and initial harness, and use ablations to identify which design choices support transfer.

Figure 4: Source–target distribution shift. (a,b) Task types and application domains of our independent evolution set and both target benchmarks. (c) Total variation DTVD_{\mathrm{TV} } ([Equation 9](#S3.E9)) compares the same target subset with a benchmark-internal or our independent evolution set. Bars average 10,000 random 2:1 partitions; whiskers show the 5th–95th percentiles. Larger distances indicate greater shift. Annotation and partition details appear in [Section C.3](#A3.SS3).

### 4.1 Experimental Setup

Evolution data and target benchmarks. For each configuration, we run the base agent three times on each task in our independent 100-task evolution set ([Section 3.4](#S3.SS4)). TransHarness constructs and selects interventions from the resulting 300 trajectories. We freeze each evolved harness before testing on DeepSWE v1.1 (113 tasks) ([Huang et al., 2026](#bib.bib13); [Huang & Jiang, 2026](#bib.bib12)) or on Terminal-Bench 2.1 (89 tasks) ([Merrill et al., 2026](#bib.bib19); [The Terminal-Bench Team, 2026](#bib.bib26)).

Models and harnesses. We evaluate DeepSeek V4.1 Flash (1017) ([DeepSeek-AI, 2026a](#bib.bib5)), GLM-5.3 Flash ([Z.ai, 2026a](#bib.bib39)), and Qwen3.8-Flash-Next ([Qwen Team, 2026a](#bib.bib21)). Our lightweight harnesses are Mini-SWE on DeepSWE and Terminus 2 on Terminal-Bench ([SWE-agent Team, 2026](#bib.bib25); [Harbor Team, 2026](#bib.bib10)). Native harnesses include DeepSeek Harness, ZCode, and Qwen Code ([DeepSeek-AI, 2026b](#bib.bib6); [Z.ai, 2026b](#bib.bib40); [Qwen Team, 2026b](#bib.bib22)). We fix the model settings, tools, environment, and execution limits when comparing the base and evolved harnesses.

Comparison settings. Table [3](#S3.T3) compares base and evolved configurations on both benchmarks alongside public scores ([Datacurve, 2026](#bib.bib4); [Artificial Analysis, 2026b](#bib.bib3)). On DeepSWE v1.1, we compare TransHarness, Meta-Harness, Self-Harness, and RRSI using the same DeepSeek V4.1 Flash (1017) model, initial Mini-SWE 2.4.6 harness, and source trajectories from this configuration, with method-specific search budgets ([Lee et al., 2026](#bib.bib16); [Zhang et al., 2026a](#bib.bib41); [Xia et al., 2026](#bib.bib34)). No RRSI candidate passed its acceptance rule; we evaluate the candidate with the highest source success rate, breaking ties by lower token cost.

Score reporting. All our evaluations report means over three independent runs (N=3N=3); public scores come from official reports or public leaderboards. For [Tables 3](#S3.T3), [3](#S3.T3) and [4](#S4.T4), we compute scores, recovery and regression contributions, and net gains from the underlying execution outcomes at full precision, then round each reported quantity independently to one decimal place. Subtracting displayed scores or summing displayed recovery and regression contributions may therefore differ from the reported net gain by 0.1 percentage points.

### 4.2 Main Results

Transfer across benchmarks and harnesses. [Table 3](#S3.T3) shows that TransHarness improves DeepSeek, Qwen, and GLM on both benchmarks, with gains across lightweight and native harnesses. On DeepSWE v1.1, improvements hold for Mini-SWE and all three native harnesses, with Qwen Code gaining the most at 7.9 points. On Terminal-Bench 2.1, all three models likewise improve with either Terminus 2 or their native harnesses. DeepSeek with Mini-SWE and DeepSeek Harness achieves the best scores on the respective benchmarks, 76.4% and 95.5%, surpassing GPT-6 Astra by 2.4 and 5.6 points. For these two configurations, paired gains over their respective base harnesses have 95% CIs of [−2.4, 8.8][-2.4,\,8.8] and [−1.1, 12.4][-1.1,\,12.4] points ([Section C.3](#A3.SS3.SSS0.Px5)).

Transfer under distribution shift. Our independent evolution set differs from the target benchmarks in both repository coverage and task distribution. It shares none of DeepSWE’s 91 repositories and emphasizes repair and extension in product workflows. DeepSWE centers on software development, while Terminal-Bench spans build, data production, and system configuration ([The Terminal-Bench Team, 2026](#bib.bib26)) ([Figure](#S4.F4) [4a,b](#S4.F4)). With the target subset fixed, replacing a benchmark-internal evolution set ([Zhang et al., 2026a](#bib.bib41)) with our independent set increases mean domain-distribution distance from 0.13 to 0.70 on DeepSWE and from 0.18 to 0.64 on Terminal-Bench. The gap persists at matched evolution-set sizes ([Figure](#S4.F4) [4c](#S4.F4)). We further examine transfer to unseen task compositions. TransHarness improves success on compositional OOD tasks in all four DeepSeek configurations, with Mini-SWE and Terminus 2 gaining 14.6 and 4.1 points, respectively ([Section C.3](#A3.SS3.SSS0.Px5)). These gains show that evolved policies can apply to requirement combinations absent from the source tasks.

### 4.3 Comparison with Harness Evolution Methods

Starting from the same Mini-SWE base, the methods obtain different cross-benchmark gains from source-task evolution. Meta-Harness ([Lee et al., 2026](#bib.bib16)) gains 2.0 points on the evolution set but loses 4.1 on DeepSWE ([Figure](#S0.F1) [1a,c](#S0.F1)). Self-Harness and RRSI recover failures in 13.3% and 11.5% of all paired executions, respectively, but regress in 13.0% and 11.2%, leaving each with a net gain of only 0.3 points ([Table 3](#S3.T3)). In comparison, TransHarness recovers 13.0%, close to Self-Harness, while reducing regressions to 9.7%, the lowest among the compared evolution methods. By retaining recovery gains while disrupting fewer successful executions, TransHarness reaches 76.4% on DeepSWE, exceeding the base harness and strongest comparator by 3.2 and 2.9 points, respectively. [Section C.6](#A3.SS6) reports paired confidence intervals and scores for all three evaluation runs.

### 4.4 Ablation Analysis

Intervention timing. We first examine whether guidance depends on the execution context in which it is delivered ([Table 4](#S4.T4)). Runtime variants share interfaces, policy order, and activation caps, with similar guidance lengths. Delivering the same guidance at the first eligible event rather than the learned trigger reduces success to 72.6%. Recovery remains close to the full method, 12.7% versus 13.0%, but regressions rise from 9.7% to 13.3%. Thus, learned timing preserves much of the guidance’s corrective benefit while reducing disruption to executions that would otherwise succeed.

Diagnostic guidance. Retaining the learned trigger and diagnostic topic, we replace evidence-based reassessment with a prescribed correction. Success falls to 65.5%, recovery drops to 8.8%, and regressions rise to 16.5%. Combining direct correction with early activation yields the highest regression rate, 17.7%. Together, these controls explain how intervention design shapes the balance in [Equation 4](#S3.E4). The trigger identifies a relevant execution context, while diagnostic guidance directs the agent to resolve the issue using current requirements and evidence. Fixing the correction in advance weakens both failure recovery and preservation of successful behavior.

Table 4: Ablations on DeepSWE v1.1. The no-review variant uses a separately constructed intervention set. Parentheses show score changes relative to TransHarness.

| Method  | Score ↑\uparrow  | Rec. ↑\uparrow  | Reg. ↑\uparrow  |
| TransHarness (Ours)  | 76.4  | +13.0  | −9.7  |
| w/o learned triggers  | 72.6 (−3.8)  | +12.7  | −13.3  |
| w/o reassessment  | 65.5 (−10.9)  | +8.8  | −16.5  |
| w/o triggers & reassessment  | 66.4 (−10.0)  | +10.9  | −17.7  |
| w/o construction review  | 67.3 (−9.1)  | +9.4  | −15.3  |

Construction review. Construction review examines the diagnostic basis and scope of candidate interventions before deployment. The separately constructed harness with fourteen unreviewed interventions reaches 67.3%, whereas the reviewed seven-intervention harness reaches 76.4%, with more recoveries and fewer regressions ([Table 4](#S4.T4)). The example in [Section 3.2](#S3.SS2) illustrates the role of this refinement. Review preserves the need for verification while restricting repair to failures caused by the current code change, avoiding guidance that would turn unrelated failures into unnecessary edits.

### 4.5 Additional Analyses

Policy transfer on Koota. The Koota case shows how a source-evolved policy adapts to a new task ([Figure 3](#S3.F3)). After local tests pass, the policy prompts the agent to reassess requirement coverage, revealing untested NOT-update behavior. The agent then adds a test and repairs the cache key. The base harness passes 41 of 43 task-specific tests, while Self-Harness, which checks verification evidence before completion ([Zhang et al., 2026a](#bib.bib41)), passes 42. TransHarness passes all 43, and all three harnesses pass the 172 regression tests. Here, the source policy provides a reason to question incomplete verification, while the target task supplies the requirement and evidence needed to derive the repair.

Figure 5: DeepSWE v1.1 success versus evolution tokens ([Table 3](#S3.T3)). Cost includes candidate construction and source validation; it excludes shared archive collection and evaluation on the target benchmark ([Section C.4](#A3.SS4)).

Source budget. We compare harnesses constructed from nested subsets of the independent evolution set. Harnesses built from 25 and 50 tasks fall below the base, while those built from 75 and 100 tasks gain 1.2 and 3.2 points ([Table 3](#S3.T3)). The 50-task harness recovers more failures than the 100-task harness, yet incurs a larger regression loss, 17.1 versus 9.7 points. The stronger result with 100 tasks therefore reflects fewer disrupted successes rather than more recoveries. This comparison reinforces the need to assess transferable evolution through both kinds of outcome change.

Evolution cost. TransHarness achieves the highest DeepSWE score, 76.4%, with the lowest evolution cost among the compared methods, 132.7M tokens ([Figure 5](#S4.F5)). The cost difference largely reflects candidate validation. Fresh source executions account for over 99% of the recorded evolution tokens for Meta-Harness and Self-Harness. TransHarness instead replays archived trajectories to examine trigger behavior and reviews guidance for dependence on source-specific assumptions. This design screens for transferable policies with fewer new executions while achieving stronger target performance.

## 5 Conclusion

We presented TransHarness, a framework for evolving harnesses beyond their source benchmark. It combines context-sensitive triggers with diagnostic guidance, using cross-task replay and independent semantic selection to refine interventions. Evolved on an independent task set, TransHarness improves strong coding models with both lightweight and mature harnesses and achieves state-of-the-art results on DeepSWE v1.1 and Terminal-Bench 2.1. Gains on compositional OOD tasks further demonstrate transfer to unseen requirement combinations. Ablations and target-task analysis show how selective intervention and evidence-based reassessment support these gains, enabling corrections on new tasks while reducing disruption to successful executions.

## Impact Statement

This work improves coding agents through their execution infrastructure, without updating model weights. More reliable harnesses can reduce repeated debugging and improve automated software development. Because evolved interventions influence code changes and verification, deployment should retain checks appropriate to software security and maintainability alongside functional task evaluation.
