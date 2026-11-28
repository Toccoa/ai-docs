# 原文存档｜Agent Evaluation Without Ground Truth: A Null Proportion Perspective

> 来源：arXiv:2611.31539v1（cs.AI）　｜　日期：2026-11-23
> 原文链接：https://arxiv.org/abs/2611.31539
> 说明：本文件为原文存档（arXiv HTML 清洗后的纯文本，止于 References 之前），供与中文译文对照。

---

Agent Evaluation Without Ground Truth: A Null Proportion Perspective

Brian M. Cho (Cornell Tech), Michael Lindon (Netflix), Nathan Kallus (Cornell Tech / Netflix)

## Abstract

The correctness of actions taken by agents is typically evaluated against known, externally verified ground truth labels, such as whether a proof is correct or whether code compiles and passes unit tests. However, as coding and science agents are entrusted with more end-to-end autonomy – proposing interventions, running experiments, and deciding what to deploy and investigate next – whether an agent's actions genuinely improve an outcome must be inferred from noisy, often inconclusive experiments. To evaluate agents in this setting, we define agent quality as a weighted sum of correct decisions along its trajectory, using sequences of e-values as statistical evidence regarding correctness in place of ground-truth labels. Our framework accommodates arbitrarily dependent decisions, data-dependent trajectory termination, dynamically generated hypotheses, and quality measures defined after the trajectory concludes. We construct upper and lower bound estimators and confidence sets for agent quality with statistical guarantees that hold uniformly over agent trajectory distributions and establish instance-wise sharpness of our estimator class. We demonstrate our methods with a case study comparing the success of Claude Opus and Claude Haiku in improving the runtime of an open-source Python package.

## 1 Introduction

In recent years, agentic AI has proliferated across real-world systems. Coding agents routinely propose changes to production software and infrastructure that are then deployed to its user population (Alshahwan et al. 2024, Novikov et al. 2025). Multi-agent systems are used to generate scientific hypotheses (Gottweis et al. 2026, Xie et al. 2026), which are then tested in real-world experiments. As agents are given authority to make autonomous decisions, a fundamental task is reliable evaluation for the quality of an agent's decisions.

While benchmarks remains the de-facto choice for measuring agent quality, these methods fall short when assessing the decision made by an agent during deployment. Consider an autonomous coding agent that updates the user interface, with the goal of increasing average user engagement. A change that increases user engagement from the baseline is considered correct. In traditional software-based benchmarks, such as SWE-Bench (Jimenez et al. 2024), each decision can be labeled as correct or incorrect with unit tests or reference answers. For our coding agent, however, whether its changes actually improved average user engagement is unknown: it corresponds to a statement about the unknown distribution of the system. While data may be collected to test this claim, the expected increase in user engagement over the entire user population is never directly observed. Our work focuses this setting, where correctness is never observed, and only noisy measurements are available to serve as evidence for and against the correctness of an agent's decision.

To deal with unknown decision quality, popular approaches are the use of estimated correctness labels, from either statistical methods or another agent. Popular heuristics include the LLM-as-judge framework, where a separate model is used a judge for the agent's decisions (Zheng et al. 2023). Alternative frameworks use a small set of decisions with labeled correctness to construct estimated labels (Wang et al. 2020, Angelopoulos et al. 2023). In our setting, however, neither approach provides reliable evaluation with statistical guarantees. Imputed labels by LLMs are prone to substantial bias and invalid confidence intervals, even with relatively high accuracy for estimated labels (Egami et al. 2023). While statistical frameworks such as prediction-powered inference construct unbiased correctness estimates (Boyeau et al. 2025), these methods require that at least a small set of true labels are observed, failing to capture our setting with no observed labels.

In this work, we cast the problem of agentic evaluation as a multiple hypothesis testing problem, where each decision is associated with the hypotheses regarding the correctness of that decision. For example, in a software deployment setting, each decision is associated with a pair of hypotheses claiming that the change increased or decreased user engagement, with a correct change being defined as one that increases expected engagement. Agent quality is defined as a weighted sum of correct decisions, such as the proportion of the agent's changes that improved engagement. Our framework corresponds to evaluating an agent's decisions as a weighted sum of null hypothesis counts, building upon null proportion estimation (Storey 2002, Meinshausen and Rice 2006, Efron 2008).

Distinct from existing works, we develop methods tailored to three key features of agent applications in practice. First, agents act adaptively: each decision is chosen in response of the outcomes of earlier ones and the system shifts in response. Consequently, decisions and the evidence on their quality may be arbitrarily dependent. Second, agent applications are often monitored continuously, and may be terminated at any data-dependent time. For example, when data collected about the agent indicates harmful behavior, it is typically terminated in response. Third, quality may be defined only after the trajectory concludes; the proportion of improving changes, for example, depends on whether the agent chose to adopt a change and how many total changes were proposed. Classical null estimation settings assume a fixed collection of hypotheses with p-values available at a fixed time. In agent applications, however, the number of changes may be random, and classical p-values are often invalid under data-driven stopping.

Our primitive for evidence is the e-value (Vovk and Wang 2021, Grünwald et al. 2024, Ramdas et al. 2023a). For each decision we use two sequences of e-values that test the correctness of the agent's decision during deployment. Unlike p-values, e-values remain valid under optional stopping and can be combined under arbitrary dependence, enabling the flexibility required for agentic evaluation. They are also readily available: anytime-valid tests based on e-values are already used to gate software releases and to monitor experiments in industrial applications (Lindon et al. 2022, Johari et al. 2022).

