# EATS: Scaling Tool-Use Experience for Medical Reasoning Agents

Mingyuan Li Affiliation: College of Information Science and Engineering, Northeastern University, China Tong Jia Affiliation: College of Information Science and Engineering, Northeastern University, China Haoran Wang Affiliation: College of Information Science and Engineering, Northeastern University, China Wenbo Qi Ziyuan Yang Bowen Ma Affiliation: College of Information Science and Engineering, Northeastern University, China Jie Gui Affiliation: Nanyang Technological University  Southeast UniversityTong Jia: [jiatong@ise.neu.edu.cn](mailto:jiatong@ise.neu.edu.cn)  Baosheng Yu: [baosheng.yu@ntu.edu.sg](mailto:baosheng.yu@ntu.edu.sg) Baosheng Yu

###### Abstract

Medical reasoning agents combine large language model (LLM) reasoning with clinical workflows and specialized neural tools. However, general-purpose LLMs receive limited training exposure to domain-specific medical tools, and the uncertainty and distributional shifts of neural tool outputs make selecting tools from simple descriptions significantly more challenging than in deterministic settings such as calculators or dictionary lookups. In this paper, we propose EATS, an experience-augmented tool selection strategy that leverages accumulated tool-use trajectories to improve tool selection in medical reasoning agents. EATS constructs a memory of past interactions, including queries, tool choices, arguments, and self-evaluated feedback, and retrieves relevant experiences to guide tool selection for new queries. As memory construction does not require ground-truth supervision, EATS scales naturally with test-time experience. We evaluate EATS on tool-augmented medical reasoning tasks, including closed-ended visual question answering and free-form report generation. Experiments on four public datasets, ChestAgentBench, CheXbench, MIMIC-CXR, and SLAKE-VQA, across three multimodal LLMs, Qwen3-VL 2B, Qwen3-VL 32B, and GPT-5.5, show consistent gains in tool selection behavior and downstream medical reasoning performance. Code is available at [https://github.com/Limingyuan001/EATS](https://github.com/Limingyuan001/EATS).

## 1 Introduction

Medical reasoning agents integrate large language model (LLM)–based reasoning with clinical workflows and specialized neural tools, allowing perception, analysis, and decision-making to be jointly carried out across complex diagnostic tasks [[47](#bib.bib31)]. In practice, these agents operate through an iterative plan–act loop [[41](#bib.bib10)], where each reasoning step may trigger the use of external tools to supplement the limited parametric knowledge of foundation models [[11](#bib.bib5), [17](#bib.bib4)]. For example, in medical image diagnosis, an agent may invoke neural networks for tasks such as classification, segmentation, and report generation, thereby extending its perceptual and analytical capacity. However, integrating medical tools introduces additional challenges. Unlike deterministic tools with stable, predictable outputs, medical models often are not universally optimal across all cases. This variability reduces the reliability of tool selection and complicates coordination across multiple steps. As the reasoning process unfolds, errors introduced at earlier stages can propagate through subsequent steps, leading to compounding inaccuracies in downstream decisions. Consequently, selecting appropriate tools at each stage remains a central challenge in developing effective medical reasoning agents.

Figure 1: Illustration of tool-use experience for tool selection. Without tool-use references (e.g., tool reliability and case similarity), the ReAct-style agent [[41](#bib.bib10), [11](#bib.bib5)] selects T-VQA [[18](#bib.bib8)] and produces an incorrect answer. With tool-reliability information retrieved from similar past cases, it selects T-DGN [[7](#bib.bib9)] and produces the correct answer.

Current tool-selection strategies in medical reasoning agents typically match user queries with tool descriptions that emphasize predefined functions or capabilities [[17](#bib.bib4), [11](#bib.bib5)], limiting their ability to incorporate patient-specific context. While this paradigm is effective for deterministic tools such as calculators or search engines in general-agent systems, it is less suitable for medical settings where neural tools exhibit output uncertainty and case-dependent variability [[18](#bib.bib8), [7](#bib.bib9)]. Recent approaches explore retraining-based methods to improve tool selection [[27](#bib.bib11), [40](#bib.bib12), [22](#bib.bib14), [28](#bib.bib18)], but their scalability in clinical domains remains constrained by data heterogeneity, privacy restrictions, and the black-box nature of commercial LLMs. In contrast, similar or relevant cases can serve as empirical references for tool selection. They connect the current patient context with prior tool-use outcomes, allowing tools that performed well in comparable cases to be preferentially selected, while less reliable ones can be avoided. This case-based grounding also helps identify recurring failure patterns across steps, thereby reducing error accumulation in multi-stage reasoning and supporting more adaptive and context-aware tool selection. As shown in Figure [1](#S1.F1), without tool-use experience, the agent selects a plausible but inappropriate tool and yields an incorrect diagnosis; with tool-use experiences from two similar cases, the agent identifies a more reliable tool and produces the correct diagnosis.

In this paper, we propose EATS, an experience-augmented tool selection strategy that leverages accumulated tool-use trajectories to improve medical reasoning agents. EATS constructs a memory of past interactions, including queries, tool selections, input arguments, tool outputs, and self-evaluated feedback. The agent then retrieves relevant experiences and uses them as a tool-use reference to guide tool selection for new queries. These retrieved experiences are injected into the reasoning context, enabling reliable tool selection without additional training or retraining the model. After each case, an LLM-as-a-Judge module evaluates the completed tool-use trajectory and assigns scores to individual tool-use events based on multiple criteria across two dimensions, including clinical relevance, informational gain, diagnostic discriminability, citation fidelity, and answer consistency. The updated experiences are then stored in memory for future retrieval. Since memory construction does not rely on ground-truth supervision, EATS can continuously scale with test-time interactions and accumulated experience.

We evaluate the proposed method on four chest X-ray benchmarks: ChestAgentBench [[11](#bib.bib5)], CheXbench [[7](#bib.bib9)], MIMIC-CXR [[15](#bib.bib29)], and SLAKE-VQA [[20](#bib.bib27)], using three multimodal foundation models (Qwen3-VL 2B, Qwen3-VL 32B, and GPT-5.5). The method consistently outperforms the MedRAX [[11](#bib.bib5)] baseline (without memory) across both small and large Qwen3-VL models and the frontier model GPT-5.5, with gains increasing as tool-use experience accumulates. The approach also generalizes to three additional reasoning benchmarks covering report generation and closed-ended VQA. Further analysis shows that performance improvements mainly arise from better tool-selection decisions, including which tool to use, when to use it, and how to set its arguments, rather than increased diversity of inputs or outputs.

## 2 Related Work

#### Medical Reasoning Agents.

Medical AI has evolved from fine-tuning static language and vision-language models [[29](#bib.bib1), [18](#bib.bib8), [7](#bib.bib9)] to agent-based systems that dynamically invoke external tools for multi-step clinical reasoning [[47](#bib.bib31)]. Early models achieved strong performance on clinical question answering but remained passive, lacking the ability to actively coordinate tool usage during reasoning [[18](#bib.bib8), [7](#bib.bib9), [4](#bib.bib38)]. Recent approaches introduce tool-augmented agents with explicit planning and tool calling [[41](#bib.bib10), [11](#bib.bib5), [23](#bib.bib47)], including multi-role LLM ensembles [[31](#bib.bib2), [16](#bib.bib3)], instruction-tuned unified models for multimodal tool use [[17](#bib.bib4)], expanded tool libraries for imaging tasks [[11](#bib.bib5)], and retrieval-based workflow planning or rare-disease reasoning [[34](#bib.bib6), [44](#bib.bib46), [6](#bib.bib7)]. Despite these advances, existing methods do not explicitly support self-improvement from accumulated tool-use experience and typically require retraining or external supervision to improve over time.

#### Tool Use & Memory.

General-agent systems have explored multiple approaches for tool use. Toolformer [[27](#bib.bib11)] enables self-supervised learning of tool-call decisions, while ReAct [[41](#bib.bib10)] integrates reasoning traces and tool actions within a unified interaction loop. More structured methods include hierarchical tool organization [[40](#bib.bib12)], utility-based pruning of tool invocations [[21](#bib.bib13)], and reinforcement learning for tool-selection policies [[22](#bib.bib14)]. Benchmarks for tool-use evaluation have also been proposed [[38](#bib.bib16), [45](#bib.bib15), [24](#bib.bib17)]. However, these methods are primarily designed for tools with well-defined and static capabilities, whereas medical neural tools exhibit case-dependent reliability that cannot be inferred from descriptions alone, and existing approaches do not address this issue without retraining. In parallel, external memory has been widely used to enhance agent reasoning [[10](#bib.bib25)]. Existing memory mechanisms include long-term memory, which stores persistent knowledge across tasks [[46](#bib.bib42), [14](#bib.bib43)], and short-term memory, which records in-context information such as inputs, intermediate reasoning, tool calls, and outputs [[41](#bib.bib10), [35](#bib.bib44)]. Several methods store and refine agent experiences, including verbal self-reflection [[28](#bib.bib18)], episodic tool-use memories [[37](#bib.bib19), [33](#bib.bib23), [43](#bib.bib21)], and unified memory management across short- and long-term stores [[42](#bib.bib20), [5](#bib.bib24)]. Some studies further use memory to support reinforcement learning-based fine-tuning [[27](#bib.bib11), [32](#bib.bib22), [1](#bib.bib32), [39](#bib.bib45)], improving tool-selection policies but requiring retraining and not leveraging memory directly at inference time.

## 3 Method

This section first formulates the medical reasoning agent and provides an overview of the proposed EATS strategy. It then details the key components, including memory construction, tool selection, and memory updating.

### 3.1 Problem Formulation

We consider a ReAct-style agent for chest X-ray interpretation equipped with KK specialized neural tools 𝒯={T1,…,TK}\mathcal{T}=\{T_{1},\dots,T_{K}\}. Each input is a clinical case 𝒳={I,Q}\mathcal{X}=\{I,Q\}, consisting of chest X-ray image(s) II and a clinical question QQ. A multimodal foundation model fθf_{\theta} serves as the agent’s reasoning core, conditioned on a system prompt PsystP_{\mathrm{syst} } that defines tool descriptions and usage instructions. At each step l∈{1,…,L}l\in\{1,\dots,L\}, the agent generates a reasoning message ClC_{l} and selects a subset of tools 𝒯l⊆𝒯\mathcal{T}_{l}\subseteq\mathcal{T} to produce feedback ElE_{l}:

| Cl,𝒯l\displaystyle C_{l},\;\mathcal{T}_{l} | =fθ​(𝒳,C<l,E<l,Psyst),\displaystyle=f_{\theta}\!\left(\mathcal{X},\,C_{<l},\,E_{<l};\,P_{\mathrm{syst} }\right), | (1) |
| El\displaystyle E_{l} | ={T⁡(𝒳,Cl)∣T∈𝒯l},\displaystyle=\{\,T(\mathcal{X},C_{l})\mid T\in\mathcal{T}_{l}\,\}, | (2) |

where C<lC_{<l} and E<lE_{<l} denote prior reasoning and tool outputs. The process terminates when 𝒯l=∅\mathcal{T}_{l}=\emptyset, and the final prediction is y^=CL\hat{y}=C_{L}. Unlike deterministic tools such as calculators or search engines, medical neural tools (e.g., LLaVA-Med, CheXagent) exhibit case-dependent behavior and vary in reliability across inputs. Therefore, the mapping from {𝒳,C<l,E<l}\{\mathcal{X},C_{<l},E_{<l}\} to appropriate tool selection 𝒯l\mathcal{T}_{l} cannot be reliably captured by static tool descriptions in PsystP_{\mathrm{syst} } alone.

Figure 2: Overview of the proposed EATS. (Top) Tool Selection: the agent retrieves similar historical entries from memory ℳ\mathcal{M} to assemble tool-reliability reference Γ⁡(𝒳)\Gamma(\mathcal{X}) as additional context, and iteratively performs reasoning and tool selection until 𝒯l=∅\mathcal{T}_{l}=\emptyset. (Bottom) Memory Update: the completed trajectory is evaluated across five criteria to score each tool event, and the resulting tool-use experience 𝒰\mathcal{U} is written back into ℳ\mathcal{M} for future retrieval. (Left) A representative CXR case.

As illustrated in Figure [2](#S3.F2), we propose an experience-augmented tool selection strategy for medical reasoning agents as follows. Given a new case 𝒳\mathcal{X}, the agent retrieves similar historical cases from memory ℳ\mathcal{M} and incorporates their tool-reliability references Γ⁡(𝒳)\Gamma(\mathcal{X}) into the foundation model context to support reliability-aware decision-making. After inference, the contribution of each tool invocation is evaluated for the current case, and the resulting experience is stored in memory as a new tool-use record 𝒰\mathcal{U} together with the case representation 𝐳\mathbf{z} for future retrieval. The following sections detail each component.

### 3.2 Experience Memory

The first component of our strategy is a structured experience memory that stores historical cases and their associated tool-use experiences in a retrievable form. Instead of retaining only raw queries or final predictions, the memory preserves information most relevant for future tool selection, including retrieval query embeddings, invoked tools, and their effectiveness scores. Formally, the memory is organized as a key–value store as follows:

| ℳ={(𝐳n,𝒰n)}n=1|ℳ|,\mathcal{M}=\bigl\{\,(\mathbf{z}_{n},\;\mathcal{U}_{n})\,\bigr\}_{n=1}^{|\mathcal{M}|}, | (3) |

where 𝐳n∈ℝ384\mathbf{z}_{n}\in\mathbb{R}^{384} is the embedding key for the nn-th case 𝒳n={In,Qn}\mathcal{X}_{n}=\{I_{n},Q_{n}\}, computed in the phrase of tool selection. The corresponding value 𝒰n={un,1,…,un,Jn}\mathcal{U}_{n}=\{u_{n,1},\dots,u_{n,J_{n} }\} stores a set of JnJ_{n} tool events collected from the completed reasoning trajectory, Each event is defined as

| un,j=(Tn,j,an,j,sn,j).u_{n,j}=\bigl(T_{n,j},\;a_{n,j},\;s_{n,j}\bigr). | (4) |

where Tn,j∈𝒯T_{n,j}\in\mathcal{T} denotes the invoked tool, an,ja_{n,j} its input arguments (e.g., prompts for LLaVA-Med-style tools), and sn,j∈[−1,1]s_{n,j}\in[-1,1] a scalar score measuring the utility of that tool invocation for solving case nn. This score serves as the supervision signal stored in memory for future retrieval and decision-making. The estimation of sn,js_{n,j} is described in Section [3.4](#S3.SS4).

### 3.3 Tool Selection

At inference time, the agent processes a new case 𝒳={I,Q}\mathcal{X}=\{I,Q\} by leveraging historical tool-use experiences retrieved from the experience memory. We first extract structured semantic tags from QQ and encode them into a query vector:

| 𝐳=ϕ⁡(𝐜)∈ℝ384,𝐜=fθ​(Q,Pext),\mathbf{z}=\phi(\mathbf{c})\in\mathbb{R}^{384},\quad\mathbf{c}=f_{\theta}(Q;\,P_{\mathrm{ext} }), | (5) |

where PextP_{\mathrm{ext} } is a prompt for tag extraction (see Appendix [H](#A8)), 𝐜\mathbf{c} contains six types of structured tags, and ϕ⁡(⋅)\phi(\cdot) is a text embedding model [[36](#bib.bib41)]. For each memory entry (𝐳n,𝒰n)∈ℳ(\mathbf{z}_{n},\mathcal{U}_{n})\in\mathcal{M}, we compute a similarity score

| rn=cos⁡(𝐳,𝐳n),n∈{1,…,|ℳ|},r_{n}=\cos(\mathbf{z},\mathbf{z}_{n}),\quad n\in\{1,\dots,|\mathcal{M}|\}, | (6) |

which measures the semantic similarity between the current case and historical cases. We then construct a retrieved set by selecting entries with similarity above a threshold τ\tau and retaining at most kk highest-scoring items:

| ℛτ,k​(𝒳,ℳ)\displaystyle\mathcal{R}_{\tau,k}(\mathcal{X};\,\mathcal{M}) | ⊆{n∣rn≥τ},\displaystyle\subseteq\bigl\{\,n\mid r_{n}\geq\tau\,\bigr\}, | (7) |
| |ℛτ,k​(𝒳,ℳ)|\displaystyle|\mathcal{R}_{\tau,k}(\mathcal{X};\,\mathcal{M})| ≤k,\displaystyle\leq k, | (8) |

where entries are ranked by rnr_{n} in descending order and only the top kk are retained, τ\tau is a similarity threshold, and kk is the maximum number of retrieved entries. If no historical entry satisfies the threshold, ℛτ,k​(𝒳,ℳ)=∅\mathcal{R}_{\tau,k}(\mathcal{X};\,\mathcal{M})=\emptyset and the agent reduces to plain prompt-driven reasoning without memory support. For each retrieved index n∈ℛτ,k​(𝒳,ℳ)n\in\mathcal{R}_{\tau,k}(\mathcal{X};\,\mathcal{M}), the corresponding tool-use experience 𝒰n\mathcal{U}_{n} and similarity score rnr_{n} are assembled into a tool-reliability reference:

| Γ⁡(𝒳)={(rn,𝒰n)∣n∈ℛτ,k​(𝒳,ℳ)},\Gamma(\mathcal{X})=\bigl\{\,(r_{n},\,\mathcal{U}_{n})\mid n\in\mathcal{R}_{\tau,k}(\mathcal{X};\,\mathcal{M})\,\bigr\}, | (9) |

which summarizes tool behaviors and their effectiveness in similar cases. Conditioned on the current case, reasoning history, and Γ⁡(𝒳)\Gamma(\mathcal{X}), the agent performs iterative experience-augmented reasoning. At each step l∈{1,…,L}l\in\{1,\dots,L\}:

| Cl,𝒯l\displaystyle C_{l},\;\mathcal{T}_{l} | =fθ​(𝒳,C<l,E<l,Γ⁡(𝒳),Psyst),\displaystyle=f_{\theta}\!\left(\mathcal{X},C_{<l},E_{<l},\Gamma(\mathcal{X});P_{\mathrm{syst} }\right), | (10) |
| El\displaystyle E_{l} | ={T⁡(𝒳,Cl)∣T∈𝒯l}.\displaystyle=\{\,T(\mathcal{X},C_{l})\mid T\in\mathcal{T}_{l}\,\}. | (11) |

The process terminates when 𝒯l=∅\mathcal{T}_{l}=\emptyset or a maximum of L=7L=7 steps is reached, and the final reasoning output is taken as the prediction y^\hat{y}.

### 3.4 Memory Update

#### Evaluate.

As shown in Figure [2](#S3.F2) (bottom), we evaluate each tool event in the completed trajectory using a process-based protocol that does not require ground-truth labels (a comparison with a ground-truth-based judge is provided in Appendix [D](#A4)). Guided by PevalP_{\mathrm{eval} }, the same foundation model fθf_{\theta} assigns scores to each event using LLM-as-a-Judge with five criteria that assess both output quality and its role in the reasoning process. The criteria are: (1) clinical relevance, whether the tool output addresses the relevant pathology or task; (2) informational increment, whether it provides information beyond the input question; (3) diagnostic discriminability, whether it helps distinguish among competing diagnoses; (4) citation fidelity, whether the reasoning properly uses or references the tool output; and (5) answer consistency, whether the output is consistent with the final prediction. The first three criteria mainly evaluate the intrinsic quality of the tool output, while the last two assess how coherently it is integrated into the reasoning process. Each criterion is scored independently on a five-point scale mapped to [−1,1][-1,1]; the full rubric and prompt template PevalP_{\mathrm{eval} } are provided in Appendix [I](#A9). For each tool event j∈{1,…,J}j\in\{1,\dots,J\}, the contribution score is defined as:

| sj=M⁡(fθ​(𝒳,C<L,E<L,y^,Peval))∈[−1,1],s_{j}=\mathrm{M}\!\left(f_{\theta}\!\left(\mathcal{X},C_{<L},E_{<L},\hat{y};\,P_{\mathrm{eval} }\right)\right)\in[-1,1], | (12) |

where M⁡(⋅)\mathrm{M}(\cdot) denotes the operator that computes the arithmetic mean of the five criterion scores.

#### Update.

The experience memory is updated with the newly collected tool-use experience and the corresponding query embedding for future retrieval. Specifically, after all JJ tool events in a case are scored, we construct the tool-use experience as a set of tuples 𝒰={(Tj,aj,sj)}j=1J\mathcal{U}=\{(T_{j},a_{j},s_{j})\}_{j=1}^{J}. The query embedding 𝐳\mathbf{z}, computed during inference, is reused as the key for memory storage. The resulting key–value pair (𝐳,𝒰)(\mathbf{z},\mathcal{U}) is then appended to the memory:

| ℳ←ℳ∪{(𝐳,𝒰)}.\mathcal{M}\leftarrow\mathcal{M}\cup\{(\mathbf{z},\mathcal{U})\}. | (13) |

In this way, each processed case enriches the memory with evaluated tool-use experience, supporting more reliable tool selection and evidence integration in future cases.

## 4 Experiments

In this section, we study three questions: (i) whether the proposed memory improves accuracy across foundation model scales and chest X-ray tasks; (ii) whether performance scales with accumulated tool-use experience; and (iii) how changes in tool-use behavior translate into accuracy gains. To isolate the effect of memory, our strategy shares the same inference loop and tool library as MedRAX [[11](#bib.bib5)]; the only differences are the memory-augmented context Γ⁡(𝒳)\Gamma(\mathcal{X}) injected into the reasoning process and the post-hoc tool-contribution scoring used for memory updates. We therefore adopt the MedRAX agent, which is without memory, as the baseline for comparisons and evaluate on chest X-ray interpretation with established neural tools.

### 4.1 Experimental Setup

Datasets. We evaluate on four chest X-ray benchmarks adopted by MedRAX [[11](#bib.bib5)], covering complementary aspects of clinical reasoning:

- •

ChestAgentBench [[11](#bib.bib5)]: a comprehensive CXR reasoning benchmark of 2,5002,500 six-choice questions across seven competencies—detection, classification, localization, comparison, relationship, characterization, and diagnosis. Performance is measured by overall and per-category accuracy.

- •

CheXbench [[7](#bib.bib9)]: we use the visual question answering subset (238 questions from Rad-Restruct [[26](#bib.bib26)] and SLAKE [[20](#bib.bib27)]) and the fine-grained image-text reasoning subset (380 questions from OpenI [[9](#bib.bib28)]), as they most closely mirror complex clinical workflows that require precise differentiation between similar findings. We report accuracy on each subset and the overall mean.

- •

MIMIC-CXR [[15](#bib.bib29)]: radiology report generation on 3,8583,858 single-image chest X-rays from the MIMIC-CXR test set. Following M4CXR [[25](#bib.bib30)], we report micro- and macro-averaged F1 over 1414 medical observation labels (mF1-14, MF1-14; CheXpert labels [[13](#bib.bib34)] extracted by CheXbert [[30](#bib.bib33)]) and over 55 key findings (mF1-5, MF1-5; cardiomegaly, edema, consolidation, atelectasis, and pleural effusion extracted by CheXbert [[30](#bib.bib33)]).

- •

SLAKE-VQA [[20](#bib.bib27)]: medical visual question answering on 114114 closed-ended English chest X-ray samples filtered from the SLAKE test set, following M4CXR [[25](#bib.bib30)]. We report exact-match accuracy and recall (proportion of ground-truth words present in the generated response).

Table 1: The six specialized tools available to the agent. Implementations are identical to MedRAX [[11](#bib.bib5)]; we add the abbreviations used throughout the analysis, together with the input arguments and output content of each tool.

| Abbr. | Task | Implementation | Input (args) | Output |
| Cls | Classification | XRV [[8](#bib.bib39)] | Image (image_path) | 18 pathology scores |
| Dgn | Diagnosis | CheXagent [[7](#bib.bib9)] | Image (image_path) + prompt | Findings / diagnosis |
| Rpt | Report Generation | CheXpert Plus [[4](#bib.bib38)] | Image (image_path) | Findings + impression |
| Seg | Segmentation | PSPNet [[19](#bib.bib37)] | Image (image_path) + organ list | Organ mask |
| Vqa | VQA | LLaVA-Med [[18](#bib.bib8)] | Question + optional image | Free-text answer |
| Grd | Phrase Grounding | Maira-2 [[3](#bib.bib36)] | Image (image_path) + phrase | BBox coordinates |

Settings. We designed two strategies for constructing the tool-use experience memory to assess the self-improving capability of our strategy on ChestAgentBench: a test-time setting and a pre-construction setting. In the test-time setting, the dataset was processed sequentially with dynamic memory: each case was first inferred against the existing memory, then its tool-use experience was scored and written back to the memory. We further parameterized this setting by a memory-coverage ratio ρ∈[0,1]\rho{\in}[0,1]: the first ρ⋅N\rho{\cdot}N cases of the dataset were processed with dynamic memory updates (read-then-write), while the remaining (1−ρ)⋅N(1{-}\rho){\cdot}N cases were processed against the resulting fixed memory (read-only); thus ρ=0\rho{=}0 recovers the baseline agent MedRAX and ρ=1\rho{=}1 corresponds to the full test-time setting where every case contributes to memory. In the pre-construction setting, inference uses a fixed, pre-constructed memory; for a controlled comparison, we adopted 5-fold cross-validation, in which four folds were used to populate the memory and the remaining fold was held out for evaluation.

Implementation Details. We evaluate the method using two open-source multimodal foundation models of different scales, Qwen3-VL 2B and Qwen3-VL 32B [[2](#bib.bib35)], and include GPT-5.5 as a proprietary frontier model to assess the performance of our memory-augmented strategy. Unless otherwise specified, Qwen3-VL 32B is used as the default core model. The agent is equipped with six specialized neural tools, one per task category (Table [1](#S4.T1)). The tool library is identical to MedRAX [[11](#bib.bib5)], so performance differences are attributable to the proposed memory mechanism. All experiments are conducted on two NVIDIA RTX Pro 6000 GPUs (96GB VRAM each). We use bge-small-en-v1.5[[36](#bib.bib41)] (d=384d{=}384) as the embedding model ϕ⁡(⋅)\phi(\cdot) and cap the reasoning steps at L=7L{=}7. For memory retrieval, we use top-k=3k{=}3 with a similarity threshold τ=0.99\tau{=}0.99 by default; sensitivity is analyzed in Section [4.5](#S4.SS5). The Qwen3-VL 2B and 32B models are deployed via local OpenAI-compatible endpoints with qwen3-vl-2b-instruct-fp8 and qwen3-vl-32b-instruct, respectively, both with temperature 0.20.2 and top-p=0.95p{=}0.95. GPT-5.5 uses the default OpenAI endpoint with gpt-5.5, service_tier=flex, temperature 0.20.2, no top-pp, and a 600600 seconds timeout. Full implementation details about system prompt and tool descriptions, tag extract prompt, and tool evaluation prompt are provided in Appendices [M](#A13), [H](#A8), and [I](#A9).

### 4.2 Main Results

We present main results in two complementary views: a cross-model comparison on ChestAgentBench (Table [2](#S4.T2)), and a memory-scaling curve on the same benchmark (Table [3](#S4.T3)). Together they support our central claim: *it consistently improves agent accuracy across substantially different foundation model scales, and the gain grows monotonically as accumulated tool-use experience scales.*

Table 2:  Model performance on ChestAgentBench [[11](#bib.bib5)] across seven task categories. The *upper block* lists standalone multimodal FMs and the prior agent reported in [[11](#bib.bib5)]. The *middle block* lists the MedRAX agent (Baseline) re-run with Qwen3-VL 2B, Qwen3-VL 32B, and GPT-5.5, and the *lower block* lists our memory-augmented agent with the same three core FMs. Each pair of rows sharing a core FM isolates the effect of memory.

| Core FM | Agent | Overall | Detect. | Classif. | Local. | Compar. | Relat. | Diagn. | Charact. |
| Reference: standalone multimodal FMs and prior agent |
| LLaVA-Med [[18](#bib.bib8)] | — | 28.7 | 32.4 | 30.8 | 30.2 | 30.6 | 31.8 | 29.3 | 28.8 |
| CheXagent [[7](#bib.bib9)] | — | 39.5 | 38.7 | 34.7 | 42.5 | 38.5 | 39.8 | 33.5 | 34.2 |
| Llama-3.2-90B | — | 57.9 | 58.1 | 56.5 | 59.9 | 57.5 | 59.3 | 55.9 | 58.0 |
| Qwen3-VL 32B [[2](#bib.bib35)] | — | 63.1 | 63.7 | 62.5 | 64.1 | 63.8 | 65.7 | 61.1 | 61.3 |
| GPT-4o [[12](#bib.bib40)] | — | 56.4 | 58.7 | 54.6 | 59.0 | 55.5 | 59.0 | 52.6 | 56.1 |
| GPT-5.5 | — | 82.4 | 83.6 | 83.6 | 80.4 | 81.1 | 81.4 | 81.6 | 82.8 |
| GPT-4o [[12](#bib.bib40)] | MedRAX [[11](#bib.bib5)] | 63.1 | 64.1 | 62.9 | 63.6 | 61.8 | 63.1 | 62.5 | 64.0 |
| Baseline (w/o Memory) |
| Qwen3-VL 2B [[2](#bib.bib35)] | MedRAX [[11](#bib.bib5)] | 56.8 | 57.6 | 58.1 | 55.1 | 56.6 | 57.1 | 57.3 | 55.8 |
| Qwen3-VL 32B [[2](#bib.bib35)] | MedRAX [[11](#bib.bib5)] | 64.0 | 65.7 | 63.4 | 65.1 | 61.9 | 63.6 | 63.0 | 66.3 |
| GPT-5.5 | MedRAX [[11](#bib.bib5)] | 83.1 | 84.0 | 84.2 | 81.6 | 81.8 | 82.1 | 81.9 | 83.7 |
| Ours (w/ Memory) |
| Qwen3-VL 2B [[2](#bib.bib35)] | EATS (Ours) | 57.6 | 59.0 | 58.9 | 55.7 | 56.0 | 56.9 | 58.3 | 58.1 |
| Qwen3-VL 32B [[2](#bib.bib35)] | EATS (Ours) | 65.2 | 67.4 | 65.3 | 65.2 | 63.4 | 65.2 | 64.3 | 66.1 |
| GPT-5.5 | EATS (Ours) | 85.7 | 86.7 | 86.8 | 84.0 | 84.5 | 84.7 | 86.6 | 86.2 |

Foundation Model. Table [2](#S4.T2) reports overall and per-category accuracy on ChestAgentBench. EATS improves the matched MedRAX baseline with all three core FMs, by +0.8+0.8, +1.2+1.2, and +2.6+2.6 points for Qwen3-VL 2B, Qwen3-VL 32B, and GPT-5.5, respectively, demonstrating that the memory benefit persists across substantially different FM scales rather than being tied to a particular model size. With GPT-5.5, EATS reaches an overall accuracy of 85.7%85.7\%, compared with 83.1%83.1\% for the memory-free agent and 82.4%82.4\% for the standalone FM. These results suggest that memory-guided tool selection remains useful across model scales, while stronger FMs further improve the performance of the proposed strategy. The reference rows in the upper block of the table further confirm that the agent strategy itself is necessary to surpass single-model performance on ChestAgentBench.

Table 3: Effect of memory size on ChestAgentBench [[11](#bib.bib5)] under two memory-construction settings.

| Method | ρ\rho | Hit rate (%) | Overall Acc. |
| Test-time |
| w/o Memory | 0.0 | 0.0 | 64.0 |
| w/ Memory | 0.25 | 24.0 | 64.5 |
| w/ Memory | 0.5 | 30.6 | 64.8 |
| w/ Memory | 0.75 | 32.1 | 65.0 |
| w/ Memory | 1.0 | 33.1 | 65.2 |
| w/ Memory (shuffled) | 1.0 | 33.1±0.133.1{\pm}0.1 | 65.2±0.265.2{\pm}0.2 |
| Pre-construction (5-fold) |
| w/o Memory | — | 0.0 | 64.0±1.864.0{\pm}1.8 |
| w/ Memory | — | 38.1±0.138.1{\pm}0.1 | 65.0±1.665.0{\pm}1.6 |

Memory-construction settings and the coverage ratio ρ\rho are defined in Section [4.1](#S4.SS1). Hit rate: fraction of cases that retrieve at least one memory entry. Shuffled: mean±\pmstd over three random processing orders. Pre-construction scores are mean±\pmstd over 55-fold cross-validation; per-fold accuracy is reported in Appendix [B](#A2). Bold: best.

Memory Size. Table [3](#S4.T3) (test-time block) reports accuracy as a function of the memory coverage ratio ρ\rho. Performance increases monotonically with ρ\rho, with ρ=1.0\rho{=}1.0 improving over the no-memory baseline by +1.2%+1.2\% overall. This trend indicates that accumulated tool-use experience leads to more reliable tool selection. At low ρ\rho, retrieved references are often sparse or absent, so the agent defaults to prompt-driven reasoning. As memory grows, more queries retrieve similar past cases, enabling tool selection based on empirical evidence. Repeating the ρ=1.0\rho{=}1.0 run with three random processing orders yields 65.2%±0.2%65.2\%{\pm}0.2\%, indicating that the gain is insensitive to the evaluation order.

Test-Time vs. Pre-Construction. The 5-fold cross-validation result (65.0%±1.6%65.0\%{\pm}1.6\%) is close to the test-time result at ρ=1.0\rho{=}1.0 (65.2%65.2\%). Under the same five folds, memory improves mean accuracy from 64.0%64.0\% to 65.0%65.0\% while slightly reducing the fold-to-fold standard deviation from 1.81.8 to 1.61.6 percentage points, suggesting a modest improvement in stability across these folds alongside better performance.

### 4.3 Cross-Dataset Results

To assess whether the memory mechanism generalizes beyond ChestAgentBench, we evaluate on three additional chest X-ray benchmarks: closed-ended VQA (SLAKE-VQA and CheXbench) and free-form report generation (MIMIC-CXR). Table [4](#S4.T4) summarizes the results, where the memory is constructed under the test-time setting with ρ=1.0\rho{=}1.0. The proposed method consistently improves the baseline across all benchmarks, increasing overall accuracy from 66.2%66.2\% to 69.7%69.7\%, MF1-5 from 47.9%47.9\% to 49.1%49.1\%, and recall from 80.6%80.6\% to 88.5%88.5\%, demonstrating effective generalization across tasks. Conversely, a cross-domain memory constructed only from these three datasets also improves the accuracy on ChestAgentBench from 64.0%64.0\% to 64.7%64.7\% (Appendix [E](#A5)), indicating that tool-use experience transfers across data sources.

Table 4: Cross-dataset generalization of memory-augmented inference on three datasets.

| Method | CheXbench [[7](#bib.bib9)] (Acc. %) | MIMIC-CXR [[15](#bib.bib29)] (F1 %) | SLAKE-VQA [[20](#bib.bib27)] (%) |
| OpenI  | Rad-Restruct  | SLAKE  | Overall  | mF1-14  | MF1-14  | mF1-5  | MF1-5  | Acc.  | Recall  |
| w/o Memory | 53.9  | 77.4  | 93.5  | 66.2  | 76.6  | 32.8  | 68.6  | 47.9  | 79.8  | 80.6  |
| w/ Memory | 59.2  | 78.3  | 94.3  | 69.7  | 77.3  | 32.9  | 69.4  | 49.1  | 87.7  | 88.5  |

Metrics on MIMIC-CXR and SLAKE-VQA follow the M4CXR protocol [[25](#bib.bib30)].

### 4.4 Tool-Use Behaviors

To analyze how memory reshapes tool-use behavior, we compare tool trajectories generated by our method and the baseline across the same 2,5002{,}500 ChestAgentBench cases. We examine two aspects of tool selection: (i) which tools are invoked and their informativeness, and (ii) the order of tool calls and their transitions. Throughout, we refer to the six tools by their abbreviations (Table [1](#S4.T1)).

Table 5: Effect of memory on tool-call frequency and per-call quality on ChestAgentBench (Qwen3-VL 32B).

| Metric | Method | Grd | Cls | Dgn | Rpt | Seg | Vqa |
| Freq. | w/o Mem | 3.36 | 2.54 | 2.54 | 2.06 | 0.76 | 0.12 |
| Freq. | w/ Mem | 3.44 | 2.40 | 2.47 | 1.78 | 0.71 | 0.10 |
| Score | w/o Mem | 0.679 | 0.417 | 0.145 | 0.169 | 0.474 | 0.446 |
| Score | w/ Mem | 0.706 | 0.438 | 0.159 | 0.187 | 0.483 | 0.570 |

Frequency: average number of calls per case. Score: average LLM-as-a-Judge tool-quality (Eq. [12](#S3.E12)) on common case-tool pairs that occur in both conditions.

Frequency and Quality. Table [5](#S4.T5) summarizes the effect of memory on both tool-call frequency and per-call quality. Memory reduces the frequency of most specialized tools, with the largest decreases for case-reusable tools such as Rpt (from 2.062.06 to 1.781.78 calls per case) and Cls (from 2.542.54 to 2.402.40). The only increase occurs for Grd, which rises from 3.363.36 to 3.443.44, consistent with its role as a query-specific localization module whose outputs are not reusable across cases. For fairness, we compare per-call quality on common case–tool pairs using the LLM-as-a-Judge scores defined in Section [3.4](#S3.SS4). Memory improves the average score of all tools, with notable gains for Vqa (from 0.4460.446 to 0.5700.570) and Rpt (from 0.1690.169 to 0.1870.187). Aggregated tool-level scores in Appendix [G](#A7) show the same trend. Overall, memory leads to fewer low-value calls and higher-quality retained calls, supporting reliability-aware tool selection. Accumulated experience allows the agent to estimate tool reliability for the current case, suppress less useful calls, and focus on those most likely to improve the final answer.

Figure 3: Tool selection dynamics across tool-call steps. Per-step usage proportion of each tool under Baseline and Ours (with memory). Memory accelerates the convergence to the final tool mix: low-final-proportion tools (Cls, Rpt) are suppressed earlier (steps 1–2), while high-final-proportion tools (Grd, Dgn) are amplified within the same window. From step 4 onwards, the per-step distributions of the two conditions are within 5%5\% of each other.

Tool Order. Beyond aggregated frequency, memory also reshapes the temporal arrangement of tool calls. Figure [3](#S4.F3.fig1) shows that memory accelerates the trajectory’s convergence to its final tool mix: low-final-proportion tools are suppressed earlier (Cls drops 8%8\% at step 1 and Rpt drops 9%9\% at step 2) while high-final-proportion tools (Grd and Dgn) are amplified within the same window; from step 4 onwards, per-step shifts are below 5%5\%, indicating that memory mainly accelerates the early reasoning phase rather than altering the late-stage tool mix. A complementary analysis of the inter-tool transition matrix P⁡(Tj+1∣Tj)P(T_{j+1}{\mid}T_{j}) (Appendix [A](#A1)) further shows that the dominant shift concentrates on the outgoing distribution of Vqa: probability mass moves from the cross-tool path Vqa→\toCls (−44%-44\% relative) to the self-continuation Vqa→\toVqa (+243%+243\% relative), all other transitions changing by less than 0.050.05 in absolute terms. This replaces a case-independent verification loop with a reliability-aware within-tool continuation.

Vocabulary Entropy. As a control, both per-call and corpus-level word-level Shannon entropy of prompts and responses show changes that are mostly concentrated below 0.100.10 bits, with the main exception being corpus-level Dgn responses. This suggests that memory does not improve performance primarily by increasing verbosity or lexical diversity (see Appendix [J](#A10)). Appendix [F](#A6) further provides qualitative examples showing that memory can modify tool arguments, such as focusing prompts on clinically relevant cues or correcting image inputs for multi-view comparison.

#### Summary.

The above views converge on a concise statement: *memory’s effect on tool use reduces to reliability-aware tool selection.* Conditioned on empirical evidence retrieved from similar past cases, the agent (i) avoids invocations that prior experience marks as unlikely to help on the current case—lowering the frequency of redundant tools while raising the per-call usefulness of those that survive; and (ii) advances the most reliable tools earlier in the trajectory and replaces case-independent cross-tool verification with within-tool deepening. Both effects share the same underlying mechanism—substituting prompt-only tool arbitration with case-specific reliability evidence—and together produce the accuracy gains reported in Section [4.2](#S4.SS2).

### 4.5 Hyperparameters

Table 6: Effect of retrieval hyperparameters.

| kk | 3  | 3  | 3  | 1  | 10  |
| τ\tau | 0.9  | 0.99  | 0.999  | 0.99  | 0.99  |
| Overall Acc. | 64.8  | 65.2  | 65.0  | 64.8  | 64.3  |

We study the sensitivity of memory-augmented inference to the retrieval hyperparameters kk and τ\tau on ChestAgentBench using Qwen3-VL 32B. As shown in Table [6](#S4.T6), we vary one hyperparameter at a time around the default setting (k=3,τ=0.99)(k{=}3,\tau{=}0.99). When fixing k=3k{=}3, the default threshold τ=0.99\tau{=}0.99 achieves the best accuracy. A lower threshold (τ=0.9\tau{=}0.9) retrieves less relevant historical cases, while a higher threshold (τ=0.999\tau{=}0.999) reduces useful memory coverage. When fixing τ=0.99\tau{=}0.99, increasing kk from 11 to 33 improves performance, indicating that multiple similar cases provide richer tool-reliability references. However, further increasing kk to 1010 degrades performance, likely because it includes fewer relevant cases, diluting the retrieved evidence. Overall, (k=3,τ=0.99)(k{=}3,\tau{=}0.99) provides the best trade-off between relevance and coverage. A complementary ablation on tag-based feature extraction is provided in Appendix [C](#A3).

## 5 Conclusion

We present EATS, an experience-augmented strategy for improving tool selection in medical reasoning agents. By constructing a long-term memory of tool-use trajectories and retrieving relevant past experiences at inference time, EATS enables reliability-aware decision-making without additional training or supervision. This design effectively addresses the challenge of uncertain and case-dependent neural tool outputs in clinical workflows. Extensive experiments across four benchmarks and three multimodal foundation models demonstrate consistent improvements in both tool selection accuracy and downstream reasoning tasks, including VQA and report generation. These results highlight the value of leveraging accumulated experience to enable scalable, adaptive medical tool use.

## LLM Usage Statement

The authors used GPT-6.1 Sol to assist with language polishing of author-written text, including grammar and spelling checks, to improve clarity and readability for non-native English writers. The tool also assisted in editing and refining author-produced code and implementation, as well as in refining author-developed experimental designs, supporting experiment execution, and assisting with the analysis of results. Its role in these activities was limited to assistance with author-produced material. Neither the full manuscript nor major portions of it were submitted to an LLM provider for reviewer-style feedback. The authors take full responsibility for all submitted content.
