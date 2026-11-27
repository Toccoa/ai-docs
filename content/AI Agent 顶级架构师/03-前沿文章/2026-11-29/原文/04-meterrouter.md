# MeterRouter: Budget-Aware Dynamic Routing for Multi-Agent Systems

Yue Xu Affiliation: Department of Applied Economics, University of Minnesota Affiliation: Department of Computer Science and Engineering, University of Minnesota Leikun Yin Affiliation: Department of Computer Science and Engineering, University of Minnesota Ruiming Min Affiliation: School of Statistics, University of Minnesota Yufeng Lai Affiliation: Databricks Justin Andrew Johnson Affiliation: Department of Applied Economics, University of Minnesota Sitao Luan Affiliation: Mila – Quebec Artificial Intelligence Institute Affiliation: University of Montreal Xiaotong Shen Affiliation: School of Statistics, University of Minnesota

###### Abstract

Multi-agent systems (MAS) built on large language models (LLMs) outperform single-agent systems, but inter-agent communication incurs substantial token overhead. While assigning a large LLM to every agent is common, it results in inefficient resource utilization, leaving the system far from the Pareto frontier. The cost of answering a query is set jointly by how many agents are recruited, the role and LLM assigned to each, and communication topology among them. Most existing routers treat cost only implicitly rather than as an explicit optimization constraint. A fixed accuracy–cost preference also cannot express how much a caller is willing to pay for a particular query. We introduce MeterRouter, a budget-aware dynamic router that incrementally synthesizes a collaboration graph by selecting each agent’s role, LLM, incoming connections, and termination conditioned on the query and a per-query monetary budget. We initialize the router by imitating successful execution graphs, then jointly refine its decisions with a variant of Group Relative Policy Optimization (GRPO) whose reward favors correct answers and penalizes spending and budget overruns. Across five benchmarks and a three-tier LLM pool, MeterRouter is (1) accurate, achieving performance comparable to the strongest MAS; (2) economical, reaching that accuracy at 82% lower cost than the strongest MAS router and extending the accuracy–cost frontier beyond the ceiling of single-agent systems; and (3) controllable, adapting its spending to the specified budget while rarely exceeding it.

|  |

## 1 Introduction