Our contributions are as follows.

1. Framework. We formalize agent quality as a data-dependent weighted sum of unobserved correctness indicators along an adaptively generated trajectory. Our model allows for the number of decisions, trajectory horizons, and definition of agent quality to be random and data-dependent.

2. Estimation. We construct e-value-based upper and lower bound estimators that are uniformly valid over deployment trajectories. Our estimator class contains estimators that are nearly sharp estimators for any instance. In a simplified setting, we show our method dominates Storey's estimator (Storey 2002).

3. Inference. We construct the confidence set for agent quality that provide uniform coverage over trajectory deployments. We relate our class with e-value merging and discuss the effect of random hypotheses on confidence set construction.

4. Real World Studies. To test our class of estimators and confidence sets, we construct estimators and confidence intervals with predictable tuning heuristics based on trajectory simulation. We demonstrate the practical application of our methods with case studies comparing agent performance for code improvement on the open-source NetworkX Python package (Hagberg et al. 2008).

Section 2 formalizes agentic evaluation and the identification problem. Section 3 and Section 4 develops the estimators and the confidence intervals respectively. Section 5 presents our real-world case study. Further discussion on related works, proofs, tuning procedures, and experiment settings are provided in the supplement.

## 2 Setup and Estimand

The agent collects information from a system sequentially over discrete time $t \in \mathbb{N}$. It can make decisions at any point based on information observed so far. The trajectory concludes at potentially data-driven time $N$, with $M$ decisions made by the end of the trajectory.

We seek to evaluate the quality of the agent's sequence of decisions along this trajectory. As the agent makes decisions, it induces a random sequence of binary correctness labels $(\theta_1,\dots,\theta_M)$, where $\theta_i = 1$ denotes that the decision was correct. We define agent quality $\theta_*$ as a weighted sum of the correctness of decisions over its trajectory,

$$\theta_* = \sum_{i=1}^{M} c_i \theta_i,$$

where $c_i$ corresponds to data-driven weights that may depend on our entire observed trajectory. Simple choices of $c_i$, such as $c_i = 1$ or $c_i = 1/M$, define $\theta_*$ as the number or proportion of correct changes respectively. We provide a real-world example of $\theta_*$ below.

Example 1 (Coding agent with live experiments). Consider a coding agent that pushes software changes to a real-world system. Let $P_i$ denote distributions over outcome metrics $(X_{\text{goal} }, X_{\text{guard} })$, such as user engagement and system crashes, after the agent's $i$-th proposed code change. Let $c_i = 1$ if the agent chooses to adopt change $i$ (such as based on an experiment yielding samples from $P_i$), and $c_i = 0$ if the change is reverted, with $j_i = \sup\{j \in \mathbb{N}_0 : j < i, c_j = 1\}$. Define correctness as whether the change improves the average goal metric by at least 10% without deteriorating the guard metric:

$$\theta_i = \mathbf{1}\left\{\mathbb{E}_{P_i}[X_{\text{goal} }]/\mathbb{E}_{P_{j_i} }[X_{\text{goal} }] \ge 1.1 \wedge \mathbb{E}_{P_i}[X_{\text{guard} }] \le \mathbb{E}_{P_{j_i} }[X_{\text{guard} }]\right\}.$$

Then, $\theta_*$ denotes the number of safe improvements generated by the agent. Dividing $c_i$ by the number of adopted changes would instead target a fraction of adopted changes that are safe improvements.

A similar example is the science agent that can make hypotheses, explore them via data collection, and declare discoveries. Both the hypotheses and how the agent investigates them can evolve fully dynamically over the trajectory. Then, $\theta_*$ can evaluate the number or fraction of true hypotheses or true discoveries.

### 2.1 Data Generating Process

As the defining feature of real-world evaluation, the correctness labels $(\theta_1,\dots,\theta_M)$ and target $\theta_*$ are unobserved. To assess the correctness of each decision, we consider the setting where for each $i \in [M]$, we observe a random sequence of nonnegative outputs $\mathbf{e}_i = (e_{i,t}, \bar{e}_{i,t})_{t \in \mathbb{N} }$, with binary observation indicators $\mathbf{R}_i = (R_{i,t})_{t \in \mathbb{N} }$. The term $R_{i,t} = 1$ indicates that a pair of nonnegative random variables $(e_{i,t}, \bar{e}_{i,t})$ for change $i$ is observed at time $t$. For any $(i,t)$ with $i > M$, $t > N$, or $R_{i,t} = 0$, we define $(e_{i,t}, \bar{e}_{i,t}) = (1,1)$, and set $R_{i,t} = 0$ whenever $i > M$ or $t > N$. We define the filtration over observed information as

$$\mathcal{F}_t = \sigma\left(\left\{R_{i,j}e_{i,j}, R_{i,j}\bar{e}_{i,j}\right\}_{(i,j) \in \mathbb{N} \times [t]}, \left\{R_{i,j}\right\}_{(i,j) \in \mathbb{N} \times [t+1]}, \left\{\mathbf{1}[j \le N]\right\}_{j \in [t+1]}\right),$$

