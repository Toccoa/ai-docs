# 原文存档｜Evaluating More with Less: Black-Box Test Selection for AI Agents

> 来源：arXiv 2611.34617　｜　日期：2026-11-25
> 原文链接：https://arxiv.org/abs/2611.34617
> 说明：本文件为原文存档（arXiv HTML 版正文纯文本），供与中文译文对照；公式排版从略。

---

arXiv:2611.34617v1 [cs.SE] 25 Nov 2026
Evaluating More with Less: Black-Box Test Selection for AI Agents
CCS: Software and its engineering Software testing and debugging
Ali Asgari Affiliation: Delft University of Technology, Delft, The Netherlands email: a.asgari-2@tudelft.nl , Mitchell Olsthoorn Affiliation: Delft University of Technology, Delft, The Netherlands email: M.J.G.Olsthoorn@tudelft.nl; , Arie van Deursen Affiliation: Delft University of Technology, Delft, The Netherlands email: arie.vandeursen@tudelft.nl and Annibale Panichella Affiliation: Delft University of Technology, Delft, The Netherlands email: a.panichella@tudelft.nl
Abstract.
Agentic software systems are increasingly used in development workflows, where changes to the model, prompt, scaffold, tools, or execution environment require repeated testing. Selecting a subset of tests can reduce testing costs while providing quick estimates of agent performance or exposing failures early to support failure analysis. Although test case selection (TCS) has been studied for deep neural networks and LLM code models, prior work does not directly address agentic systems and often requires model information that is unavailable for proprietary agents.
This paper presents the first empirical study of black-box TCS for agentic software systems. We treat each benchmark task as a test case and adapt black-box regression-testing techniques by redefining their selection criteria over task descriptions, metadata, code fragments, and embedding representations. We also propose new strategies that estimate task difficulty using heuristic features or independent LLM-as-judge assessments. Our proposed and adapted strategies select tasks without executing the target agent or using past results.
We evaluate fourteen selection strategies, including random sampling, and an additional historical-data baseline on ten AI agent benchmarks, including SWE-bench Verified, with 12 to 101 agents per benchmark. We assess Success Rate estimation and early failure detection. No single strategy dominates both objectives. Adapted black-box regression-testing strategies are most effective for Success Rate estimation, with Category Partition obtaining the lowest median error on five of the ten benchmarks at the 20% task budget. LLM-as-judge selection is more effective for early failure detection. For GPT 5.2 Codex on SWE-bench Verified, Category Partition executes 100 instead of 500 tasks and reduces execution cost from $225 to $47, with an absolute error in Success Rate estimation of 0.8 percentage points. At the same task budget, LLM-as-judge selection detects nearly twice as many failures as random sampling: 53.0% of selected SWE-bench Verified tasks reveal failures, compared with 27.4% for random sampling.
Keywords: 
AI agents, test selection, black-box testing, LLM-as-a-judge
1. Introduction
AI agents increasingly write code, resolve programming issues, interact with the web, and perform a wide range of software engineering tasks. Their performance is typically evaluated using standard benchmarks that assess success in completing predefined tasks. As these agents evolve, modifications to the underlying model, prompt, orchestration, tools, or execution environment require continuous testing (Asgari et al., 2026b). However, executing a complete benchmark can be costly (Hasan et al., 2026): each task may require multiple calls to large language models (LLMs), tool interactions, and code execution. These costs increase with benchmark size. For example, SWE-bench Verified contains 500 tasks (Jimenez et al., 2024), while SWE-Bench Pro contains 607 (Scale AI, 2025). Selecting a subset of tasks could reduce these costs and provide faster feedback after changes by requiring fewer agent executions, provided that the selected tasks support accurate performance estimation or help reveal failures early.
A similar challenge has long existed in software testing. As test suites grow, executing every test after each software change becomes increasingly expensive (Yoo and Harman, 2012). Test case selection (TCS) addresses this issue by selecting a subset of tests (Rothermel et al., 2001; Elbaum et al., 2002). More recently, TCS has been studied for deep neural networks (DNNs), primarily on image-classification tasks, and for LLM code models on classification tasks such as vulnerability detection, clone detection, and technical debt prediction (Asgari et al., 2026a). These studies consider two objectives: estimating overall model performance from a sample of inputs and selecting inputs that reveal failures early.
Applying TCS to agentic systems introduces new challenges. Many existing deep neural network (DNN) and LLM test-selection techniques depend on information from the system/model under test, such as confidence scores, uncertainty estimates, activations, coverage, or internal representations (Aghababaeyan et al., 2024; Tian et al., 2018; Abbasishahkoo et al., 2025; Asgari et al., 2026a). However, such information is unavailable for closed-source models or black-box agents. Furthermore, agent evaluation typically involves generative tasks where the agent interacts with tools and environments to complete a task, rather than predicting a single class label.
In this paper, we formulate benchmark evaluation for agentic software systems as a test case selection problem. Each benchmark task is a test case, each candidate agent is a system under test, and an unsuccessful task is a failure. Following prior test-selection studies (Asgari et al., 2026a; Guerriero et al., 2024; Asgari et al., 2025), we consider two objectives: estimating an agent’s full-benchmark Success Rate from a subset of tasks and exposing failures early for failure analysis. To the best of our knowledge, this is the first empirical study of black-box TCS for agentic software systems. We adapt seven black-box regression-testing techniques by redefining their selection criteria over task descriptions, metadata, code fragments, and embedding representations. These techniques include category partitioning, boundary-value selection, textual diversity, clustering, and adaptive random selection. We also propose six novel task-difficulty strategies: two use heuristic features, and four use independent LLM-as-judge assessments. These thirteen strategies require neither execution of the target agent nor recorded outcomes from the same or other agents.
Together with random sampling, they form the fourteen primary strategies evaluated in our study. We also include Historical Mid-Range, a baseline adapted from prior work on predicting agent leaderboard rankings (Ndzomga, 2026). Unlike our strategies, this baseline uses recorded outcomes from other agents, excluding the target agent’s outcomes. The study covers ten public AI agent benchmarks encompassing repository-level software engineering (Jimenez et al., 2024; Yang et al., 2025; Scale AI, 2025), competitive programming (Shi et al., 2024), terminal use (The Terminal-Bench Team, 2025), tool-using dialogue (Yao et al., 2024), computational reproducibility (Siegel et al., 2024), general assistant tasks (Mialon et al., 2023), and web browsing (Xue et al., 2025). For each strategy, we assess how accurately the selected set of tasks estimates each agent’s full-benchmark Success Rate and how many failures it reveals at task budgets of 10%, 20%, and 50%.
The results show that the two objectives benefit from different selection strategies. For Success Rate estimation, adapted black-box regression-testing strategies yield the strongest results, with Category Partition achieving the lowest median estimation error on five of the ten benchmarks. For early failure detection, LLM-as-judge difficulty-based selection proves more effective, prioritizing failing tasks earlier in the selected subset across the evaluated benchmarks.
Our results also suggest that evaluation costs can be reduced in practice. For DeepSeek V3.2 on SWE-bench Multilingual, Category Partition evaluates 60 of 296 tasks, reducing execution cost by approximately 82%, from $114 to $20, with an absolute error in Success Rate estimation of 0.8 percentage points. On SWE-Bench Pro, when testing GPT-5 within SWE-agent with a 250-turn limit, LLM-as-judge selection detects approximately 42% more failures than random sampling at the same 20% task budget: 91.7% of selected tasks reveal failures, compared with 64.5% for random sampling. These examples illustrate how task selection can reduce the cost of performance estimation and detect more failures within the same task budget.
This paper offers the following contributions:
	•	• We formulate limited-budget evaluation of agentic software systems as a test case selection problem and, to the best of our knowledge, present the first empirical study of black-box TCS for agentic systems and generative agent tasks. 
	•	• We adapt seven strategies from black-box regression testing and propose six task-difficulty strategies that select tasks without executing the target agent. We evaluate these strategies against random sampling and a historical-performance baseline. 
	•	• We conduct an empirical study across ten public agent benchmarks, evaluating the strategies for Success Rate estimation and early failure detection at three task budgets using 12 to 101 agents per benchmark. 
	•	• All code and results are released to support replication. 