Large Language Model (LLM)-based agents have demonstrated remarkable capabilities in tackling complex tasks that extend beyond enclosed reasoning and textual boundaries ([Schick et al., 2023](#bib.bib33)), with external capabilities like context-aware memory ([Zhang et al., 2024](#bib.bib30)), tool use ([Qin et al., 2024](#bib.bib34)). However, single-agent architectures often struggle when executing multi-step reasoning ([Wei et al., 2022](#bib.bib16); [Valmeekam et al., 2023](#bib.bib23)), adapting to dynamic environments ([Yao et al., 2023](#bib.bib17)), or maintaining coherence over extended horizons ([Park et al., 2023](#bib.bib31); [Sun et al., 2026](#bib.bib24)). To address these challenges, Multi-Agent Systems (MAS) have emerged as a dominant paradigm, consistently outperforming single-agent by well-crafted inter-agent communication topologies, harnessing collective intelligence ([Chen et al., 2024c](#bib.bib20); [Wang et al., 2025a](#bib.bib21)), specialized role allocation ([Hong et al., 2024](#bib.bib27); [Qian et al., 2024](#bib.bib19)), and dynamic error recovery ([Shinn et al., 2023](#bib.bib18); [Du et al., 2024](#bib.bib28); [Gou et al., 2024](#bib.bib22)).

With the rapid expansion of a highly accessible and heterogeneous LLM landscape, selecting appropriate LLMs based on their capability and cost has increasingly captured the attention of the research community ([Yue et al., 2025](#bib.bib9); [Yang et al., 2026](#bib.bib14); [Cai et al., 2025](#bib.bib15)). Although LLM capabilities generally scale with model size, smaller models reduce computational cost ([Feng et al., 2025](#bib.bib11)). Moreover, uniform dependency on a single model introduces critical operational vulnerabilities, leading to service outages or demand spikes ([Chen et al., 2024a](#bib.bib8)). LLM-routing is proposed to assign the suitable LLM for each query ([Dai et al., 2024](#bib.bib35); [Ding et al., 2024](#bib.bib6); [Ong et al., 2025](#bib.bib7); [Feng et al., 2025](#bib.bib11); [Zhang et al., 2026](#bib.bib12)). Leveraging model diversity by strategically assigning heterogeneous LLMs offers a promising approach for MAS construction.

MAS cooperative performance gains rely on inter-agent information transmission, exchange and assimilation ([Zhang et al., 2025a](#bib.bib1)). Such extensive prompt-level communication-spanning inter-agent and self-evaluation introduces substantial token overhead ([Wang et al., 2024a](#bib.bib32)), leading to a fundamental trade-off between collaborative synergy and token efficiency. To address that, the MAS topology design has shifted from static, manually designed graphs to more flexible and sparse task-adaptive topology synthesis paradigms ([Wang et al., 2025b](#bib.bib2); [Zhang et al., 2025b](#bib.bib4); [Li et al., 2026a](#bib.bib5)). However, these cost-efficiency solutions operate exclusively at the structural orchestration level, uniformly assigning homogeneous LLMs without leveraging heterogeneous LLMs. This motivates a critical question: How to architect a budget-aware, topologically adaptive MAS using heterogeneous backbones that optimizes task performance with cost-efficiency?

For complex tasks where the division of labor is hard to define, fixed communication topologies including chains cannot meaningfully contribute to collaborative intelligence ([Zhang et al., 2025a](#bib.bib1)). In contrast, sparse, task-adaptive graphs reduce redundant roles and edges ([Zhang et al., 2025b](#bib.bib4); [Li et al., 2026a](#bib.bib5)). However, designing these topologies independently of model selection can still lead to suboptimal MAS construction. To avoid separating those two selections, we propose MeterRouter (Figure [1](#S1.F1)), a framework that jointly optimizes topology generation and LLM-to-role assignments. By dynamically tailoring agent topologies ([Li et al., 2026a](#bib.bib5)) and LLM assignments by remaining budget, MeterRouter optimizes the accuracy-cost tradeoff, achieving competitive task performance while substantially reducing monetary consumption. Our main contributions are as follows: ➊ Autonomous MAS Orchestration with Heterogeneous LLMs: We design MAS routing, which dynamic topology generation with assigning each agent’s role, backbone, and incoming edges, systematically eliminates the operational redundancies and suboptimal LLM assignments inherent in static, pre-defined templates. ➋ Budget-Aware and Dynamic Adjustment: We introduce a flexible and practical multi-agent framework customized to user-defined budget per query. Instead of cut-off output generation, MeterRouter employs a dynamic remaining-budget tracker to adaptively reallocate resources to achieve cost-efficient routing. ➌ Pareto Optimization: We introduce MeterRouter, a joint routing mechanism that balances task performance and token cost. Driven by a dual-source cost reduction strategy, it minimizes operational overhead by combining structural communication savings with heterogeneous capacity assignment savings.

Figure 1: Overview of MeterRouter. The router builds the MAS incrementally, choosing each agent’s role, backbone, and incoming edges, or stopping, under the remaining budget tracked by the meter (top, middle). It is trained by budget-conditioned imitation (Stage 1) and group-relative RL (Stage 2) (bottom).

## 2 Related works

Collaboration Topology. MAS have transitioned from fixed interaction heuristics to topology optimization. The progression occurs along two critical axes: task adaptivity and structural flexibility. Early frameworks relied on static canonical graphs, such as CoT ([Wei et al., 2022](#bib.bib16)), Reflexion ([Shinn et al., 2023](#bib.bib18)), LLM-debate ([Du et al., 2024](#bib.bib28)) and MACNET ([Qian et al., 2025](#bib.bib29)). These networks fundamentally dictate reasoning performance while remaining task-agnostic and computationally inefficient. Dynamic task-adaptive frameworks advance beyond rigid heuristics by leveraging execution feedback to steer communication traces ([Hong et al., 2024](#bib.bib27); [Dang et al., 2025](#bib.bib25); [Wu et al., 2024](#bib.bib26)). To eliminate manual topology engineering, template-based optimization frameworks apply learnable edge reweighting and pruning mechanisms to distill redundant communication topologies into sparse structures ([Zhuge et al., 2024](#bib.bib3); [Wang et al., 2025b](#bib.bib2); [Zhang et al., 2025a](#bib.bib1)). Pushing beyond template modification, graph generative paradigms construct autonomous topologies: G-Designer ([Zhang et al., 2025b](#bib.bib4)) utilizes a graph autoencoder to learn task-adaptive collaboration structures, while ARG-Designer ([Li et al., 2026a](#bib.bib5)) leverages an autoregressive model to incrementally build graphs. However, existing MAS frameworks frequently over-provision computational resources by uniformly assigning top-tier LLMs to all agents, leading to excessive token consumption ([Yue et al., 2025](#bib.bib9)).

LLM Routing. LLM routing optimizes the Pareto frontier between cost and response quality by assigning the suitable LLMs for queries. Early paradigms rely on sequential cascading, such as FrugalGPT ([Chen et al., 2024a](#bib.bib8)), which queries models iteratively until satisfying a confidence threshold, or binary routing based on predicted query difficulty ([Ding et al., 2024](#bib.bib6)) and human preference ([Ong et al., 2025](#bib.bib7)). Recognizing that ensembling responses across LLMs outperforms a single LLM, recent works transition from binary model selection to multi-choice routing and output fusion ([Dai et al., 2024](#bib.bib35); [Chen et al., 2024b](#bib.bib10); [Feng et al., 2025](#bib.bib11); [Zhang et al., 2026](#bib.bib12)). Extending routing to MAS, MasRouter ([Yue et al., 2025](#bib.bib9)) integrates topology selection, role assignment and LLM routing, but it is constrained to selecting from a graph catalog. ProgRouter ([Li et al., 2026b](#bib.bib13)) performs step-wise LLM routing across workflow pipelines.

## 3 Problem Formulation

### 3.1 Notation Establishment

Search Space. ℛ\mathcal{R} denotes the pool of available NrN_{r} roles (e.g., programmer, analyst), ℳ\mathcal{M} denotes NmN_{m} available LLM backbone pool, and each LLM backbone carries a price pair (cmin,cmout)(c^{\mathrm{in} }_{m},c^{\mathrm{out} }_{m}) in dollars per input and output token. More detailed notation form is in Appendix [A](#A1).

Agents and edges. We represent a multi-agent system as a directed acyclic graph (DAG) 𝒢=(𝒱,ℰ)\mathcal{G}=(\mathcal{V},\mathcal{E}). The node set 𝒱={v1,v2,⋯,vN}\mathcal{V}=\{v_{1},v_{2},\cdots,v_{N}\} represents collection of NN interacting agents and agent viv_{i} is an instance with an LLM backbone mim_{i} endowed with a specific role function and expertise rir_{i} denoted as vi={ri,mi},ri∈ℛ,mi∈ℳ.v_{i}=\{r_{i},m_{i}\},r_{i}\in\mathcal{R},m_{i}\in\mathcal{M}. Edges ℰ⊆𝒱×𝒱\mathcal{E}\subseteq\mathcal{V}\times\mathcal{V} represent communication pathway. An edge ej​i=(vj,vi)e_{ji}=(v_{j},v_{i}) means that agent viv_{i} is recipient of information from agent vjv_{j}. The set of direct predecessors of agent viv_{i} is denoted by 𝒩i​n​(vi)={vj|(vj,vi)∈ℰ}\mathcal{N}_{in}(v_{i})=\{v_{j}|(v_{j},v_{i})\in\mathcal{E}\}.

Budget-Aware. For query 𝒬\mathcal{Q}, user has a willingness to pay or budget constraint BB. The cost considered in this paper is monetary cost:

| Ci=cmiin​Tiin+cmiout​Tiout.C_{i}=c^{\mathrm{in} }_{m_{i} }T^{\mathrm{in} }_{i}+c^{\mathrm{out} }_{m_{i} }T^{\mathrm{out} }_{i}. | (1) |

Remaining budget bib_{i} is the money left before agent ii, denoted as:

| bi=B−∑j<iCj.b_{i}=B-\sum_{j<i}C_{j}. | (2) |

Observations. Executing agent ii therefore returns an observation. Given the byte counts of information |y~i|B\lvert\tilde{y}_{i}\rvert_{\mathrm{B} }, denoted as:

| oi=(|y~i|B,Tiin,|yi|chars,Tiout),o_{i}=\Big(\ |\tilde{y}_{i}|_{\mathrm{B} },T^{\mathrm{in} }_{i},\ |y_{i}|_{\mathrm{chars} },\ T^{\mathrm{out} }_{i}\Big), | (3) |

where TiinT^{\mathrm{in} }_{i} is the token count of the message to viv_{i}, |y~i|B|\tilde{y}_{i}|_{\mathrm{B} } is the size in bytes of the message viv_{i} transmits to its successors, which would cost viv_{i}’s successor to read, and agent ii outputs the message yiy_{i}, of length |yi|chars|y_{i}|_{\mathrm{chars} } characters. TioutT^{\mathrm{out} }_{i} is the token count for output. A trajectory ξ\xi records the graph together with everything its execution produced: the responses yiy_{i}, the LLM provider-reported token counts TiinT^{\mathrm{in} }_{i} and TioutT^{\mathrm{out} }_{i}, and the per-call costs C⁡(ξ)=∑i=1NCi.C(\xi)=\sum_{i=1}^{N}C_{i}.

### 3.2 Budget-Aware Orchestration

Optimization Goal. Let 𝒫\mathcal{P} be the distribution over query–budget pairs. The ideal budget-aware MAS should be able to optimize a strategy to maximize utility by considering both performance and marginal cost under the given budget constraints:

| maxθ\displaystyle\max_{\theta} | 𝔼(𝒬,B)∼𝒫𝔼ξ∼πθ(⋅∣𝒬,B)[U(𝒬,B,ξ)]\displaystyle\mathbb{E}_{(\mathcal{Q},B)\sim\mathcal{P} }\mathbb{E}_{\xi\sim\pi_{\theta}(\cdot\mid\mathcal{Q},B)}\left[U(\mathcal{Q},B,\xi)\right] | (4) |
| s.t.\displaystyle\text{s.t.} | 𝔼ξ∼πθ(⋅∣𝒬,B)[C(𝒬,ξ)]≤B,∀(𝒬,B)∼𝒫,\displaystyle\mathbb{E}_{\xi\sim\pi_{\theta}(\cdot\mid\mathcal{Q},B)}\left[C(\mathcal{Q},\xi)\right]\leq B,\quad\forall\,(\mathcal{Q},B)\sim\mathcal{P}, |  |

where πθ\pi_{\theta} is the policy distribution induced by the router and the execution environment. The utility formalizes the trade-off between answer quality and monetary cost. We introduce the utility function:

| U⁡(𝒬,B,ξ)=S⁡(𝒬,ξ)−γ​C⁡(ξ)B,U(\mathcal{Q},B,\xi)=S(\mathcal{Q},\xi)-\gamma\frac{C(\xi)}{B}, | (5) |

where S⁡(𝒬,ξ)∈{0,1}S(\mathcal{Q},\xi)\in\{0,1\} indicates whether the answer is correct and γ\gamma is tuning parameter reflecting the elasticity of cost sensitivity. The higher value of γ\gamma penalizes expenditure more heavily.

MAS Generation. In our work, rather than relying on fixed graph templates and deterministic model selection, MeterRouter constructs the MAS as an arbitrary DAG to consider a more general case. To achieve this, MeterRouter incrementally expands the expert team by selecting each agent’s role, backbone, and incoming edges under the remaining budget progressively. To implement it, we learn a stochastic construction policy πθ\pi_{\theta}. It induces a distribution over feasible orchestration graphs, which is denoted by Pθ​(𝒢∣𝒬,B,ℛ,ℳ)=Pθ​(𝒢∣𝒮).P_{\theta}(\mathcal{G}\mid\mathcal{Q},B,\mathcal{R},\mathcal{M})=P_{\theta}(\mathcal{G}\mid\mathcal{S}). We factorize this distribution into a tractable sequence of conditional decisions. At each step, the policy either terminates or adds a new agent with its role, backbone, and incoming edges, conditioned on the current state:

| Pθ​(𝒢∣𝒮)=∏i∈ℐπθ​(τi∣si)Iiτ⏟Termination​∏i=1|𝒱|[πθ​(ri∣si)⏟Role​πθ​(mi∣ri,si)⏟Backbone​∏j<iπθ​(ej​i∣ri,mi,𝐞>j,i,si)Ij​ie⏟Edge]P_{\theta}(\mathcal{G}\mid\mathcal{S})=\prod_{i\in\mathcal{I} }\underbrace{\pi_{\theta}(\tau_{i}\mid s_{i})^{I_{i}^{\tau} }}_{\text{Termination} }\prod_{i=1}^{|\mathcal{V}|}\left[\underbrace{\pi_{\theta}(r_{i}\mid s_{i})}_{\text{Role} }\underbrace{\pi_{\theta}(m_{i}\mid r_{i},s_{i})}_{\text{Backbone} }\prod_{j<i}\underbrace{\pi_{\theta}\left(e_{ji}\mid r_{i},m_{i},\mathbf{e}_{>j,i},s_{i}\right)^{I_{ji}^{e} }}_{\text{Edge} }\right] | (6) |

Here, ℐ\mathcal{I} denotes the reached construction steps. The indicators IiτI_{i}^{\tau} and Ij​ieI_{ji}^{e} exclude decisions deterministically imposed by structural or budget constraints from the policy probability. The state before generating the ii-th agent, state:

| si=(𝒬,B,bi,𝒢<i,o<i),s_{i}=\left(\mathcal{Q},B,b_{i},\mathcal{G}_{<i},o_{<i}\right), | (7) |

maintains accumulated knowledge and experience from previous interactions by containing the information of query 𝒬\mathcal{Q}, remaining budget bib_{i}, existing graph 𝒢<i\mathcal{G}_{<i}, and previous steps observation o<io_{<i}.

There are three types of decisions in the construction: agent generation, which predicts the role and selects a backbone from the admissible set ℳim⊆ℳ\mathcal{M}_{i}^{m}\subseteq\mathcal{M} detailed in Section [4.2](#S4.SS2); edge generation, which connects the incoming agent with existing agents; and termination to stop construction.

## 4 MeterRouter

Based on the autoregressive graph generation paradigm, the graph generation is designed to implement the sequential generation process. MeterRouter instantiates πθ\pi_{\theta} as a small recurrent network (§[4.1](#S4.SS1)), making the agent aware of available resource limits (§[4.2](#S4.SS2)) by tracking the remaining budget. It is trained in two stages and run in a generate–execute loop at inference (§[4.3](#S4.SS3)).

### 4.1 Model Architecture

Input Representation. All textual conditioning information (query, role descriptions and the backbone) is mapped into dense vector representations. The query is mapped into a fixed-dimensional vector 𝒬→ℝD\mathcal{Q}\to\mathbb{R}^{D} by a frozen sentence-BERT text encoder to extract the semantic information, followed by Layer Normalization (LN). fBf_{B} denotes the dd-dimensional embedding of the log budget, and f~𝒬\tilde{f}_{\mathcal{Q} } fuses the query with the budget:

| f𝒬=MLP⁡(LN⁡(Enc⁡(𝒬))),fB=MLP⁡(log⁡B),f~𝒬=MLP⁡([f𝒬,fB]).f_{\mathcal{Q} }=\operatorname{MLP}\big(\operatorname{LN}(\operatorname{Enc}(\mathcal{Q}))\big),\quad f_{B}=\operatorname{MLP}\big(\log B\big),\quad\tilde{f}_{\mathcal{Q} }=\operatorname{MLP}\big([f_{\mathcal{Q} },f_{B}]\big). | (8) |

Similarly, each available agent role r∈ℛr\in\mathcal{R} is converted into zr=MLP⁡(LN⁡(Enc⁡(r)))z_{r}=\operatorname{MLP}\big(\operatorname{LN}(\operatorname{Enc}(r))\big), sharing MLP\operatorname{MLP} with the query. These are collected into a role embedding matrix 𝐙∈ℝ|ℛ|×d\mathbf{Z}\in\mathbb{R}^{|\mathcal{R}|\times d}. For each LLM m∈ℳm\in\mathcal{M}, the model information is concatenated with its price,

| zm=MLP⁡([Enc⁡(m),log⁡cmin,log⁡cmout]).z_{m}=\operatorname{MLP}\big([\operatorname{Enc}(m),\log c^{\mathrm{in} }_{m},\log c^{\mathrm{out} }_{m}]\big). | (9) |

Encoding the price into the latent vector represents each backbone by what it costs as well as by its description. The edge policy below additionally receives the receiver’s input price explicitly.

State Representation. A gated recurrent unit (GRU) aggregates the joint role–backbone encoding of the agents generated so far, {[zrj,zmj]}j<i\{[z_{r_{j} },z_{m_{j} }]\}_{j<i}, forming a historical embedding fhist(i)f^{(i)}_{\mathrm{hist} } in Eq. [21](#A2.E21). The meter enters as a cost vector ϕi\phi_{i} holding the shares of the budget spent and remaining, and the shares of the agent cap used and remaining, formed as

| ϕi=[B−biB,biB,i−1Nmax,Nmax−i+1Nmax,ψ⁡(B)]\phi_{i}=\Big[\frac{B-b_{i} }{B},\,\frac{b_{i} }{B},\,\frac{i-1}{N_{\max} },\;\frac{N_{\max}-i+1}{N_{\max} },\;\psi(B)\Big] | (10) |

with ψ⁡(B)\psi(B) in Eq. [23](#A2.E23), the log budget rescaled so that the training range [Bmin,Bmax][B_{\min},B_{\max}] maps to [−1,1][-1,1].

fcont(i)f^{(i)}_{\mathrm{cont} } combines the historical information with the current information by composing the budget-conditioned query through a dynamic gate, giving all context information and cost:

| fcont(i)=(1−gi)⋅fhist(i)+gi⋅f~𝒬+MLP⁡(ϕi),gi=σ⁡(fhist(i)⋅f~𝒬d),f^{(i)}_{\mathrm{cont} }=(1-g_{i})\cdot f^{(i)}_{\mathrm{hist} }+g_{i}\cdot\tilde{f}_{\mathcal{Q} }+\operatorname{MLP}(\phi_{i}),\quad g_{i}=\sigma\!\left(\frac{f^{(i)}_{\mathrm{hist} }\cdot\tilde{f}_{\mathcal{Q} }}{\sqrt{d} }\right), | (11) |

where σ\sigma represents the sigmoid function. fedge(i)f^{(i)}_{\mathrm{edge} } in Eq. [22](#A2.E22) captures the connectivity pattern of the previous agent by collecting its incoming edges together with a mask of the predecessors already scanned, and encoding them using an MLP.

Another GRU\mathrm{GRU} then updates the node-level state hnode(i)h^{(i)}_{\mathrm{node} } based on the context information together with the connectivity of the previous agent, denoted as

| hnode(i)=GRU⁡(MLP⁡([fcont(i),fedge(i)]),hnode(i−1)).h^{(i)}_{\mathrm{node} }=\mathrm{GRU}\Big(\operatorname{MLP}\big([f^{(i)}_{\mathrm{cont} },\,f^{(i)}_{\mathrm{edge} }]\big),\,h^{(i-1)}_{\mathrm{node} }\Big). |  |

Role. A metric-learning module projects the hidden state hnode(i)h^{(i)}_{\mathrm{node} } into a “node intent” embedding to predict a node prediction score ωnodei\omega^{i}_{\mathrm{node} }. The softmax⁡(⋅)\operatorname{softmax}(\cdot) function converts the scores into the probability distribution for role selection:

| ωnodei=MLP⁡(hnode(i))⊤​MLP⁡(zr)d,πθ​(ri=r∣si)=softmaxr∈ℛ⁡(ωnodei).\omega^{i}_{\mathrm{node} }=\frac{\operatorname{MLP}(h^{(i)}_{\mathrm{node} })^{\!\top}\operatorname{MLP}(z_{r})}{\sqrt{d} },\qquad\pi_{\theta}(r_{i}=r\mid s_{i})=\operatorname{softmax}_{r\in\mathcal{R} }\big(\omega^{i}_{\mathrm{node} }\big). | (12) |

Backbone. With the role fixed, the router assigns a backbone. Each candidate in the feasible set ℳim\mathcal{M}^{m}_{i} is scored independently as ωmi\omega_{m}^{i}, so no role falls on an unaffordable backbone. 𝐥m=(ℓmin,ℓmout)\mathbf{l}_{m}=(\ell_{m}^{\mathrm{in} },\ell_{m}^{\mathrm{out} }) denotes the backbone’s log price standardized across ℳ\mathcal{M}. The pair 𝝍⁡(B,bi)=(ψ⁡(B),ψ⁡(bi))\bm{\psi}(B,b_{i})=(\psi(B),\psi(b_{i})) reports the assigned budget and the realized remainder on one log-dollar scale. Because bib_{i} is computed from billed usage, it serves as execution feedback that enters the backbone decision:

| ωmi=MLP⁡([hnode(i),zri,zm,fB,𝐥m,𝝍⁡(B,bi)]),πθ​(mi∣ri,si)=softmaxm∈ℳim⁡(ωmi).\omega_{m}^{i}=\operatorname{MLP}\big([h^{(i)}_{\mathrm{node} },z_{r_{i} },z_{m},f_{B},\mathbf{l}_{m},\bm{\psi}(B,b_{i})]\big),\quad\pi_{\theta}(m_{i}\mid r_{i},s_{i})=\operatorname{softmax}_{m\in\mathcal{M}^{m}_{i} }\Big(\omega_{m}^{i}\Big). | (13) |

Edges. With rir_{i} and mim_{i} fixed, the router chooses which existing agents v<iv_{<i} to connect with. A GRU is employed to update the hidden state, initialized from the node-level state. For existing agents {j=i−1,…,1}\{j=i-1,\dots,1\}, scanned in this reverse order, the edge GRU at each step updates the state based on the previous edge decision and the predecessor’s length vector:

| hedge(i,i)\displaystyle h^{(i,i)}_{\mathrm{edge} } | =MLP⁡([hnode(i),zri,zmi]),\displaystyle=\operatorname{MLP}\big(\big[h^{(i)}_{\mathrm{node} },z_{r_{i} },z_{m_{i} }\big]\big), | (14) |
| hedge(i,j)\displaystyle h^{(i,j)}_{\mathrm{edge} } | =GRU⁡(MLP⁡([ej+1,i,zrj,zmj])+MLP⁡(ℓj→i),hedge(i,j+1)).\displaystyle=\mathrm{GRU}\Big(\operatorname{MLP}\big(\big[e_{j+1,i},z_{r_{j} },z_{m_{j} }\big]\big)+\operatorname{MLP}\big(\bm{\ell}_{j\to i}\big),\,h^{(i,j+1)}_{\mathrm{edge} }\Big). |  |

where a length vector ℓj→i\bm{\ell}_{j\to i} is built from its observation ojo_{j} and the receiver mim_{i} in Eq. [24](#A2.E24) to describe the resource usage of this edge. The state hedge(i,j)h^{(i,j)}_{\mathrm{edge} } then predicts the score for connecting to agent jj, which gives the probability of edge ej​ie_{ji}:

| ωedgei,j=MLP⁡(hedge(i,j)),πθ​(ej​i=1∣ri,mi,𝐞>j,i,si)=σ⁡(ωedgei,j).\omega^{i,j}_{\mathrm{edge} }=\operatorname{MLP}(h^{(i,j)}_{\mathrm{edge} }),\qquad\pi_{\theta}\big(e_{ji}=1\mid r_{i},m_{i},\mathbf{e}_{>j,i},s_{i}\big)=\sigma\big(\omega^{i,j}_{\mathrm{edge} }\big). | (15) |

When viv_{i} must close the graph, the edges from the current sinks are fixed to 11 rather than sampled.

Termination. Team size is decided by the node state and the budget, so stopping can respond to a shrinking remainder in the cost vector ϕi\phi_{i}. The termination policy is evaluated at the start of step ii. Termination is forced when the affordable set ℳim=∅\mathcal{M}^{m}_{i}=\emptyset. The probability of termination is:

| πθ​(τi=1∣si)=σ⁡(MLP⁡([hnode(i),fB])).\pi_{\theta}(\tau_{i}=1\mid s_{i})=\sigma\big(\operatorname{MLP}([h^{(i)}_{\mathrm{node} },f_{B}])\big). | (16) |

Design Rationale. Since an agent’s cost CiC_{i} is known only after it is executed and the admissible set ℳim\mathcal{M}^{m}_{i} in Eq. [17](#S4.E17) depends on the remaining budget bib_{i}, MeterRouter builds and executes agents one at a time and feeds bib_{i} to every decision head. Within each step, the decisions follow how cost arises: termination comes first because it depends only on the remaining budget, the role precedes the backbone because the capacity an agent needs depends on its role, and the backbone precedes the edges because reading a predecessor vjv_{j} costs about cmiin​Tjoutc^{\mathrm{in} }_{m_{i} }T^{\mathrm{out} }_{j}, which the edge head sees through the length vector ℓj→i\bm{\ell}_{j\to i} in Eq. [24](#A2.E24). The budget enters through budget-relative shares and a log scale, and each role or backbone is scored by a shared function over the feasible set, so one model works across budgets and LLM pools of any size.

### 4.2 The Meter

Besides tracking the remaining budget in our policy condition, we confine generation to the affordable budget. We therefore form budget awareness from two sides. One removes unaffordable backbones from the action set; the other converts the remaining money into a hard token cap on the call that is about to be issued. Both run on a byte-based estimator that is deliberately conservative; all constants and estimator forms in this section are given in Appendix [B](#A2).

Affordable backbone set. Let T^i\widehat{T}_{i} be an upper estimation of the input node ii would consume, if it gets all messages from every completed predecessor. Let Fm​(T)=cmin​T+cmout​qminF_{m}(T)=c^{\mathrm{in} }_{m}T+c^{\mathrm{out} }_{m}q_{\min} be the floor cost of a call on mm that produces the predefined minimum admissible completion constant qminq_{\min}. Then:

| ℳim={m∈ℳ:Fm​(T^i)+Ri≤bi},\mathcal{M}^{m}_{i}=\Big\{m\in\mathcal{M}\;:\;F_{m}\big(\widehat{T}_{i}\big)+R_{i}\leq b_{i}\Big\}, | (17) |

where RiR_{i} reserves the floor cost of any successor. If ℳim=∅\mathcal{M}^{m}_{i}=\emptyset, the step terminates. If there is no affordable LLM before the first agent, the query is flagged as budget-blocked without issuing any model call.

Priced completion cap. Once the role, the backbone and the edges are fixed, the input message is decided and the remaining budget becomes the hard cap on completion. So the cap decides how long the node ii may output in the remaining budget:

| qi=min⁡{Tmax,⌊bi−ρ^i−Riμi⌋},μi=cmiout+νi​κr​cm¯in,q_{i}=\min\Big\{T_{\max},\;\Big\lfloor\frac{b_{i}-\hat{\rho}_{i}-R_{i} }{\mu_{i} }\Big\rfloor\Big\},\qquad\mu_{i}=c^{\mathrm{out} }_{m_{i} }+\nu_{i}\,\kappa_{\mathrm{r} }\,c^{\mathrm{in} }_{\underline{m} }, | (18) |

where TmaxT_{\max} is the maximum number of completion tokens allowed per call, ρ^i\hat{\rho}_{i} is the estimated input charge, νi=1\nu_{i}=1 if a successor is still obliged, m¯\underline{m} is the cheapest backbone and κr\kappa_{\mathrm{r} } converts output tokens into the input tokens they become downstream. The marginal price μi\mu_{i} can help tighten the cap on exactly the agents whose output will be re-read. Under the estimator, a shielded trajectory satisfies C⁡(ξ)≤BC(\xi)\leq B by construction. The estimator is an upper bound.

### 4.3 Policy Procedure

MeterRouter is trained in two separate stages to balance a good initialization against exploration of the full action space. In the first stage, the policy learns a prior MAS distribution from a set of pre-generated supervision MAS, 𝒟SFT\mathcal{D}_{\mathrm{SFT} }, by a weighted negative log-likelihood objective function on role and edge decisions in Eq. [25](#A3.E25) inspired by [Li et al. (2026a)](#bib.bib5) as shown in Algorithm [2](#alg2). This loss has no budget or backbone term, so the budget enters only by the label in 𝒟SFT\mathcal{D}_{\mathrm{SFT} }.

To build 𝒟SFT\mathbf{\mathcal{D}_{\mathrm{SFT} }}, for every query 𝒬\mathcal{Q}, each template tt in a predefined pool 𝒯\mathcal{T} listed in Table [11](#A5.T11.fig1) is implemented KK times. Each run draws the roles uniformly and every agent is on the mid-priced backbone. The runs are executed once and re-scored at every budget BB of a fixed log-spaced grid by the empirical utility,

| u^t(𝒬,B)=1K∑k=1KS(𝒬,ξt,k)−γB⋅1K∑k=1KC(ξt,k),t⋆(𝒬,B)=arg​maxt∈𝒯:c^t≤Bu^t(𝒬,B),c^t=1K∑k=1KC(ξt,k).\begin{gathered}\hat{u}_{t}(\mathcal{Q},B)=\frac{1}{K}\sum_{k=1}^{K}S(\mathcal{Q},\xi_{t,k})-\frac{\gamma}{B}\cdot\frac{1}{K}\sum_{k=1}^{K}C(\xi_{t,k}),\\ t^{\star}(\mathcal{Q},B)=\argmax_{t\in\mathcal{T}:\ \hat{c}_{t}\leq B}\ \hat{u}_{t}(\mathcal{Q},B),\qquad\hat{c}_{t}=\frac{1}{K}\sum_{k=1}^{K}C(\xi_{t,k}).\end{gathered} | (19) |

We will always put the templates that maximize u^t​(𝒬,B)\hat{u}_{t}(\mathcal{Q},B) and use cost less than BB into 𝒟SFT\mathcal{D}_{\mathrm{SFT} }, as detailed in Algorithm [1](#alg1). Because the label changes with BB, 𝒟SFT\mathcal{D}_{\mathrm{SFT} } pairs every query with its highest-utility affordable template at each budget. The backbone policy is frozen in this stage, so supervision shapes topology and roles, and backbone allocation is left to the second stage.

In the second stage, the policy is refined by on-policy Reinforcement Learning (RL) since its answer can be graded quickly, so that backbone allocation and the response to execution feedback can be learned. For every training query 𝒬\mathcal{Q}, a budget BB is drawn log-uniformly from [Bmin,Bmax][B_{\min},B_{\max}] to get a better ability of generalization. The current policy πθold\pi_{\theta_{\mathrm{old} }} then generates and executes a group of GG trajectories {ξg}g=1G\{\xi_{g}\}_{g=1}^{G} under this common budget. Each trajectory is scored by the utility Ug=U⁡(𝒬,B,ξg)U_{g}=U(\mathcal{Q},B,\xi_{g}), and its advantage in its own group is denoted as: Ag=Ug−1G​∑g′=1GUg′.A_{g}=U_{g}-\frac{1}{G}\sum_{g^{\prime}=1}^{G}U_{g^{\prime} }.Let 𝒦⁡(ξ)\mathcal{K}(\xi) collect the decisions of ξ\xi made from the policy and ρd​(θ)=πθ​(d)/πθold​(d)\rho_{d}(\theta)=\pi_{\theta}(d)/\pi_{\theta_{\mathrm{old} }}(d) be the ratio of πθ\pi_{\theta} and πθold\pi_{\theta_{\mathrm{old} }} assigned to decision dd. The policy is updated with the clipped surrogate:

| ℒRL=−𝔼𝒬,B,ξ1:G∼πθold[1G∑g=1G1Z∑d∈𝒦⁡(ξg)min{ρd(θ)Ag,clip(ρd(θ),1−ϵ,1+ϵ)Ag}],\mathcal{L}_{\mathrm{RL} }=-\,\mathbb{E}_{\mathcal{Q},B,\,\xi_{1:G}\sim\pi_{\theta_{\mathrm{old} }} }\Bigg[\frac{1}{G}\sum_{g=1}^{G}\frac{1}{Z}\sum_{d\in\mathcal{K}(\xi_{g})}\min\Big\{\rho_{d}(\theta)A_{g},\ \operatorname{clip}\big(\rho_{d}(\theta),1-\epsilon,1+\epsilon\big)A_{g}\Big\}\Bigg], | (20) |

where ZZ is the mean number of decisions in the demonstrations of the first stage, a constant fixed once. The objective function follows Dr. GRPO ([Liu et al., 2025](#bib.bib36)) to reward the improvement of utility and isolate the LLM providers’ contribution to the likelihood of ξ\xi, which does not depend on θ\theta and is totally black box. By considering the ratios ρd\rho_{d}, we therefore obtain the exact likelihood ratio of the whole trajectory. All parameters are trained in this stage. The detail can be seen in Algorithm [3](#alg3).

At inference the parameters are frozen, and the router receives only the query 𝒬\mathcal{Q} and the budget BB. It builds the multi-agent system online by sampling from πθ\pi_{\theta}, which makes the decision of every step based on the MAS structure and all responses before. As each agent is executed and metered before the next decision is made, every later decision can be made on what the earlier calls actually cost and returned. The answer is the output of the final agent. MeterRouter takes the budget BB as an input, so sweeping BB yields a set of MAS along a cost–accuracy curve from one trained model. Detailed information of it is in Algorithm [4](#alg4).

## 5 Experiments

### 5.1 Experiments Setup

Datasets. We evaluate MeterRouter on three types of tasks: (1) general reasoning, with MMLU-Pro ([Wang et al., 2024b](#bib.bib39)), MuSR ([Sprague et al., 2024](#bib.bib40)), and BBEH ([Kazemi et al., 2025](#bib.bib41)); (2) mathematical reasoning, with Omni-MATH-2 ([Ballon et al., 2026](#bib.bib38)); and (3) code generation, with MBPP+ ([Liu et al., 2023](#bib.bib42)). For each benchmark, we split the queries into disjoint training, validation, and test sets (Table [5](#A4.T5.fig1)). Omni-MATH-2, MMLU-Pro, and BBEH each have 1,000 test queries, and MuSR and MBPP+ use every query left after the training and validation splits as their test sets (516 and 138).

Baselines. We compare MeterRouter with four groups of methods: (1) single-agent methods, namely vanilla and Chain-of-Thought prompting ([Wei et al., 2022](#bib.bib16)); (2) fixed multi-agent topologies, including Chain, Tree, and Complete Graph ([Qian et al., 2025](#bib.bib29)), and LLM-Debate ([Du et al., 2024](#bib.bib28)); (3) dynamic MAS, including AutoGen ([Wu et al., 2024](#bib.bib26)), GPTSwarm ([Zhuge et al., 2024](#bib.bib3)), and AgentPrune ([Zhang et al., 2025a](#bib.bib1)); and (4) LLM routing methods, including GraphRouter ([Feng et al., 2025](#bib.bib11)), RouterDC ([Chen et al., 2024b](#bib.bib10)), MasRouter ([Yue et al., 2025](#bib.bib9)), and BAMAS ([Yang et al., 2026](#bib.bib14)), which explicitly includes the budget.

Backbone LLMs. We build a three-tier LLM pool from gpt-oss-20b, gpt-oss-120b, and MiniMax-M3 (Table [6](#A4.T6.fig1)). Their sizes grow from 20B total parameters for gpt-oss-20b to ∼\sim428B for MiniMax-M3. The two gpt-oss models support 128K-token contexts, while MiniMax-M3 supports up to 1M tokens. Per-token prices rise with tier: from gpt-oss-20b to MiniMax-M3, the input price increases from $0.06 to $0.30 and the output price from $0.19 to $1.20 per million tokens. The model support an extensible LLM pool (Appendix  [D.6](#A4.SS6)).

Implementation. The text encoder is all-MiniLM-L6-v2 ([Wang et al., 2020](#bib.bib43)) and each system has at most Nmax=5N_{\max}=5 agents. Role sets follow the style of ARG-Designer ([Li et al., 2026a](#bib.bib5)). All LLMs are called with temperature 0.20.2 and at most Tmax=32,768T_{\max}=32{,}768 completion tokens per call. We evaluate at B∈{1,5,50}×10−3B\in\{1,5,50\}\times 10^{-3} and add B=4×10−3B=4\times 10^{-3} for Omni-MATH-2 and BBEH, where accuracy changes most sharply between 11 and 5×10−35\times 10^{-3}. Each benchmark’s checkpoint is selected on the validation set, and we report results on the test sets. We access all LLMs through Ollama Cloud API.

### 5.2 Performance Analysis

Table 1: Comparison with single-agent, multi-agent, and routing baselines. Multi.: builds a multi-agent topology; Router: selects LLMs from the pool. Acc. is averaged over all test questions, and Cost is the average cost per query. The top five performing methods are highlighted in bold.

| Method | Multi. | Router | LLM | Omni-Math-2 | MMLU-Pro | MuSR | BBEH | MBPP+ | Acc. | Cost ($ ×10−3\times 10^{-3}) |
|  | MiniMax-M3 | 43.1 | 80.6 | 63.2 | 27.8 | 79.7 | 53.39 | 4.14 |
|  | gpt-oss-120b | 60.3 | 79.1 | 68.7 | 42.7 | 76.5 | 62.50 | 1.91 |
| Vanilla | ✗ | ✗ | gpt-oss-20b | 43.6 | 64.4 | 58.5 | 16.0 | 79.0 | 45.18 | 0.14 |
|  | MiniMax-M3 | 39.5 | 80.4 | 70.0 | 29.9 | 76.8 | 53.78 | 2.61 |
|  | gpt-oss-120b | 61.8 | 78.3 | 71.5 | 42.4 | 78.0 | 62.98 | 1.84 |
| CoT | ✗ | ✗ | gpt-oss-20b | 44.2 | 68.1 | 61.8 | 18.1 | 76.8 | 47.32 | 0.17 |
|  | MiniMax-M3 | 58.3 | 83.3 | 66.3 | 40.7 | 81.2 | 62.32 | 12.68 |
|  | gpt-oss-120b | 57.7 | 78.2 | 63.2 | 36.8 | 81.9 | 59.28 | 3.65 |
| Chain | ✓ | ✗ | gpt-oss-20b | 51.3 | 70.5 | 64.0 | 23.2 | 81.9 | 51.81 | 1.13 |
|  | MiniMax-M3 | 59.8 | 83.7 | 69.8 | 41.2 | 82.6 | 63.52 | 16.87 |
|  | gpt-oss-120b | 57.3 | 78.2 | 65.9 | 36.7 | 84.1 | 59.61 | 4.30 |
| Tree | ✓ | ✗ | gpt-oss-20b | 50.9 | 71.1 | 60.3 | 23.6 | 81.2 | 51.42 | 1.38 |
|  | MiniMax-M3 | 54.5 | 83.0 | 66.1 | 35.4 | 84.8 | 59.85 | 13.03 |
|  | gpt-oss-120b | 55.6 | 78.1 | 63.8 | 34.7 | 82.6 | 58.21 | 3.24 |
| Complete Graph | ✓ | ✗ | gpt-oss-20b | 49.6 | 69.5 | 62.2 | 23.2 | 80.4 | 50.77 | 1.01 |
|  | MiniMax-M3 | 60.6 | 82.6 | 62.8 | 38.2 | 83.3 | 61.65 | 27.34 |
|  | gpt-oss-120b | 65.7 | 80.0 | 69.5 | 51.3 | 78.7 | 66.70 | 10.13 |
| LLM-Debate | ✓ | ✗ | gpt-oss-20b | 53.0 | 70.8 | 60.7 | 20.6 | 80.4 | 51.12 | 0.90 |
|  | MiniMax-M3 | 42.4 | 80.8 | 63.6 | 29.9 | 79.0 | 53.86 | 6.10 |
|  | gpt-oss-120b | 63.1 | 79.0 | 66.7 | 46.6 | 82.6 | 64.18 | 3.79 |
| AutoGen | ✓ | ✗ | gpt-oss-20b | 47.6 | 68.0 | 58.3 | 18.3 | 81.2 | 47.95 | 0.36 |
|  | MiniMax-M3 | 45.9 | 81.9 | 67.6 | 36.1 | 84.0 | 57.57 | 6.93 |
|  | gpt-oss-120b | 63.9 | 78.5 | 68.3 | 47.0 | 81.6 | 64.56 | 6.74 |
| GPTSwarm | ✓ | ✗ | gpt-oss-20b | 48.0 | 70.8 | 62.0 | 17.3 | 77.5 | 48.93 | 0.52 |
|  | MiniMax-M3 | 47.1 | 80.8 | 66.5 | 30.4 | 81.9 | 55.80 | 10.87 |
|  | gpt-oss-120b | 65.9 | 79.6 | 68.4 | 48.3 | 84.8 | 65.90 | 8.33 |
| AgentPrune | ✓ | ✗ | gpt-oss-20b | 48.6 | 71.0 | 57.2 | 18.8 | 77.5 | 48.88 | 0.72 |
| GraphRouter | ✗ | ✓ | LLM Pool | 44.2 | 65.2 | 58.7 | 24.7 | 78.9 | 47.97 | 0.35 |
| RouterDC | ✗ | ✓ | LLM Pool | 44.0 | 72.6 | 60.7 | 25.3 | 81.3 | 50.39 | 0.24 |
| BAMAS | ✓ | ✓ | LLM Pool | 45.3 | 78.7 | 67.2 | 35.9 | 76.8 | 56.15 | 4.93 |
| MasRouter | ✓ | ✓ | LLM Pool | 67.4 | 80.8 | 67.8 | 49.3 | 82.6 | 66.80 | 14.15 |
| MeterRouter | ✓ | ✓ | LLM Pool | 64.2 | 83.6 | 72.2 | 46.8 | 86.6 | 66.72 | 2.56 |

Accuracy. Table [1](#S5.T1) reports test accuracy and cost per query, with MeterRouter at B=5×10−2B=5\times 10^{-2} and Nmax=5N_{\max}=5. MeterRouter reaches an average accuracy of 66.72%, 0.08 points below the most accurate baseline, MasRouter (66.80%), and 0.02 points above LLM-Debate with gpt-oss-120b (66.70%). Baseline results with three seeds in Appendix [D.1](#A4.SS1). It is the most accurate method on MuSR (72.2%) and MBPP+ (86.6%). BBEH is its weakest benchmark: there, LLM-Debate with gpt-oss-120b is 4.5 points more accurate.

Figure 2: Accuracy versus cost per query on each benchmark and on the overall average. The dashed line is the Pareto frontier; marker shape denotes the method and color the backbone LLM.

Cost–accuracy trade-off. MeterRouter spends 2.56×10−32.56\times 10^{-3} $ per query on average, 4×4\times less than LLM-Debate and 5.5×5.5\times less than MasRouter. Fig. [2](#S5.F2) shows that it lies on the Pareto frontier of all five benchmarks and of the overall average, so no baseline is both more accurate and cheaper. On the overall front, MeterRouter sits at the point where extra spending stops paying off: LLM-Debate with gpt-oss-120b costs about 4×4\times more but is 0.02 points less accurate. Compared with BAMAS, whose predefined tier-based preference systematically favors high-tier models (MiniMax-M3), our method can instead select mid- or low-tier models when they perform better.

### 5.3 Ablation Study

Table 2: Ablation studies of MeterRouter. Cost is measured in units of $ ×10−3\times 10^{-3}.

| Method | OmniMath-2 | MMLU-Pro | MuSR | BBEH | MBPP+ | Acc. | Cost |
| MeterRouter | 64.2 | 83.6 | 72.2 | 46.8 | 86.6 | 66.72 | 2.56 |
| w/o RL | 53.7 | 75.9 | 67.2 | 34.2 | 79.2 | 57.34 | 2.55 |
| B=$5×10−3B=\$5\times 10^{-3} | 60.4 | 81.4 | 69.4 | 35.0 | 85.5 | 61.42 | 1.96 |
| B∈{$1,$4}×10−3B\in\{\$1,\$4\}\times 10^{-3} | 56.2 | 73.8 | 62.4 | 31.3 | 82.2 | 56.06 | 1.53 |
| Max agents = 4 | 65.5 | 82.2 | 71.6 | 45.2 | 84.8 | 66.08 | 2.47 |
|    w/o RL | 52.1 | 74.5 | 64.0 | 33.5 | 81.2 | 55.92 | 2.84 |
| B=$5×10−3B=\$5\times 10^{-3} | 58.0 | 78.0 | 68.8 | 33.7 | 83.3 | 59.30 | 1.47 |
| B∈{$1,$4}×10−3B\in\{\$1,\$4\}\times 10^{-3} | 56.3 | 73.4 | 58.7 | 32.5 | 80.8 | 55.73 | 1.27 |
| Max agents = 6 | 65.1 | 83.1 | 69.1 | 45.1 | 84.2 | 65.85 | 3.44 |
|    w/o RL | 53.8 | 75.0 | 65.7 | 34.7 | 79.9 | 57.07 | 3.19 |
| B=$5×10−3B=\$5\times 10^{-3} | 57.4 | 79.9 | 66.3 | 35.8 | 83.2 | 59.90 | 1.81 |
| B∈{$1,$4}×10−3B\in\{\$1,\$4\}\times 10^{-3} | 54.3 | 76.3 | 63.6 | 31.6 | 82.1 | 56.49 | 1.64 |

Table [2](#S5.T2) varies one factor at a time: whether RL is used, the budget, and the maximum number of agents NmaxN_{\max}. SFT learns a prior over topologies and roles but leaves model routing at its uniform initialization; RL then fine-tunes the whole policy, learning the LLM allocation and how to respond to the realized cost. At Nmax=5N_{\max}=5, replacing RL with random LLM selection (w/o RL) lowers average accuracy from 66.72% to 57.34%, with drops on all five benchmarks, while cost barely changes (2.552.55 vs. 2.56×10−32.56\times 10^{-3} $ per query). RL gives a similar gain at the other two agent caps.

We run two further ablations to separate the two stages. First, to separate graph construction from LLM allocation, we train MeterRouter with a single backbone (gpt-oss-120b), so it builds the graph but cannot choose models (Appendix [D.2](#A4.SS2)). It is only 3.19 points below the full model, and it is more accurate and cheaper than the same-backbone Chain, Tree, and Complete Graph baselines. Second, we fix the topology and train only the LLM allocation with RL (Appendix [D.3](#A4.SS3)). This variant lies on the cost–accuracy frontier in Fig. [6](#A4.F6), so RL alone learns an efficient allocation. However, fixing the topology costs 7.03 to 7.51 points of accuracy, more than twice the drop from using a single backbone. Graph construction therefore accounts for most of the gain, and LLM allocation adds the rest.

Budget compliance. Nearly every query stays within its budget. The in-budget rate is at least 99.98% at every tested budget (Table [8](#A4.T8)). The rare overruns occur because one byte-based estimate is used for all LLMs, while each LLM counts input tokens differently. Counting input tokens with each LLM’s own tokenizer before the call would make the estimate exact without changing the framework. Every call would then satisfy Ci≤cmiin​Tiin+cmiout​qi≤biC_{i}\leq c^{\mathrm{in} }_{m_{i} }T^{\mathrm{in} }_{i}+c^{\mathrm{out} }_{m_{i} }q_{i}\leq b_{i}, so no query could exceed its budget. Appendix [D.4](#A4.SS4) reports how often each query ends by a learned stop, the agent cap, or the budget, and how often answers are truncated or exceed the budget.

Agent cap. The agent cap has little impact on accuracy because it is rarely reached. As shown in Fig. [4](#S5.F4) for MMLU-Pro, most runs terminate through the learned stopping policy before hitting the maximum number of agents. Across Nmax∈{4,5,6}N_{\max}\in\{4,5,6\}, average accuracy varies by less than one point (65.85% to 66.72%, highest at Nmax=5N_{\max}=5), so the policy sets the graph size itself and does not depend on a tuned cap.

Budget allocation. Fig. [4](#S5.F4) examines how MeterRouter allocates additional budget on Omni-MATH-2 and MMLU-Pro when Nmax=4N_{\max}=4, the two benchmarks whose generated systems change most with the budget. The two benchmarks spend the extra budget in different ways. On Omni-MATH-2, the router keeps gpt-oss-120b for about 92% of agents at every budget but builds larger systems: the mean number of agents rises from 1.22 at B=5×10−3B=5\times 10^{-3} to 3.13 at 5×10−25\times 10^{-2}, and 42.5% of queries use four agents. On MMLU-Pro, the team size stays near 1.4 agents, and the budget instead buys a stronger backbone: the share of agents on MiniMax-M3 rises from 59% at B=10−3B=10^{-3} to 93% at 5×10−35\times 10^{-3}. The right panel shows that cost stays within the budget at every level, but its distribution changes with the budget. spending clusters near BB under tight budgets but varies more across queries at B=5×10−2B=5\times 10^{-2}, where the budget is no longer binding.

Figure 3: How MeterRouter adapts the MAS it generates to the per-query budget BB on OmniMath-2 and MMLU-Pro. Left: share of queries by the number of agents used. Middle: share of agents assigned to each backbone LLM. Right: distribution of per-query cost on a log scale. Each violin spans the min to max cost. Figure 4: Budget use across problem difficulty on OmniMath-2 (Easy <4<4, Medium 44–5.55.5, Hard ≥5.5\geq 5.5). Left: accuracy of MeterRouter at each budget. Right: change from B=5×10−3{B=5\times 10^{-3} } to B=5×10−2{B=5\times 10^{-2} }.

Gains by difficulty. Omni-MATH-2 assigns each query a difficulty level, and Fig. [4](#S5.F4) breaks down MeterRouter’s accuracy by difficulty and budget. The left panel shows that accuracy falls with difficulty at every budget and that the budget matters more on harder problems. The right panel shows that the larger budget, together with larger agent teams, improves accuracy on medium and hard problems but gives little benefit on easy ones.

Changing prices and extensible LLM pools. MeterRouter handles new LLM prices and new LLMs without any change to its architecture. On MMLU-Pro, after price-paired training, the share of queries that assign gpt-oss-120b to the first agent falls from 92.1% to 0.0% as its price rises from 0.1×0.1\times to 10×10\times (Appendix [D.5](#A4.SS5)). Retrained with a fourth backbone, Qwen3.8-27B, the router gains 2.1 points on Omni-MATH-2 and 2.5 points on BBEH at 8% and 2% higher cost, and it stays on the Pareto frontier (Appendix [D.6](#A4.SS6)).

## 6 Conclusion

We presented MeterRouter, which builds a multi-agent system for each query under a monetary budget, choosing each agent’s role, backbone LLM, and incoming connections one at a time. Because every call is metered before the next decision, the router spends the remaining budget based on actual costs, and overruns are rare. Across five benchmarks, it matches the strongest multi-agent baselines in average accuracy at a fraction of their cost and lies on the cost–accuracy Pareto frontier.

## AI Use Statement

LLMs play two distinct roles in this work. *As objects of study:* gpt-oss-20b, gpt-oss-120b, and MiniMax-M3 serve as agent backbones in MeterRouter and in all baselines. They are accessed through the Ollama Cloud API with the settings in Section [5.1](#S5.SS1), and all reported accuracies and costs are produced by these calls. *As writing assistants:* ChatGPT and Claude were used to polish the grammar and wording of author-written text.

## Ethics Statement

This work aims to improve the cost efficiency and accessibility of multi-agent language model systems through budget-aware routing. Our experiments use publicly available benchmarks and focus on routing among frozen language models. We do not anticipate specific ethical concerns arising from the proposed routing method. However, MeterRouter may inherit biases, factual errors, and harmful outputs from its underlying models. Responsible deployment should therefore include appropriate safeguards, privacy protections for queries sent to external providers, and human oversight in sensitive applications

## Reproducibility Statement

We have made efforts to ensure the reproducibility of our results. The full method, including the router architecture, the budget meter, and both training stages, is specified in Section 4, with supplementary functions in Appendix [B](#A2) and pseudocode in Appendix [C](#A3). All five benchmarks are publicly available; data splits are given in Table [5](#A4.T5.fig1) and the complete role prompts in Appendix [F](#A6). All backbone LLMs are accessed through Ollama Cloud API, and costs are computed at the fixed per-token rates in Table [6](#A4.T6.fig1). Hyperparameters of MeterRouter are listed in Table [4](#A2.T4), and the configurations of all baselines in Appendix [G](#A7). Source code will be made publicly available.