where $\mathcal{F}_t$ denotes sigma-field induced by the e-variables observed by time $t$, with observation indices $R_{i,j}$ and continuation indicators $\mathbf{1}[j \le N]$ observed by time $t+1$. Our filtration encodes the information before e-values at time $t+1$ are generated, but observability and continuation at time $t+1$ are known. By definition of $\mathcal{F}_t$, the trajectory length $N$ is a potentially random stopping time adapted to $(\mathcal{F}_t)_{t \in \mathbb{N} }$, and the number of decisions, $M = \max\{i : \exists t \le N \text{ such that } R_{i,t} = 1\}$, is also allowed to be random. We let

$$\mathcal{F}_N = \{A \in \mathcal{F}_\infty : A \cap \{N = t\} \in \mathcal{F}_t \ \forall t \ge 0\}$$

denote the sigma-field corresponding to the final observed outputs, where $\mathcal{F}_\infty = \sigma(\cup_{t=1}^{\infty} \mathcal{F}_t)$. Write

$$F_N = \left(M, N, (\mathbf{e}_i, \mathbf{R}_i)_{i=1}^{M}\right)$$

for the observed trajectory and let $\mathcal{F}_N = \sigma(F_N)$. Our data-driven weights are formally defined as $c_i = c_i(F_N)$, with $c_i = 0$ whenever $i > M$.

Let $\mathcal{Q}$ be the class of all joint distributions $Q$ of the trajectory and correctness label variables $(F_N, (\theta_i)_{i=1}^{M})$ that satisfy the following four assumptions:

Assumption 1 (Finite Expected Number of Changes). The number of changes/decisions $M$ satisfies $\mathbb{E}_Q[M] < \infty$ and $M \ge 1$ $Q$-almost surely.

Assumption 2 (Finite Trajectory Length). $N$ is finite $Q$-almost-surely.

Assumption 3 (e-value Constraints). The pair $(e_{i,t}, \bar{e}_{i,t})$ are nonnegative $Q$-almost-surely. Furthermore, the expectation of the cumulative sum over $(1 + e_{i,t} + \bar{e}_{i,t})$ is finite, i.e.,

$$\mathbb{E}_Q\left[\sum_{i=1}^{M}\sum_{t=1}^{N} R_{i,t}(1 + e_{i,t} + \bar{e}_{i,t})\right] < \infty,$$

and their conditional expectation satisfies the $\mathcal{F}_{t-1}$-conditional e-value constraint

$$\mathbb{E}_Q\left[\theta_i R_{i,t}(e_{i,t} - 1) \mid \mathcal{F}_{t-1}\right] \le 0, \qquad \mathbb{E}_Q\left[(1 - \theta_i) R_{i,t}(\bar{e}_{i,t} - 1) \mid \mathcal{F}_{t-1}\right] \le 0.$$

Assumption 4 (Nonnegative Weights with Finite Expectation). Target weights $c_i$ satisfy $c_i \ge 0$ for $i \in [M]$ $Q$-almost-surely, and $\mathbb{E}_Q\left[\sum_{i=1}^{M} c_i\right] < \infty$.

For $Q \in \mathcal{Q}$, we let $\tilde{Q}$ denote its marginalized distribution of just the observed trajectory $F_N$, and let $\tilde{\mathcal{Q} } = \{\tilde{Q} : Q \in \mathcal{Q}\}$ denote the set of all such marginalized distributions.

The second condition of Assumption 3 states that $(e_{i,t}, \bar{e}_{i,t})$ are $\mathcal{F}_{t-1}$-conditional e-values for the hypotheses $\theta_i = 1$ and $\theta_i = 0$ respectively (Vovk and Wang 2021). The expectation contains $\theta_i$, as $\theta_i$ is a random label generated by the agent's actions.

Example 2 (e-values for a binary goal metric). Consider Example 1 with $X_{\text{goal} } \in \{0,1\}$ and $\theta_i = \mathbf{1}\left\{\mathbb{E}_{P_i}[X_{\text{goal} }] \ge \mathbb{E}_{P_{j_i} }[X_{\text{goal} }]\right\}$. Fix $0 < b < a < 1$ and let $r = (a+b)/2$. At each evaluation time $t$ for decision $i$, observe one new draw $X_{\text{goal},t}$ from $P_i$ and one $X'_{\text{goal},t}$ from $P_{j_i}$, independently conditional on the past. Let our e-values be the likelihood ratios

$$e_{i,t} = \frac{\ell_t(b,a)}{\ell_t(r,r)}, \quad \bar{e}_{i,t} = \frac{\ell_t(a,b)}{\ell_t(r,r)}, \quad \text{where} \quad \ell_t(u,v) = u^{X_{\text{goal},t} }(1-u)^{1-X_{\text{goal},t} } v^{X'_{\text{goal},t} }(1-v)^{1-X'_{\text{goal},t} }.$$

The first has conditional expectation at most one when $\theta_i = 1$, and the second when $\theta_i = 0$. Thus, large $e_{i,t}$ provides evidence against correctness, while large $\bar{e}_{i,t}$ provides evidence in its favor. Products of these likelihood ratios accumulate evidence over successive evaluations.

### 2.2 Estimation and Inference on Agent Quality

We construct classes of upper and lower bound estimators that bound $\theta_*$ in expectation uniformly over all distributions $Q \in \mathcal{Q}$. Our choice to construct estimators that bound $\theta_*$ in expectation is motivated by the fact that two distributions $Q$ and $Q'$ with equivalent marginalized distribution $\tilde{Q}$ can yield different expected values of $\theta_*$. Specifically, our work aims to characterize the class of upper and lower bound estimators that provide uniform guarantees over all data generating processes $Q \in \mathcal{Q}$.

