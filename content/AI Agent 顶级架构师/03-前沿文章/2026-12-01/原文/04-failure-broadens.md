# Failure Broadens, Success Sharpens:
Continual Adaptation of Tool-Use Agents Across Diverse Tasks with Dual-Polarity Memory

Tianmai M. Zhang ††thanks: Work done during internship at Microsoft. Affiliation: University of Washington Email: [tianmai@uw.edu](mailto:) Hoda Shajari Affiliation: Microsoft Email: [hodashajari@microsoft.com](mailto:) Amr Hendy Affiliation: Microsoft Xiaohu Liu Affiliation: Microsoft Piyush Behre Affiliation: Microsoft Omar Zia Khan Affiliation: Microsoft Ankur Gupta Affiliation: Microsoft

###### Abstract

Large language model agents can self-improve over time by utilizing procedural memory derived from prior task trajectories, yet the distinct utilities of memories derived from local successes and failures remain underexplored. This work studies this question in a realistic setting with heterogeneous streams of multi-domain tool-use tasks and various environment constraints common in real-world scenarios. We develop *Dual-Polarity Memory with Periodic Maintenance* (DualPM), a simple, retrieval-free memory workflow characterized by (1) customizable reflection and procedural memory generation from both local successes and failures within each trajectory, and (2) periodic memory consolidation over long task streams under a given memory capacity, preventing memory explosion. Online prequential evaluation with fine-grained metrics reveals that failure memory more strongly broadens coverage, success memory better streamlines execution, while combining both polarities effectively integrates both benefits. Further studies demonstrate that DualPM enables cross-domain memory generalization and continual memory adaptation, while external evaluation on EvoMemBench reveals the portability and effectiveness of DualPM as a general long-term procedural memory method.

## 1 Introduction

### 1.1 Background and related work

