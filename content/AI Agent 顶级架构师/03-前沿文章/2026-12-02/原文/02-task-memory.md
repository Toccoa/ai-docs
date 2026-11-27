# TASK Memory: Beyond Text-Only Memory with Activation Steering and Knowledge Editing against Memory Hallucination

Affiliation: Jinkun Zhao Affiliation: Wenjun Wu Affiliation: SKLCCSE, Institute of Artificial Intelligence Beihang University, Beijing, China Affiliation: Beijing Advanced Innovation Center for Future Blockchain and Privacy Computing Beihang University, Beijing, Chinawwj09315@buaa.edu.cn

###### Abstract

LLM agents increasingly rely on external memory, yet they still hallucinate about what they remember. Much of this is not a storage error: the correct memory is retrieved and placed in the prompt, but the answer contradicts it, or the memory is applied to the wrong question. We call these *use-time memory hallucinations*. Across five open models, we find that they come from the conflict between the model’s parametric knowledge and its external memory, and that they take three forms. In *memory-ignoring* hallucination, the model returns to a stale fact stored in its weights despite the memory, in up to 46% of queries. In *memory-misapplying* hallucination, it attributes the memory to unrelated neighbour entities, in up to 24% of cases, and in up to 49% once retrieval is combined with weight editing. In *version confusion*, 53% of answers about revised facts assert the superseded value when both versions remain stored. We propose TASK memory, a memory that is not text alone: each memory combines a Text note with Activation Steering and Knowledge editing, which act inside the model. The three carriers share one in-model address. The text T holds the content. A local, removable knowledge edit E supplies the address through its subject key and supports multi-hop composition through its weight change. A pair of activation-steering vectors S decides, query by query, whether the model should adopt the memory or keep its own answer. S stores no content; it controls how the model uses the text memory, rather than writing new memory into the parameters. On frozen off-the-shelf models, under a pre-registered, test-once protocol, TASK reduces memory-ignoring hallucinations to ≤\leq1.5% in all ten model–dataset cells, and cuts neighbour misuse from 39.2% to 7.5% (+10.8 pp composite on CounterFact). It also improves a 300-memory library over BM25 RAG by 16.4 pp, an advantage that holds at 3,000 memories, resolves fact revisions without fact IDs, and adds 7.5 pp of multi-hop accuracy on MQuAKE. 21 of 23 cross-model comparisons (8B–27B, four families) are significant, and TASK beats three recent context-steering methods in 9 of 10 model–dataset cells.

## 1 Introduction

Figure 1: Memory hallucination: the memory is correct, the answer is not. (a) Text-only memory or RAG puts the retrieved note into the prompt and leaves the rest to the frozen model, where the note in the context conflicts with the stale fact in the weights. On a question about the memory, the weights win and the model answers with the stale fact (Type I, memory-ignoring). On a question about another entity, the note wins and the model assigns the memory to the wrong entity (Type II, memory-misapplying). Across our five models these rates reach 46% and 24%, and Type II reaches 49% when retrieval is combined with weight editing. (b) TASK memory goes beyond text-only memory. Each memory object holds Text content, a Knowledge edit Δ​Wm\Delta W_{m} whose key u^m\hat{u}_{m} serves as the in-model address, and a pair of Activation-Steering vectors (v+,v−)(v^{+},v^{-}) that carry no content. For a query xx, the address response rm​(x)r_{m}(x) is compared with the threshold τm\tau_{m}. A relevant query shows T, loads E and adds v+v^{+}, so the model adopts the memory; an unrelated query leaves T and E off and adds v−v^{-}, so the model keeps its own answer.