Definition 1 (Uniformly Valid Bound Estimator). Let $\widehat{\Theta}_N$ denote the set of $\mathcal{F}_N$-measurable, real-valued functions with finite expectation for all $Q \in \mathcal{Q}$. The function $\hat{\theta}_U \in \widehat{\Theta}_N$ is uniformly valid upper bound estimator if

$$\inf_{Q \in \mathcal{Q} } \mathbb{E}_Q\left[\hat{\theta}_U - \theta_*\right] \ge 0.$$

Uniformly valid lower bound estimators are defined analogously, with the inequalities reversed. We also construct uniform confidence sets over $Q \in \mathcal{Q}$.

Definition 2 (Uniformly Valid Confidence Set). Let $\mathcal{C}_N$ denote the set of mappings from a fixed coverage error parameter $\alpha \in (0,1)$ and $F_N$ to a set on the real line. The mapping $C(\alpha, F_N)$ is a uniform $(1-\alpha)$ confidence set for $\theta_*$ if

$$\sup_{Q \in \mathcal{Q} } P_Q\left(\theta_* \not\in C(\alpha, F_N)\right) \le \alpha.$$

Uniform validity states that our estimators and confidence intervals provide valid guarantees in expectation and in probability across all $Q \in \mathcal{Q}$, enabling statistically rigorous evaluation of agentic quality for any sequence of agent decisions.

## 3 Estimation Bounds on Agent Quality

We begin with our class of estimators for upper bounds on $\theta_*$, which combines the observed e-value pairs with predictable weights to construct upper bound estimates. We discuss analogous results for our lower bound estimator class in Appendix Lower Bound Estimation.

To construct our upper bound estimator, we start with hypothesis-specific terms that have expectation upper bounding the correctness parameter $\theta_i$. For $i \in [M]$

$$A_i = \sum_{t=1}^{N} w_{i,t} R_{i,t}(e_{i,t} - 1), \qquad \bar{A}_i = \sum_{t=1}^{N} \bar{w}_{i,t} R_{i,t}(\bar{e}_{i,t} - 1),$$

where $w_{i,t}$ and $\bar{w}_{i,t}$ denote nonnegative $\mathcal{F}_{t-1}$-measurable weights. Conditional on $\theta_i = 1$, the term $A_i$ has non-positive expectation along the evaluation trajectory. Thus, positive expected values of $A_i$ can only occur when $\theta_i = 0$, and large values of $A_i$ yield evidence that $\theta_i = 0$. Likewise, larger values of $\bar{A}_i$ yields evidence that $\theta_i = 1$. We combine evidence on the correctness label $\theta_i$ with $\mathcal{F}_N$-measurable weights $c_i$ using $\psi_i$, where

$$\psi_i = \max(c_i - A_i, -\bar{A}_i).$$

The term $\psi_i$ corresponds to an upwards biased estimate of $c_i\theta_i$. Conditional on $\theta_i = 1$, the term $c_i - A_i$ has expectation at least $\mathbb{E}_{\tilde{Q} }[c_i]$; conditional on $\theta_i = 0$, the term $-\bar{A}_i$ has nonnegative expectation. Therefore, $\psi_i$ has expectation at least $\mathbb{E}_{\tilde{Q} }[c_i\theta_i]$. Our estimator is defined as the sum of $\psi_i$ over the $M$ agent decisions,

$$\hat{\theta}_*^U = \sum_{i=1}^{M} \psi_i.$$

We define our estimator class as all estimators of the form in Equation (7), with predictable weight sequences satisfying the following conditions.

Assumption 5 (Integrable Predictable Weights). For any $Q \in \mathcal{Q}$, weights $(w_{i,t}, \bar{w}_{i,t})$ are nonnegative, $\mathcal{F}_{t-1}$-measurable, and equal zero whenever $R_{i,t} = 0$. Furthermore, the expectation of the sum of weights

$$\mathbb{E}_Q\left[\sum_{i=1}^{M}\sum_{t=1}^{N} R_{i,t}(w_{i,t} + \bar{w}_{i,t})\right]$$

is finite for all $Q \in \mathcal{Q}$.

In particular, Assumption 5 imposes integrability conditions on our weights that ensure $\mathbb{E}_Q\left[\hat{\theta}_*^U\right]$ is well-defined. For any choice of weights satisfying Assumption 5, Theorem 1 shows that our estimator satisfies uniform validity over all $Q \in \mathcal{Q}$.

Theorem 1 (Uniformly Valid Estimator). Let Assumptions 1–4 hold. Under any sequence of weights $(w_{i,t}, \bar{w}_{i,t})$ satisfying Assumption 5, $\hat{\theta}_*^U$ satisfies Definition 1.

### 3.1 Instance-wise Sharpness

Uniform validity does not ensure that a procedure is informative: for example, $\sum_{i=1}^{M} c_i$ is a uniformly valid upper bound estimators. A natural notion of performance is the sharpness of its expectation relative to $\tilde{Q}$, the distribution of observed outputs. Let $\Pi(\tilde{Q}) \subseteq \mathcal{Q}$ correspond to the set of all agent trajectory distributions $Q$ with the marginalized distribution $\tilde{Q}$ over observed outputs $F_N$. An estimator $\hat{\theta}^U$ is a $\tilde{Q}$-sharp upper bound if its expectation equals largest possible expected value of $\theta_*$ over $\Pi(\tilde{Q})$

