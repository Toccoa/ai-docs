# How Much Do Coding Agents Over-Edit, and Why? An Empirical Study of Unneeded Edits in Repository-Level Agent Patches

Aakash Goel, Benjamin Steenhoek11footnotemark: 1 , Yu Hu
 Microsoft
 {aakashgoel, bensteenhoek, yuhu}@microsoft.com ††thanks: Equal contribution. November 25, 2026

###### Abstract

Agent patches are larger than developers’, which is widely read as over-editing. But patch size does not say whether the extra edits are needed, what they are, or where they come from. We introduce Delta Residue Attribution (DRA), which replays agent trajectories, traces every block (unit) of the final patch to the step that wrote it, reverts each unit, and reruns the task tests to decide whether the unit is needed. We apply DRA to 7,660 resolved GitHub Copilot CLI trajectories from 18 frontier models on SWE-bench Verified (6,728) and DeepSWE (932), and grade developer patches using the same method. Agent patches do change more lines than developers’; on SWE-bench Verified the majority of extra edits add tests (61%) and documentation (13%) while on DeepSWE, most extra edits are code (58%). On both benchmarks, agents’ code is on average at least as necessary as developers’ (mean NPcode\mathrm{NP}_{\mathrm{code} } 0.887 vs. 0.864 on SWE-bench Verified, where 11 of 18 models leave less unneeded code than developers, and 0.797 vs. 0.785 on DeepSWE). On average, 11% of an agent patch’s code units on SWE-bench Verified are still unneeded, and 89% of those change behavior. Tests the agent adds detect most injected bugs (68%, against 77% for the task tests); 5% of all injected bugs are caught by the agent’s new or strengthened tests but missed by the task tests. Debug steps write almost none of the unneeded code. Code necessity differs substantially by model; it is unrelated to resolve rate on SWE-bench Verified and negatively correlated with it on DeepSWE (Spearman −0.59-0.59, p=0.01p=0.01). On SWE-bench Verified, pruning with DRA using only the tests the agent can see (its own tests and the repository’s) removes the majority of unneeded code but also some needed code (67% recall, 46% precision), and 89% of pruned patches still resolve the task; asking the agent to audit its own diff is more precise but less effective (36% recall, 66% precision). We recommend that benchmarks report code necessity next to resolve rate and that over-editing be addressed through model training and harness-level pruning.

## 1 Introduction