2. Background and Related Work
Regression testing aims to reduce the cost of executing large test suites after software changes (Yoo and Harman, 2012). Many regression testing techniques rely on white-box information, such as statement or branch coverage collected from previous executions. Black-box techniques, instead, use only information available from the test inputs and are therefore more practical when source code, instrumentation, or prior coverage data is unavailable. Henard et al. (Henard et al., 2016) showed that black-box techniques based on input characteristics and diversity can be competitive with coverage-based techniques. Related black-box testing methods include category partitioning (Ostrand and Balcer, 1988), where tests are derived from observable partitions of the input space, and Adaptive Random Testing (ART) (Chen et al., 2010), where each new test is selected to be far from the tests already selected according to a distance metric over the input domain. ART is motivated by the observation that failures often cluster in the input space, so diverse inputs can exercise different behaviors earlier.
Black-box regression testing has also used textual information to compare and select tests (Feldt et al., 2016). In information-retrieval-based regression testing, program changes are treated as queries and tests as documents to retrieve; models such as TF-IDF, LSI, and LDA are then used to rank tests by their textual similarity to changes (Peng et al., 2020) or to other tests in the suite (Aman et al., 2018). More broadly, machine-learning-based regression testing has used test-case text to construct representations for unsupervised methods, including clustering and topic modeling (Pan et al., 2022).
Our setting differs from conventional regression testing because our test inputs are benchmark tasks rather than conventional executable test cases, such as JUnit tests. Each test is an agent task: a prompt together with the context, files, repository state, tools, and success criterion provided by the benchmark. Executing a test means invoking the agent on that task and observing whether it reaches the expected outcome. Thus, there is no executable test body comparable to a JUnit method; the executable procedure is the agent run, and the assertion is provided by the benchmark oracle or success criterion. We therefore re-interpret black-box regression testing criteria using task-side information, including task descriptions, benchmark metadata, code snippets, test names, and embedding representations.
Test selection for deep models. Test case selection has been studied for deep models to reduce labeling and execution costs while supporting performance estimation and early failure detection (Ma et al., 2020). Selection criteria include uncertainty, surprise adequacy, coverage, sampling, and diversity (Ma et al., 2020; Kim et al., 2019; Guerriero et al., 2024). Their effectiveness depends on the objective: uncertainty-based criteria often favor failure discovery, whereas representative samples better support performance estimation. Many techniques require model-side information, such as probabilities, logits, or hidden-layer activations, which may be unavailable for proprietary agents or difficult to define consistently across systems combining LLMs, tools, memory, and execution environments.
Recent work has extended test case selection to LLMs. Clotho (Yoon et al., 2026) identifies inputs likely to reveal failures using LLM hidden states and a labeled reference set, before output generation. Asgari et al. (Asgari et al., 2026a) re-examined DNN selection techniques on LLMs performing code-related classification tasks, such as clone detection, vulnerability detection, and technical-debt prediction. Several criteria in these studies rely on model-side information, such as predictive probabilities or hidden-layer representations. Our setting differs: we study agentic systems that solve generative, interactive, and often multi-step benchmark tasks. We focus on task-related criteria computed before executing the target agent, including task features, textual and embedding representations, and independent task-difficulty judgments, without requiring recorded agent outcomes.
Predicting agent leaderboard rankings. Ndzomga studies reduced benchmark suites for predicting agent leaderboard rankings (Ndzomga, 2026). The approach uses historical per-task pass rates from previously evaluated agents to identify tasks of intermediate difficulty, motivated by item response theory. Tasks that are solved by almost all agents or by almost none of them carry little information for ranking, whereas mid-difficulty tasks are expected to better discriminate among agents. The resulting reduced suite is evaluated by how well it preserves the ranking of agents that would be obtained from the complete benchmark. Instead of finding a subset of tasks that can predict the overall ranking of agents, we search for a subset that facilitates predicting agent performance with a limited budget. The selected prefix is assessed by how accurately it estimates the target agent’s full-suite Success Rate and how many of its failures it exposes early. We adapt the historical mid-range idea as a baseline by computing each task’s pass rate over all agents in the benchmark except the target agent, then prioritizing tasks whose pass rate is closest to 0.5. This leave-one-agent-out version keeps the original principle of selecting discriminative mid-difficulty tasks while avoiding the target agent’s own outcomes when constructing the ordering.
3. Test Case Selection for AI Agents
Following prior work on test selection for LLMs for code (Asgari et al., 2026a), we treat each benchmark task as a test case: an input on which the agent is executed and its success or failure is assessed. Tasks may include issue reports, programming problems, terminal instructions, web tasks, or tool-use scenarios. Given a benchmark with tasks
T
=
{
t
1
,
…
,
t
n
}
T=\{t_{1},\ldots,t_{n}\}
and a budget of
k
k
tasks, each strategy selects a subset
S
⊆
T
S\subseteq T
with
|
S
|
=
k
|S|=k
. Selection follows the strategy’s criterion until the budget is reached. For strategies that select tasks sequentially, the selected set contains the first
k
k
tasks chosen. These sets support two objectives: estimating the agent’s full-benchmark Success Rate and exposing failures early.
3.1. Test Selection Techniques
We describe seven strategies adapted from black-box regression testing and six novel strategies that estimate task difficulty before executing the agent, together with random sampling as a baseline. Historical Mid-Range, an additional baseline requiring outcomes from other agents, is described in Section 4.2. Unless stated otherwise, ties are resolved by the original benchmark order: if tasks
t
i
t_{i}
and
t
j
t_{j}
receive the same score and
i
<
j
i<j
, then
t
i
t_{i}
is selected first.
3.1.1. Random sampling.
Random is our feature-agnostic baseline (Asgari et al., 2025; Henard et al., 2016). For a budget of
k
k
tasks, it samples
k
k
tasks uniformly without replacement. This baseline tests whether task information, such as text, metadata, embeddings, or difficulty estimates, improves over chance. It is especially strong for Success Rate estimation because random samples are unbiased estimators of the full-benchmark Success Rate, but it does not target difficult or failure-prone tasks and is therefore less suited to early failure detection.
3.1.2. Adapted Black-box Regression Techniques.
The second family adapts black-box regression-testing ideas to agent benchmarks. In traditional black-box testing, selection uses observable properties of the test inputs rather than coverage or internal information from the system under test. We apply the same principle to agent tasks: the input is the benchmark task given to the agent, including its natural-language description, code snippets, metadata, test names, repository or task category, and other contextual fields. The following strategies reinterpret black-box selection criteria over these task-side properties.
Task length is a single-feature baseline. It computes the number of characters in the task text available before execution, including the instruction, problem statement, hints, contextual fields, and any code snippets that appear in them. The strategy selects longer tasks first, using length as a proxy for task complexity: longer tasks may contain more requirements, constraints, code fragments, or environmental details, and may require more context management, exploration, or tool use from the agent.
Table 1. Selection criteria used by the evaluated strategies and baselines
Family
Strategy
Selection criterion
Baselines
Random
randomness only