$$\mathbb{E}_{\tilde{Q} }\left[\hat{\theta}^U\right] = U(\tilde{Q}), \qquad U(\tilde{Q}) = \sup_{Q \in \Pi(\tilde{Q})} \mathbb{E}_Q[\theta_*].$$

Below, we show that there exists a sequence of predictable weights such that our estimator $\hat{\theta}_*^U$ achieves arbitrarily close expectation equivalent to the $\tilde{Q}$-sharp upper bounds.

Theorem 2 (Sharpness over Observable Distributions). Let $U(\tilde{Q})$ be as in Equation (8). Then, for any $\tilde{Q} \in \tilde{\mathcal{Q} }$ and $\epsilon > 0$, there exists a sequence of weights $(w_{i,t}, \bar{w}_{i,t})$ satisfying Assumption 5 such that $\hat{\theta}_*^U$ satisfies

$$\mathbb{E}_{\tilde{Q} }\left[\hat{\theta}_*^U\right] \le U(\tilde{Q}) + \epsilon.$$

Theorem 2 shows that our class is arbitrarily close to the sharp bound $U(\tilde{Q})$ for any $\tilde{Q} \in \tilde{\mathcal{Q} }$. Paired with Theorem 1, our theoretical results demonstrate that uniform validity does not come at the cost of instance-wise sharpness: the arbitrarily sharp estimator defined by Theorem 2 lives in our estimator class, and therefore satisfies uniform validity.

### 3.2 Comparisons with Storey's Estimator

To compare our approach with existing methods for estimating valid upper bounds, we consider an adaptation of the classical Storey estimator (Storey 2002), which is based on p-values rather than e-values. Storey's estimator $\pi_m^{\text{Storey} }(\lambda)$ is given by

$$\pi^{\text{Storey} }(\lambda) = \left(\frac{\sum_{i=1}^{M} \mathbf{1}\left[p_i \ge \lambda\right]}{M(1-\lambda)}\right),$$

and corresponds to expected upper bound for the proportion of correct hypotheses under super-uniform p-values. The parameter $\lambda \in [0,1)$ is specified in advance. To compare our proposed estimators with existing results, we focus on the setting where $M$ is fixed, and we observe a single e-value $e_i$ for each $i \in [M]$. Consider the goal of estimating $\theta_* = \frac{1}{M}\sum_{i=1}^{M}\theta_i$. In our fixed $M$ setting, an upper bound estimator can be obtained by converting our e-values into p-values and leveraging Storey's estimator. First, by Ramdas et al. (2023b), we convert e-values $(e_1,\dots,e_M)$ into p-values with the dominating e-to-p converter $p_i = \min(1, 1/e_i)$. Then, Storey's estimator yields

$$\pi^{\text{Storey} }(\lambda) = \left(\frac{\sum_{i=1}^{M} \mathbf{1}\left[e_i \le 1/\lambda\right]}{M(1-\lambda)}\right).$$

Storey's estimator with e-to-p conversion obtains expectation larger than $\theta_*$ in our simplified setting, yielding a valid upper bound estimator. We show that for any choice of $\lambda \in (0,1)$, there exists a choice of weight for our estimator $\hat{\theta}_*^U$ which yields estimated upper bounds no larger than Storey's estimator in a pathwise sense.

Lemma 1 (Dominating Choice for Correctness Proportion). Let $\lambda \in (0,1)$ be fixed, with $M$ fixed and a single e-value $(e_i)_{i=1}^{M}$ for each $i \in [M]$. Let $\bar{w}_i = 0$ for all $i \in M$, yielding

$$\hat{\theta}_*^U = \sum_{i=1}^{M} \max\left(\frac{1}{M} - w_i(e_i - 1), 0\right).$$

Then, $w_i = \frac{\lambda}{M(1-\lambda)}$ yields that $\hat{\theta}_*^U \le \pi^{\text{Storey} }(\lambda)$ for any realization of e-values $(e_1,\dots,e_M)$.

Thus, in the e-value setting, a standard adaptation of Storey's approach always dominated by a member of our estimator class with simple, fixed weights.

Remark 1 (Leveraging Lemma 1 in Practice). To leverage the results of Lemma 1 under more general settings, one can merge sequences of $(e_{i,t}, \bar{e}_{i,t})_{t \in \mathbb{N} }$ according to the martingale merging function of Vovk and Wang (2024a) in Equation (18) to obtain a single pair of e-values $(e_i, \bar{e}_i)$. For example, with the choice of $\lambda_{i,t} = 1$, $(e_i, \bar{e}_i)$ corresponds to

$$e_i = \prod_{t \in [N] : R_{i,t} = 1} e_{i,t}, \qquad \bar{e}_i = \prod_{t \in [N] : R_{i,t} = 1} \bar{e}_{i,t},$$

the product e-variable. By setting $w_i = \lambda/(M(1-\lambda))$ and $\bar{w}_i = 0$, our final estimator is no worse than conducting e-to-p conversion and applying Storey's estimator.

## 4 Confidence Sets for Agent Quality

Our confidence sets build upon our estimation framework by leveraging terms $(A_i, \bar{A}_i)$ as measures of evidence. Let $\mathcal{A}_t = \{i : R_{i,t} = 1\}$ as the changes with evidence observed at time $t$, and denote running versions of the evidence terms as $A_{i,t}$ and $\bar{A}_{i,t}$, defined as