As applications of large language model (LLM) agents increasingly emphasize utility in multi-session, long-horizon settings, externalizing experiences from past tasks as reusable memories or skills has become a common approach to enable continual personalization, adaptation, and improvement of AI agents ([Huang et al., 2026](#bib.bib1); [Zhang et al., 2026](#bib.bib2)). Rather than retaining noisy raw interaction histories, training-free methods on agent memory or skills typically compress prior experience into knowledge or procedural guidance that can inform future task execution ([Huang et al., 2026](#bib.bib1)).

A prominent strand of research in this direction derives reusable procedural guidance primarily from successful task executions. For example, Agent Workflow Memory ([Wang et al., 2025](#bib.bib6)) abstract successful trajectories into workflows; SkillWeaver ([Zheng et al., 2025](#bib.bib7)) synthesizes tool interfaces from successful practice runs. Meanwhile, failed trajectories may carry distinct values that can be utilized through self-reflection. Reflexion ([Shinn et al., 2023](#bib.bib8)), an early pioneer in reflective self-learning, converts feedback from failed attempts into guidance for subsequent trails; recent work also showed that corrective updates derived from failures could improve computer-use agents ([Sun et al., 2026](#bib.bib9)). Recent trajectory learning approaches—including ExpeL ([Zhao et al., 2024](#bib.bib11)), ReasoningBank ([Ouyang et al., 2026](#bib.bib5)), SkillOpt ([Yang et al., 2026b](#bib.bib12)), MUSE ([Yang et al., 2026a](#bib.bib13)) and Trace2Skill ([Ni et al., 2026](#bib.bib14))—draw on both successful and failed trajectories to derive reusable procedural guidance. These studies established that agents can self-improve at inference time by utilizing both previous successes and failures that are primarily judged and measured by benchmark-style, verifiable final task success.

Final-task success alone provides limited insight into whether memories derived from successful and unsuccessful behavior serve different functions or how they affect actions within a multi-step trajectory. Successes and failures can also occur locally within a trajectory rather than only at the episode level ([Cao et al., 2026](#bib.bib10)). A successful trajectory may contain local failures worth avoiding or improving, while a failed trajectory may contain effective behaviors worth reusing. Furthermore, the explicit outcome signals available in benchmark environments are often absent in the real world. In real-world user-facing scenarios, agents may also face incomplete environment information, noisy tool interfaces, ambiguous user requests, and domain-diverse task streams. Under these conditions, deriving and maintaining a durable pool of procedural guidance over long, heterogeneous task streams remains challenging and underexplored.

### 1.2 Objectives and Contributions

This work studies cross-session procedural memory in a realistic setting where an agent handles a heterogeneous stream of multi-step, multi-domain tool-use tasks under various constraints: user requests may be implicit; the tool set is large, noisy, and not fully visible upfront; evaluation ground truth is not available to the memory workflow; and the memory pool has a fixed capacity. The memory mechanism must therefore determine procedural lessons that remain durable and applicable to tasks from different domains, and continuously maintain the memory pool based on observations from newly completed task episodes.

Our primary research question is how success and failure memories, independently and jointly, affect agent performance. To answer this, we introduce *Dual-Polarity Memory with Periodic Maintenance* (DualPM), a simple, retrieval-free memory workflow that reflects on completed task episodes, drafts success and failure memories, and periodically consolidates them into separate memory pools. Through online, prequential evaluation and fine-grained measurements of intermediate task stages, we find that the two memory polarities have complementary utilities: failure memory broadens coverage more, success memory improves efficiency more, and their combination effectively integrates both benefits.

Case studies and analyses demonstrate that DualPM supports continuous memory adaptation after the procedural memory pool of a user is transferred to another user task sequence with a distinct domain composition. External evaluation on EvoMemBench ([Wang et al., 2026](#bib.bib4)) further reveals the effectiveness of DualPM as a portable long-term procedural memory method that works across different task environments and backbone models.

## 2 Methodology

### 2.1 The DualPM workflow

#### Problem formulation

We consider memory-driven cross-session continual learning over an ordered task sequence {ti}i=1n=(t1,t2,…,tn)\{t_{i}\}_{i=1}^{n}=(t_{1},t_{2},\ldots,t_{n}). For each task tit_{i}, an agent produces an observed trajectory τi∼π⁡(ti,ℳi)\tau_{i}\sim\pi(t_{i},\mathcal{M}_{i}), conditioned on an active memory context ℳi\mathcal{M}_{i}. The objective of a test-time memory workflow is to transform earlier trajectories {τj}j<i\{\tau_{j}\}_{j<i} into a memory context ℳi\mathcal{M}_{i} that improves the execution of subsequent tasks {tj}j≥i\{t_{j}\}_{j\geq i}, without updating the agent model, harness, or environment settings. *Dual-Polarity Memory with Periodic Maintenance* (DualPM) operationalizes this process through periodic memory generation and parallel maintenance of success memory ℳ+\mathcal{M}^{+} and failure memory ℳ−\mathcal{M}^{-}.

Figure 1: Blockwise task–reflection–maintenance workflow of DualPM.

#### Blockwise task–reflection–maintenance cycle

DualPM partitions the task sequence {ti}i=1n\{t_{i}\}_{i=1}^{n} into consecutive blocks of size bb, ℬk={t(k−1)​b+1,…,tmin⁡(k​b,n)}\mathcal{B}_{k}=\{t_{(k-1)b+1},\ldots,t_{\min(kb,n)}\} for k=1,2,…,⌈n/b⌉k=1,2,\ldots,\lceil n/b\rceil. Each block follows three sequential phases (Figure [1](#S2.F1)). During the *task phase*, every task in ℬk\mathcal{B}_{k} is executed with the same frozen memory context ℳk−1\mathcal{M}_{k-1}, producing trajectories {τi:ti∈ℬk}\{\tau_{i}:t_{i}\in\mathcal{B}_{k}\}. During the *reflection phase*, DualPM employs an LLM to first reflect on each completed trajectory, and then generate drafts of success and failure memories, denoted as 𝒟k+\mathcal{D}_{k}^{+} and 𝒟k−\mathcal{D}_{k}^{-}. During the *maintenance phase*, these memory drafts are consolidated independently into success and failure memory lists, producing ℳk+\mathcal{M}_{k}^{+} and ℳk−\mathcal{M}_{k}^{-}. The aggregated memory list ℳk=ℳk+​⋃ℳk−\mathcal{M}_{k}=\mathcal{M}_{k}^{+}\bigcup\mathcal{M}_{k}^{-} becomes the memory context for tasks in the next block ℬk+1\mathcal{B}_{k+1}. The initial block ℬ1\mathcal{B}_{1} cold-starts with no memory ℳ0=∅\mathcal{M}_{0}=\varnothing.

#### Reflection and memory drafting

During the reflection phase, DualPM makes two sequential LLM calls for each completed trajectory τi\tau_{i} associated with task ti∈ℬkt_{i}\in\mathcal{B}_{k}. The first call performs reflection on the observed trajectory τi\tau_{i}, including the agent-visible instructions, user request, agent actions, tool responses, and final agent answer. Task ground truth, such as the golden trajectory and reference answer, is never exposed to the reflection model. The reflection prompt includes a customizable feedback signal section specifying what constitutes granular success or failure within the trajectory, thereby guiding the reflection process.

The second LLM call continues from the reflection and drafts reusable procedural lessons for trajectory τi\tau_{i}. It may generate lessons of either polarity: success memory drafts 𝒟k,i+\mathcal{D}_{k,i}^{+} capture reusable principles for effective behaviors worth repeating, whereas failure memory drafts 𝒟k,i−\mathcal{D}_{k,i}^{-} provide constructive guidance for avoiding or improving an ineffective behavior. The memory drafting call produces up to dd drafts for each polarity. All memory drafts adopt the following structure:

- •

memory_type: success memory or failure memory;

- •

title: a short, transferable name for the procedural principle;

- •

content: actionable guidance for future tasks and its rationale;

- •

evidence: a concise account of the trajectory’s evidence that supports the guidance;

- •

applicability: an access-time routing cue specifying when the guidance should be considered;

- •

confidence: qualitative assessment of the drafting model’s confidence in deriving the guidance.

Each draft additionally records a draft index and source-episode reference for provenance. All prompts are available in Appendix [A.1](#A1.SS1).

#### Memory maintenance

After reflection on block ℬk\mathcal{B}_{k}, DualPM consolidates the resulting drafts while maintaining the two memory polarities independently. For each polarity p∈{+,−}p\in\{+,-\}, a separate LLM call receives the previous memory list ℳk−1p\mathcal{M}_{k-1}^{p} together with the new drafts 𝒟kp\mathcal{D}_{k}^{p}, then returns the complete updated list ℳkp\mathcal{M}_{k}^{p}, subject to a capacity constraint |ℳkp|≤m|\mathcal{M}_{k}^{p}|\leq m. This constraint encourages draft consolidation and evidence-based revision: rather than simply appending new memories, the maintainer must keep the memory list concise and nonredundant by preserving, revising, merging, splitting, creating, or removing memories based on new drafts and evidence from the latest block. Each maintained memory unit follows the draft schema above but may retain up to ee supporting evidence items selected from its parent memories or newly incorporated drafts. Index references to these sources are recorded for provenance. The updated memory lists are then combined as ℳk=ℳk+​⋃ℳk−\mathcal{M}_{k}=\mathcal{M}_{k}^{+}\bigcup\mathcal{M}_{k}^{-} and applied to the next block ℬk+1\mathcal{B}_{k+1}.

### 2.2 The TRAJECT-Bench environment and agent runtime

To evaluate agent performance and task progress in a granular manner, we use TRAJECT-Bench ([He et al., 2026](#bib.bib3)), a trajectory-aware tool-use benchmark providing diverse user requests spanning multiple domains and ground-truth tool trajectories for the tasks. Each user request in TRAJECT-Bench consists of multiple subtasks, typically requiring 3 to 10+ different tool calls to the gold tools ([He et al., 2026](#bib.bib3)). To complete the user request, an agent needs to select from a pool of hundreds of candidate tool APIs provided for the task’s domain, and make function calls to those tools using correct parameter combinations inferred from the user request ([He et al., 2026](#bib.bib3)). The large candidate tool pool also simulates the real-world scenario where an agent is exposed to numerous tools provided by Model Context Protocol servers. Some task examples in TRAJECT-Bench can be found in Appendix [B](#A2).

TRAJECT-Bench primarily evaluates LLMs through one-shot prediction, with all tool schemas supplied in the prompt. Since this does not reflect the task environment faced by modern agents, we construct a more realistic, single-agent agent runtime with provider-native tool provision, parallel tool calling, and ReAct-style ([Yao et al., 2023](#bib.bib15)) agent-tool interaction. During task execution, a tool would replay its gold response recorded in the ground-truth dataset if the agent calls it using the correct parameter combination for required parameters. Tool calls to either non-gold tools or gold tools but with incorrect parameters, however, would receive a general failure message that instructs the agent to reconsider its tool or parameter selection. This replay-based procedure would naturally result in multiple trials and errors until the agent makes a correct tool call, while ensuring that final agent responses in our experiments are comparable to the reference answers provided by TRAJECT-Bench.

We further increase task difficulty through two design choices motivated by real-world agent applications. First, we use only the hard version of TRAJECT-Bench, which is designed to mimic real-world interactions where users often describe their requests colloquially and implicitly ([He et al., 2026](#bib.bib3)). Second, modern agent applications (e.g., ChatGPT, Codex, and M365 Copilot) commonly do not expose all available tools to the agent upfront, but instead provide only a short list of core built-in tools plus a tool discovery function that retrieves additional tools when necessary. To mimic this design, we hide each task’s candidate tool pool behind a tool_search function that the agent can use to retrieve tools relevant to a user request. The function ranks candidate tools through BM25 matching between the agent’s search query and tool metadata, and then returns the requested number of top-ranked tool schemas. Retrieved tools are added to the agent’s callable tool set and remain available throughout the episode. The agent may invoke tool_search repeatedly to discover additional tools, but cannot call a tool before retrieving it. The system prompt for the task agent is available in Appendix [A.2](#A1.SS2).

### 2.3 Stage-aware evaluation

To effectively solve a user request in the revised TRAJECT-Bench environment, an agent needs to complete three intermediate stages of execution. First, it must *discover* the appropriate tools by issuing effective tool_search queries. This is challenging because implicit user requests often describe only the required functionality (e.g., verifying an email address) rather than naming the tool directly (e.g., Blaze Verify in Appendix [B](#A2), task example 1). Second, it must *select* tools from the retrieved schemas that correspond to the request’s sub-requirements. Third, it must *use* each tool correctly by supplying ground-truth-matching parameters to obtain a valid response, which then serves as evidence for the final answer. For each task episode, we evaluate this three-stage funnel using the following metrics:

- •

Discovery recall: The proportion of ground-truth tool APIs discovered through tool_search. A higher discovery recall indicates better discovery coverage.

- •

Selection recall: The proportion of ground-truth tool APIs invoked by the agent. A higher selection recall indicates better selection coverage. This metric is identical to TRAJECT-Bench’s Inclusion.

- •

Usage recall: The proportion of ground-truth tool calls matched by tool calls invoked by the agent. A higher usage recall indicates better tool execution coverage and overall task progress. This metric is revised from TRAJECT-Bench’s u​s​a​g​eusage, which is conditional on selecting a ground-truth tool.

- •

Usage precision: The proportion of the agent’s task-relevant tool calls that match ground-truth calls. Any incorrect, malformed, or redundant calls would reduce precision.

- •

Total turns: The number of agent interaction turns until it produces the final answer. Fewer turns indicate higher trajectory efficiency. This metric is also a proxy for task latency, as each turn corresponds to an LLM call.

- •

Final answer accuracy: Binary final answer correctness judged by an LLM against the reference answer in TRAJECT-Bench, complementary to the deterministic usage recall. This metric is inherited from TRAJECT-Bench. Only answers successfully addressing all subtasks in the user requests would be considered correct; partially correct answers are considered incorrect.

### 2.4 Profile-based task sequence construction

To simulate task diversity in the real world, we construct four mixed-domain task sequences by reorganizing the domain-specific tasks in the parallel-hard subset of TRAJECT-Bench. Each task sequence contains 200 unique tasks sampled from two primary domains and three secondary domains based on a synthetic user profile (Table [1](#S2.T1)). Matching DualPM’s blockwise design, each task sequence is organized into ten 20-task blocks with a consistent domain distribution, i.e., 70% from primary domains and 30% from secondary domains. Task sequences are frozen for the experiments.

Table 1: User profiles and domain composition of the four task sequences. Primary domains constitute 70% of a user’s task sequence, while secondary domains constitute 30%.

| User | Profile | Primary domains | Secondary domains |
| U1 | Information worker | Email, News/Media | Finance, Education, Weather |
| U2 | Student | Education, Email | Gaming, E-commerce, Music |
| U3 | Budget-aware shopper | E-commerce, Finance | Travel, Weather, Education |
| U4 | Entertainment lover | Gaming, Music | E-commerce, Travel, Finance |

## 3 Experiments and results

### 3.1 Memory polarity experiment

The main experiment examines the independent and joint effects of success- and failure-derived procedural memory. We adopt a 2×22\times 2 factorial design involving four memory conditions: no memory, failure memory only, success memory only, and both on. During the task phase, the agent receives the complete, active memory list permitted by its assigned condition, appended to the system or developer prompt as memory context (see prompt template in Appendix [A.2](#A1.SS2)). We use GPT-5.5 as the backbone model for both the task agent and the DualPM memory workflow, and DeepSeek-V3.2 as the judge for final answer accuracy to avoid evaluation with the same model. Details of model setup are available in Appendix [D](#A4).

The experiment evaluates task agent performance in an online, prequential manner. Under DualPM’s periodic memory update workflow (Section [2.1](#S2.SS1)), tasks in each block are first used for testing and then included in training as they enter memory generation and maintenance. With n=200n=200 tasks in each user’s task sequence, we set block size b=20b=20 for DualPM, yielding a total of ten blocks and an evaluation sample size of nine blocks, 180180 tasks. Across four user task sequences, this yields 720 evaluated task episodes per condition. We heuristically set memory capacity parameters to d=2d=2, m=10m=10, and e=3e=3, i.e., each episode can produce up to 2 drafts per polarity; the maintained memory list contains up to 10 memory units per polarity, with each memory unit containing up to 3 evidence items. This parameter setting effectively caps the memory list generated by GPT-5.5 at around five thousand tokens per polarity. For the same user sequence, all three memory-on conditions reuse the same block 1 from the no-memory run to ensure a fair cold start, and then fork with their own memory exposure settings. Statistical comparisons of the memory conditions are based on paired differences by task within each user sequence. Details of statistical methods are available in Appendix [D](#A4).

Table 2: Performance of memory polarities averaged across all four users. Recalls, usage precision, and final answer accuracy are reported in percentages. Bold and underline mark the best and second-best values, respectively.

| Memory Setting  | Recall | Efficiency | Answer Accuracy  |
| Discovery | Selection | Usage | Usage Precision | Turns |
| No memory | 75.2 | 68.0 | 66.0 | 50.5 | 6.1 | 68.1 |
| Failure only | 81.0 | 73.9 | 71.9 | 49.0 | 6.3 | 71.0 |
| Success only | 78.7 | 72.2 | 70.5 | 56.2 | 5.4 | 72.2 |
| Both on | 81.1 | 74.5 | 72.4 | 53.7 | 5.5 | 73.2 |

Failure memory primarily broadens coverage, success memory primarily streamlines execution, and their combination integrates both benefits. Table [2](#S3.T2) shows that all three memory-on settings improved tool utilization coverage and final answer accuracy over the no memory setting. The improvements are statistically significant across all three recall measures (all p≤.001p\leq.001) and final answer accuracy (p≤.015p\leq.015) in paired comparisons across all four users. The two memory polarities exhibit distinct utility profiles. Failure-only memory achieved significantly higher discovery and selection recall than success-only (p=.002p=.002 and p=.018p=.018, respectively). This pattern indicates that failure lessons primarily broaden the set of relevant capabilities considered and selected by the agent. Success-only memory instead produced the highest tool usage precision and completed the tasks in fewest turns (both p<.001p<.001 compared to failure-only).

Combining both polarities integrated these complementary effects and achieved the best performance overall. Relative to success-only memory, the combined condition significantly improves discovery, selection, and usage recalls (all p≤.002p\leq.002) with only slightly lower precision (p<.001p<.001) and comparable total turns (p=.27p=.27). Relative to failure-only memory, it achieves comparable or modestly better recalls (p=.41p=.41, .038.038, and .045.045 for discovery, selection, and usage recalls, respectively) while significantly improved usage precision (p<.001p<.001) and task completion in fewer turns (p<.001p<.001). In terms of final answer accuracy, the both-on condition achieved the highest score, although the differences among the memory-on settings were not statistically significant (all p≥.17p\geq.17). Together, dual-polarity memory achieved the strongest overall coverage while retaining comparable tool usage precision, interaction length, and answer accuracy.

Memory promoted more targeted tool searches and more judicious tool calls. Paired trajectory analysis indicates that memory changed how the agent organized tool discovery and execution. Memory-on trajectories more often decomposed multi-part requests into subtask-specific tool_search queries rather than relying on a single generic query, resulting in more tool search actions and lower (better) mean ranks of gold tools in tool search results (Appendix [D](#A4), Table [5](#A4.T5)). For example, on a composite, class-presentation preparation task (task example 2 in Appendix [B](#A2)) requesting a fact about number 42, DEI (diversity, equity, and inclusion) learning resources, and a usage example for the word “excellent”, the no-memory agent issued one broad query: “web search internet search retrieve links snippets definitions dictionary”, which retrieved a dictionary tool but no tools related to the other two subtasks. Then, the no-memory agent made no further searches, answered from prior knowledge, and invented plausible links to DEI resources. Instead, the agent with dual-polarity memory issued separate tool search queries for “Numbers trivia fact number 42”, “DEI learning resources page links”, and “dictionary definition word excellent usage”, allowing it to obtain tools for all three subtasks. The memory lesson that potentially drove this improvement can be found in Appendix [C](#A3).

The paired trajectories further illustrate the distinct utilities of the two memory polarities. In a task requiring ten pieces of evidence across multiple topics, the no-memory agent issued one generic search and selected tools covering only 20% of the request requirements. With failure-only memory, active memory guidance emphasized decomposing the request by evidence type and recovering unresolved material requirements. The agent consequently pursued five subtask-oriented searches and expanded execution to 16 tool calls over ten turns, increasing selection recall to 80%. Success-only memory achieved the same 80% selection recall with 16 calls but only five turns, and a usage precision of 80%. Although no trajectory produced a fully correct final answer for the task, this contrast demonstrates the broader pattern reflected in Table [2](#S3.T2): failure memories operated primarily as coverage-and-recovery checklists that encouraged continued pursuit of incomplete subtasks, whereas success memories operated more as routing guidance that organized parallel work into a more compact execution trajectory. Similar to the success-memory agent, the both-on agent completed the task in five turns but with a 100% precision (i.e., no failed tool call). Combining performance results with token usage metrics (Appendix [D](#A4), Table [5](#A4.T5)) reveals a practical performance-cost trade-off: success-only is preferable when prioritizing execution efficiency and cost, whereas dual-polarity memory is preferable when maximizing coverage and performance.

### 3.2 Case studies

Following the main experiment, we conducted case studies to further examine cross-domain memory transfer and memory evolution patterns.

#### Case study 1: cross-domain memory transfer

To examine whether procedural memories learned from one user remain useful on a largely distinct task sequence, we select U1 and U4, as this pair has minimal overlap in task domains and is therefore the most challenging for cross-domain evaluation. Memory transfer is evaluated in both directions (U1 →\to U4 and U4 →\to U1). For each target sequence, we compare four settings: (1) no memory; (2) standard DualPM memory from scratch; (3) the other user’s final dual-polarity memory applied to all target tasks but kept frozen; and (4) the same transferred memory used as a warm start with standard DualPM updates afterwards. Results in Table [3](#S3.T3) shows that frozen procedural memory learned from different domains yielded moderate performance gains, with improvements in all recall measures and final accuracy. Enabling memory adaptation led to continual update of the transferred memory and yielded comparable performance to building memory from scratch.

Table 3: Cross-user memory transfer effects, averaged across U1 →\to U4 and U4 →\to U1. Recalls, usage precision, and final answer accuracy are reported in percentages. Bold and underline mark the best and second-best displayed values of memory-on settings, respectively; ties are marked equally.

| Memory Setting  | Recall | Efficiency | Answer Accuracy  |
| Discovery | Selection | Usage | Usage Precision | Turns |
| No memory | 79.0 | 71.9 | 69.6 | 49.1 | 6.2 | 72.0 |
| Own memory | 82.1 | 76.2 | 73.8 | 50.6 | 5.6 | 78.0 |
| Transferred, frozen | 79.3 | 73.7 | 71.5 | 48.2 | 6.4 | 75.0 |
| Transferred, adaptive | 82.1 | 75.3 | 73.5 | 50.0 | 5.6 | 78.5 |

Figure 2: Memory operations in user 4’s own memory and adapted user 1 memory.

#### Case study 2: memory lineage analysis

To understand how the memory list evolves over time, we conducted a post hoc analysis of the two DualPM-active runs (own memory and transferred adaptive memory) on the U4 sequence in the first case study. Using the recorded parent-child reference linkages of each maintained memory, we classify maintenance operations into six categories. *Add* introduces a new memory without a parent; *Merge* combines multiple parent memories; *Split* produces multiple memories from one parent; and *Remove* means that a parent memory is no longer cited. Single-parent updates are classified as *Revise* when the memory content is substantially altered, as measured by a normalized word-level Levenshtein distance above 0.3, or *Refine* when they involve smaller content change or merely evidence updates. Comparing operation frequencies across blocks reveals how memory develops from scratch and how transferred memory is adapted to a new user. Results in Figure [2](#S3.F2) shows that U4’s own memory became structurally stable after block 5, with subsequent maintenance focusing on revising and refining existing memories; when the run warm-started with transferred memory, DualPM continued to update and revise the memory list for a longer period.

### 3.3 External evaluation on EvoMemBench

For evaluation of DualPM as a portable long-term memory method, we took EvoMemBench ([Wang et al., 2026](#bib.bib4)), a recent benchmark designed to evaluate agent memory methods from a self-evolving perspective. Its cross-episode tool using (CrossEp-Tool) subset matches closely with our target application scenario of agent tool use in a multi-session setting, providing multi-turn tasks in four new domains—file system operation, vehicle control, trading bots, and travel booking ([Wang et al., 2026](#bib.bib4)). EvoMemBench offers a unified evaluation environment, including an agent runtime, tool execution, and memory interfaces, to enable benchmarking of diverse memory methods using an online learning paradigm ([Wang et al., 2026](#bib.bib4)). This benchmark design effectively measures the general performance of DualPM in an environment-independent, domain-independent, and model-independent manner.

Each domain in EvoMemBench-CrossEp-Tool comprises an ordered stream of 50 tasks. To match the ten-block design in our TRAJECT-Bench experiments, we set DualPM’s block size to b=5b=5. This yields one five-task cold-starts block without memory and nine blocks with memory. Memory capacity parameters, including draft limit d=2d=2, memory pool limit m=10m=10, and evidence limit e=3e=3, are kept the same as in TRAJECT-Bench experiments and never tuned. However, since EvoMemBench evaluates memory methods by task completion only, we use a different feedback signal section in the reflection prompt that encourages reflection on overall task completion but is not relevant to any of the task domains. The prompts (Appendix [A.1](#A1.SS1)) are frozen before evaluation runs.

Table 4: Success rate (%) on EvoMemBench-CrossEp-Tool. Best and second-best results are shown in bold and underlined, respectively. DualPM results are averaged from three independent runs; other results are taken from Table 6 of EvoMemBench. Overall is the average of all four domains.

| Method | File System | Vehicle Control | Trading Bots | Travel Booking | Overall |
| No memory | 64.0 | 36.0 | 54.0 | 26.0 | 45.0 |
| General long-term memory |
| Mem0 | 76.0 | 58.0 | 48.0 | 30.0 | 53.0 |
| A-MEM | 68.0 | 62.0 | 70.0 | 26.0 | 56.5 |
| MemOS | 72.0 | 60.0 | 36.0 | 28.0 | 49.0 |
| MemoryOS | 72.0 | 72.0 | 56.0 | 36.0 | 59.0 |
| Procedural long-term memory |
| AWM | 64.0 | 56.0 | 74.0 | 24.0 | 54.5 |
| SkillWeaver | 66.0 | 48.0 | 44.0 | 28.0 | 46.5 |
| AgentKB | 62.0 | 71.4 | 74.0 | 30.0 | 59.4 |
| ACE | 68.0 | 56.0 | 14.0 | 34.0 | 43.0 |
| ReasoningBank | 64.0 | 82.0 | 86.0 | 42.0 | 68.5 |
| DualPM (ours) | 67.3 | 84.0 | 80.7 | 47.3 | 69.8 |

Following EvoMemBench’s practice, we used DeepSeek-V3.2 ([DeepSeek-AI et al., 2025](#bib.bib16)) as the backbone model for both the task agent and memory workflow, thereby making our evaluation results comparable to benchmarking results reported by EvoMemBench. We first verified the performance of DeepSeek-V3.2 in the no memory setting and obtained consistent results with those reported by EvoMemBench. Subsequent evaluation of DualPM reused the exact same agent loop implementation, tool environment, task order, and official result checker provided by EvoMemBench ([Wang et al., 2026](#bib.bib4)). To reduce sensitivity to run-to-run variation, we report average results of DualPM from three independent runs for each task domain.

As shown in Table [4](#S3.T4), DualPM exhibits competitive performance with other long-term memory methods evaluated by EvoMemBench. On three of four domains, DualPM outperforms ReasoningBank ([Ouyang et al., 2026](#bib.bib5)), the overall best-performing method on EvoMemBench-CrossEp-Tool ([Wang et al., 2026](#bib.bib4)). DualPM achieves this despite two design-level disadvantages. First, DualPM performs no task-specific memory retrieval. It applies a fixed memory context across all tasks in the same block. Second, all tasks in the first cold-start block receive no memory. By contrast, other memory methods could update memory after each task, allowing memory derived from task 1 to be applied to task 2. These results indicate that DualPM is a portable procedural memory method that works in different environments and with a different model.

## 4 Discussion

This work examines the utilities of memory polarities (Section [3.1](#S3.SS1)) with an application-oriented agent memory method (Section [2.1](#S2.SS1)), a realistic agent setting (Section [2.2](#S2.SS2)), domain-diverse task sequences (Section [2.4](#S2.SS4)), and fine-grained evaluation metrics (Section [2.3](#S2.SS3)). Case studies and analyses (Section [3.2](#S3.SS2)) demonstrate that DualPM enables continual memory adaptation along task streams. External evaluation on EvoMemBench (Section [3.3](#S3.SS3)) further shows the portability and effectiveness of DualPM as a general procedural memory method.

#### Application-oriented advantages of DualPM

The DualPM workflow carries multiple advantages for agent applications. First, the reflection step can be customized for different goals of user-facing applications. Developers could use the feedback signals section to define self-improvement dimensions (e.g., verbosity and safety) and application-specific successes/failures (e.g., user satisfaction/dissatisfaction in follow-up messages) within a trajectory. If pre-defined evaluation metrics are available, the reflection call may also serve as an evaluation step to produce LLM-judged metrics and reflections along given evaluation dimensions. Second, DualPM’s memory schema is structured and manageable. Developers or users may directly edit or remove a memory item. If an application already carries other memory types (e.g., user facts and events) in a structured way, DualPM memories could share the same storage layer. Finally, the capacity of DualPM’s memory store is adjustable through capacity parameters, which bounds the number of stored memory units.

#### Extension to flexible block split, reflection with subsets, and dynamic memory utilization

This work adopts a fixed block size bb across task blocks for simplicity. Real-world applications could consider a more flexible block splitting design, e.g., triggering reflection and memory maintenance after a certain period (e.g., a week) or during low-demand time (e.g., at night) for economic considerations. To further save token cost during memory generation, developers may also consider triggering reflection on a subset of task trajectories that would potentially produce the most constructive guidance. This work also applies memories in their entirety by injecting the complete memory pools as memory context. However, some memories may be inapplicable for a newly encountered task and therefore carry uncertain utility. Prior work typically handles this through task-aware memory retrieval. For example, ReasoningBank retrieves memories of the most similar task at inference time by comparing the embeddings of task descriptions ([Ouyang et al., 2026](#bib.bib5)). A more agentic design could be lazy loading, in which only lightweight memory metadata (e.g., the title and applicability fields of DualPM) is loaded in the beginning context, while the agent could retrieve the full content of specific memories at its own discretion.

#### Limitations

First, because this work builds on TRAJECT-Bench, it inherits limitations of the benchmark. For example, multiple trajectories may plausibly solve a given task, yet TRAJECT-Bench provides only one as the ground truth, penalizing valid alternative strategies. Second, our TRAJECT-Bench task sequences maintain a consistent domain composition across blocks, whereas real-world task streams may undergo temporal distribution shifts. Third, the polarity of a source trajectory and the procedural guidance derived from it are coupled in our design; we did not isolate their respective contributions. Last, we fixed DualPM’s design parameters in the experiments and did not systematically study their effects. Our objective is to examine the utilities of memory polarities in a realistic setting with a simple, application-oriented memory method, rather than to optimize DualPM towards a state-of-the-art memory architecture.