Historical Mid-Range (Ndzomga, 2026)
distance of other agents’ success rate from 50%
Adapted Black-Box Regression
Task length
task-text length

Boundary Value
distance from median over task-input features

Category Partition
task categories, textual markers, length quartile

TF-IDF Diversity (Original)
TF-IDF diversity over the original task text

TF-IDF Diversity (Code)
TF-IDF diversity over task text plus extracted code

Adaptive Random
CodeT5+ embeddings, UMAP-10, farthest-from-selected rule

Round Robin
CodeT5+
k
k
-means clusters, prose entropy, traceback
Task-Side Difficulty Estimation
Difficulty Score
hand-designed difficulty score from task text and metadata

Difficulty Score with Diversity
difficulty score plus cluster-based diversity

LLM-as-Judge
one overall 1–4 difficulty judgment

LLM-as-Judge with Diversity
one overall judgment plus cluster-based diversity

Factor-Based LLM-as-Judge
several judged difficulty factors,
z
z
-scored and summed

Factor-Based LLM-as-Judge with Diversity
factor-based judgment plus cluster-based diversity
Boundary Value adapts boundary-value testing to agent tasks. Traditional boundary-value testing selects inputs near the edges of an input domain because such inputs are often more likely to expose faults. Since agent benchmarks do not provide explicit numeric input domains, we define boundaries over task-input features available before execution, such as task length, number and length of code spans, number of lines, token counts, prose entropy, and the presence of tracebacks or exception names. For each feature
f
j
f_{j}
, we compute the median
f
j
~
\widetilde{f_{j}}
over the benchmark and assign each task a normalized distance from it:
d
j