$$A_{i,t} = \sum_{j=1}^{t} w_{i,j} R_{i,j}(e_{i,j} - 1), \qquad \bar{A}_{i,t} = \sum_{j=1}^{t} \bar{w}_{i,j} R_{i,j}(\bar{e}_{i,j} - 1),$$

with $A_{i,0} = \bar{A}_{i,0} = 0$. For candidate label vectors $v \in \{0,1\}^{M}$, we define candidate wealth

$$K_t(\vartheta) = 1 + \sum_{i=1}^{M}\left(\vartheta_i A_{i,t} + (1 - \vartheta_i)\bar{A}_{i,t}\right).$$

When $\vartheta = (\theta_1,\dots,\theta_M)$, each increment of $K_t(v)$ has non-positive $\mathcal{F}_{t-1}$-conditional expectation by Assumption 3, so $K_t(\theta)$ starts at wealth 1 and drifts downward. Thus, large values of $K_t(v)$ are evidence against the vector $v = (\theta_1,\dots,\theta_M)$. Our confidence set $C(\alpha, F_N)$ is the projection of all label vectors $v \in \{0,1\}^{M}$ with wealth less than $1/\alpha$, i.e.

$$C(\alpha, F_N) = \left\{\sum_{i=1}^{M} c_i v_i : v \in V(\alpha, F_N)\right\}, \quad V(\alpha, F_N) = \left\{v \in \{0,1\}^{M} : K_N(v) < \frac{1}{\alpha}\right\}.$$

If $K_N(v)$ is nonnegative, it forms a valid e-value for $(\theta_1,\dots,\theta_M) = \vartheta$ by Assumption 3. Our confidence set simply corresponds to the collection of all vectors $v$ that fail to be rejected. We provide restrictions on predictable weight sequences that ensure $K_N(v)$ is a valid e-value for all $v \in \{0,1\}^{M}$ uniformly over $Q \in \mathcal{Q}$. The largest and smallest elements of $C(\alpha, F_N)$ maximize and minimize the linear objective $\sum_i c_i v_i$ over binary $v$ subject to the single linear constraint $K_N(v) < 1/\alpha$, which is a 0–1 knapsack problem. When the coefficients are equal, $c_i = c$, no solver is needed.

### 4.1 Sequential Betting with Shared Wealth

To characterize our predictable weight restrictions, we first parameterize $K_t(\vartheta)$ as

$$K_t(\vartheta) = B_t + \sum_{i=1}^{M}\left(\vartheta_i D_{i,t} + (1 - \vartheta_i)\bar{D}_{i,t}\right),$$

$$B_t = 1 + \sum_{i=1}^{M}\min\{A_{i,t}, \bar{A}_{i,t}\}, \quad D_{i,t} = (A_{i,t} - \bar{A}_{i,t})_+, \quad \bar{D}_{i,t} = (\bar{A}_{i,t} - A_{i,t})_+.$$

The value $B_t$ denotes the wealth common to every candidate vector $\vartheta \in \{0,1\}^{M}$, while $D_{i,t}$ and $\bar{D}_{i,t}$ denote the excess evidence against $\theta_i = 1$ and $\theta_i = 0$ respectively. Then, $K_t(\vartheta)$ corresponds to the common wealth pool $B_t$ plus the excess evidence on the side that $\bar{\theta}$ bets against. Our class of inference procedures restricts weights $(w_{i,t}, \bar{w}_{i,t})$ as follows.

Assumption 6 (Sequential Bets with Shared Wealth). For every $t \in \mathbb{N}$, $Q \in \mathcal{Q}$, weights $w_{i,t}$ and $\bar{w}_{i,t}$ can be represented as $w_{i,t} = \lambda_{i,t}(D_{i,t-1} + b_{i,t})$ and $\bar{w}_{i,t} = \bar{\lambda}_{i,t}(\bar{D}_{i,t-1} + b_{i,t})$, where (i) the betting fractions $\lambda_{i,t}, \bar{\lambda}_{i,t} \in [0,1]$ and the transfers $b_{i,t} \ge 0$ are $\mathcal{F}_{t-1}$-measurable, (ii) equal $b_{i,t} = 0$ and $\lambda_{i,t} = \bar{\lambda}_{i,t} = 0$ whenever $R_{i,t} = 0$, and (iii) the transfers $b_{i,t}$ satisfy the budget constraint $\sum_{i \in \mathcal{A}_t} b_{i,t} \le B_{t-1}$ $Q$-almost surely.

Assumption 6 parametrizes weights $(w_{i,t}, \bar{w}_{i,t})$ with betting fractions $(\lambda_{i,t}, \bar{\lambda}_{i,t})$ and wealth transfer parameters $b_{i,t}$. By the budget constraint $\sum_{i \in \mathcal{A}_t} b_{i,t} \le B_{t-1}$, note that $K_t(v)$ is nonnegative for all $t \in \mathbb{N}$. The transfer parameter $b_{i,t}$ denotes the amount of wealth from $B_{t}$ to $B_{t-1}$ allocated to testing $\theta_i$'s value. Larger values of $b_{i,t}$ correspond to larger possible wealth allocation, reflected in the upper bounds of $(w_{i,t}, \bar{w}_{i,t})$. Thus, larger transfers to testing $\theta_i$ correspond to larger weight upper bounds in our construction. The fractions $(\lambda_{i,t}, \bar{\lambda}_{i,t})$ are the usual betting fractions of a game martingale (Vovk and Wang 2024a), determining how much capital is invested for collecting evidence against $\theta_i = 1$ and $\theta_i = 0$ relative to its hypothesis specific budget $D_{i,t-1} + b_{i,t}$ and $\bar{D}_{i,t-1} + b_{i,t}$ respectively.