Agents built on large language models (LLMs) keep meeting facts that their weights do not contain, or contain in an outdated form: a person changes jobs, a user replaces a device, an API is deprecated. The dominant way to remember such facts is *text memory*. The fact is written as a note, stored in a memory store, and retrieved into the prompt when a related question arrives [[22](#bib.bib1), [36](#bib.bib2), [37](#bib.bib3), [62](#bib.bib4), [8](#bib.bib5), [54](#bib.bib6)]. Agents with memory still hallucinate. HaluMem [[6](#bib.bib61)] shows that memory systems introduce hallucinations when they extract and update memories, and that these errors carry into question answering. That diagnosis locates the error in what is *stored*. Here we study the complementary failure: *the stored memory is correct and is even in the prompt, yet the answer contradicts it, or the memory is applied where it does not belong.* We call these use-time memory hallucinations. They are a form of context-conflicting (unfaithful) hallucination [[57](#bib.bib63), [16](#bib.bib62)] in which the conflicting context is the agent’s own memory.

Use-time memory hallucinations arise because the memory is not read by a blank slate. The model already holds parametric knowledge about the same entities, and the note and the weights compete inside every forward pass. Such knowledge conflicts are known from question answering over retrieved passages [[28](#bib.bib39), [52](#bib.bib40), [53](#bib.bib41)]. We measure them in the agent-memory setting, on five open models (Qwen3-8B/14B, Llama-3.1-8B, Phi-4, Gemma-3-27B) and three memory settings, and find three types ([Figure 2](#S1.F2)). The first, memory-ignoring hallucination (Type I), is parametric override. When we split queries by whether the no-memory model still states the pre-update fact, text memory turns out to be adopted 14.8–28.6 pp less often on queries whose stale fact is stored in the weights, in five of ten model–dataset cells ([Figure 2](#S1.F2)a). On those queries the model asserts the stale answer in 4.9–46.3% of cases, even though the correct note is in the prompt. The second, memory-misapplying hallucination (Type II), runs in the opposite direction. On neighbour questions that share the relation but not the subject, and that the no-memory model answers correctly, the model attributes the note’s answer to the wrong entity in 5.3–24.3% of cases on CounterFact, against less than 1% without memory. A natural “RAG + editing” design, which adds a weight edit to the text memory, raises this rate to as much as 49% ([Figure 2](#S1.F2)b). The third, version-confusion hallucination (Type III), appears once facts are revised: when both versions remain in the store, 53% of answers about revised facts assert the superseded value (Qwen3-8B, BM25 RAG; [Appendix C](#A3)).

Figure 2: Use-time memory hallucinations caused by the conflict between parametric knowledge and external memory (test splits, text memory in context, greedy decoding). (a) Type I, memory-ignoring: adoption of the memory’s answer on paraphrased questions. Filled markers: queries on which the no-memory model states the stale fact, i.e. the old fact is in the weights. Hollow markers: all other queries. The gap is in percentage points; ∗ marks a paired world-level bootstrap 95% CI that excludes 0. (b) Type II, memory-misapplying: on neighbour questions (same relation, different subject) that the no-memory model answers correctly, the rate at which the model instead states the memory’s answer. Without memory this is ≤\leq0.9%. With text memory it rises on every model, and with text memory plus a weight edit (T+E) it rises further on four of the five models. All numbers come from frozen predictions ([Appendix A](#A1)).

Because Types I and II pull in opposite directions, no single global remedy fixes both, and each existing family of methods addresses at most one of them. Better retrieval decides which note enters the prompt, but not how the model weighs it against its weights. Context-faithfulness methods, such as contrastive decoding [[42](#bib.bib42)] and global steering directions [[2](#bib.bib43), [29](#bib.bib44), [59](#bib.bib45)], push the model towards the context uniformly and thereby trade Type I for Type II; in our experiments an ungated evidence direction raises misuse and lowers the composite score below that of text memory alone (0.780 vs. 0.811). Knowledge editing [[32](#bib.bib13), [33](#bib.bib14), [11](#bib.bib15)] writes the fact into the weights, which amplifies Type II when it is combined with text memory ([Figure 2](#S1.F2)b), and a joint closed-form patch over accumulating versions collapses ([Section 5.2](#S5.SS2)). Memory-native models such as MemT-1.0 [[31](#bib.bib29)] go further and move the memory *content* itself into the model: MemT-1.0 trains native memory blocks on 34B tokens, writes the interaction history into a dynamic memory state, and reads it back through a parallel memory attention. This changes *where* the memory lives, but not *who arbitrates* when the stored item and the weights disagree. Its memory modules are trained to imitate the backbone given the full textual history, so they inherit the backbone’s way of using context, and in their own evaluation conflicts with real-world knowledge are handled by an instruction to answer “from the knowledge pool … rather than the real facts in real world”.

We take a different view: *using* a memory is a separate, controllable decision, and use-time memory hallucination is a failure of that decision. For each query the model must decide whether a note should override what it already believes. That decision is made inside the network, so it can be read out and steered there. We therefore propose TASK memory, which goes beyond text-only memory by coupling each Text note with Activation Steering and Knowledge editing, two carriers that act inside the model and share one in-model address ([Figures 1](#S1.F1) and [3](#S3.F3)). The text T carries the content, a versioned note that tells the model *what* the fact is. The activation-steering carrier S carries the use policy: a pair of residual-stream vectors, of which v+v^{+} makes the model adopt the note when the address fires, countering Type I, and v−v^{-} makes it keep its parametric answer when the note is present but the query concerns something else, countering Type II. The knowledge-editing carrier E is a closed-form, removable MLP edit keyed on the subject’s internal representation [[32](#bib.bib13), [13](#bib.bib12)]. Its key doubles as the memory’s address, so that one partial forward pass tells whether a query is about this memory, and its weight change supports multi-hop composition. At read time the address gates all three carriers at once, deciding which notes are shown, which patches are loaded and which steering direction is applied. Relevance is thus judged in one place, the model’s own representation, rather than separately by a retriever, an editor and a steering rule. When a fact is revised, the old version’s text, patch and vectors are retired together, which removes Type III.

The steering carrier is deliberately not a memory store. Without the text note it answers 1.7% of CounterFact queries, the same as the unmodified model. What it changes is the arbitration: memory-ignoring hallucinations fall to at most 1.5% in all ten model–dataset cells, and neighbour misuse falls from 39.2% to 7.5% (Qwen3-8B, CounterFact). This is the key difference from parametric-memory approaches such as knowledge editing, parametric RAG [[43](#bib.bib27)] and MemT-1.0, which put new *content* into weights or a trained memory state. TASK keeps content in text, where it can be inspected, versioned and deleted, and writes into the model only a bidirectional controller that applies to a single memory and can be removed.

We evaluate TASK memory on five frozen models from four families (8B–27B) and six benchmarks under a pre-registered protocol. On single facts it improves over text memory by 10.8 pp on CounterFact and 5.7 pp on zsRE (Qwen3-8B, composite of adoption and locality). For an agent holding 300 memories it improves over BM25 RAG by 16.4 pp and 16.2 pp, mainly by removing Type II hallucinations caused by retrieved distractors, and the advantage holds at 3,000 memories (0.926 for address-verified T +S vs. 0.731). Address-assisted supersession, which needs no fact IDs, raises accuracy on revised facts by 48.7–54.7 pp, and on MQuAKE the weight carrier adds 7.5 pp of multi-hop accuracy. Across models, 21 of 23 comparisons are significant, and TASK beats knowledge-selection steering [[29](#bib.bib44)], ContextFocus [[2](#bib.bib43)] and CAST [[20](#bib.bib52)] in 9 of 10 model–dataset cells. The experiments also reveal a clear division of labour among the carriers: the weight change of E matters for composition but not for single facts, and training the steering vectors on the edited model brings no reliable gain over training them on the base model.

#### Contributions.

First, we define use-time memory hallucination and its three types, and show on five models that memory-ignoring and memory-misapplying hallucinations arise from the two-way conflict between parametric knowledge and external memory, with weight edits added to retrieval amplifying the latter ([Figure 2](#S1.F2)). Second, we propose TASK memory, which combines text, activation steering and knowledge editing in one memory object: text carries the content, a removable edit provides an in-model address and compositional recall, and a paired adopt/restrain steering policy arbitrates each query, with the address gating prompt, weights and activations together across a write, read and revision lifecycle that detects revisions without fact IDs. Third, we provide pre-registered evidence on five models against twelve published baselines, together with an analysis showing that S learns a shared adopt/restrain direction plus a memory-specific residual that is effective only behind the address gate.

## 2 Related Work

#### Hallucination and memory hallucination.

Hallucination surveys separate output that conflicts with world facts from output that conflicts with the input or context the model was given [[17](#bib.bib64), [57](#bib.bib63), [16](#bib.bib62)]. Agent memory adds a new source of context, so it adds new ways to hallucinate. HaluMem [[6](#bib.bib61)] evaluates memory systems operation by operation (extraction, updating, question answering). It finds that hallucinations are introduced and accumulate when memories are extracted and updated, and then propagate into answers. Its remedy is to store the right memories. We study what remains when the stored memory *is* right: the model can still ignore it, misapply it to another entity, or answer from a superseded version. These use-time memory hallucinations are context-conflicting hallucinations caused by the conflict between parametric knowledge and the agent’s own memory. They cannot be fixed by better storage alone, which is why TASK intervenes in how the model *reads* a memory.

#### Text memory for agents.

Most agent memories store natural-language records and retrieve them into the prompt. Examples are retrieval-augmented generation [[22](#bib.bib1)], operating-system-style paging [[36](#bib.bib2)], reflective memory streams [[37](#bib.bib3)], forgetting-curve stores [[62](#bib.bib4)], and production systems that extract, consolidate and link memories [[8](#bib.bib5), [54](#bib.bib6)]. Long-conversation benchmarks such as LoCoMo [[30](#bib.bib7)] and LongMemEval [[51](#bib.bib8)] measure whether the right memory is retrieved and answered from. These systems optimise *what reaches the context*. TASK is complementary: it keeps a text store and controls *how the model uses* what reaches the context. On LoCoMo we compare against Mem0 and A-Mem with the same answering model.

#### Parametric memory: editing, parametric RAG and memory-native models.

*Knowledge editing* writes facts into weights. Locate-then-edit methods treat MLPs as key–value stores [[13](#bib.bib12)] and insert closed-form updates: ROME [[32](#bib.bib13)], MEMIT [[33](#bib.bib14)], and AlphaEdit [[11](#bib.bib15)] with null-space constraints. Memory-based editors keep side memories with scope classifiers or codebooks: SERAC [[35](#bib.bib18)], GRACE [[15](#bib.bib17)], WISE [[47](#bib.bib16)], Larimar [[9](#bib.bib24)]. IKE [[60](#bib.bib19)] edits in context, and RECIPE [[7](#bib.bib30)], DeCK [[3](#bib.bib31)] and LightEdit [[19](#bib.bib32)] combine retrieval with prompts or decoding that suppress the old fact. Sequential editing remains fragile [[26](#bib.bib33), [56](#bib.bib20)]. Our E follows the ROME lineage; what differs is how TASK uses it. The edit’s subject key also serves as the address that gates text and steering. Each memory keeps its own patch, loaded only when its address fires, and a patch is retired when its memory is revised. *Parametric RAG* turns documents into LoRA weights generated by a hypernetwork and combines them with text RAG [[43](#bib.bib27), [44](#bib.bib28)]. This resembles our T +E, but without per-query arbitration. *Memory-native models* make memory part of the architecture. MemoryLLM [[50](#bib.bib25)] keeps a self-updating memory pool inside the transformer, and Temp-LoRA [[49](#bib.bib26)] trains a temporary adapter on the history. MemT-1.0 [[31](#bib.bib29)] is the most recent and most scaled example. It adds native memory blocks to selected layers. A dynamic per-trajectory memory state is written token by token with a gated delta rule and read through a parallel memory attention, and Mixture-of-Storage scales its capacity. The memory modules are trained with the backbone frozen, on 34B tokens of continued pre-training and post-training, by distilling the backbone that sees the full textual history. After writing, the history text is no longer needed in context. MemT-1.0 and TASK both bring memory into the model’s computation, but they put different things there ([Table 1](#S2.T1)). MemT-1.0 internalises the *content* of the history in a trained, fixed-size state; it is evaluated on recall and use of that history, and its training target is the backbone’s own full-context behaviour. TASK leaves the content in an inspectable text store and writes into the model only a per-memory *use policy*, an address and an adopt/restrain steering pair, which act on a frozen, off-the-shelf model without any pre-training. The two are therefore orthogonal. TASK targets the arbitration failures of [Figure 2](#S1.F2), which full-context imitation does not address by construction. A memory-native model could also expose its memory readout to the same kind of address-gated steering.

#### Knowledge conflicts and context faithfulness.

LLMs can over-rely on parametric knowledge and ignore context [[28](#bib.bib39)]. They can also be very receptive to coherent but wrong context [[52](#bib.bib40)]. Both behaviours are surveyed by [Xu et al. [53]](#bib.bib41). Existing remedies push the model towards the context, through contrastive decoding (CAD) [[42](#bib.bib42)], attention-head or SAE-feature interventions [[23](#bib.bib46), [59](#bib.bib45)], adaptive gating of parametric participation [[25](#bib.bib47)], or global steering directions that favour the context, such as ContextFocus [[2](#bib.bib43)] and the knowledge-selection direction (KSD) of [Lou et al. [29]](#bib.bib44), a signed diff-of-means direction that transfers across conflict types and models. These methods treat faithfulness as a global property of a prompt. In an agent memory the same note is relevant to some queries and irrelevant to others, so a global push turns parametric override into memory override. TASK makes the decision per memory and per query: the address selects between an adopt and a restrain vector. We compare directly against CAD, KSD, ContextFocus and CAST on five models.

#### Activation steering, and steering as memory.

Adding vectors to the residual stream steers behaviour: ActAdd [[46](#bib.bib48)], CAA [[39](#bib.bib49)], ITI [[24](#bib.bib50)], representation engineering [[64](#bib.bib51)]. CAST [[20](#bib.bib52)] applies a behaviour vector only when the hidden state is similar to a condition vector. We share the idea of gating, but our gate is a per-memory address taken from the edit key. Our steered behaviour is evidence use, not refusal. Several works store knowledge *as* activations or representation edits: SAKE [[41](#bib.bib34)], REACT [[61](#bib.bib35)], MEGA [[4](#bib.bib37)], RILKE [[27](#bib.bib36)]. Neural Procedural Memory [[58](#bib.bib53)] stores agent skills as retrieved steering vectors and finds them complementary to textual workflow memory. [Jumle [18]](#bib.bib54) show that facts barely survive when stored as steering alone (at most 15% clean use, against 96–98% in context). This negative result is consistent with our design choice: TASK never asks S to carry content (S alone: 1.7%), only to control how text content is used. [Chavira Juárez et al. [5]](#bib.bib38) argue conceptually that memory agents should divide labour among retrieval, steering and weight editing. TASK gives one concrete instance of that division, with experiments.

Table 1: Where the memory lives and who arbitrates. “Content in model”: whether the fact or history itself is written into weights or a trained state. “Arbitration”: how the system decides, per query, between the memory and parametric knowledge.

| Paradigm | Memory content | Written into the model | Base-model training | Arbitration with parametric knowledge | Per-memory removal |
| Text memory / RAG [[22](#bib.bib1), [8](#bib.bib5), [54](#bib.bib6)] | text | nothing | none | left to the model | delete record |
| Knowledge editing [[32](#bib.bib13), [33](#bib.bib14), [11](#bib.bib15)] | weights | fact (weight delta) | none | edit replaces parametric fact | partly (side memories) |
| Context-faithfulness steering [[2](#bib.bib43), [29](#bib.bib44), [42](#bib.bib42)] | text | one global direction / decoding rule | none | always favour context | – |
| Parametric RAG [[43](#bib.bib27)] | text + generated LoRA | document content | hypernetwork | left to the model | drop adapter |
| MemT-1.0 [[31](#bib.bib29)] | trained native memory state | history content | 34B-token memory training | imitate full-context backbone | no (fixed-size state) |
| TASK (ours) | text (+ local patch) | address + adopt/restrain policy | none (frozen) | per query, address-gated v+v^{+}/v−v^{-} | yes (versioned, unloadable) |

## 3 Method: TASK Memory

Figure 3: TASK memory overview. (a) Write. A visible observation (s,p,o∗)(s,p,o^{*}) is compiled into a memory object bound to the model hash, scope and version. The object contains a text record T, an address key kmk_{m} at layer ℓE\ell_{E} with a threshold τm\tau_{m} calibrated at write time, a closed-form, low-rank and removable patch E keyed on the same address, and steering vectors S =(vm+,vm−)=(v^{+}_{m},v^{-}_{m}) trained on the frozen model; these are kept in a text store, a patch library and a steering bank. (b) Read, against memory-ignoring (Type I) and memory-misapplying (Type II) hallucination. Candidates are retrieved by BM25 or semantic search, and one partial forward pass to layer ℓE\ell_{E} computes each candidate’s address response rmr_{m}. The shared gate gm=𝟙[rm≥τm]g_{m}=\mathbb{1}[r_{m}\geq\tau_{m}] decides whether the note is shown, whether the patch is loaded as W+B​AW+BA, and whether vm+v^{+}_{m} or vm−v^{-}_{m} is added at the decision positions of layer ℓS\ell_{S}; multi-hop composition uses v+v^{+} only. All hooks and patches are unloaded after generation. (c) Revise, against version confusion (Type III). A new observation is matched to the top-2 active records by BM25, checked with the address and judged by the agent’s own model. On update the old version’s T, E and S are retired together; on different the existing record stays active. No fact IDs are used.

### 3.1 Setting and notation

An agent runs a frozen decoder-only LM fθf_{\theta} with residual stream ht(ℓ)∈ℝdh^{(\ell)}_{t}\in\mathbb{R}^{d} at layer ℓ\ell and token tt. During deployment it receives *observations*, i.e. facts it is allowed to see, and later *queries*. A structured memory mm comes from one observation: a subject sms_{m}, a relation prompt pmp_{m} that contains sms_{m}, and a new object om∗o^{*}_{m}. A free-form memory is a sentence extracted from a dialogue session.

#### Use-time memory hallucination.

Let omoldo^{\text{old} }_{m} be the pre-update object, and let 𝒩m\mathcal{N}_{m} be the neighbour queries that are not about mm but that the no-memory model answers correctly. Given a correct memory mm in the store, an answer yy to query xx is a *memory-ignoring* hallucination (Type I) if xx is about mm and yy asserts omoldo^{\text{old} }_{m} instead of om∗o^{*}_{m}; a *memory-misapplying* hallucination (Type II) if x∈𝒩mx\in\mathcal{N}_{m} and yy asserts om∗o^{*}_{m}, attributing the memory to the wrong entity; and a *version-confusion* hallucination (Type III) if mm has been revised to m′m^{\prime} and yy asserts om∗o^{*}_{m} instead of om′∗o^{*}_{m^{\prime} }. Avoiding the first two requires *adoption*, answering om∗o^{*}_{m} on queries about mm even when the weights hold the stale object, and *restraint*, answering as the model would without mm on queries that are not about mm, even when mm is in the context. TASK assigns these requirements to different components: the steering pair provides adoption and restraint against Types I and II, the address decides which memories are in play at all, and supersession at revision time removes Type III.

### 3.2 The memory object

#### T: content.

A JSONL record holds the fact text, scope, version, source, a retrieval key (subject and relation cue) and a supersedes link. T is the only carrier of content in TASK memory.

#### Address.

Let kt∈ℝdffk_{t}\in\mathbb{R}^{d_{\text{ff} }} be the input of the down-projection of the MLP at layer ℓE\ell_{E} at token tt. Following the key–value view of MLPs [[13](#bib.bib12), [32](#bib.bib13)], the key of mm is

| km=𝔼c​[kts​(c)],k_{m}=\textstyle\mathbb{E}_{c}\big[k_{t_{s} }(c)\big], |  |

the average of ktsk_{t_{s} } at the last subject token tst_{s} over a set of writer contexts cc. These contexts are the relation prompt, mined same-relation templates from the training split, the evidence-in-context form, and generic Wikitext prefixes. We estimate the second moment C=𝔼⁡[k​k⊤]C=\mathbb{E}[kk^{\top}] once on about 7×1057\times 10^{5} Wikitext tokens [[34](#bib.bib59)] and set

| um=C−1​km,u^m=umkm⊤​um,rm​(x)=maxt⁡u^m⊤​kt​(x).u_{m}=C^{-1}k_{m},\qquad\hat{u}_{m}=\frac{u_{m} }{k_{m}^{\top}u_{m} },\qquad r_{m}(x)=\max_{t}\ \hat{u}_{m}^{\top}k_{t}(x). | (1) |

By construction rm=1r_{m}=1 on the memory’s own key. Directions that ordinary text uses heavily are down-weighted by C−1C^{-1}. The threshold τm\tau_{m} is calibrated per memory at write time: it is the midpoint between the minimum response on the memory’s own contexts and the maximum response on hard negatives (same relation, other subjects). The gate is gm(x)=𝟙[rm(x)≥τm]g_{m}(x)=\mathbb{1}[r_{m}(x)\geq\tau_{m}]. For free-form facts, where the subject rarely appears verbatim in questions, we use a semantic address in the same spirit. The writer asks the model for three questions that the fact answers. The key is the centred, normalised mean-pooled layer-ℓS\ell_{S} state of these questions and the statement. τm\tau_{m} is calibrated against other memories’ self-questions, and the most similar candidate always passes.

#### E: a removable closed-form patch on the same key.

Following ROME [[32](#bib.bib13)], we optimise a residual δm\delta_{m} at the output of layer ℓE\ell_{E} with Adam (25 steps, lr 0.5). The objective is the likelihood of om∗o^{*}_{m} across the writer contexts, a KL term that keeps “{sm}\{s_{m}\} is a” unchanged, weight decay and a norm cap. The rank-one update

| Δ​Wm=δm​um⊤km⊤​umsatisfiesΔ​Wm​km=δm.\Delta W_{m}=\frac{\delta_{m}\,u_{m}^{\top} }{k_{m}^{\top}u_{m} }\quad\text{satisfies}\quad\Delta W_{m}k_{m}=\delta_{m}. | (2) |

For several memories we solve Δ​W=R​(λ​I+K⊤​C−1​K)−1​(C−1​K)⊤\Delta W=R(\lambda I+K^{\top}C^{-1}K)^{-1}(C^{-1}K)^{\top} with residuals RR and keys KK. Each patch is stored as low-rank factors and applied by a hook as the effective weight W+B​AW+BA. It is bound to the model hash and can be unloaded bit-exactly. In TASK, E plays two roles. Its key *is* the address of [Equation 1](#S3.E1), and its weight change provides associative recall that multi-hop questions can chain through ([Section 5](#S5)).

#### S: a paired use policy.

Each memory gets two vectors vm+,vm−∈ℝdv^{+}_{m},v^{-}_{m}\in\mathbb{R}^{d}. They are added to the residual stream at the output of layer ℓS\ell_{S}, only at the *decision positions*, i.e. the last prompt token and all generated tokens, so the encoding of the question itself is untouched:

| ht(ℓS)←ht(ℓS)+gm​(x)​vm++(1−gm​(x))​vm−.h^{(\ell_{S})}_{t}\leftarrow h^{(\ell_{S})}_{t}+g_{m}(x)\,v^{+}_{m}+\big(1-g_{m}(x)\big)\,v^{-}_{m}. | (3) |

Only the two vectors are trained; θ\theta is frozen, but gradients still flow through it. The objective has three terms:

| ℒm=\displaystyle\mathcal{L}_{m}=\; | 𝔼c∈𝒞m+​[−log⁡pθ,vm+​(om∗∣Tm,c)]⏟adopt+𝔼c∈𝒞m−[KL(pθ(⋅∣c)∥pθ,vm−(⋅∣Tm,c))]⏟restrain+λ​‖vm+‖2+‖vm−‖2rmsℓS2.\displaystyle\underbrace{\mathbb{E}_{c\in\mathcal{C}^{+}_{m} }\big[-\log p_{\theta,v^{+}_{m} }(o^{*}_{m}\mid\textsf{T}_{m},c)\big]}_{\text{adopt} }+\underbrace{\mathbb{E}_{c\in\mathcal{C}^{-}_{m} }\big[\mathrm{KL}\big(p_{\theta}(\cdot\mid c)\,\|\,p_{\theta,v^{-}_{m} }(\cdot\mid\textsf{T}_{m},c)\big)\big]}_{\text{restrain} }+\lambda\frac{\|v^{+}_{m}\|^{2}+\|v^{-}_{m}\|^{2} }{\mathrm{rms}^{2}_{\ell_{S} }}. | (4) |

The adopt term is taken over contexts 𝒞m+\mathcal{C}^{+}_{m} that ask about sms_{m} with the note present, where the gate is on and the gradient reaches vm+v^{+}_{m}. The restrain term is taken over hard negatives 𝒞m−\mathcal{C}^{-}_{m} that share the relation but not the subject and contain mm’s note, which is exactly where text memory is misused; there the gate is off, and vm−v^{-}_{m} is trained to reproduce what the model says *without* the note. Vectors are zero-initialised and trained with Adam for 40 steps at lr 0.02×rmsℓS0.02\times\mathrm{rms}_{\ell_{S} }. We call this version Sind{}_{\text{ind} }. A variant, Scond{}_{\text{cond} }, trains the vectors on the edited model θ+Δ​Wm\theta+\Delta W_{m} to test whether steering should compensate for the residual errors of the edit ([Section 5.1](#S5.SS1)); unless stated otherwise TASK uses Sind{}_{\text{ind} }.

### 3.3 Reading: one address, three gates

Given a query xx, BM25 [[40](#bib.bib11)] first returns candidates: the top two for structured memories, and the union of the BM25 and semantic top five for dialogue facts. One partial forward pass to layer ℓE\ell_{E} then yields rm​(x)r_{m}(x) for every candidate. Only memories with gm=1g_{m}=1 are shown as text and have their own single-memory patches loaded (summed; “gated E”), and their steering is applied by [Equation 3](#S3.E3). A single context manager owns all patch and steering hooks and removes them after generation. Relevance is thus decided once, by the model’s own representation, so the three interventions cannot contradict each other: a note is never shown without its patch, and an adopt vector is never applied to an unrelated query.

#### Read rule for composition.

v−v^{-} assumes that a query can be attributed to individual memories. In multi-hop questions the bridge entity does not appear in the question, so v−v^{-} would suppress evidence that is needed. For multi-hop composition we therefore apply only v+v^{+}, and paired steering elsewhere.

### 3.4 Revision and supersession

When a new observation arrives, BM25 retrieves the top two active records, the observation’s address response is checked against them, and the agent’s own frozen model judges with a fixed prompt whether the observation gives a new value for the same entity and attribute (update) or states a different fact (different). On update, the old record is superseded, and its E and S leave the active set together; no fact IDs, relation IDs or version numbers are involved. Retiring the old E is necessary because two versions have almost identical keys, and a joint closed-form solve over both collapses. Retiring the old S proves equally necessary, since otherwise the adopt vectors of both versions fire and each pushes its own object ([Section 5.2](#S5.SS2)).

## 4 Experimental Setup

#### Models.

We use five frozen open models from four families: Qwen3-8B (primary) [[38](#bib.bib55)], Llama-3.1-8B-Instruct [[14](#bib.bib56)], Qwen3-14B, Phi-4 (14B) [[1](#bib.bib57)] and Gemma-3-27B [[12](#bib.bib58)], all run in BF16 with greedy decoding (non-thinking mode for Qwen3). For each model, ℓE\ell_{E} is chosen on training-split worlds by one fixed rule, edit-only paraphrase accuracy over three candidate layers, which gives layers 6/4/9/7/11 in the order above; ℓS\ell_{S} is set by relative depth (14/13/16/16/25). All other hyperparameters were chosen once on Qwen3-8B development data and reused unchanged for every model.

#### Benchmarks and protocols.

The protocols vary along two axes: how the memory arrives (provided, retrieved from a library, or accumulated with revisions) and what form the fact takes (structured or free-form). The *provided-evidence* protocol isolates the use of a memory: CounterFact [[32](#bib.bib13)] and zsRE [[21](#bib.bib22)] each contribute 300 test worlds with one memory per world, and the note is in the context for both related and unrelated queries. In the *library* protocol, one agent holds all memories of the split (300, and 1k and 3k with training-split distractors) and must retrieve before reading. The *continual-revision* protocol inserts 100 facts and then revises 50 of them. Multi-hop composition is evaluated on MQuAKE-CF-3k [[63](#bib.bib21)] (200 cases, 600 questions), where only the edited base facts are written. Free-form dialogue memory is evaluated on LoCoMo [[30](#bib.bib7)], split by conversation into 2 development and 8 test conversations with 1,230 test questions of categories 1–4. Results on LongMemEval with oracle histories [[51](#bib.bib8)] and on AppWorld [[45](#bib.bib9)] with a local ReAct agent [[55](#bib.bib10)] are in [Appendix D](#A4).

#### Metrics.

*Adoption* is paraphrase and canonical accuracy on queries about the memory. *Restraint* is measured by locality preserved, i.e. one minus the damage rate on neighbour queries that the no-memory model answers correctly, and by *misuse*, the rate at which a neighbour answer asserts the memory’s object. These quantities map directly onto the hallucination types of [Section 3](#S3). The Type I rate is *reversion*, the fraction of answers that assert the pre-update object, reported on queries whose stale fact is stored in the weights; the Type II rate is misuse; and the Type III rate is the *stale-version rate*, the fraction of answers about a revised fact that assert the superseded value. The *composite* is the harmonic mean of paraphrase accuracy, canonical accuracy and locality preserved, so it is low whenever one of the three is low. Answers are classified by a normalised assertion matcher that ignores negated mentions. On LoCoMo we report LLM-judge accuracy under three judges (Qwen3-8B, Qwen3-14B and GLM-5.3) together with input tokens.

#### Baselines.

Six context-use methods receive the same note as TASK: IKE [[60](#bib.bib19)], CAD [[42](#bib.bib42)], CAA [[39](#bib.bib49)], KSD [[29](#bib.bib44)], ContextFocus [[2](#bib.bib43)] and CAST [[20](#bib.bib52)], with strengths tuned once on Qwen3-8B development data. The parametric carriers are ROME, MEMIT, AlphaEdit and WISE in their original EasyEdit implementations [[48](#bib.bib23)]. For dialogue we compare with Mem0 [[8](#bib.bib5)] and A-Mem [[54](#bib.bib6)], both ingesting every turn with the same local model, and with the full conversation in context. Control conditions replace S with norm-matched random vectors, vectors at the wrong layer, another memory’s vectors, or an ungated global evidence vector.

#### Protocol and statistics.

Train/dev/test splits are hashed by subject (or by conversation) and frozen before any model output. Hyperparameters and read rules were selected on train or dev data, the primary test comparisons were registered before their outputs existed, and each test set was run once. Confidence intervals are 95% paired-bootstrap intervals over worlds (or conversations, or subjects in clustered settings) with 2,000 resamples [[10](#bib.bib60)]; “significant” (∗) means that the interval excludes 0.

## 5 Results

We organise the results around three questions. RQ1 asks whether, once a correct memory is in context, TASK prevents memory-ignoring (Type I) and memory-misapplying (Type II) hallucinations. RQ2 asks whether, when one agent holds many memories that keep changing, the shared address reads the right ones and avoids version confusion (Type III). RQ3 asks whether updated facts can be composed with what the model already knows. [Table 2](#S5.T2) lists the pre-registered test comparisons on the primary model.

Table 2: Pre-registered test comparisons (Qwen3-8B; one frozen configuration; each test set run once). Δ\Delta in percentage points with 95% paired-bootstrap CI; bold and ∗: CI excludes 0. The upper bound 0.00 in the last row is exactly zero, so that interval includes 0. Composite = harmonic mean of paraphrase accuracy, canonical accuracy and locality preserved.

| Benchmark | TASK configuration | Baseline | TASK | Baseline | Δ\Delta [95% CI] |
| RQ1 | CounterFact (300 worlds) | T + S | T | 0.919 | 0.811 | +10.80 [7.80, 14.16]∗ |
| zsRE (300 worlds) | T + S | T | 0.892 | 0.835 | +5.65 [1.20, 10.20]∗ |
| LoCoMo (1,230 q.) | retrieved T + S | retrieved T | 0.342 | 0.328 | +1.38 [0.21, 2.75]∗ |
| RQ2 | CounterFact library (300) | address-verified T + gated E + S | BM25 RAG | 0.946 | 0.782 | +16.36 [12.99, 20.31]∗ |
| zsRE library (300) | address-verified T + gated E + S | BM25 RAG | 0.965 | 0.803 | +16.23 [11.29, 22.11]∗ |
| LoCoMo | semantic-address T + S | BM25 RAG | 0.342 | 0.308 | +3.41 [0.07, 7.05]∗ |
| LoCoMo | semantic-address T (text only) | BM25 RAG | 0.328 | 0.308 | +2.03 [-1.21, 5.51] |
| RQ3 | MQuAKE-CF-3k (600 q.) | T + E + S(v+v^{+}) | T | 0.765 | 0.690 | +7.50 [3.33, 11.83]∗ |
| Analysis | CounterFact | T + E + Scond{}_{\text{cond} } | T + E + Sind{}_{\text{ind} } | 0.883 | 0.867 | +1.55 [-1.41, 4.22] |
| zsRE | T + E + Scond{}_{\text{cond} } | T + E + Sind{}_{\text{ind} } | 0.882 | 0.891 | −-0.91 [-3.30, 0.00] |

### 5.1 RQ1: Preventing memory-ignoring and memory-misapplying hallucinations

Table 3: Provided evidence (test, Qwen3-8B). The note is in context for related *and* unrelated queries. Para./Canon.: adoption on paraphrased/canonical queries (%); Loc.: locality preserved (%); Misuse: neighbour answers that assert the memory’s object (%, all neighbours); Comp.: composite.

| CounterFact (300) | zsRE (300) |
| Method | Para. | Canon. | Loc. | Misuse↓\downarrow | Comp. | Para. | Canon. | Loc. | Misuse↓\downarrow | Comp. |
| No memory | 1.8 | 0.7 | 100.0 | 1.7 | 0.015 | 1.7 | 1.3 | 100.0 | 0.0 | 0.022 |
| T (text memory) | 88.2 | 91.7 | 67.8 | 39.2 | 0.811 | 91.7 | 92.7 | 70.4 | 5.7 | 0.835 |
| T + global evidence vector (ungated) | 88.2 | 93.3 | 60.9 | 43.5 | 0.780 | 93.0 | 95.0 | 66.7 | 8.3 | 0.827 |
| T + random vector (norm-matched) | 88.3 | 91.0 | 69.1 | 38.8 | 0.816 | 92.7 | 92.3 | 70.4 | 5.0 | 0.837 |
| T + vector at wrong layer | 88.3 | 91.7 | 68.7 | 39.2 | 0.816 | 91.7 | 92.7 | 68.5 | 5.7 | 0.827 |
| T + another memory’s S | 91.5 | 94.7 | 78.3 | 12.8 | 0.875 | 92.3 | 93.7 | 72.2 | 1.0 | 0.849 |
| S only (no text) | 1.7 | 0.7 | 83.9 | 1.5 | 0.014 | 1.0 | 1.3 | 87.0 | 0.0 | 0.017 |
| T + S (TASK) | 96.7 | 99.3 | 81.7 | 7.5 | 0.919 | 98.7 | 100.0 | 74.1 | 2.3 | 0.892 |
| E only | 79.7 | 95.3 | 94.8 | 2.8 | 0.893 | 72.0 | 93.0 | 100.0 | 0.0 | 0.866 |
| T + E | 96.8 | 99.0 | 50.4 | 52.7 | 0.745 | 97.3 | 99.0 | 68.5 | 5.0 | 0.858 |
| T + E + Sind{}_{\text{ind} } | 97.3 | 99.7 | 70.0 | 16.3 | 0.867 | 98.3 | 100.0 | 74.1 | 2.7 | 0.891 |
| T + E + Scond{}_{\text{cond} } | 97.3 | 99.0 | 73.5 | 10.3 | 0.883 | 98.3 | 100.0 | 72.2 | 1.7 | 0.882 |

#### S improves adoption and restraint at the same time.

On CounterFact ([Table 3](#S5.T3)), S raises paraphrase adoption from 88.2% to 96.7%. It also cuts neighbour misuse from 39.2% to 7.5% and raises locality from 67.8% to 81.7%: +10.8 pp composite. A single direction cannot achieve both: the ungated evidence vector increases misuse to 43.5% and *lowers* the composite below text memory, while norm-matched random vectors and wrong-layer vectors leave behaviour unchanged. Without the note, S answers 1.7% of queries, the same as the unmodified model, so its effect lies in how the note is used rather than in any stored content.

#### Both types of memory hallucination fall at once.

[Figure 4](#S5.F4) revisits the two hallucination types of [Figure 2](#S1.F2) on all five models. For Type I, reversion to the stale answer on queries whose stale fact is stored in the weights falls from 4.9–46.3% under T to 0–1.5% under T +S, significantly in all ten model–dataset cells; on Llama-3.1-8B CounterFact, for example, it drops from 46.3% to 0% (−-46.3 pp [-53.5, -39.1]). The adoption gap between stored and not-stored facts, which T shows in five cells, disappears, and no cell has a positive significant gap under T +S. For Type II, misuse on CounterFact neighbours that the model knows falls from 5.3–24.3% to 1.2–7.4%, significantly on four of five models; on the fifth, Qwen3-14B, T misuses only 5.3% to begin with. That both failures shrink together, which no single global direction can achieve, indicates that S learns an *arbitration* policy rather than a bias towards context.

Figure 4: TASK reduces both types of use-time memory hallucination on five models and two datasets (test). (a) Type I, memory-ignoring: reversion to the stale parametric answer on queries whose stale fact is in the weights. (b) Type II, memory-misapplying: misuse on neighbour questions that the no-memory model answers correctly. This subset is why the values differ from the misuse over all neighbours in [Table 3](#S5.T3) (e.g. 24.3% vs. 39.2% for Qwen3-8B with T). Bars give values in %. Per-cell bootstrap CIs are in [Appendix A](#A1).

#### What S learns: a shared direction behind a per-memory gate.

We decompose every memory’s vectors into the mean over all 300 memories (“shared”) and a residual (Appendix [Table 13](#A4.T13)). With each memory’s own gate kept, the shared direction alone reaches 0.909, statistically indistinguishable from full S (0.919; full S −- shared =+0.99=+0.99 pp [-1.07, 3.00]); the memory-specific residual alone reaches 0.866; and another memory’s vectors recover about 60% of the gain (0.875). Most of what S encodes is therefore a reusable “adopt / restrain the note” direction, with a smaller memory-specific part. What makes this direction useful is the *gate*: the same kind of direction applied without a per-memory gate (ContextFocus, KSD) or behind a generic hidden-state condition (CAST) is significantly worse in 9 of 10 model–dataset cells ([Section 5.4](#S5.SS4)). The address, not the vector, is where per-memory specificity lives.

#### Edit-aware steering is not needed.

Training S on the edited model (Scond{}_{\text{cond} }) was the original motivation for coupling steering with editing. Scond{}_{\text{cond} } does depend on its edit: unloading E lowers its dev paraphrase accuracy from 197 to 187 of 200. It also asserts the new object on fewer neighbours (62 vs. 98 of 600). But its composite advantage over Sind{}_{\text{ind} } is not significant on CounterFact (++1.55 pp) or zsRE (−-0.91 pp). Across eleven settings it is significantly positive once and significantly negative three times (Appendix [Table 14](#A4.T14)). We therefore use Sind{}_{\text{ind} }. Most of what S learns is decoupled from the particular edit.

### 5.2 RQ2: Reading the right memories from a growing library

Table 4: One agent, 300 memories (test; BM25 top-2 candidates) and continual revision (dev; 100 insertions then 50 revisions). Eall{}_{\text{all} }: one joint patch over all memories, always on.

| CounterFact library | zsRE library |
| Method | Para. | Loc. | Comp. | Para. | Loc. | Comp. |
| BM25 RAG (T) | 83.3 | 64.9 | 0.782 | 85.7 | 68.4 | 0.803 |
| BM25 RAG + S | 80.8 | 78.5 | 0.837 | 91.7 | 70.2 | 0.846 |
| BM25 RAG + Eall{}_{\text{all} } | 93.2 | 51.3 | 0.736 | 91.0 | 70.2 | 0.843 |
| Address-verified T | 82.2 | 96.9 | 0.898 | 89.7 | 94.7 | 0.923 |
| Address-verified T + S | 89.3 | 96.9 | 0.950 | 96.3 | 94.7 | 0.970 |
| Address-verified T + gated E | 89.7 | 94.7 | 0.942 | 94.3 | 94.7 | 0.959 |
| Addr.-verified T + gated E + S | 90.0 | 95.2 | 0.946 | 95.3 | 94.7 | 0.965 |

| Method | Current | Stale↓\downarrow | Loc. |
| BM25 RAG, naive append | 68.7 | 50.7 | 45.0 |
| BM25 RAG + supersession | 94.3 | 0.7 | 53.3 |
| RAG + one E over all versions | 1.3 | 3.3 | 0.0 |
| Address-verified T | 93.0 | 0.0 | 93.3 |
| Addr.-verified T + gated E | 99.0 | 0.0 | 95.0 |
|    + S | 98.7 | 0.0 | 95.0 |

#### The address prevents memory-misapplying hallucinations in a library.

With 300 memories, BM25 retrieves a distractor note for many unrelated queries; the model then applies it, and locality drops to 64.9% ([Table 4](#S5.T4), left). Verifying candidates with the in-model address raises locality to 96.9%. Adding S on top lifts adoption: +16.4 pp composite on CounterFact and +16.2 pp on zsRE over BM25 RAG. Without the address, weight memories do not scale: an always-on joint patch drops locality to 51.3%, whereas the gated per-memory patches keep it at about 95%. In this setting T +S and T +gated E +S perform alike (0.950 vs. 0.946). On structured single facts the address is what E contributes; its weight change adds nothing.

Figure 5: Scaling the library to 3,000 memories (CounterFact test queries; distractors are training-split memories written by the same writer). Dashed: BM25 retrieval; solid: address-verified reading. Colours follow the carriers as in [Figures 2](#S1.F2) and [4](#S5.F4). At 300 memories, address-verified T and T +S have the same locality (96.9%), so their markers coincide in (b). The full configuration with gated E (address-verified T + gated E + S, [Table 4](#S5.T4)) scores 0.946 / 0.928 / 0.916 and lies between the two upper curves in (a); it is omitted for legibility.

#### Scaling.

From 300 to 3,000 memories ([Figure 5](#S5.F5)), BM25 RAG degrades from 0.782 to 0.731, because locality falls to 56.3%. Address-verified T +S stays at 0.926, with locality above 91%, and the full configuration with gated E stays at 0.916.

#### Version-confusion hallucinations: supersession is a precondition for steering.

Naive appending leaves both versions of a fact in the library, and half of the answers assert the old value ([Table 4](#S5.T4), right). Placing both versions in one joint closed-form patch collapses it (current-value accuracy 1.3%). With address verification and gated E, current-value accuracy is 99.0% with no stale answers. On the harder test version of this setting ([Appendix C](#A3)), all Qwen3-8B methods drop to 33–42% accuracy on revised facts when versions coexist. On Llama-3.1-8B, S even *amplifies* the conflict (−-28.7 pp): the adopt vectors of both versions fire, and each pushes its own object. Revision must therefore retire the old S together with the old T and E. Our automatic supersession, which combines the address with the agent’s own judge and uses no fact IDs, recovers this. It improves over not superseding by 48.7 pp on Qwen3-8B and 54.7 pp on Llama-3.1-8B (both significant), matches oracle links exactly on Llama-3.1-8B, and falls 10.7 pp short of them on Qwen3-8B, whose judge misses 14% of true updates. In terms of Type III hallucination, the stale-version rate of address-verified T +S on revised facts falls from 54.7% to 10.0% on Qwen3-8B and from 48.0% to 0% on Llama-3.1-8B ([Table 11](#A3.T11)).

### 5.3 RQ3: Composing updated facts

Table 5: Composition and the parametric carrier. *Left:* MQuAKE-CF-3k test (200 cases, 600 questions; only edited base facts are written). *Right:* our closed-form E against the original EasyEdit implementations on zsRE test (300 edits).

| Method | Multi-hop | Case | Old-answer↓\downarrow |
| No memory | 2.8 | 4.0 | 27.5 |
| T | 69.0 | 79.5 | 6.5 |
| T + S (paired) | 62.2 | 75.0 | 9.2 |
| T + S (v+v^{+} only) | 69.3 | 80.5 | 6.3 |
| E only | 5.5 | 8.0 | 14.3 |
| T + E | 76.8 | 85.5 | 3.2 |
| T + E + S (v+v^{+} only) | 76.5 | 85.0 | 3.0 |

| Edit method | E only | T + E | T + E + S |
| EasyEdit ROME | 0.756 | 0.836 | 0.860 |
| EasyEdit MEMIT | 0.739 | 0.852 | 0.876 |
| EasyEdit AlphaEdit | 0.720 | 0.855 | 0.856 |
| Ours (closed-form, subject key) | 0.866 | 0.858 | 0.891 |

Multi-hop questions require chaining an updated fact through the model’s own knowledge, and here the weight carrier matters ([Table 5](#S5.T5), left). Text memory reaches 69.0% multi-hop accuracy, and adding E raises it to 76.8%; TASK (T +E +S +) reaches 76.5%, +7.5 pp [3.3, 11.8]. The gain is due to E, not S. Reversion to the old answer halves (6.5%→\to3.0%). Paired steering *hurts* here (62.2%): the bridge entity is not in the question, so v−v^{-} suppresses notes that are needed. This motivates the v+v^{+}-only read rule for composition. As a carrier, our subject-keyed closed-form patch is stronger than the original ROME, MEMIT and AlphaEdit implementations under the same requests ([Table 5](#S5.T5), right). S also improves every one of these editors when stacked on top.

### 5.4 Generality across models and against baselines

Table 6: Same frozen protocol on five models (test). *Top:* gains of TASK. Δ1\Delta_{1}: T+S −- T; Δ2\Delta_{2}: address-verified T + gated E + S −- BM25 RAG (300-memory library); Δ3\Delta_{3}: T+E+S+ −- T (MQuAKE). *Bottom:* T+S (TASK) minus each context-use baseline with the same note (composite, pp). Bold and ∗: 95% CI excludes 0, in either direction (full CIs in [Appendix D](#A4)). n/a: not run for Gemma-3-27B, as fixed in advance for compute reasons.

| Model | CF: T | CF: T+S | CF Δ1\Delta_{1} | CF lib. Δ2\Delta_{2} | zsRE Δ1\Delta_{1} | zsRE lib. Δ2\Delta_{2} | MQuAKE Δ3\Delta_{3} |
| Qwen3-8B | 0.811 | 0.919 | +10.80∗ | +16.36∗ | +5.65∗ | +16.23∗ | +7.50∗ |
| Llama-3.1-8B | 0.518 | 0.948 | +43.02∗ | +49.37∗ | +28.04∗ | +41.40∗ | +33.83∗ |
| Qwen3-14B | 0.923 | 0.945 | +2.19∗ | +6.05∗ | +7.90∗ | +11.60∗ | +1.17 |
| Phi-4 (14B) | 0.756 | 0.956 | +19.97∗ | +12.99∗ | +8.20∗ | +20.12∗ | +36.00∗ |
| Gemma-3-27B | 0.849 | 0.888 | +3.92∗ | +17.65∗ | −-4.61 | n/a | n/a |
| Model ⋅\cdot dataset | −-IKE | −-CAD | −-CAA | −-KSD | −-ContextFocus | −-CAST |  | Qwen3-8B ⋅\cdot CF | +34.67∗ | +23.44∗ | +8.89∗ | +11.51∗ | +10.60∗ | +10.37∗ |  | Qwen3-8B ⋅\cdot zsRE | +0.36 | +15.16∗ | +9.96∗ | +6.18∗ | +11.37∗ | +5.84∗ |  | Llama-3.1-8B ⋅\cdot CF | +39.37∗ | +55.06∗ | +38.37∗ | +41.37∗ | +41.90∗ | +36.90∗ |  | Llama-3.1-8B ⋅\cdot zsRE | +27.06∗ | +53.21∗ | +43.02∗ | +27.56∗ | +24.27∗ | +26.29∗ |  | Qwen3-14B ⋅\cdot CF | +2.73∗ | +7.20∗ | +2.41∗ | +2.66∗ | +2.19∗ | +2.09∗ |  | Qwen3-14B ⋅\cdot zsRE | −-4.06 | +11.32∗ | +12.04∗ | +6.75∗ | +8.04∗ | +7.12∗ |  | Phi-4 ⋅\cdot CF | +5.91∗ | +21.48∗ | +24.41∗ | +19.21∗ | +19.28∗ | +21.14∗ |  | Phi-4 ⋅\cdot zsRE | −-1.31 | +16.29∗ | +17.45∗ | +8.64∗ | +15.83∗ | +8.43∗ |  | Gemma-3-27B ⋅\cdot CF | +26.37∗ | +13.86∗ | +3.52∗ | +3.53∗ | +3.92∗ | +3.68∗ |  | Gemma-3-27B ⋅\cdot zsRE | −-9.71∗ | −-0.69 | −-2.35 | −-4.61 | −-2.60 | −-4.25 |  |

#### Across models.

The same frozen protocol holds on all five models ([Table 6](#S5.T6), top): 21 of 23 cross-model comparisons are significantly positive. The gain is largest where the model resists its context most. Llama-3.1-8B adopts text memory poorly (CF composite 0.518) and gains +43.0 pp. Qwen3-14B already follows context well (0.923) and gains +2.2 pp. This matches the conflict analysis: models with larger parametric override ([Figure 2](#S1.F2)a) leave more room for arbitration.

#### Against context-use baselines.

With the same note in context, TASK significantly beats the three steering methods closest to it (KSD, ContextFocus, CAST) in 9 of 10 model–dataset cells, and CAA in 9 of 10 ([Table 6](#S5.T6), bottom). The exception is Gemma-3-27B on zsRE. There S raises paraphrase accuracy (0.907→\to0.967) but increases locality damage, and no difference to the steering baselines is significant. IKE, which adds demonstrations and is especially strong on zsRE’s question format, ties with TASK or wins on 14B+ models for zsRE. On CounterFact, IKE’s demonstrations cause heavy misuse, and TASK leads by 2.7–39.4 pp.

### 5.5 Free-form dialogue memory

Table 7: LoCoMo test (8 conversations, 1,230 questions; same answering model, Qwen3-8B). Accuracy under three judges and mean input tokens. Bold: best among methods with at most about 300 input tokens. Paired differences use a conversation-level bootstrap.

| Method | Qwen3-8B judge | Qwen3-14B judge | GLM-5.3 judge | Input tokens |
| BM25 top-5 facts (T) | 30.8 | 28.5 | 33.6 | 299 |
| Semantic-address T | 32.8 | 30.3 | 34.6 | 298 |
| Semantic-address T + S (TASK) | 34.2 | 31.0 | 39.3 | 298 |
| Mem0, top-5 | 17.9 | 16.1 | 19.5 | 257 |
| Mem0, top-30 | 26.1 | 24.2 | 30.4 | 1,226 |
| A-Mem, token-matched to ours | 28.6 | 27.1 | 30.7 | 294 |
| A-Mem, top-5 | 39.4 | 37.5 | 42.8 | 1,248 |
| A-Mem, top-30 | 51.5 | 48.0 | 55.9 | 6,845 |
| Full conversation in context (reference) | 60.3 | 57.5 | 64.2 | 19,488 |
| TASK −- semantic-address T | +1.38∗ | +0.65 | +4.63∗ |  | TASK −- Mem0 top-5 | +16.34∗ | +14.88∗ | +19.76∗ |  | TASK −- A-Mem token-matched | +5.61∗ | +3.90∗ | +8.62∗ |  |

On LoCoMo ([Table 7](#S5.T7)), facts are free-form and the subject key does not apply, so TASK uses the semantic address and T +S, without E. At an equal input budget of about 300 tokens, TASK improves over BM25 retrieval, over the same retrieval without S (significant under two of three judges), over Mem0, and over token-matched A-Mem (significant under all three judges). The absolute level stays modest: A-Mem with 4–23×\times more tokens and the full conversation (65×\times) remain clearly more accurate. On LongMemEval the literal subject key gates out relevant facts and E/S give no gain ([Appendix D](#A4)), which is what motivated the semantic address.

## 6 Discussion and Limitations

#### What each carrier contributes.

The evidence assigns each carrier a distinct role. Text carries the content: without it, neither S nor single-fact accuracy survives. Steering carries the use policy and is the most consistent source of gains, resolving both directions of the conflict on all five models. The address taken from E’s key controls which memories are read; it turns retrieval into precise reading for libraries of up to 3,000 memories and is what allows weight patches to scale. E’s weight change matters where facts must be composed (MQuAKE) but adds nothing to T +S on single facts: on CounterFact, T +E +S scores below T +S on four models and ties on Gemma-3-27B (0.887 vs. 0.888), and in libraries the two tie. TASK memory is therefore best understood as a division of labour, in which each carrier is used for what it does well.

#### Memory hallucination beyond storage.

Our results suggest that memory approaches should be judged on *use* as well as on *storage*: whether a stored item is adopted where it applies and ignored where it does not. Storage-stage benchmarks such as HaluMem [[6](#bib.bib61)] and our use-time analysis cover complementary halves of memory hallucination. A memory system can store perfectly and still hallucinate at read time. Writing content into weights (editing) or into a trained state (MemT-1.0) changes where the memory lives. It does not by itself arbitrate between the memory and the model’s prior knowledge. Combined with retrieval, editing even amplifies memory override. An address-gated use policy addresses this arbitration directly; because it acts on a frozen model through one hook and one partial forward pass, it can be combined with either kind of storage.

#### Limitations.

The gains of TASK memory shrink when a model already follows its context well (Qwen3-14B CounterFact: +2.2 pp), and on Gemma-3-27B zsRE T +S is not better than T (−-4.61 pp [-10.25, 0.01]), while IKE is significantly better. On dialogue memory the gains are small and TASK stays far below full-context reading and token-rich A-Mem; the literal subject key fails on free-form questions (LongMemEval), and the semantic address fixes this only in part. Revision depends on supersession, without which S can amplify version conflicts, and the automatic judge is imperfect: it misses 14% of true updates on Qwen3-8B, and in libraries with many facts per subject the Llama-3.1-8B judge wrongly supersedes 34% of memories, while about 10% of sibling memories remain confused under every carrier. Writing a memory costs about 25 s of steering training and 4 s of editing on one GPU, and our libraries reach 3,000 memories rather than millions; the decomposition in [Section 5.1](#S5.SS1) suggests that a shared direction behind per-memory gates could remove most of this cost. Finally, CounterFact, zsRE and MQuAKE consist of synthetic counterfactual updates, our answer classifier and LLM judges are not the official scorers, and on AppWorld the local 8B agent almost never completes tasks, with S improving only the partial test-pass rate (+2.2 pp, not significant).

#### Broader impact.

Making agents adopt stored notes more reliably also makes them adopt *wrong* notes more reliably. TASK should sit behind a writer that verifies sources. Its per-memory, versioned and removable design makes such auditing and deletion straightforward.

## 7 Conclusion

Text memory tells a model *what* a fact is, but not *whether* the fact should override what the model already believes. We showed that this gap produces use-time memory hallucinations, even when the stored memory is correct. The model ignores the memory in favour of stale weights, misapplies it to other entities, or answers from a superseded version. The first two come from the conflict between parametric knowledge and external memory, which runs in both directions on every model we tested. TASK memory addresses it with a per-memory use policy behind an in-model address: paired adopt/restrain steering vectors, gated by the key of a removable knowledge edit, with content kept in text. Under a pre-registered protocol on five frozen models, this policy resolves both conflict directions and makes memory libraries precise up to 3,000 memories; the edit carrier adds compositional recall. By making each memory more than text, a Text note combined with Activation Steering and Knowledge editing, each in the role it is good at, we can reduce memory hallucinations without retraining the model. We hope these results encourage treating memory *use*, and not only memory *storage*, as a first-class target for reducing hallucination in LLM agents.