(
t
i
)
=
|
f
j

(
t
i
)
−
f
j
~
|
/
(
MAD
⁡
(
f
j
)
+
ϵ
)
d_{j}(t_{i})=|f_{j}(t_{i})-\widetilde{f_{j}}|/(\mathrm{MAD}(f_{j})+\epsilon)
, where
MAD
\mathrm{MAD}
is the median absolute deviation. The boundary score is
Boundary
⁡
(
t
i
)
=
max
j
⁡
d
j

(
t
i
)
\mathrm{Boundary}(t_{i})=\max_{j}d_{j}(t_{i})
. Tasks are selected in decreasing score, so tasks that are unusually short, long, code-heavy, sparse, or otherwise extreme in at least one observable feature are selected earlier. The method does not use oracle information or agent outcomes.
Category Partition adapts the category-partition method (Ostrand and Balcer, 1988). The original method partitions the input domain using categories and choices derived from the specification. We apply the same principle to benchmark tasks by building categories from task information available before execution. When available, we use benchmark variables such as task type, domain, repository, language, or difficulty label; we also derive simple textual variables, such as whether the task contains a traceback, mentions an exception or warning, and its length quartile. For example, in SWE-bench-style repair tasks the repository can define a category variable, while in other benchmarks the task type or domain can play the same role. Each non-empty combination of variables defines a task category. The method sorts tasks within each category by decreasing length and then cycles over categories, selecting one task from each at a time. Early selected sets therefore cover different task types, domains, textual patterns, and length ranges.
TF-IDF Diversity (Original and Code) adapts diversity-based black-box regression testing to agent tasks (Feldt et al., 2016; Peng et al., 2020). We evaluate two variants that differ only in how they construct the task document. TF-IDF Diversity (Original) uses the original task text, including the instruction, problem statement, hints, context fields, and any existing code. TF-IDF Diversity (Code) uses the same document but additionally appends extracted code blocks and inline code spans, increasing the contribution of code-related tokens to the representation without introducing new information. Both variants use the same representation and selection procedure. We lowercase documents, tokenize them into word unigrams and bigrams, filter out English stop words, and represent them as TF-IDF vectors with sublinear term-frequency scaling. We do not apply stemming or lemmatization because identifiers, library names, and error names may carry useful information. Diversity between tasks
t
i
t_{i}
and
t
j
t_{j}
is computed using cosine distance,
d
⁡
(
t
i
,
t
j
)
=
1
−
𝐱
i
⋅
𝐱
j
‖
𝐱
i
‖