Recovering e-Value Merging. Let $(E_{i,N}, \bar{E}_{i,N})$ denote the e-values for $\theta_i = 1$ and $\theta_i = 0$, merged with the game-martingale of Vovk and Wang (2024a),

$$E_{i,N} = \prod_{j \le t : R_{i,j} = 1}(1 + \lambda_{i,j}(e_{i,j} - 1)), \qquad \bar{E}_{i,t} = \prod_{j \le t : R_{i,j} = 1}(1 + \bar{\lambda}_{i,j}(\bar{e}_{i,j} - 1)).$$

By Assumption 3, martingale merging yields valid e-values $E_{i,N}$ and $\bar{E}_{i,N}$ for $\theta_i = 1$ and $\theta_i = 0$. For a fixed, nonnegative vector $b \in \mathbb{R}^{M+1}$ with $\sum_{i=0}^{M} b_i = 1$, the weighted average merging for arbitrarily dependent hypotheses (Wang 2025) yields an e-value for $(\theta_1,\dots,\theta_M) = v$, given by

$$K_N(\vartheta) = b_0 + \sum_{i=1}^{M} b_i\left(\vartheta_i E_{i,N} + (1 - \vartheta_i)\bar{E}_{i,N}\right).$$

Setting $(\lambda_{i,j}, \bar{\lambda}_{i,j})$ as above, $b_{i,1} = b_i$ at $t = 1$ and $b_{i,t} = b_{i,1}\min(E_{i,t-1}, \bar{E}_{i,t-1})$ recovers this construction. Note that Assumption 6 enables a more general construction: $(b_{i,t})$ are allowed to pick any allocation among a common wealth pool $B_t - B_{t-1}$ satisfying budget constraints.

Restrictions under Random Hypothesis Labels. Assumption 6 requires an additional restriction relative to typical confidence sets: every $\vartheta \in \{0,1\}^{M}$ with $\vartheta_i = 1$ contains the same term $A_{i,t}$ in $K_t(\vartheta)$, and every $\vartheta$ with $\vartheta_i = 0$ contains the same term $\bar{A}_{i,t}$ due to shared weights $(w_{i,t}, \bar{w}_{i,t})$ and wealth pool $B_t$ across all $v \in \{0,1\}^{M}$. In contrast, when $\theta_i$ are fixed, each label vector $\vartheta$ can have its own, hypothesis specific weights $(w_{i,t}^{\vartheta}, \bar{w}_{i,t}^{\vartheta})$, wealth $B_t^{\vartheta}$, and transfers $b_{i,t}^{\vartheta}$. Failure of hypothesis-specific tuning parameters can be shown by selecting $Q$ with dependence between e-values and labels $\theta_i$.

Example 3 (An agent reacting to a false alarm). Let $\alpha = 1/10$, $M = 2$, $N = 1$, $c_1 = c_2 = 1$ and $\bar{e}_1 = \bar{e}_2 = 1$. First, an agent ships a correct change $\theta_1 = 1$, with $e_1 = 10$ with probability $1/10$, a false alarm, and $e_1 = 0$ otherwise. After a false alarm $(e_1 = 10)$, it ships a fix that is bad $(\theta_2 = 0)$; otherwise it ships a good change $(\theta_2 = 1)$. Change 2's own experiment yields $e_2 = 20$ when $\theta_2 = 0$, and $e_2 = 20$ with probability $1/20$ and $e_2 = 0$ otherwise. Both e-values satisfy Assumption 3. Consider separate weights for each $v$:

$$K_N(1,1) = (e_1 + e_2)/2, \quad K_N(1,0) = e_1, \quad K_N(0,1) = e_2, \quad K_N(0,0) = 1.$$

Under this trajectory distribution, separate weights fail to cover $\theta_*$ with probability $0.145 > \alpha$. Shared weights $w_{i,1} = \bar{w}_{i,1} = 1/2$ for $i \in [M]$ fail to cover $\theta_*$ with probability $0.045 < \alpha$.

### 4.2 Uniform Coverage over Agent Trajectories

Under our regularity conditions in Section 2 and the sequential betting restrictions of Assumption 6, we obtain our uniform coverage guarantee in Theorem 3.

Theorem 3 (Uniform Confidence Sets). Let $\alpha \in (0,1)$ be fixed, and assume Assumptions 1–4 hold. Under any weight sequences $(w_{i,t}, \bar{w}_{i,t})$ satisfying Assumption 6, the confidence set $C(\alpha, F_N)$ in Equation (15) is a uniformly valid $(1-\alpha)$ confidence set (Definition 2).

## 5 Case Study: Comparing Coding Agents

For our real-world case study, we compare the performance of two large language models for generating code speed-ups on the NetworkX Python library (Hagberg et al. 2008).

Setup. We evaluate Claude Opus 5 and Claude Haiku 4.5 run at high effort and asked to propose up to 50 localized runtime optimizations to the NetworkX package. Each agent was run separately. Changes were proposed sequentially on the code tree left by the agent's previously accepted changes. Along each agent's trajectory, change $i$ was correct if the geometric-mean runtime decreases by at least $p\%$ from the last change. We set $c_i = 1/M$.