Language models are now routinely asked to edit existing code rather than write it from scratch. Passing tests is necessary but not sufficient: a patch that fixes a three-line bug by rewriting fifty lines is harder to review and more likely to carry unintended changes. In a maintainer study, roughly half of the SWE-bench-passing patches would not have been merged ([Whitfill et al., 2026](#bib.bib35)), and many plausible patches behave differently from the developer fix on inputs the tests do not cover ([Wang et al., 2026](#bib.bib34)). We call the tendency to change more than necessary *over-editing*. On minimal function-level edits, models change far more than the task requires ([Zhu et al., 2026](#bib.bib40)). At the repository level, successful agent patches contain about twice as many changes as developers’ patches, and minimality prompts barely help ([Luo et al., 2026](#bib.bib18)). Larger agent patches are therefore widely read as over-editing.

Preservation prompts ([Zhu et al., 2026](#bib.bib40); [Chai et al., 2026](#bib.bib4)) and edit-aware training ([Zhu et al., 2026](#bib.bib40); [Yang et al., 2026](#bib.bib36); [Ke et al., 2026](#bib.bib17)) reduce function-level over-editing. Patch size does not tell whether the extra edits are needed, what kind of edits they are, or when in the trajectory they were written; the answers to these questions determine what a fix should look like. If the extra edits are debugging leftovers, a harness can clean them up. If they are tests, they may be welcome. If they are written into the fix, the model has to change.

We study over-editing in repository-level patches at the level of individual blocks and the trajectory steps that wrote them. Our research questions are: RQ1: How much do agents over-edit compared with developers? RQ2: What are the unneeded edits? RQ3: Where in the trajectory do they come from? RQ4: Which models over-edit more, and does over-editing track resolve rate? RQ5: Can unneeded code be removed automatically?

To answer these questions, we build DRA. DRA replays a resolved trajectory, splits the final patch into units (contiguous blocks of changed lines that can be reverted on their own), and traces each unit to the step that wrote it. It decides whether a unit is needed by reverting it and rerunning the task tests, in the tradition of delta debugging ([Zeller and Hildebrandt, 2002](#bib.bib39)). The share of needed units is the *necessity precision* NP\mathrm{NP}, and NPcode\mathrm{NP}_{\mathrm{code} } is that share over code units. Because benchmark tests miss some needed behavior ([Wang et al., 2026](#bib.bib34)), we also check unneeded code with behavioral probes ([Section 3.4](#S3.SS4)) and grade developer patches the same way. We apply DRA to 7,660 resolved coding-agent trajectories of 18 models on SWE-bench Verified and DeepSWE.

#### Findings.

Agent patches do change more lines than developers’, but on SWE-bench Verified the extra lines are mostly tests (61%) and documentation (13%), while on DeepSWE most extra edits are code (58%; RQ2). On code, on SWE-bench Verified 11 of 18 models leave less unneeded code than developers (mean NPcode\mathrm{NP}_{\mathrm{code} } 0.887 vs. 0.864), for four no significant difference is detected (which does not establish equivalence), and three models leave more (RQ1, [Section 5.1](#S5.SS1)). On DeepSWE, agents are on par with developers (0.797 vs. 0.785), but no model is significantly above the developer baseline. On average, 11% of an agent patch’s code units are still unneeded, and 89% of those change behavior (RQ2). Debug steps (exploring, reproducing, or probing) write almost none of the code residue (154 of 3,987 units); fix steps write 83% of it (RQ3). Code necessity differs by model and does not correlate with resolve rate on SWE-bench Verified (Spearman −0.10-0.10), but on DeepSWE it is anti-correlated (−0.59-0.59, p=0.01p=0.01; RQ4). On SWE-bench Verified, after generation, self-audit is precise (65.7%) but finds only 35.5% of unneeded code, pruning with the agent’s own tests and the repository’s regression tests finds 67.3% at lower precision (46.3%) on the 2,495 eligible patches, and stopping early barely changes NPcode\mathrm{NP}_{\mathrm{code} } (0.700 to 0.710; RQ5). Our contributions are a block-level empirical study of over-editing with developer patches graded the same way, the DRA method ([Section 3](#S3)), and implications for evaluation and harness design ([Section 6](#S6)). Appendix [A.1](#A1.SS1) lists our pre-registered hypotheses and our deviations from them.

## 2 Related Work

#### Measuring over-editing.

[Zhu et al. (2026)](#bib.bib40) and PDB ([Chai et al., 2026](#bib.bib4)) measure unneeded edits against a known minimal fix, mostly on single functions, CanItEdit ([Cassano et al., 2024](#bib.bib2)) measures how much of a function edit the tests cover, and edit-aware training reduces it ([Yang et al., 2026](#bib.bib36); [Ke et al., 2026](#bib.bib17)). At the repository level, RECAP ([Luo et al., 2026](#bib.bib18)) compares patch sizes. Coverage metrics conflate “executed by tests” with “required by the task”. DRA measures necessity by counterfactual removal and needs no unique reference patch.

#### Why unneeded changes are costly.

Change size predicts defects ([Nagappan and Ball, 2005](#bib.bib22); [Kamei et al., 2013](#bib.bib16)), and tangled changes distort defect data ([Herzig and Zeller, 2013](#bib.bib9)). Reviewers favor small, focused changes ([Rigby and Bird, 2013](#bib.bib25); [Bacchelli and Bird, 2013](#bib.bib1)), and larger changes take longer to review ([Sadowski et al., 2018](#bib.bib26)). Agent pull requests often need reviewer involvement or later rework ([Peralta et al., 2026](#bib.bib23); [Pham and Ghaleb, 2026](#bib.bib24)). Plausible patches often differ from the developer fix on untested inputs ([Wang et al., 2026](#bib.bib34)). LLM refactorings that pass existing tests can still change behavior ([Dristi and Dwyer, 2026](#bib.bib7)). Both findings motivate our behavioral checks.

#### Agent harnesses, trajectories, and delta debugging.

Work on agent harnesses and trajectories ([Yang et al., 2024](#bib.bib37); [Wang et al., 2025](#bib.bib33); [SWE-agent Team, 2025](#bib.bib31); [Shu et al., 2026](#bib.bib28); [Ceka et al., 2026](#bib.bib3)) does not attribute individual patch blocks to the steps that wrote them. DRA builds on delta debugging ([Zeller and Hildebrandt, 2002](#bib.bib39)) and inherits the overfitting caveat of test-based repair ([Smith et al., 2015](#bib.bib29)), so we calibrate against developer patches. Appendix [I](#A9) gives the extended discussion.

## 3 Tracing Edits to Trajectory Steps: DRA

DRA has four steps: replay, unit provenance, step-role labeling, and necessity grading. [Figure 1](#S3.F1) shows the pipeline on a small example (Appendix [B.1](#A2.SS1)), and [Algorithm 1](#alg1) gives pseudocode.

Figure 1: Overview of DRA. A resolved trajectory is replayed, each unit of the final patch is traced to the step that wrote it, the step is labeled with a role, and each unit is reverted to test whether it is needed. Unneeded units are attributed to the role of the step that wrote them. The example is the parse_date() fix of Appendix [B.1](#A2.SS1). Algorithm 1  Delta Residue Attribution (DRA) 0:  base files S0S_{0}, resolved trajectory τ=((at,ot))t=1T\tau=((a_{t},o_{t}))_{t=1}^{T}, submitted patch Δ\Delta, oracle 𝒪\mathcal{O} 1:  replay the edit and create calls of τ\tau on S0S_{0}, recording line-level blame after every step 2:  assert the replayed final state equals Δ\Delta 3: for each unit u∈𝒰⁡(Δ)u\in\mathcal{U}(\Delta) do 4: t⋆​(u)←t^{\star}(u)\leftarrow latest step that wrote or deleted a line of uu 5: r⁡(t⋆​(u))←Rules​(at⋆)​ or Judge​(at⋆,ot⋆,context)r(t^{\star}(u))\leftarrow\textsc{Rules}(a_{t^{\star} })\text{ or }\textsc{Judge}(a_{t^{\star} },o_{t^{\star} },\text{context}) 6: class⁡(u)∈{code,test,docs,nonsemantic,config}\mathrm{class}(u)\in\{\text{code},\text{test},\text{docs},\text{nonsemantic},\text{config}\} 7: n⁡(u)←1−𝒪⁡(ST⊖u)n(u)\leftarrow 1-\mathcal{O}(S_{T}\ominus u) 8: end for 9: return NPtest​(Δ)\mathrm{NP}_{\mathrm{test} }(\Delta), NPcode​(Δ)\mathrm{NP}_{\mathrm{code} }(\Delta), ρ\rho, and the per-unit table

### 3.1 Definitions

An agent produces a trajectory of actions and observations; executing the first tt actions of a task yields the working-tree state StS_{t}, and the submitted patch is Δ=diff⁡(S0,ST)\Delta=\mathrm{diff}(S_{0},S_{T}). We decompose Δ\Delta into units 𝒰⁡(Δ)={u1,…,un}\mathcal{U}(\Delta)=\{u_{1},\dots,u_{n}\} that can each be reverted on their own, and write ST⊖uS_{T}\ominus u for the state with unit uu reverted. An oracle 𝒪\mathcal{O} accepts a state (𝒪⁡(S)=1\mathcal{O}(S)=1) if it passes some check. The task-test oracle 𝒪test\mathcal{O}_{\mathrm{test} } runs the SWE-bench FAIL_TO_PASS and PASS_TO_PASS tests ([Jimenez et al., 2024](#bib.bib14)) (on DeepSWE, the task’s own tests). We analyze only resolved patches, so 𝒪⁡(ST)=1\mathcal{O}(S_{T})=1. A unit is *needed* for 𝒪\mathcal{O} if reverting it causes rejection (n𝒪​(u)=1n_{\mathcal{O} }(u)=1, written needed), and *unneeded* otherwise (n𝒪​(u)=0n_{\mathcal{O} }(u)=0, written unneeded). The *necessity precision* NP𝒪\mathrm{NP}_{\mathcal{O} } of a patch is its needed units divided by all its units:

| n𝒪​(u)=1−𝒪⁡(ST⊖u),n_{\mathcal{O} }(u)=1-\mathcal{O}(S_{T}\ominus u), | (1) |

| NP𝒪​(Δ)=1|𝒰⁡(Δ)|​∑un𝒪​(u).\mathrm{NP}_{\mathcal{O} }(\Delta)=\frac{1}{|\mathcal{U}(\Delta)|}\sum_{u}n_{\mathcal{O} }(u). | (2) |

NP=1\mathrm{NP}=1 exactly when Δ\Delta is 1-minimal ([Zeller and Hildebrandt, 2002](#bib.bib39)), meaning no single unit can be removed without the oracle rejecting the patch; larger groups of units may still be removable together. A *unit* is an atomic piece of an edit. *Unneeded code* is an unneeded unit in a code file; units in test files are graded separately ([Section 3.2](#S3.SS2)). NP\mathrm{NP} inherits the oracle’s blind spots: a unit that the tests do not need may still serve the developer’s intent ([Smith et al., 2015](#bib.bib29)). We therefore treat the share of unneeded units as an upper bound on true excess, and we compare agents with developer patches graded the same way (Appendix [B.2](#A2.SS2) separates three notions of minimality).

### 3.2 Replay, Units, and Provenance

Agent trajectories record every tool call but not intermediate repository states. We replay the structured file-editing calls on the task’s base files with line-level blame after each step, and we exclude trajectories whose replayed final state does not match the submitted patch exactly (96.7% of SWE-bench Verified trajectories replay). A unit is a contiguous block of changed lines in one file (blocks separated by at most one unchanged line are merged), and a new or deleted file is one unit. Each unit is a *code* unit or a non-code unit (test, documentation, configuration, or comment and formatting edits). SWE-bench grading resets test files, so test changes don’t change the oracle’s result. We therefore report test edits separately from code as *ungraded*, and call ungraded test edits and unneeded units together the patch’s *extra edits*. We use NPcode\mathrm{NP}_{\mathrm{code} } as the primary measure (Appendix [B.3](#A2.SS3) gives the rules). The introduction step t⋆​(u)t^{\star}(u) of a unit is the latest step that wrote or deleted any of its lines, so a unit first written at a debug step and later revised at a fix step is attributed to the fix.

### 3.3 Step-Role Labeling

Each step that introduces a unit gets a role. We group roles into three: debug (explore, reproduce, and probe steps), fix (fix and refine steps), and cleanup (steps that revert earlier changes). Two deterministic rules run first, and an LLM judge (GPT-6.1 Sol) labels the rest based on the issue, the condensed history, the action, and the agent’s narration (Appendix [B.4](#A2.SS4) gives the six fine-grained roles and the rubric).

### 3.4 Oracle: Grading Necessity

For each unit we revert its lines in the task container and rerun the task tests. We count reversions that cannot be applied (they leave the base state or do not parse) as needed. Task tests do not exercise every input path, so we also check unneeded code units with behavioral probes modeled on PatchDiff ([Wang et al., 2026](#bib.bib34)). We report necessity under 𝒪test\mathcal{O}_{\mathrm{test} } and use the probes to validate its unneeded verdicts; the strengthened oracle 𝒪+\mathcal{O}^{+}, which also rescues units whose reversion matches the developer patch, uses the same probe labels. For each code unit that 𝒪test\mathcal{O}_{\mathrm{test} } marks unneeded, an LLM (GPT-6.1 Sol) sees the issue and the diff of the reversion, without the task tests or the developer patch, and writes several differential calls: probe-script inputs that call the changed code and print labeled outputs. We run them under the agent patch, the reverted state, and the developer patch. A unit is needed under 𝒪+\mathcal{O}^{+} if its reversion fails the task tests or makes the same behavioral change as the developer patch. Appendix [C.1](#A3.SS1) reports the breakdown. Units are reverted one at a time ([Section 6](#S6)).

### 3.5 Step Attribution and Developer Calibration

The unneeded units form the residue Edbg∪EfixE_{\mathrm{dbg} }\cup E_{\mathrm{fix} }: EdbgE_{\mathrm{dbg} } holds the units whose introducing step is a debug step, and EfixE_{\mathrm{fix} } holds the rest. The debug share is

| ρ=|Edbg|/|Edbg∪Efix|,\rho=|E_{\mathrm{dbg} }|\,/\,|E_{\mathrm{dbg} }\cup E_{\mathrm{fix} }|, | (3) |

and ρcode\rho_{\mathrm{code} } restricts it to code residue. A debug-step edit that is needed is not residue, because the experiment became the fix.

Developer patches also contain code the tests do not need, so we grade SWE-bench Verified developer patches (code files only) the same way and report, for each model, the gap between the means

| Δdev=NPcode¯​(agent)−NPcode¯​(developer)\Delta_{\mathrm{dev} }=\overline{\mathrm{NP}_{\mathrm{code} }}(\text{agent})-\overline{\mathrm{NP}_{\mathrm{code} }}(\text{developer}) | (4) |

over instances where both have code units, with a 95% instance-bootstrap CI (B=2000B=2000; all CIs in this paper are 95% bootstrap intervals over instances unless noted). If Δdev<0\Delta_{\mathrm{dev} }<0, the agent leaves more unneeded code than the developer.

## 4 Study Setup

### 4.1 Data

We evaluate 18 models from four providers on SWE-bench Verified ([Jimenez et al., 2024](#bib.bib14); [Chowdhury et al., 2024](#bib.bib5)) (500 Python coding tasks) and DeepSWE ([Huang et al., 2026](#bib.bib12)) (113 long-horizon coding tasks in Go, TypeScript, Python, Rust, and JavaScript), using the GitHub Copilot CLI ([GitHub, 2026](#bib.bib8)) coding agent. SWE-bench Verified resolve rates range from 64.0% to 89.4%. The resolve rate of a model is the share of its attempted tasks whose final patch passes the task tests. For each model we use all of its resolved SWE-bench Verified instances whose trajectory replays exactly, and all of its resolved DeepSWE tasks. Model-level DeepSWE statistics use the 17 models with at least 10 graded tasks. The study covers 6,728 SWE-bench Verified patches (30,265 units; 482 distinct instances, 114 shared by all 18 models) and 932 DeepSWE patches (26,209 units). We ran developer baselines on SWE-bench Verified (470 analyzed instances, 1,317 code units) and on DeepSWE (103 graded tasks; four developer patches fail the task tests and are dropped). Other harnesses and SWE-bench Pro are reported in Appendix [D](#A4). All units are graded in the official evaluation images under 𝒪test\mathcal{O}_{\mathrm{test} }; behavioral probes validate the unneeded verdicts ([Section 3.4](#S3.SS4)). Role and probe judges are GPT-6.1 Sol. A second judge (Claude Opus 5.5) relabeled 10,000 randomly sampled steps and agreed with the primary judge on 84.4% of role labels (κ=0.69\kappa=0.69) and 89.1% of debug vs. non-debug labels (κ=0.55\kappa=0.55; Appendix [B.4](#A2.SS4)).

### 4.2 Research Questions and Analyses

For each research question, we pre-registered the outcome we expected (Appendix [A.1](#A1.SS1)), with thresholds and deviations from the original experiment plan. A two-model pilot showed that most extra edits are test edits, so we implemented separate analyses for code and tests, made code units the primary population, and added the developer calibration.

## 5 Results

Appendix [E.6](#A5.SS6) lists per-model results and Appendix [D](#A4) holds the secondary analyses referenced below.

### 5.1 RQ1: How Much Do Agents Over-Edit?

By size, agent patches look bloated. On SWE-bench Verified the median model changes 2.33 times as many lines as the developer patch, in line with [Luo et al. (2026)](#bib.bib18). On code units alone the ratio is 0.86, and the per-task median is 1.00. Outside test files, agents still change more lines than developers (median ratio 1.09). By necessity, agents’ mean NPcode\mathrm{NP}_{\mathrm{code} } is 0.887, against 0.864 for developer patches on the same instances. So agents produce more non-test changes, but most of the code they write is needed. Developer patches serve as a baseline for the oracle: 𝒪test\mathcal{O}_{\mathrm{test} } alone calls 33% of developer code units unneeded, and the strengthened oracle 𝒪+\mathcal{O}^{+} calls 3% unneeded (Appendix [C.1](#A3.SS1)).

[Figure 2](#S5.F2) shows the gap Δdev\Delta_{\mathrm{dev} } on both benchmarks. On SWE-bench Verified ([Figure 2](#S5.F2)a), eleven models leave significantly less unneeded code than developers (GPT-6 Astra only marginally, with a CI lower bound of 0.002), four show no significant difference (Kimi K3, Claude Haiku 4.5, GPT-6 Sol, GPT-6.1 Sol), and three leave significantly more: Gemini 3.8, 3.7, and 3.6 Flash. On DeepSWE ([Figure 2](#S5.F2)b), mean NPcode\mathrm{NP}_{\mathrm{code} } is 0.797, against 0.785 for the 103 developer patches; only two models are significantly below the developer baseline and none significantly above (mean gap −0.005-0.005). The sign of the SWE-bench Verified gap depends on the oracle: under 𝒪+\mathcal{O}^{+} it flips from +2.3+2.3 to −4.5-4.5 percentage points (Appendix [C.1](#A3.SS1)).

Figure 2: Agent minus developer NPcode\mathrm{NP}_{\mathrm{code} } (Δdev\Delta_{\mathrm{dev} }) per model under 𝒪test\mathcal{O}_{\mathrm{test} }, with 95% bootstrap CIs. (a) SWE-bench Verified instances with developer patches (6,728 agent patches, 470 developer patches). (b) DeepSWE tasks with developer patches (914 agent patches from 17 models, 103 developer patches). Each panel is sorted by Δdev\Delta_{\mathrm{dev} }. Red: the CI excludes 0 below; blue: above.

Finding 1. Agent patches are larger than developers’ (2.33 times the lines). Outside tests, agents change 1.09 times the lines, yet most of their code is needed. On SWE-bench Verified, 11 of 18 models leave less unneeded code than developers (mean NPcode\mathrm{NP}_{\mathrm{code} } 0.887 vs. 0.864), four show no significant difference, and the three Gemini Flash models leave significantly more. On DeepSWE, agents are on par with developers (0.797 vs. 0.785), but no model is significantly above the developer baseline. On average, 11% of an agent patch’s code units are unneeded.

### 5.2 RQ2: What Are the Unneeded Edits?

[Figure 3](#S5.F3) shows the classes of extra edits. On SWE-bench Verified, 61% are test-file edits, 21% are code, 13% are documentation, and 5% are comment or formatting edits. Test edits are pervasive (81.5% of agent patches edit a test file) and ungraded, and a reviewer may welcome many of them. Counting them as unneeded would dominate the all-unit NP\mathrm{NP}, which then mostly tracks how many tests a model writes. On DeepSWE the composition flips: tasks are feature implementations with about six times more units per patch. Code is 58% of extra edits, and tests are 26% (Appendix [D](#A4)).

On SWE-bench Verified, among the 3,987 unneeded code units, the behavioral probes (run on 3,559 unneeded agent units) show that 89% change behavior, for example by raising or swallowing an exception on nearby inputs. The other 11% are inert guards or duplicate checks (Appendix [C.1](#A3.SS1)).

We use mutation testing ([Jia and Harman, 2011](#bib.bib13); [Just et al., 2014](#bib.bib15)) to ask whether the tests agents add are useful. Over the 271 SWE-bench Verified instances that pass our validity checks, we inject 1,962 mutants (small artificial bugs) into the patched code with mutmut ([Hovmöller, 2026](#bib.bib10)). The agent’s added tests catch 68.1% of them: more than the existing regression tests in the same files (45.6%), but fewer than the task tests (77.1%). They catch 73.2% of mutants in needed code and 31.2% in unneeded code. The agent’s tests also catch bugs the task tests miss. Of the mutants that slip past the task tests, 22.7% (102) are caught by tests the agent added or strengthened; this is 5.2% of all mutants (Appendix [F.1](#A6.SS1)). Most agent tests are written after the fix, and few show a failing-then-passing run (Appendix [D](#A4)).

Figure 3: Composition of extra edits: ungraded test edits and unneeded units (18 models; 6,728 SWE-bench Verified and 932 DeepSWE patches, all under 𝒪test\mathcal{O}_{\mathrm{test} }). On DeepSWE, code is 58% of extra edits.

Finding 2. On SWE-bench Verified, beyond the code, patches mostly add tests (61%) and documentation (13%); on DeepSWE, most extra edits are code (58%). The added tests catch more injected bugs than the regression tests (68.1% vs. 45.6%), though fewer than the task tests (77.1%), and they catch 22.7% of the bugs the task tests miss, so agent-written tests can help strengthen benchmark test suites. Finally, 89% of unneeded code units change behavior.

### 5.3 RQ3: Where Do Unneeded Edits Come From?

If residue came mostly from debugging, it would enter the patch at debug steps and never be reverted. The pooled debug share over all residue is ρ=0.257\rho=0.257, but 4,676 of the 4,898 debug-step residue units are test-file hunks that the agent wrote before the fix as regression tests. On code, only 154 of the 3,987 code-residue units (in 55 patches) come from debug steps, so ρcode=0.039\rho_{\mathrm{code} }=0.039. Scratch scripts and debug prints almost never survive into resolved patches.

Fix steps write 83% of unneeded code, and revision steps write 11%. Code written while revising a fix is unneeded only slightly more often than code from the first fix (0.29 vs. 0.25), and revisions are rare (Appendix [D](#A4)). On DeepSWE, over units with exact provenance, ρcode\rho_{\mathrm{code} } is 0.037.

Finding 3. Debug steps write almost none of the unneeded code (154 of 3,987 units, ρcode=0.039\rho_{\mathrm{code} }=0.039); fix steps write 83% of it, and code from revisions is unneeded only slightly more often than first-fix code (0.29 vs. 0.25).

### 5.4 RQ4: Which Models Over-Edit More?

Across the 18 models on SWE-bench Verified, the Spearman correlation between resolve rate and NPcode\mathrm{NP}_{\mathrm{code} } is −0.10-0.10 (raw p=0.69p=0.69; 95% CI [−0.28-0.28, +0.05+0.05], bootstrap over each model’s instances). At nearly the same resolve rate, Sonnet 5 (80.6%) has NPcode=0.922\mathrm{NP}_{\mathrm{code} }=0.922 and Gemini 3.7 Flash (81.4%) has 0.789, so Gemini 3.7 Flash leaves about 3.6 times as many unneeded code units per task (1.23 vs. 0.34).

The model effect survives controls for unit granularity and task selection (Appendix [D.4](#A4.SS4)). Multi-unit and line-weighted variants keep the ranking, and task fixed effects leave the same three Gemini Flash models below developers.

On DeepSWE the relation reverses: NPcode\mathrm{NP}_{\mathrm{code} } is negatively correlated with resolve rate (Spearman −0.59-0.59, p=0.01p=0.01; −0.52-0.52, p=0.03p=0.03, task-adjusted), so models that solve more tasks leave more unneeded code. The model ranking agrees moderately between benchmarks (+0.59+0.59), and Gemini 3.7 and 3.8 Flash are low on both ([Table 9](#A4.T9)).

Finding 4. The amount of unneeded code differs by model. It does not track resolve rate on SWE-bench Verified (Spearman −0.10-0.10), even after controlling for unit granularity and task selection, but on DeepSWE models with higher resolve rates leave more unneeded code (−0.59-0.59).

### 5.5 RQ5: Can Unneeded Code Be Removed Automatically?

Task tests are unavailable at deployment, so we test three strategies that do not need them ([Table 1](#S5.T1)). All RQ5 experiments use SWE-bench Verified.

#### Stopping at the first green run.

The numbers below cover all resolved SWE-bench Verified patches. For each trajectory we find the agent’s first all-green run of its own tests, replay to that step, and grade the patch. The early patch still passes the task tests in 2,948 of 3,031 graded cases (97.3%), but code units barely change (7,419 to 7,269) and NPcode\mathrm{NP}_{\mathrm{code} } on those patches moves only from 0.700 to 0.710.

#### Self-audit.

We ask each model to justify every hunk of its final diff and drop the ones it cannot. Across all resolved SWE-bench Verified patches (17 of 18 models; Appendix [D.5](#A4.SS5)), dropped code hunks match a unit that 𝒪+\mathcal{O}^{+} calls unneeded 65.7% of the time, but the audit finds only 35.5% of all such units (κ=0.39\kappa=0.39); the drops break 1.8% of resolved patches. Models are selective: they drop 40.5% of unneeded units that behave like the patch without them, against 14.7% of those that behave like the full patch. Applying the drops raises NPcode\mathrm{NP}_{\mathrm{code} } from 0.924 to 0.944.

#### Pruning with DRA.

Most agents run their own tests, and 4,860 of 6,728 trajectories reach a green run. We run a simplified cumulative DRA that reverts a unit whenever the agent’s test command 𝒪agent\mathcal{O}_{\mathrm{agent} } still passes, and we also require the existing PASS_TO_PASS tests (𝒪agent+P2P\mathcal{O}_{\mathrm{agent+P2P} }). This applies to 2,495 of the 6,724 patches, because the others have no standalone test command or fail the baseline check (Appendix [G.1](#A7.SS1)). With 𝒪agent+P2P\mathcal{O}_{\mathrm{agent+P2P} }, pruning removes 67.3% of the unneeded code units, nearly twice the self-audit’s recall, but at 46.3% precision against the self-audit’s 65.7%. It raises NPcode\mathrm{NP}_{\mathrm{code} } from 0.936 to 0.975, and 89.1% of patches still pass the task tests. With 𝒪agent\mathcal{O}_{\mathrm{agent} } alone, pruning reaches 39.6% precision and 66.5% recall, and 86.6% of its patches still pass the task tests. Most false drops are code units that implement behavior that neither the existing tests nor the agent’s tests exercise.

| First green | Self-audit | DRA + 𝒪agent\mathcal{O}_{\mathrm{agent} } | DRA + 𝒪agent+P2P\mathcal{O}_{\mathrm{agent+P2P} } |
| Patches / units graded | 3,031 / 7,419 | 6,345 / 13,729 | 2,495 / 5,060 | 2,495 / 5,060 |
| Dropped units | 150 (2.0%, net) | 1,238 (9.0%) | 997 (19.7%) | 863 (17.1%) |
| Precision | – | 65.7% | 39.6% | 46.3% |
| Recall | – | 35.5% | 66.5% | 67.3% |
| NPcode\mathrm{NP}_{\mathrm{code} } before →\to after | 0.700 →\to 0.710 (3%) | 0.924 →\to 0.944 (26%) | 0.936 →\to 0.974 (59%) | 0.936 →\to 0.975 (61%) |
| Patches still resolving | 97.3% | 98.2% | 86.6% | 89.1% |

Table 1: Post-generation cleanup on SWE-bench Verified under 𝒪+\mathcal{O}^{+}. Units are code units; dropped-unit percentages are of units graded, and NPcode\mathrm{NP}_{\mathrm{code} } is shown before and after reduction on each column’s patches, with the share of the unneeded-code gap (1−NPcode1-\mathrm{NP}_{\mathrm{code} }) closed in parentheses. 𝒪agent\mathcal{O}_{\mathrm{agent} } is the agent’s own test command; 𝒪agent+P2P\mathcal{O}_{\mathrm{agent+P2P} } also requires the existing PASS_TO_PASS regression tests. The DRA columns cover the 2,495 eligible patches where 𝒪agent​(ST)=1\mathcal{O}_{\mathrm{agent} }(S_{T})=1. First green covers the patches edited after it; its pass rate uses the task tests, and its units are the net change in code units. The self-audit covers 17 models; 1,540 patches had at least one drop, and the passing rate is on the regraded patches (none ungraded).

Finding 5. On SWE-bench Verified, self-audit and test-based pruning trade precision for recall. Self-audits are precise (65.7%) but find only about a third of unneeded code (35.5%), and their drops break 1.8% of resolved patches. Pruning with the agent’s own tests and the repository’s regression tests finds about two thirds (67.3%) at lower precision (46.3%) on the 2,495 eligible patches, and 89.1% of them still resolve. Early stopping barely changes the patch (NPcode\mathrm{NP}_{\mathrm{code} } 0.700 to 0.710), because most unneeded code is already in the patch when the agent’s tests first pass.

## 6 Discussion and Limitations

#### Does the metric measure what we claim?

We check the metric against the developer patch. A code unit is *outside-patch* if it lies outside every function the developer patch touched. Of 14,591 agent code units on 6,596 instances, 2,607 are outside-patch. The DRA unneeded flag predicts outside-patch units with an AUROC of 0.718, against 0.478 for unit size (difference +0.24+0.24, 95% CI [0.21, 0.27]); it flags 3,753 units at precision 0.43 and recall 0.62. At the instance level, the unneeded-line fraction correlates with the outside-patch fraction at Spearman 0.40, against 0.21 for edit distance and 0.25 for lines relative to the developer patch. The metric flags code a developer would likely not have written better than patch size does, though fewer than half of flagged units are outside-patch. Whether a reviewer would remove the flagged units needs human labels (Appendix [D](#A4)).

#### Implications.

The amount of unneeded code a model writes does not track its resolve rate on SWE-bench Verified and is anti-correlated with it on DeepSWE, and most unneeded code changes behavior, so reviewers cannot skip it ([Section 5.2](#S5.SS2), [Section 5.4](#S5.SS4)). Because code necessity differs by model, coding benchmarks should report NPcode\mathrm{NP}_{\mathrm{code} } with a developer-patch baseline alongside resolve rate. Size comparisons with developer patches should separate test and code edits. Debug steps write little code residue, so in-loop cleanup would have little to remove, although we did not test it, and post-generation cleanup is the more promising target. Its two forms trade off: self-audit rarely drops needed code but misses most unneeded code, while pruning with the agent’s and the repository’s regression tests finds most of it at the cost of more false drops ([Section 5.5](#S5.SS5)). Because the unneeded code is written while constructing and revising the fix, we recommend debloating training trajectories: drop units that the tests do not need before supervised fine-tuning, in line with edit-aware training ([Yang et al., 2026](#bib.bib36); [Ke et al., 2026](#bib.bib17)) and as PDB proposes ([Chai et al., 2026](#bib.bib4)).

#### Limitations.

Necessity depends on the oracle, and on DeepSWE and SWE-bench Pro it is an upper bound on unneeded code (on DeepSWE the developer baseline is 0.785). Behavioral checks are LLM-written, and oracle-unneeded code can still be wanted. Units are reverted one at a time, so jointly needed pairs and mixed blocks can mislead. We study over-editing in successful trajectories, i.e., resolved patches, and leave over-editing in unsuccessful trajectories to future work. Role labels were validated against a second LLM judge only, with no human audit (Appendix [B.4](#A2.SS4)). The debug-share result rests on 154 of 3,987 code-residue units, and the mutation results cover 271 instances (1,962 mutants). Provenance needs replayable trajectories: 3.3% of SWE-bench Verified replays are not exact (228 replay mismatches, 6 self-check failures, 5 binary patches), and 33.4% of DeepSWE patches (311 of 932) contain at least one unit without provenance (14.9% of units, 12.7% of code units). The main results use one harness, Copilot CLI (Appendix [D](#A4) covers others). SWE-bench Verified is Python-only and may be contaminated.

#### Future work.

Human labels (Appendix [B.5](#A2.SS5)) would test whether reviewers agree with the oracle. Property-based testing ([MacIver et al., 2019](#bib.bib19)) and LLM-generated differential tests ([Hu et al., 2026](#bib.bib11)) could extend probe-based grading to benchmarks without developer patches. Repeating the experiment on open-source harnesses such as OpenHands ([Wang et al., 2025](#bib.bib33)) and mini-SWE-agent ([SWE-agent Team, 2025](#bib.bib31)), using public trajectories ([SWE-bench Team, 2026](#bib.bib32)), would show how harness design affects over-editing.

## 7 Conclusion

We took 7,660 resolved coding-agent trajectories and traced each block of the final patch to the step that wrote it, then graded necessity with the task tests and validated unneeded code with behavioral probes. Agent patches are larger than developers’, but on SWE-bench Verified the extra lines are mostly tests and documentation. On code, on average about 11% of an agent patch’s code units are unneeded; on SWE-bench Verified, 11 of 18 models leave less unneeded code than developers and the three Gemini Flash models leave more, while on DeepSWE agents are on par with developers. The unneeded code that remains is written while building and revising the fix, usually changes behavior, and differs by model, with no relation to resolve rate on SWE-bench Verified and a negative one on DeepSWE. After generation, self-audit removes it precisely but finds only about a third, while pruning with the agent’s own tests and the repository’s regression tests finds about two thirds at lower precision on the patches where it applies. We recommend reporting code necessity next to resolve rate and addressing over-editing through model training and harness-level pruning.