‖
𝐱
j
‖
d(t_{i},t_{j})=1-\frac{\mathbf{x}_{i}\cdot\mathbf{x}_{j}}{\|\mathbf{x}_{i}\|\,\|\mathbf{x}_{j}\|}
, where
𝐱
i
\mathbf{x}_{i}
and
𝐱
j
\mathbf{x}_{j}
are their TF-IDF vectors. Selection starts with one uniformly random task; each subsequent task maximizes its minimum distance to previously selected tasks. Neither variant uses agent outcomes or benchmark oracle information.
Adaptive Random adapts adaptive random testing (Chen et al., 2010) to a task-embedding space. In ART, each new test is chosen to be far from the tests already selected. Here, task descriptions are embedded with CodeT5+ (Salesforce/codet5p-110m-embedding) (Wang et al., 2023), reduced to 10 dimensions with UMAP using cosine distance, and normalized before selection. The method then applies the same farthest-from-selected rule as TF-IDF Diversity, but computes distances between task embeddings rather than TF-IDF vectors. Thus, early selected tasks cover different regions of the learned task representation.
Round Robin adapts clustering-based test selection and prioritization (Pan et al., 2022). The method clusters the same task embeddings used by Adaptive Random with
k
k
-means and then cycles over the non-empty clusters, selecting one task from each cluster before returning to the same cluster. Within each cluster, tasks are ordered by the sum of two standardized task-input features: prose-token entropy and the presence of a traceback. For a benchmark with
n
n
tasks, we set
k
=
max
⁡
(
4
,
round
⁡
(
0.06

n
)
)
k=\max(4,\mathrm{round}(0.06n))
. This makes the number of clusters grow with benchmark size while retaining at least four clusters on small benchmarks (Aloise et al., 2017). The value of
k
k
is fixed before observing any agent outcome and is used only to obtain a coarse partition of the task space.
3.1.3. Task-Side Difficulty Estimation
The third family estimates task difficulty before executing the target agent. The rationale is that, under a limited testing budget, harder tasks may be more useful for exposing failures early. These strategies do not run the target agent and do not use agent outcomes. They use only task-side information available before execution, such as task descriptions, code fragments, metadata, or independent LLM-as-judge assessments. Each strategy constructs a benchmark-level task ordering, and the selected set at budget
k
k
is the first
k
k
tasks in that ordering. The same selected sets can therefore be reused for every agent evaluated on the ben