Random Stopping and e-Values. For each agent, its $i$-th change records the contrasts $(Y_{i,1},\ldots,Y_{i,N_i})$ over $N_i$ generated graphs, where $Y_{i,t}$ is the log runtime for change $i$ minus the log runtime for change $i-1$. The graphs used for evaluations use seeds unavailable to either agent, corresponding to an unknown distribution of user inputs. For a minimum speedup of $p\%$, we set $\delta_p = -\log(1 - p/100)$ and apply the one-sided right-Haar construction of Appendix 8.1 to the shifted contrasts $X_{i,t} = Y_{i,t} + \delta_p$. This produces $E_{i,t}$ and $\bar{E}_{i,t}$, with increment pairs $e_{i,t} = E_{i,t}/E_{i,t-1}$ and $\bar{e}_{i,t} = \bar{E}_{i,t}/\bar{E}_{i,t-1}$, providing evidence against $\theta_i = 1$ and $\theta_i = 0$, respectively. The sample size $N_i$ is determined adaptively. After the first 10 pairs, stopping is assessed every five additional pairs; sampling stops when either $E_{i,t}$ or $\bar{E}_{i,t}$ reaches 100 or when 150 pairs have been observed.

Predictable Tuning. Across all experiments, we use a predictable tuning heuristic based on trajectory simulation at each time $t$ to select weights $(w_{i,t}, \bar{w}_{i,t})$. For our estimator, our approach aims to minimize and maximize the conditional expectation of the upper and lower bound estimators. For inference, we similarly minimize a convex upper bound on the expected width. Both methods leverage 64 trajectory simulations at each time $t$ to approximate conditional expectations at each $t \in \mathbb{N}$ to obtain weights $(w_{i,t}, \bar{w}_{i,t})$. Our approach, along with its pseudocode, is provided in Appendix 7.

### 5.1 Discussion of Results

Figure 1: Estimated Bounds and Confidence Intervals for NetworkX Experiment. Confidence sets are pointwise for each minimum speedup threshold and agent, with $\alpha = 0.1$. The bolded line denotes the midpoint of our estimated bounds and confidence sets.

In Figure 1, we plot our estimated upper/lower bound estimators and confidence sets as a function of $p$, the minimum speedup threshold required for a change to be considered correct. Across all thresholds, Opus exhibits a higher estimated proportion of correct changes than Haiku. For example, at a minimum speedup of 5%, the lower estimated bound is approximately 0.15 for Opus, while the estimated upper bound for Haiku is 0.11. The gap persists as the minimum speedup threshold increases, suggesting that Opus produces more meaningful runtime improvements than Haiku.

Our confidence sets provide additional information about the reliability of these conclusions. Despite adaptively determined sample sizes and dependence between successive code changes, our procedures yield informative 90% pointwise confidence sets across the considered speedup thresholds. In particular, the lower confidence sets remain positive even when requiring a 10% speedup, providing statistical evidence that both agents produce a nonzero proportion of meaningful improvements.

Our case study demonstrates that that agent quality can be meaningfully evaluated on tasks without ground-truth correctness labels, while preserving rigorous statistical guarantees. In our experiment, the true geometric-mean runtime improvement of each code change is unknown, and evidence is collected and stopped adaptively. Our framework converts this sequential evidence into interpretable estimates and confidence bounds on a user-defined notion of agent quality, such as the fraction of beneficial decisions. For practitioners choosing between agents, metrics such as the proportion of correct changes enable comparisons based on the frequency of practically meaningful improvements, rather than benchmark performance or noisy empirical correctness labels. Additionally, correctness, such as minimum improvement thresholds, can be selected to reflect deployment priorities, allowing practitioners to define correctness based on operational significance.

## 6 Conclusions

As AI agents increasingly make consequential decisions in real-world systems, evaluating their performance requires moving beyond static benchmarks or heuristic correctness labels. We introduced a null-proportion estimation framework for evaluating agent quality based on sequential e-values, allowing for adaptive decisions, data-dependent stopping, and quality metrics defined after deployment. Our results establish that uniformly valid estimation and inference are possible under these conditions, with estimators that can approach instance-wise sharp bounds. Our coding agent case study illustrates how this framework can provide interpretable assessments of agent performance.

Our work opens several directions for future research. Our setting is intentionally general, and we construct uniform estimated bounds and confidence sets. While our approach ensures our desired statistical guarantees across any distribution of agent trajectories, more efficient procedures for estimation and inference may be possible under stronger assumptions, such i.i.d. e-value pairs, a fixed data collection policy, or restrictions on agent behavior. A practical direction of interest is the development of more efficient tuning procedures, including improved predictable methods for allocating evidence across hypotheses and over time. Lastly, our experiment is intended as a case study, rather than a rigorous evaluation across agents, tasks, and correctness objectives. Because our methods have uniform guarantees, testing them on large scale evaluation across recorded agent trajectories offers the promise of selecting agents in a statistically principled manner based past performance, tailored to the relevant task.

## Data Availability Statement

The data and code needed to reproduce the numerical results are provided with this submission. The starting version of NetworkX for the case study is available at https://github.com/networkx/networkx (commit 2622da75c).

## Acknowledgements

Generative AI tools were used to edit this manuscript, check mathematical arguments, and write code for experiments. The authors reviewed all such output and take full responsibility for the content.

## Conflicts of interest

The authors declare no conflicts of interest.
