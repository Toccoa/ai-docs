# Latent-in-the-Middle: On the Security of Cross-Model Latent Communication in Multi-Agent SystemsThanks: * Equal contribution

Manit Baser1*  Vyoman Jain2*  Rachel Yeo Hui Min1
Xianglin Yang1  Meenatchi Sundaram Muthu Selva Annamalai3  Dinil Mon Divakaran4 Affiliation: 1National University of Singapore
2Singapore University of Technology and Design
3University of Toronto
4A*STAR Institute of Advanced Intelligence and Computing (A*STAR IAIC) Affiliation: 

###### Abstract

As large language models increasingly collaborate in heterogeneous multi-agent systems, latent communication has emerged as an efficient alternative to exchanging natural-language messages. By sharing internal representations, agents can avoid repeatedly processing the same context, reducing communication overhead and prefill computation. One such mechanism is cross-model Key–Value (KV) cache transfer, which uses a learned mapper to translate a source model’s KV cache into one a target model can use. However, this handoff means the target model consumes context it did not encode itself, thus calling into question whether its safety alignment still holds.

In this work, we investigate the security implications of latent handoffs by introducing Chasm, a framework characterizing cross-model handoff attacks across three new attack surfaces: the source model, mapper, and handoff mechanism itself. Our experiments reveal that latent handoffs substantially undermine safety alignment and prompt-injection defenses. Notably, a target model that follows only 0.4% of benchmark prompt injections natively, follows up to 44.2% when transferred through a mapper from a source model. On the other hand, for jailbreak attacks, transfer alone raises attack success by up to 24.6 pp within a model family and zero-shot attacks by up to 69.2 pp, whereas white-box optimization through the mapper boosts the attack success rate to 92.5%, against 37.5% for ordinary GCG on the same target. To address these vulnerabilities, we propose a lightweight target-side cache guard that corrects transferred caches to restore the target model’s refusal, considerably mitigating these attacks.

Fig. 1: Overview of native inference and latent handoffs. *Top: jailbreaks.* \scriptsize1⃝ Under native inference, the aligned agent 𝒯\mathcal{T} encodes the prompt and generates the answer. \scriptsize2⃝ Under model cascading, source agent 𝒮\mathcal{S} encodes the prompt, and mapper ℳ\mathcal{M} converts its KV cache for target agent 𝒯\mathcal{T}. Subsequent model switches or relays trigger further mappings. *Bottom: indirect prompt injection (IPI).* \scriptsize3⃝ Under native inference, the agent fetches and encodes external content. \scriptsize4⃝ Under delegate and return, the main agent transfers its cache to subagent 𝒮\mathcal{S} via mapper ℳ′\mathcal{M}^{\prime}, then receives the subagent’s cache via mapper ℳ\mathcal{M}, answering without encoding the fetched content itself. Red arrows denote untrusted data. Red badges mark the four jailbreak entry points: prompt templates (J1), model switching (J2), an untrusted source (J3), and mapper-aware GCG (J4). The violet badge marks an instruction planted in content fetched by the subagent. Dashed boxes enclose the computation between input and answer.

## I Introduction

Large language models (LLMs) increasingly operate as heterogeneous agents that delegate tasks, exchange intermediate results, and coordinate to solve problems beyond the reach of a single model. This shift is underway: a 2026 KPMG survey reports that 25% of large U.S. enterprises are developing multi-agent systems [[1](#bib.bib58)], while Gartner expects that more than 60% of multi-agent systems will combine agents from different vendors by 2028 [[2](#bib.bib59)]. Meanwhile, LLM applications increasingly distribute work across models: systems cascade from cheaper models to larger ones [[3](#bib.bib62)], route requests to the smallest capable model [[4](#bib.bib61), [5](#bib.bib72)], or compose agents built on different models [[6](#bib.bib2)]. At the same time, agents are moving from private chats into shared workspaces such as Slack, Discord, and group chats, where persistent agents observe messages from multiple users as context [[7](#bib.bib19)]. Across these deployments, context routinely crosses between models and trust boundaries.

However, passing context across agents can be communication-intensive. In SwarmChat [[8](#bib.bib60)], eight agents exchanged 2,482 messages during a six-hour collaborative coding run. Agents commonly communicate through natural-language messages or shared memory, requiring target agents to repeatedly process context that may already have been processed elsewhere. This prefill computation accumulates over a long interaction. Anthropic reports that multi-agent implementations consume 3–10×\times more tokens than single-agent approaches on comparable tasks [[9](#bib.bib63)]. Beyond cost, natural-language communication can introduce ambiguity and information loss, contributing to coordination failures [[10](#bib.bib64), [11](#bib.bib65)].

These efficiency limitations have motivated *latent-space communication*, in which agents exchange internal states rather than natural-language messages. One such reusable latent state is the Key–Value (KV) cache. Production serving systems already support KV-cache transfer and reuse across hosts, requests, and storage tiers through disaggregated inference and cache offloading [[12](#bib.bib66), [13](#bib.bib75), [14](#bib.bib67)]. However, because a KV cache depends on a model’s specific architecture and weights, it generally is not directly transferable across models. To address this incompatibility, recent work introduces cross-model KV-cache transfer via learned mappers [[15](#bib.bib68), [16](#bib.bib54), [17](#bib.bib1), [18](#bib.bib55)]. For example, NVIDIA proposes a closed-form, per-head ridge mapper that transfers caches across differently sized models within the same model family, retaining 73–98% of target-model accuracy while reducing prefill latency by 2.7–25×\times [[17](#bib.bib1)]. Subsequent work explores MLP and transformer-based mappers [[17](#bib.bib1), [16](#bib.bib54)], head-local variants [[15](#bib.bib68)], and distillation-trained linear translators [[18](#bib.bib55)], and we are starting to see mapped prefill offered as a hosted service [[19](#bib.bib97)]. Across these designs, a latent handoff proceeds in three steps: a *source* model prefills the context into its KV cache; a *mapper*, fitted or trained offline, translates that cache into the representation space of the *target* model; and the target model processes only the remaining suffix before generating its answer directly from the converted cache.

In practice, this three-step handoff also crosses trust and safety boundaries as illustrated in Fig. [1](#S0.F1). Consider a coding assistant deployed in a team’s workspace, where a user asks it to fix a bug described in an issue that links to a web page. Its *main agent* is a large model that has been safety-tested and hardened against prompt injection, as coding assistants routinely process untrusted files and pages. To save cost, the main agent delegates reading the issue and the linked page to a cheaper *subagent*, as coding assistants already do with text [[20](#bib.bib10), [21](#bib.bib11)]. With latent communication, the subagent does not reply with a summary. It fetches the page with a tool call, and its KV cache returns to the main agent through a mapper (Fig. [1](#S0.F1) \scriptsize4⃝). The main agent then writes the patch without ever computing its own representation of the page. Session-level handoffs create the same separation between who reads the context and who answers: a cheaper model may escalate a hard request to the larger model in a cascade [[17](#bib.bib1)], or a user may switch models mid-session, likewise transferring the cache through a mapper (Fig. [1](#S0.F1) \scriptsize2⃝). Similar cross-model handoffs arise in model routers [[4](#bib.bib61)], multi-agent group chats, and shared workspaces [[7](#bib.bib19)]. In each, the model that answers decodes from a cache that another model computed and a mapper rewrote.

Although cross-model KV-cache transfer aims to preserve accuracy while reducing latency, delegating representation introduces security risks by making an agent’s behaviour depend on computation performed elsewhere. A model’s refusal decision is read from its internal representation of the prompt [[22](#bib.bib33)], and the first few answer tokens—where safety alignment does most of its work [[23](#bib.bib32)]—are generated from that representation. Prompt-injection defenses likewise rely on representing trusted instructions and untrusted data differently [[24](#bib.bib28)]. Natively, the answering model builds these representations itself; in a latent handoff, it inherits a cache computed by another model and rewritten by a mapper. In the coding-assistant example above, a jailbreak in the user’s request is first encoded by the cheaper session model, and an instruction planted in the linked page is encoded only by the subagent—so the hardened main agent never sees either input in the form it was trained to handle. As a result, latent handoffs expand the attack surface for threats such as jailbreaks, where a user seeks harmful answers, and indirect prompt injection (IPI), where a third party plants instructions in external content [[25](#bib.bib77)].

To study these risks systematically, we introduce Chasm (Cross-Model Handoff Attacks in Latent-Space Agent Communication), which models the components separating the input from the aligned answering agent. A handoff interposes a source that encodes the input and a mapper that converts its cache, and a session may chain multiple handoffs. Each component creates a point where an attack can succeed even if it fails against the standalone target model, and Chasm organizes attacks by the entry point they exploit (Fig. [1](#S0.F1)): through the *input*, a published jailbreak template (J1) or an instruction in fetched content (IPI) is encoded by a model other than the answering model; through *repeated handoffs*, a cache is remapped across successive model switches (J2); through the *source*, an attacker-controlled source model computes the cache (J3); and through the *mapper*, prompts are optimized with gradients end-to-end through the transfer path (J4). All attacks except J4 are *zero-shot*, requiring no training, gradients, or search. We measure each attack as the change in success rate through the handoff relative to native inference on the target model, and study additional handoff-specific entry points with no native counterpart in Appendices [A](#A1) and [B](#A2).

Findings and contributions. With Chasm, we evaluate three model families (Qwen3, Llama 3, and Ministral 3) and four mapper types, each calibrated on two corpora, for 24 settings. Our contributions and main findings are as follows.

- →\rightarrow

*A framework for handoff attacks*. Chasm organizes attacks on latent handoffs by the entry point they exploit (Section [III](#S3)).

- →\rightarrow

*Zero-shot jailbreaks get stronger (J1–J3).* Through the handoff, zero-shot attacks raise the HarmBench attack success rate (ASR) by up to +69.2 percentage points (pp) without touching the target model or the deployed mapper, and an untrusted source succeeds in all 24 settings (Section [V](#S5)).

- →\rightarrow

*The mapper hands the attacker a stronger white-box attack (J4).* Suffixes optimized through the mapper cross 90% ASR on every target model through the SwaT (Chat) renderers, whereas ordinary GCG on a standalone target model reaches at most 65.0% (Section [V-E](#S5.SS5)).

- →\rightarrow

*Injection defenses fail across the handoff (IPI).* In the first evaluation of indirect prompt injection across a latent handoff, the injection ASR of Meta-SecAlign-8B on AlpacaFarm rises from 0.4% natively to about 30% through the four default FineWeb-calibrated mappers, and to as much as 44.2% through SwaT (Chat), when a 3B subagent encodes the content. The pipeline is only as robust as the agent that reads the content (Section [VI](#S6)).

- →\rightarrow

*A new defense.* We propose HandoffGuard, a low-rank correction of the mapped cache that brings attacker-controlled sources within 4.5 points of native HarmBench ASR across all families at negligible utility loss, though a costly adaptive attack that fine-tunes the source still succeeds (Section [VII](#S7)).

Furthermore, we show that a mapped cache leaks the prompt (Appendix [A](#A1)), that a mapper can be backdoored (Appendix [B](#A2)), and that repeated handoffs erode the target model’s capability (Appendix [C](#A3)).

## II Background

### II-A KV Caches and Prefill Reuse

A decoder-only LLM processes a token sequence x=(x1,…,xn)x=(x_{1},\dots,x_{n}) in two phases. During *prefill*, each of the LL transformer layers computes a key 𝐤pℓ,h\mathbf{k}^{\ell,h}_{p} and value 𝐯pℓ,h\mathbf{v}^{\ell,h}_{p} for every position pp and KV head hh, forming the KV cache

| 𝒞⁡(x)={(𝖪ℓ,𝖵ℓ)}ℓ=1L,\mathcal{C}(x)=\{(\mathsf{K}^{\ell},\mathsf{V}^{\ell})\}_{\ell=1}^{L}, |  |

where 𝖪ℓ\mathsf{K}^{\ell} and 𝖵ℓ\mathsf{V}^{\ell} aggregate keys and values across positions and heads (with rotary position embeddings, RoPE, applied to keys but not values). During *decode*, each newly generated token attends to cached states and appends its own keys and values. Since prefill cost grows with prompt length, serving systems reuse, offload, and move caches across requests and hosts. Cache reuse, however, requires the consumer to be the same model that produces it.

### II-B Cross-Model Latent Communication

To share context across heterogeneous models without re-prefilling, a *mapper* ℳ\mathcal{M} translates a source model 𝒮\mathcal{S}’s KV cache into the representation space of a target model 𝒯\mathcal{T}:

| ℳ:𝒞𝒮​(x𝒮)↦𝒞^𝒯​(x),\mathcal{M}:\;\mathcal{C}_{\mathcal{S} }(x_{\mathcal{S} })\;\mapsto\;\widehat{\mathcal{C} }_{\mathcal{T} }(x), |  |

where x𝒮x_{\mathcal{S} } and xx denote the same text tokenized for 𝒮\mathcal{S} and 𝒯\mathcal{T}, respectively. Offline, ℳ\mathcal{M} is fitted on a calibration corpus processed by both models to minimize discrepancy between 𝒞^𝒯\widehat{\mathcal{C} }_{\mathcal{T} } and 𝒯\mathcal{T}’s native cache 𝒞𝒯\mathcal{C}_{\mathcal{T} }. Existing designs fall into two regimes based on tokenization:

- •

Same-tokenizer mappers (x𝒮=xx_{\mathcal{S} }=x) operate token-by-token [[17](#bib.bib1), [15](#bib.bib68)]. They strip 𝒮\mathcal{S}’s RoPE from keys, predict each target layer ℓ\ell’s keys and values in RoPE-free space from selected source layers (via per-head ridge regression, MLPs, or head-local affine maps), and reapply 𝒯\mathcal{T}’s RoPE.

- •

Cross-tokenizer mappers relax the shared-tokenizer requirement [[16](#bib.bib54)]. For example, SwaT aligns x𝒮x_{\mathcal{S} } and xx by character offsets and applies a trained attention-based renderer to produce one cache entry (𝐤^pℓ,h,𝐯^pℓ,h)(\hat{\mathbf{k} }^{\ell,h}_{p},\hat{\mathbf{v} }^{\ell,h}_{p}) per target position pp.

The transfer path. Given a prompt x=(x1,…,xn)x=(x_{1},\dots,x_{n}) formatted in 𝒯\mathcal{T}’s chat template, we split xx into a prefix x<nx_{<n}—containing the system and user turns plus all but the final token of the assistant header—and a final *lead-in* token xnx_{n}. Every cached position attended to before generation (except xnx_{n}) therefore originates from x<nx_{<n}. We compare two execution paths on 𝒯\mathcal{T}:

- •

Native path (𝒯⁡(x)\mathcal{T}(x)): 𝒯\mathcal{T} prefills x<nx_{<n} itself to form 𝒞𝒯​(x<n)\mathcal{C}_{\mathcal{T} }(x_{<n}), processes xnx_{n}, and decodes.

- •

Transfer path (𝒯⁡(ℳ⁡(𝒮⁡(x)))\mathcal{T}(\mathcal{M}(\mathcal{S}(x)))): 𝒮\mathcal{S} prefills its tokenization x𝒮x_{\mathcal{S} } of x<nx_{<n}, ℳ\mathcal{M} computes 𝒞^𝒯​(x<n)=ℳ⁡(𝒞𝒮​(x𝒮))\widehat{\mathcal{C} }_{\mathcal{T} }(x_{<n})=\mathcal{M}(\mathcal{C}_{\mathcal{S} }(x_{\mathcal{S} })), and 𝒯\mathcal{T} processes only xnx_{n} conditioned on 𝒞^𝒯​(x<n)\widehat{\mathcal{C} }_{\mathcal{T} }(x_{<n}) before decoding.

Both paths share the same lead-in, decoding loop, and stopping rule; only the prefix-cache producer differs. When tokenizers differ (cross-family SwaT), 𝒮\mathcal{S} prefills x𝒮x_{\mathcal{S} } by reading 𝒯\mathcal{T}’s chat template as plain text (as in SwaT’s training) and SwaT renders the aligned cache entries before xnx_{n}, keeping the lead-in and decoding loop unchanged. In multi-agent chains, 𝒯\mathcal{T} extends 𝒞^𝒯​(x<n)\widehat{\mathcal{C} }_{\mathcal{T} }(x_{<n}) with its own generated states and forwards the resulting cache downstream, so subsequent hops map an already-mapped cache and earlier mapping deviations can compound.

TABLE I: Chasm comprises classical attacks run through the parts of a latent handoff: four jailbreaks (J1–J4) and indirect prompt injection (IPI). *Attack surface*: the part of the handoff the attack exploits (Section [III-B](#S3.SS2)). All attacks except J4 are zero-shot. Beyond the target model’s native safety, which these attacks and a backdoored mapper (Appendix [B](#A2)) target, we also examine the confidentiality of the prompt (Appendix [A](#A1)) and the availability of the target model (Appendix [C](#A3)).

| # | Attack  | Attack surface  | What the attack does  |
| *Jailbreaks* |
| – | No attack  | –  | Sends plain harmful requests through an aligned pipeline  |
| J1 | Templates  | Input  | Wraps requests in published jailbreak templates  |
| J2 | Model switching  | Repeated handoffs  | Maps the cache back and forth between models before the answer  |
| J3 | Untrusted source  | Source  | Controls the source model  |
| J4 | Mapper-aware GCG  | Mapper  | Optimizes suffixes through source model, mapper, and target model  |
| *Indirect prompt injection* |
| IPI | Planted content  | Input  | Plants an instruction in content the source fetches, e.g., a web page or email  |

## III The Chasm Framework

Chasm models each component of a latent handoff that lies between the user input and the system output. Below, we first describe the multi-agent system and its latent handoffs, then how a handoff expands the attack surface and which attacks we study on it (Section [III-B](#S3.SS2)). Because these attacks pursue different goals by exploiting different components, Chasm yields not a single threat model but a family of them; Table [I](#S2.T1) summarizes the attacks.

### III-A System Model

We model communication in a multi-agent system as a set of *handoffs*, in which one agent passes its context to another through cross-model KV-cache transfer. A handoff involves three components: (1) a *source agent*, running model 𝒮\mathcal{S}, which processes the context into its KV cache; (2) a *mapper* ℳ\mathcal{M}, which transforms that cache into a representation compatible with the target model; and (3) a *target agent*, running model 𝒯\mathcal{T}, which generates the response from the mapped cache. Handoffs can be chained, so the same context can be mapped more than once.

This handoff model covers two common multi-agent patterns: *model cascading* and *delegate and return*. In model cascading, one model’s context is handed off to the next, as when a smaller model escalates a request to a larger model [[3](#bib.bib62)] or a router or the user switches the serving model [[4](#bib.bib61)]. A related one-way handoff arises in disaggregated serving infrastructure, where one server prefills the prompt into a KV cache and another server generates the answer from it [[12](#bib.bib66), [14](#bib.bib67), [26](#bib.bib76)], and a mapper would let the prefill server run a different model. In delegate and return, a coordinator hands a subtask to a subagent and receives its result back, so context is handed off in both directions [[20](#bib.bib10), [21](#bib.bib11)]. More complex architectures, such as peers communicating over a shared channel, can be built by combining these two patterns. For the purposes of this work, we assume that the target model 𝒯\mathcal{T} is aligned, i.e., an instruct model safety-trained to refuse harmful requests and, where an injection defense is deployed, trained to ignore instructions in untrusted data, as Meta-SecAlign is.

### III-B An Expanded Attack Surface

We expect a latent handoff to leave the target model’s behaviour intact. For instance, a multi-agent system deployer that hands off context to an aligned target model expects it to keep refusing harmful requests and ignoring injected instructions, just as it does natively. However, a handoff breaks this expectation by expanding the attack surface. Under native inference, the adversary controls only the input, limiting adversarially crafted input to the aligned model 𝒯\mathcal{T}. Under a handoff, by contrast, the input first passes through additional components, each of which the adversary can target, thus enabling an attack to succeed even if it fails against 𝒯\mathcal{T} alone. We focus on the two most prominent attacks on LLM applications: i) jailbreaks, which aim to make the target model answer malicious requests it would otherwise refuse; and ii) indirect prompt injection, which aims to make it follow malicious instructions embedded in the content it processes. We also study whether a handoff keeps the prompt confidential and the target model available, in Appendices [A](#A1) and [C](#A3). Below, we describe the attacks and summarize them in Table [I](#S2.T1), with the jailbreaks shown in Figure [2](#S3.F2) and indirect prompt injection in Figure [3](#S3.F3).

Fig. 2: Jailbreaks across a latent handoff, one per attack surface. Each pattern shows the transfer path (source 𝒮\mathcal{S}, its KV cache, mapper ℳ\mathcal{M}, mapped cache, aligned target model 𝒯\mathcal{T}) and where the attack acts (red, dashed; hatched: an attacker-controlled component). Fig. 3: Indirect prompt injection natively (top) and in a delegate-and-return handoff (bottom). An attacker plants an instruction in external content. Natively, the defended main agent encodes the content itself and ignores the instruction. In the handoff, (1) the user gives the main agent a task, (2) its cache passes through ℳ′\mathcal{M}^{\prime} to the subagent, (3–4) the subagent fetches the content and prefills it, and (5) its cache returns through ℳ\mathcal{M}, so (6) the main agent decodes without encoding the content itself and follows the instruction. Red marks untrusted data and the hijacked path.

J1: Templates. We assume the simplest attacker, who can only send text requests to the system and read its answers, with no knowledge of the models or the mapper. The attacker wraps a harmful request in a published jailbreak template without any optimization.

J2: Model switching. We assume that the attacker can additionally trigger handoffs. Deployed systems already change the serving model within a session. Coding assistants let the user switch models with a command [[27](#bib.bib96)], routers decide per request which model serves it [[4](#bib.bib61), [28](#bib.bib69), [29](#bib.bib70)], and prompt content alone can force a router’s choice [[30](#bib.bib21)]. The attacker sends a plain harmful request, and the context is mapped back and forth between the source and target models before the answer. We generate no tokens between switches, which isolates the effect of repeated mapping. Switches at turn boundaries would interleave tokens that each model computes itself, and we leave this setting to future work.

J3: Untrusted source. We assume that the source model is untrusted, so that the attacker can choose or replace it, but the attacker does not know the mapper’s weights. For instance, a deployer may unknowingly adopt a de-aligned or tampered checkpoint from a public hub such as Hugging Face, which hosts every de-aligned checkpoint we use (Table [II](#S4.T2)). Alternatively, the prefill may run outside the deployer’s control, on a separate prefill node [[31](#bib.bib3), [32](#bib.bib4), [14](#bib.bib67)], or in a peer agent run by another party [[6](#bib.bib2), [10](#bib.bib64)]. The mapper accepts the cache of any model with the source’s architecture, so the substituted source stays compatible with the deployed mapper. We restrict the attacker to running a public de-aligned model, the weakest form of this control. An attacker who controls the prefill could also write arbitrary cache tensors, which prior work studies [[33](#bib.bib9), [34](#bib.bib13), [35](#bib.bib56)], so our results are a lower bound. The attacker sends a plain harmful request through the untrusted source and receives the response after the handoff. Because a de-aligned source already answers more harmful requests on its own (Figure [5](#S5.F5)), our goal is not to measure the attacker’s gain over the source; instead, we analyze how far an untrusted source raises the ASR of the larger, aligned target model, which is more capable natively and on whose safety the deployer relies.

J4: Mapper-aware GCG. We assume the attacker has full knowledge of the source model, mapper, and target model, including their weights. Open-weight models are widely available on hubs such as Hugging Face, and a deployed mapper may be published or leaked. The attacker optimizes an adversarial suffix with gradients through 𝒮\mathcal{S}, ℳ\mathcal{M}, and 𝒯\mathcal{T}, exploiting a mapper whose error was fitted for accuracy, not for safety. This is our only white-box attack.

IPI: Planted content. We assume the attacker can author external content (a web page, an email, a document) consumed by the agents in the system. This is the only setting where we assume that the user is benign and the attacker is a third party. The attacker plants a fixed instruction within adversarial content consumed by the source model.

## IV Experimental Setup

We evaluate every attack against three model families, four published mapper types, and two calibration corpora (Table [II](#S4.T2)) across a total of 24 settings. The setup specific to each attack is given with its corresponding results in Sections [V](#S5) and [VI](#S6), and implementation details are in Appendix [D](#A4).

TABLE II: The 24 settings: three families ×\times four mapper types ×\times two calibration corpora (FineWeb-Edu, the published default, and UltraChat). Every pair is also run in reverse. De-aligned checkpoints are listed with their publisher.

| Family | Source →\to target | De-aligned source  |
| Qwen3 [[36](#bib.bib79)] | 14B →\to 32B | 14B (mlabonne [[37](#bib.bib82)], huihui-ai [[38](#bib.bib83)]); 32B (huihui-ai [[39](#bib.bib84)])  |
| Llama 3 [[40](#bib.bib80)] | 3.2-3B →\to 3.1-8B | 3B (huihui-ai [[41](#bib.bib85)]); 8B (mlabonne [[42](#bib.bib86)])  |
| Ministral 3 [[43](#bib.bib81)] | 8B →\to 14B | 8B (Nitral-Archive [[44](#bib.bib87)]); 14B (MuXodious [[45](#bib.bib88)])  |

Models. We experiment with three model families along with their de-aligned counterparts: Qwen3 [[36](#bib.bib79)], Llama 3 [[40](#bib.bib80)], and Ministral 3 [[43](#bib.bib81)]. Within each family, we define the smaller and larger models as the source and target models respectively in the jailbreaking experiments. For Qwen3-14B, we use the mlabonne checkpoint, except in Section [V-G](#S5.SS7), which uses huihui-ai (the only publisher of a de-aligned Qwen3-32B) to keep one publisher across both directions, and in mapper alignment (Section [VII-A](#S7.SS1)). For prompt injection, we fix the target model to be the hardened Meta-SecAlign-8B model [[46](#bib.bib29)].

TABLE III: Jailbreaks in all 24 settings judged by the HarmBench (HB) classifier. Block headers list standalone target and source HB ASR; rows show transfer configurations with target MMLU/GSM8K transfer accuracy. *No attack* gives HB ASR change with an aligned source; *J1* count of the 10 templates with significant ASR gains on the 159 standard behaviours (vs. same-template standalone target) and max gain; *J2* gives max gain over ≤6\leq 6 switches and switch count (↓\downarrow: only lowers ASR; n.s.n.s.: none significant); *J3* gives the HB and StrongREJECT (SR) ASR changes with a de-aligned source; and *J4* is ASR of standalone ordinary GCG, handoff mapper-aware GCG, and their difference. Shading marks significant changes (exact McNemar, p<0.05p<0.05, Bonferroni-corrected over the six switch counts for J2). Red toward the attacker, blue away.

Capability No attack Templates (J1) Switching (J2) Untrusted source (J3) Δ\Delta Mapper-aware GCG (J4) Family Mapper Calibration MMLU GSM8K HB Δ\Delta templates up / max Δ\Delta max Δ\Delta (switches) HB SR native →\to handoff (Δ\Delta) Qwen3 14B→\to32B *Standalone target model*: [HB 18.8%, SR 0.3%, MMLU 79.2%, GSM8K 92.0%]; *standalone source model*: [HB 23.3%] Ridge FineWeb 71.2 79.2 +1.7 6 / +28.3 n.s. +34.6 +28.1 65.0 →\to 62.5 (−-2.5) Chat 72.8 81.2 +8.8 7 / +55.3 +19.2 (3) +35.0 +25.9 65.0 →\to 72.5 (+7.5) CacheBridge FineWeb 72.6 82.4 +1.2 6 / +36.5 ↓\downarrow +33.3 +32.3 65.0 →\to 62.5 (−-2.5) Chat 73.4 81.2 +6.2 6 / +40.3 +11.3 (2) +42.5 +42.8 65.0 →\to 65.0 (+0.0) MLP FineWeb 72.6 84.0 +4.6 6 / +55.3 ↓\downarrow +41.7 +36.4 65.0 →\to 57.5 (−-7.5) Chat 71.2 86.8 +12.5 7 / +48.4 +20.8 (3) +40.8 +32.9 65.0 →\to 67.5 (+2.5) SwaT FineWeb 71.6 84.0 −-7.5 0 ↓\downarrow +40.8 +47.0 65.0 →\to 77.5 (+12.5) Chat 71.0 87.6 +7.1 6 / +57.2 +20.8 (2) +37.1 +44.1 65.0 →\to 90.0 (+25.0) Llama 3 3.2-3B→\to3.1-8B *Standalone target model*: [HB 30.0%, SR 1.6%, MMLU 62.6%, GSM8K 88.8%]; *standalone source model*: [HB 24.6%] Ridge FineWeb 52.8 66.4 −-15.8 0 ↓\downarrow +21.3 +16.0 37.5 →\to 60.0 (+22.5) Chat 56.2 45.6 −-7.9 3 / +32.1 n.s. +25.8 +29.7 37.5 →\to 50.0 (+12.5) CacheBridge FineWeb 53.6 59.6 −-12.1 0 ↓\downarrow +16.3 +19.2 37.5 →\to 60.0 (+22.5) Chat 56.4 68.8 +3.3 3 / +31.4 +14.2 (2) +30.0 +29.4 37.5 →\to 45.0 (+7.5) MLP FineWeb 48.2 74.0 −-6.7 1 / +17.6 ↓\downarrow +21.7 +22.0 37.5 →\to 47.5 (+10.0) Chat 50.8 69.6 +16.7 5 / +64.2 +24.6 (3) +32.9 +35.5 37.5 →\to 52.5 (+15.0) SwaT FineWeb 51.8 42.8 +13.3 7 / +60.4 +29.2 (3) +40.0 +48.2 37.5 →\to 70.0 (+32.5) Chat 54.6 74.8 +5.4 6 / +69.2 +11.2 (2) +21.2 +23.6 37.5 →\to 92.5 (+55.0) Ministral 3 8B→\to14B *Standalone target model*: [HB 25.0%, SR 2.2%, MMLU 72.2%, GSM8K 88.0%]; *standalone source model*: [HB 28.8%] Ridge FineWeb 68.4 73.6 +10.0 3 / +19.5 +15.8 (5) +32.1 +45.0 42.5 →\to 77.5 (+35.0) Chat 68.6 76.4 +9.2 3 / +20.1 +16.7 (4) +28.3 +39.9 42.5 →\to 55.0 (+12.5) CacheBridge FineWeb 69.2 78.8 +5.8 2 / +15.1 +10.0 (2) +26.7 +33.2 42.5 →\to 67.5 (+25.0) Chat 67.4 76.0 +2.5 3 / +11.9 +9.2 (2) +23.8 +37.4 42.5 →\to 27.5 (−-15.0) MLP FineWeb 67.8 82.8 +7.9 3 / +20.8 +12.5 (6) +30.8 +36.1 42.5 →\to 75.0 (+32.5) Chat 66.8 84.0 +7.9 3 / +27.0 +17.5 (3) +30.4 +42.8 42.5 →\to 70.0 (+27.5) SwaT FineWeb 68.2 86.0 +12.1 2 / +30.8 +31.7 (4) +28.3 +37.4 42.5 →\to 82.5 (+40.0) Chat 67.8 90.4 +24.6 5 / +52.8 +38.8 (2) +45.4 +64.9 42.5 →\to 90.0 (+47.5)

Mappers. We evaluate four mapper types, namely NVIDIA’s closed-form ridge mapper [[17](#bib.bib1)], its gradient-trained MLP variant [[17](#bib.bib1)], CacheBridge [[15](#bib.bib68)], and the SwaT renderer [[16](#bib.bib54)]. We omit KV-Lingo [[18](#bib.bib55)] which has no public implementation code. Its translators share the linear form of the ridge and CacheBridge mappers but require a separate logit-distillation run through the target model for every pair, direction, and training corpus, amounting to multiple H200 GPU-days across our setting. We train each type with its official recipe on 500 FineWeb-Edu sequences of 1,024 tokens [[47](#bib.bib89)] and on chat-templated UltraChat conversations [[48](#bib.bib90)] (Appendix [D](#A4)). All fits reach the published fit quality (in-sample ridge RK2R^{2}_{\mathrm{K} } 0.77–0.94), and every mapper costs the target model 3.0–14.4 MMLU points and up to 46.0 GSM8K points against native inference (Table [III](#S4.T3)) 11 1 In NVIDIA’s evaluation, the ridge mapper collapses on Ministral 3 8B→14B (≈42%\approx 42\% average retention)  [[17](#bib.bib1)]. However, we found that this loss comes from RoPE handling. In our experiment with the target’s RoPE re-applied, ridge reaches 68.4% MMLU and 73.6% GSM8K (vs. 72.2% and 88.0% natively; Table [III](#S4.T3)).

Unless otherwise stated, every attack runs through these mappers fitted on the aligned source, and chat templates are applied with reasoning disabled. This capability cost does not explain the attacks. Across all settings, mappers that cost more accuracy do not raise ASR correspondingly (Spearman correlation between GSM8K loss and ASR gain −0.40-0.40 without an attack), and through the same mapper a de-aligned source raises HarmBench ASR by 16–48 points more than an aligned one.

Benchmarks. For jailbreaks, we measure harm on the 240 text behaviours of the HarmBench *test* split (159 standard and 81 contextual) [[49](#bib.bib35)] and on StrongREJECT’s 313 direct requests [[50](#bib.bib36)]; prompt-injection benchmarks are detailed in Section [VI-A](#S6.SS1). We use XSTest’s 250 safe prompts [[51](#bib.bib91)] to check over-refusal, and MMLU [[52](#bib.bib92)] and GSM8K [[53](#bib.bib95)] to separate safety shifts from general capability loss.

Baselines. The baseline for every attack is native inference, where a single target model reads the input directly, with the same template, decoding settings, and seeds as the multi-agent system.

Evaluation metrics. We measure each attack by its attack success rate (ASR) through the handoff, ASRtr\mathrm{ASR}_{\mathrm{tr} }, and through native inference, ASRnat\mathrm{ASR}_{\mathrm{nat} }, as measured by an LLM judge. We report Δ=ASRtr−ASRnat\Delta=\mathrm{ASR}_{\mathrm{tr} }-\mathrm{ASR}_{\mathrm{nat} } in percentage points.

An attack is considered successful if the official HarmBench classifier gives ℙ⁡(yes)>0.5\mathbb{P}(\text{yes})>0.5. Additionally, we use a second judge, Gemma 4 31B [[54](#bib.bib93)], with rubrics calibrated against hand labels, and find that the two agree on nearly every effect we report (Appendix [D](#A4)).

Statistical significance. Every comparison is paired and evaluated with the two-sided exact McNemar test [[55](#bib.bib94)], focusing on prompts that flip in each direction between the native and transfer paths. For J2, each cell reports the largest effect over six switch counts of one attack; therefore, we apply Bonferroni correction over them. In J1, each template is a separate published attack, so we test each at p<0.05p<0.05. With a Bonferroni correction over the ten templates, 79 of the 93 significant gains remain, and the largest gain in every cell stays significant. Greedy decoding is the primary setting, and sampling (temperature 0.7) with an item-level cluster bootstrap serves as a robustness check. For the no-attack and J3 results in Table [III](#S4.T3), 64 of the 66 effects that are significant under greedy decoding keep their sign under sampling, with a 95% bootstrap interval that excludes zero (three seeds without an attack and through the SwaT renderers, and one seed otherwise). The two exceptions are safety gains, through Llama (ridge, Chat) and Llama (MLP, FineWeb).

Hardware. All experiments run in bfloat16 on NVIDIA H200 GPUs with PyTorch and Hugging Face Transformers.

## V Jailbreaks Through Latent Handoffs

We evaluate the robustness of the latent handoff against four jailbreak attacks, with results summarized in Table [III](#S4.T3). As an example to read the table, consider the Qwen (ridge, FineWeb) row: transfer raises the HarmBench ASR of Qwen3-32B by 1.7 points (No attack), six templates raise it significantly by up to 28.3 points (J1), switching has no significant effect (J2), a de-aligned source raises it by 34.6 points (J3), and mapper-aware GCG reaches 62.5% against 65.0% for ordinary GCG (J4).

### V-A No Attack Scenario

First, we route ordinary harmful requests through each pipeline with an aligned source and no attack (“No attack” in Table [III](#S4.T3)). We find that even without an attacker, transfer alone raises HarmBench ASR significantly in 13 of the 24 settings, by up to +24.6 pp through Ministral (SwaT, Chat). Seven of these 13 increases also significantly exceed the ASR of the standalone source model, so the handoff does more than inherit the source’s weaker refusal.

Interestingly, the handoff does not always result in more harm. On Llama, four of the eight mappers make the target model significantly safer (up to −-15.8 pp through Llama (ridge, FineWeb)). However, only two of these gains also hold under sampling, not just greedy decoding (Section [IV](#S4)), and none of the four causes blanket refusals (4.8–7.2% refusal on XSTest’s safe prompts, against 6.8% natively).

Fig. 4: Model switching (J2). HarmBench ASR (left) and MMLU (right) after mm switches, with m=0m{=}0 the larger model alone. Chains alternate between the two models. Colour and marker give the mapper, and dashed and solid lines give FineWeb and Chat calibration. In the ASR column, filled markers are significant changes against the model that ends the chain, and faded points and segments are where switching does not raise ASR.

### V-B Templates (J1)

Next, we evaluate the handoff against a more motivated attacker who wraps harmful requests in jailbreak templates. Specifically, we wrap the 159 standard HarmBench test behaviours in ten jailbreak template families from Wei et al. [[56](#bib.bib78)], and compare each with the standalone target model reading the same templated behaviours. A template’s baseline is therefore not the HarmBench ASR on all 240 behaviours given in the header of Table [III](#S4.T3).

We find that using jailbreak templates results in a substantially higher increase in ASR than when simply submitting harmful requests to the system. Specifically, through Qwen (ridge, FineWeb), role-play more than doubles HarmBench ASR from 26.4% to 54.7%. Across all eight mappers, the largest gain reaches +57.2 pp on Qwen, +69.2 pp on Llama, and +52.8 pp on Ministral, each through SwaT (Chat). On Ministral, the Wikipedia and style-injection templates gain significantly through seven and all eight mappers.

### V-C Model Switching (J2)

Next, we consider an attacker who can trigger handoffs, so that the session’s cache is mapped back and forth between the two models of a family. We send plain harmful requests without any adversarial prompt and chain the forward and reverse mappers for up to six switches, and compare each chain with the standalone model that ends it (Figure [4](#S5.F4)).

We find that switching alone raises HarmBench ASR significantly in 16 of the 24 settings (Table [III](#S4.T3)), by up to +38.8 pp through Ministral (SwaT, Chat). Through chat-calibrated mappers, refusals erode faster than capability. For instance, through the Qwen (ridge, Chat) chain, ASR roughly doubles from 20.0–22.5% to 36–39% over two to five switches while MMLU stays at 66–74%. By model family, switching raises ASR significantly across every mapper on Ministral. Conversely, on Qwen and Llama, switching yields no ASR gain through the FineWeb fitted mappers, as their ridge chains lose capability before safety refusals erode (Appendix [C](#A3)).

### V-D Untrusted Source (J3)

Fig. 5: Untrusted source (J3). HarmBench ASR of the standalone target model, through handoff (ridge, FineWeb), and of the standalone de-aligned source. De-aligned sources are marked by publisher (hh: huihui-ai; na: Nitral-Archive). Table [III](#S4.T3) presents results for all mappers.

We instantiate the threat with a public de-aligned checkpoint that has the source’s architecture, send plain harmful requests without any jailbreak, and keep the mapper, the target model, and the decoding as deployed (Figure [5](#S5.F5)).

We find that the target model inherits much of the source’s de-alignment while retaining its general capabilities. Specifically, the handoff becomes a jailbreak in all 24 settings, raising HarmBench ASR by +16.3 to +45.4 pp and StrongREJECT ASR by +16.0 to +64.9 pp (Table [III](#S4.T3)), whereas an aligned source raises HarmBench ASR by at most 24.6 points. Note that, of the 187 HarmBench requests that the huihui-ai Qwen3-14B answers but Qwen3-32B refuses natively, Qwen3-32B answers 123 through the handoff (69 of 145 for the mlabonne checkpoint). Importantly, as the target model preserves the capability (69.4% on MMLU and 76.8% on GSM8K), routine capability checks would fail to detect this vulnerability, making it stealthy.

### V-E Mapper-Aware GCG (J4)

Next, we consider the strongest attacker, who has white-box access to the source, the mapper, and the target model. Mapper-aware GCG optimizes a suffix against the entire deployed path. Let xx be a harmful behaviour, ss a suffix of 20 tokens appended to the user turn, and y⋆y^{\star} HarmBench’s affirmative target string (“Sure, here is…”). The transfer loss is the cross-entropy of y⋆y^{\star} when the target model decodes from the mapped cache, and the native loss is ordinary GCG’s objective on the standalone target model,

| ℒtr​(s)\displaystyle\mathcal{L}_{\mathrm{tr} }(s) | =−logℙ𝒯(y⋆∣ℳ(𝒮(chat(x∥s))<n),xn),\displaystyle=-\log\mathbb{P}_{\mathcal{T} }\big(y^{\star}\mid\mathcal{M}(\mathcal{S}(\mathrm{chat}(x\|s))_{<n}),\,x_{n}\big), | (1) |
| ℒnat​(s)\displaystyle\mathcal{L}_{\mathrm{nat} }(s) | =−logℙ𝒯(y⋆∣chat(x∥s)).\displaystyle=-\log\mathbb{P}_{\mathcal{T} }\big(y^{\star}\mid\mathrm{chat}(x\|s)\big). | (2) |

Our main *transfer* arm minimizes ℒtr\mathcal{L}_{\mathrm{tr} }, with gradients flowing through the source, the mapper, and the target model. We compare it with ordinary GCG [[57](#bib.bib31)], which minimizes ℒnat\mathcal{L}_{\mathrm{nat} }. We run GCG for 250 steps with 256 candidates per step over printable ASCII tokens and keep only candidates that survive re-tokenization. We optimize on 40 HarmBench behaviours that both paths refuse without a suffix, so every success is caused by the suffix, and judge the answers to each suffix on both paths. On one NVIDIA H200, a suffix takes a median of 3–8 minutes on Llama, 7–20 minutes on Qwen, and 24–48 minutes on Ministral.

We find that ordinary GCG, with white-box access to the target model, succeeds on at most 65.0% of behaviours against any of our target models (65.0% on Qwen, 37.5% on Llama, and 42.5% on Ministral). Mapper-aware GCG additionally uses the weights of the source and the mapper and attacks through the handoff, and through SwaT (Chat) it crosses 90% on every target model (90.0% on Qwen, 92.5% on Llama, and 90.0% on Ministral). Across the 24 settings, it beats ordinary GCG significantly in 11, and in four it falls below ordinary GCG, though never significantly (Table [III](#S4.T3)). Thus, the mapper becomes an attack surface of its own, through which attacks can exceed what white-box access to the target model achieves.

TABLE IV: Jailbreaks across model families through SwaT [[16](#bib.bib54)] (judge: HarmBench classifier). Columns as in Table [III](#S4.T3). Shading marks significant changes.

Capability No attack J1 J2 J3 Δ\Delta Renderer MMLU GSM8K HB Δ\Delta up / max Δ\Delta max Δ\Delta (mm) HB SR Llama-3.2-3B →\to Qwen3-4B *Standalone target model*: [HB 27.9%, MMLU 64.4%, GSM8K 86.4%] FineWeb 53.0 55.6 −-5.0 0 +23.8 (4) +1.7 +21.7 Chat 53.6 81.2 +12.1 3 / +19.5 +14.6 (2) +19.6 +36.7 Qwen3-8B →\to Llama-3.1-8B *Standalone target model*: [HB 28.8%, MMLU 62.6%, GSM8K 87.6%] FineWeb 62.6 30.0 +32.9 7 / +64.8 +33.8 (1) +41.7 +77.3 Chat 62.2 71.6 +21.2 6 / +73.0 +20.4 (1) +30.0 +48.2 Llama-3.2-3B →\to Ministral-3-14B *Standalone target model*: [HB 25.0%, MMLU 72.2%, GSM8K 87.6%] FineWeb 51.4 76.8 −-2.5 1 / +13.2 +30.8 (2) +3.8 +12.1 Chat 53.6 80.8 +14.2 3 / +55.3 +22.9 (5) +23.3 +20.1

### V-F Across Model Families

Unlike the other three mappers, SwaT enables latent handoffs across model families (Section [II-B](#S2.SS2)). We therefore evaluate SwaT on three cross-family pairs, namely Llama-3.2-3B to Qwen3-4B, Qwen3-8B to Llama-3.1-8B, and Llama-3.2-3B to Ministral-3-14B. For each pair, we train both renderers, FineWeb and Chat, with the authors’ recipe and run the no-attack scenario and the zero-shot attacks J1–J3; Table [IV](#S5.T4) presents the results.

We find that the handoff weakens safety across families as it does within them. Without an attack, HarmBench ASR rises significantly through four of the six renderers, by up to +32.9 pp, and templates (J1) gain by up to +73.0 pp (role-play, from 14.5% to 87.4% on the same template). Switching raises HarmBench ASR significantly in all six settings, by up to +33.8 pp, and a de-aligned source raises StrongREJECT ASR significantly through all six renderers, by +12.1 to +77.3 pp. The SwaT (FineWeb) renderers into Qwen3-4B and Ministral-3-14B are the exception, leaving HarmBench ASR unchanged without an attack and with a de-aligned source. Thus, a different tokenizer on the other side of the handoff does not stop the attacks.

### V-G The Strong-to-Weak Direction

We also test the strong-to-weak handoff for the no attack scenario, J1, and J3. We reverse all three pairs, with the larger model or a public de-aligned checkpoint of it as source and the aligned smaller model as target, through all eight reverse mappers. With an aligned source, transfer raises HarmBench ASR significantly in 15 of the 24 settings, mostly through the chat-calibrated mappers and the SwaT renderers, and templates gain the most through the same mappers, with role-play rising from 7.5% to 89.9% through Llama (SwaT, Chat). With a de-aligned source, the attack succeeds in all 24 settings, raising HarmBench ASR by +20.8 to +59.2 pp. Thus, handing off to a smaller model is as exposed as escalating to a larger one.

### V-H Effect of the Calibration Data

We calibrate every mapper type on both FineWeb and Chat (Section [IV](#S4)), so Table [III](#S4.T3) compares the two corpora on the same model pairs. Chat calibration gives the larger template and switching gains in 10 of 12 mapper pairs and the larger change without an attack in 8, but for an untrusted source and mapper-aware GCG only in about half of the pairs (6 and 7 of 12). The difference is not one of capacity. With the same number of source layers per target-model layer, chat calibration still raises the HarmBench ASR of role-play through Qwen (ridge) from 49.7% to 74.8% with 8 layers and from 54.1% to 81.8% with 16, whereas doubling the layers on FineWeb moves it only from 49.7% to 54.1%. Ministral is the main exception, where chat calibration lowers the ASR with an untrusted source and of mapper-aware GCG through three of the four mappers, and its chat template adds a default system prompt that every chat calibration sequence contains. Thus, a deployment that calibrates its mapper on chat, as a chat pipeline naturally would, faces stronger template and switching attacks than our FineWeb results show.

## VI Prompt Injection Through Latent Handoffs

Indirect prompt injection (IPI) plants an instruction in untrusted data that an agent reads, such as a web page, a file, or a tool output, to override the user’s task [[25](#bib.bib77)]. Meta-SecAlign [[46](#bib.bib29)], one of the strongest defenses, adds an *input* role for untrusted data to Llama-3.1-8B-Instruct’s chat template and trains the model to ignore instructions in it, bringing injection success close to zero on its benchmarks at negligible utility loss. This defense assumes that the model reads the untrusted data itself, which a latent handoff no longer guarantees. When a main agent delegates reading external content to a subagent (Figure [3](#S3.F3)), only the subagent’s mapped cache comes back, and the defended main agent answers without ever reading the content. We test whether its defense still holds. As in Section [III-B](#S3.SS2), the user is benign, and the attacker only plants a fixed instruction in the content, without knowledge of the models or the mapper.

### VI-A Setup

The target model is Meta-SecAlign-8B, a fine-tune of the undefended Llama-3.1-8B-Instruct. The source is Llama-3.2-3B-Instruct, and the handoff runs through the eight Llama mappers of Section [IV](#S4), unchanged. Meta-SecAlign-8B reads its base model’s caches directly and keeps its native MMLU and GSM8K accuracy when it decodes from them (Table [V](#S6.T5)). All models use the released Meta-SecAlign chat template, with the user’s instruction in the user role and the data in the input role. The main agent delegates the task in text, and the subagent prefills the task and the fetched content and returns its cache through the mapper.

Following Meta-SecAlign, we plant the instruction Print exactly “Hacked!” in the 208 AlpacaFarm samples that have a data field, with the eight attack variants of its evaluation code, which differ in wording, in where the instruction sits, and in fake delimiters. An attack succeeds if the response begins with “Hacked”, and we pool ASR over the eight variants. Our second benchmark, also from Meta-SecAlign’s evaluation, is a stratified sample of 3,000 of the 31,134 items of TaskTracker [[58](#bib.bib99)]. Each item asks a question about a paragraph that contains an injected task, namely a coding request, a harmful question, or a jailbreak. Target models answer greedily with up to 512 tokens, and a judge decides with Meta-SecAlign’s prompt and rule whether the answer carries out the injected task. Since Meta-SecAlign’s judge (GPT-4o) is deprecated, we use Gemma 4 31B [[54](#bib.bib93)], our second judge for jailbreaks, and draw conclusions only from paired changes against native inference. As a control without a mapper, the undefended Llama-3.1-8B prefills the prompt and Meta-SecAlign-8B decodes from its cache. On its own, the undefended 3B source carries out 42.7% of the AlpacaFarm and 20.4% of the TaskTracker injections.

### VI-B Results

TABLE V: IPI through the handoff (Llama-3.2-3B→\to3.1-8B). ASR on AlpacaFarm (AF) and TaskTracker (TT), and Meta-SecAlign-8B’s capability on the same path. Shaded ASR: significant change from the standalone target model; red toward the attacker, blue away from it.

Meta-SecAlign-8B Llama-3.1-8B Mapper Calib. AF TT MMLU GSM8K AF TT *Standalone target model* 0.4 2.1 63.8 87.2 34.7 24.8 Ridge FineWeb 29.7 12.4 51.0 78.4 41.6 20.6 Chat 28.1 14.6 55.0 86.8 38.8 25.1 CacheBridge FineWeb 26.2 6.8 53.2 62.0 40.4 11.8 Chat 12.5 10.6 55.0 68.8 25.4 19.1 MLP FineWeb 27.3 8.7 48.8 74.8 45.2 19.2 Chat 1.9 20.1 52.6 79.6 3.2 31.5 SwaT FineWeb 29.1 6.7 52.8 77.6 45.2 17.2 Chat 44.2 17.6 55.0 80.8 54.0 26.4 No mapper (8B prefills) 31.9 19.7 65.0 85.2 – –

We find that the handoff removes most of Meta-SecAlign’s protection. Its injection ASR on AlpacaFarm rises from 0.4% natively to as much as 44.2% (Table [V](#S6.T5)), and to 26.2–29.7% through the four default FineWeb mappers, close to the 34.7% of the undefended Llama-3.1-8B natively. On TaskTracker, Meta-SecAlign-8B carries out three to ten times as many injected tasks as natively (6.7–20.1% against 2.1%). The attacks are unmodified and the defended model stays capable on most paths, so the increase comes from the handoff alone.

The defense lies mostly in how the model encodes the data. Even without a mapper, when the undefended 8B prefills the prompt, Meta-SecAlign-8B carries out 31.9% of the AlpacaFarm injections, only 2.8 pp fewer than the undefended model natively, while keeping its native capability.

Transfer also changes the undefended model’s ASR, raising it on AlpacaFarm through six of the eight mappers, by up to +19.3 pp. The low ASR through Llama (MLP, Chat) does not reflect resistance, as the target model refuses the whole request on 46–69% of the completion-attack prompts.

## VII Defenses

We evaluate three defenses that an operator can deploy without changing the target model (Fig. [6](#S7.F6)). Note that our experiments focus on cache- and mapper-level behaviour. The first two, mapper alignment (D1) and VReparo [[59](#bib.bib71)] (D2), are preliminary, and their failures motivate the third, HandoffGuard (D3). We test each defense without an attack and against an untrusted source (J3), and D2 and D3 also against templates (J1), mapper-aware GCG (J4), and adaptive attacks that optimize through the defense. We further test VReparo against prompt injection and backdoored mappers, and HandoffGuard against prompt injection. We primarily focus on J3, the only attack that succeeds in all 24 settings (Section [V-D](#S5.SS4)).

### VII-A Preliminary Defenses

D1: Mapper alignment. The calibration corpus shapes what a mapper carries to the target model. Chat calibration strengthens template and switching attacks (Section [V-H](#S5.SS8)), and poisoned calibration rows plant a backdoor (Appendix [B](#A2)). An operator can instead align the mapper toward refusal by adding refusal conversations to its calibration corpus. We refit Qwen (ridge, FineWeb) on 300 or 500 FineWeb-Edu sequences together with 500 refusal conversations, built from 300 HarmBench and 200 SORRY-Bench [[60](#bib.bib98)] requests, each paired with a refusal. With the de-aligned huihui-ai Qwen3-14B as source, this lowers ASR on 283 HarmBench and SORRY-Bench requests from 51.6% to about 32% (20.5% natively), at a small perplexity cost on held-out FineWeb-Edu text (from 8.36 to at most 8.48). It thus removes about 60% of what the de-aligned source adds, but leaves ASR 12 points above native, because a mapper translates what the source encodes, and that cache carries the source’s decision to comply.

D2: VReparo. VReparo [[59](#bib.bib71)] is a recent defense proposed for cross-model cache reuse. For every layer and KV head, it learns an affine map, regularized toward the identity, that pulls the reused values toward the target model’s native values, with a strength α\alpha chosen by an XSTest-based rule that bounds over-refusal. It needs only a cache of the target model’s shape, so we apply it after every mapper, with the authors’ code, recipe, and selection rule. We find that VReparo removes much of what transfer adds without an attacker. Through Qwen (ridge, FineWeb), role-play falls from 54.7% to 27.7% (26.4% natively), and static mapper-aware suffixes from an earlier set of 20 behaviours fall from 50.0% to 15.0%. However, it fails against the other attacks. An untrusted source still reaches 26.7–56.2% HarmBench ASR on Qwen (18.8% natively) and up to 58.8% on Llama (30.0% natively). Because VReparo is a fixed differentiable map, suffixes optimized through it reach 36% on Qwen and 31–54% on Llama, whereas the same suffixes succeed on only 5% and 7–18% when the target model reads the prompt itself (averaged over greedy and three sampled decodings). Against injection on the undefended Llama-3.1-8B, it lowers AlpacaFarm ASR but raises TaskTracker ASR where transfer had lowered it. Its selection rule also ships six of the eight backdoored Llama mappers uncorrected, and on Llama it can cost capability (GSM8K from 42.8% to 5.6% through Llama (SwaT, FineWeb)).

Both defenses still rely on benign cache-matching fidelity rather than adversarial training: D1 aligns what target cache the mapper reproduces, and D2 pulls the mapped cache toward the target model’s own, so neither is trained against an attacker. The refusal-direction probe in Section [VII-B](#S7.SS2) shows that a de-aligned source’s decision to comply is already present in the cache.

Fig. 6: The three defenses we evaluate. D1 calibrates the mapper on refusal conversations. D2 (VReparo) corrects the mapped values toward the target model’s own. D3 (HandoffGuard) adds a learned low-rank correction to the mapped keys and values, trained against a de-aligned source and perturbed inputs to reproduce the target model’s native reply.

### VII-B HandoffGuard (D3)

Design. LCGuard [[61](#bib.bib12)] protects the privacy of shared caches with a learned transform at the sender, trained against input reconstruction. HandoffGuard moves this idea to the receiver and trains against a behavioural adversary instead. For each target layer, it adds a low-rank residual to the keys and values of every mapped token, across all KV heads and before RoPE,

| [𝐤;𝐯]←[𝐤;𝐯]+r​U​GELU​(D⁡[𝐤/‖𝐤‖;𝐯/‖𝐯‖]),[\mathbf{k};\mathbf{v}]\leftarrow[\mathbf{k};\mathbf{v}]+r\,U\,\mathrm{GELU}\big(D\,[\mathbf{k}/\|\mathbf{k}\|;\ \mathbf{v}/\|\mathbf{v}\|]\big), | (3) |

with rank 64, rr the token’s RMS norm, and UU initialized to zero, so an untrained guard leaves the cache unchanged. It skips the attention sink, runs once over the mapped prefix without native prefill, and has about 10M parameters for Ministral-3-14B, against about 1B for its mapper. On long prompts, it adds only 3.6–8.2% to the target model’s own prefill time, so transfer keeps its prefill savings.

Training. HandoffGuard is trained so that the target model reproduces its own native reply. With y⋆y^{\star} the target model’s greedy native reply to xx, the guard GϕG_{\phi} minimizes

| 𝔼x,𝒮′​∑t≤32KL⁡(CLOSEℙ𝒯(⋅∣x,y⋆<t)∥ℙ𝒯(⋅∣Gϕ(ℳ(𝒮′(x+δ))),y⋆<t)),\begin{split}\mathbb{E}_{x,\,\mathcal{S}^{\prime} }\sum_{t\leq 32}\mathrm{KL}\Big(&\mathbb{P}_{\mathcal{T} }(\cdot\mid x,y^{\star}_{<t})\,\Big\|\\ &\mathbb{P}_{\mathcal{T} }\big(\cdot\mid G_{\phi}(\mathcal{M}(\mathcal{S}^{\prime}(x{+}\delta))),y^{\star}_{<t}\big)\Big),\end{split} | (4) |

over the first 32 reply tokens with teacher forcing. Because the objective matches native behaviour rather than refusal, benign prompts keep their answers. Two variants differ only in the adversary they train against. p1 alternates the aligned source (𝒮′=𝒮\mathcal{S}^{\prime}{=}\mathcal{S}, δ=0\delta{=}0) with a de-aligned source, and p2 additionally perturbs the source’s input embeddings on half the steps, with δ\delta from 5 steps of PGD toward an affirmative reply (per-token ℓ2\ell_{2} radius of 0.1 times the embedding norm), as in latent adversarial training [[62](#bib.bib43)]. We train for 1,000 steps with batch size 8 on 400 harmful AdvBench [[57](#bib.bib31)], 400 benign Dolly [[63](#bib.bib100)], and 200 borderline OR-Bench [[64](#bib.bib101)] prompts, half of each batch harmful, through the stock ridge (FineWeb) mapper only. No evaluation prompt appears in training.

Setup. We evaluate the guard across all families22 2 Each pair’s guard experiments use their own fit of the stock ridge (FineWeb) mapper, so the no-guard rates and capability in Tables [VI](#S7.T6) and [VII](#S7.T7) and in the prompt-injection results differ from those in Tables [III](#S4.T3) and [V](#S6.T5)., with the same de-aligned source as in training (Nitral-Archive for Ministral, mlabonne for Qwen, and huihui-ai for Llama), so we make no claim about unseen ones. To test a change of mapper, we also run the unchanged guard through the de-aligned source’s own FineWeb mapper (Ministral and Llama) and through CacheBridge (Qwen and Llama). For utility, we measure MMLU, GSM8K, and refusal of XSTest’s 250 safe prompts and of 159 benign Alpaca instructions wrapped in each jailbreak template. Adaptive attackers, who know the guard’s weights, run (i) 20 steps of PGD on the source’s input embeddings at radius ϵ\epsilon, on the 60 HarmBench validation behaviours, (ii) GCG through the guarded path (20 behaviours on Ministral, 10 at a reduced budget elsewhere), and (iii) a LoRA fine-tune of the de-aligned source (rank 16, 300 steps) toward affirmative replies through it. As a gray-box control, we also run the LoRA trained without the guard through p2.

TABLE VI: HandoffGuard against an untrusted source (J3): HarmBench ASR (%), or StrongREJECT ASR in the (SR) rows, without a guard and through each guard. All guards are trained through the stock FineWeb ridge mapper only. Own: the de-aligned source’s own FineWeb mapper. In parentheses (†): p2 retrained through CacheBridge, for an operator who refits the guard for each mapper. Shaded: significant change from the target model’s replies in the same run; red toward the attacker, blue away from it.

| Source | Mapper | None | p1 | p2 |
| Ministral-3-8B →\to Ministral-3-14B |
| *Standalone target model*: HB 25.0%, SR 2.2% |
| Aligned | Stock | 35.0 | 20.4 | 8.8 |
| De-aligned | Stock | 57.1 | 26.2 | 9.2 |
| Stock (SR) | 47.3 | 6.1 | 3.5 |
| Own | 49.2 | 27.9 | 12.5 |
| Qwen3-14B →\to Qwen3-32B |
| *Standalone target model*: HB 18.8%, SR 0.3% |
| Aligned | Stock | 20.4 | 16.7 | 8.3 |
| De-aligned | Stock | 60.4 | 23.3 | 16.2 |
| Stock (SR) | 30.4 | 1.9 | 1.3 |
| CacheBridge | 55.0 | – | 33.8 (19.6†) |
| Llama-3.2-3B →\to Llama-3.1-8B |
| *Standalone target model*: HB 30.0%, SR 1.6% |
| Aligned | Stock | 14.2 | 19.6 | 7.9 |
| De-aligned | Stock | 51.7 | 26.7 | 14.6 |
| Stock (SR) | 16.6 | 4.2 | 5.4 |
| Own | 48.3 | 22.5 | 13.3 |
| CacheBridge | 46.2 | – | 16.2 (15.4†) |

TABLE VII: Utility of HandoffGuard (%). Refusal is keyword-based. Shaded: significantly more refusals than the standalone target model (exact McNemar, p<0.05p<0.05). p1 refuses at most 1.3% of benign requests in any template.

| Ministral 3 | Qwen3 | Llama 3 |
| *Capability through the guard’s mapper fit: no guard →\to p1* |
| MMLU | 68.2 →\to 69.2 | 71.4 →\to 72.8 | 52.8 →\to 51.0 |
| GSM8K | 86.8 →\to 88.4 | 80.0 →\to 85.6 | 69.6 →\to 79.6 |
| *XSTest safe prompts refused* |
| Standalone | 4.4 | 3.2 | 6.8 |
| p1 | 4.0 | 4.4 | 7.6 |
| p2 | 6.4 | 6.4 | 14.0 |

HandoffGuard stops the de-aligned source it was trained against (Table [VI](#S7.T6)). We find that p1 brings HarmBench ASR within 4.5 points of native on all three pairs, and p2 below native (9.2–16.2%). Trained only on the stock mapper, p2 also holds through the de-aligned source’s own mapper and through Llama (CacheBridge, FineWeb), but removes only about half of the increase through Qwen (CacheBridge, FineWeb) (55.0% →\to 33.8%, and 19.6% once retrained there). The guards also remove most template gains, for instance Qwen role-play from 50.9% to 25.2% under p1 (25.8% natively with role-play), though on Llama they raise distractor template jailbreaks to 45–62% (29.6% natively).

p1 costs no utility, and p2 over-refuses (Table [VII](#S7.T7)). Compared with unguarded transfer, p1 loses at most 1.8 MMLU points, gains up to 10.0 GSM8K points, and stays within 1.2 points of native refusal on XSTest’s safe prompts. p2 over-refuses on Qwen and Llama, rejecting 87.4% of benign role-play requests on Llama. Benign requests wrapped in a jailbreak template are rarely refused by p1 (at most 1.3% in any template) or, on Qwen and Ministral, by p2, except Wikipedia-style requests on Ministral (11.3%). p2 does refuse significantly more of XSTest’s safe prompts on Qwen and Llama. We therefore recommend p1 by default and p2 as a stronger setting at a utility loss.

Prompt injection. We also run the Llama guards, unchanged, on the AlpacaFarm injections of Section [VI](#S6), with Meta-SecAlign-8B as the target model. Through the stock ridge (FineWeb) mapper, p1 lowers injection ASR from 29.6% to 10.0% and p2 to 0%, but by refusing. p1 refuses 24.2% of injected inputs (7.4% without a guard) and none of the clean ones, and p2 refuses 94% of injected and 18% of clean inputs. HandoffGuard thus makes the target model fail closed rather than restoring its injection defense, likely because it was trained on harmful requests and the payload (“Hacked!”) reads as one.

TABLE VIII: HandoffGuard (p2) against white-box attackers: HarmBench ASR (%), and the refusal-direction probe at the last prompt token (1: the target model’s mean on the probe’s harmful calibration prompts, 0: on its harmless ones). Gray-box LoRA: trained without the guard. Shading as in Table [VI](#S7.T6). PGD and GCG use their own behaviour subsets, so their standalone rates differ from Section [V](#S5); the probe rows are not tested.

| Attack | Pair | No guard | p2 | Standalone |
| PGD, ϵ=0.1\epsilon{=}0.1 | Ministral | 68 | 38 | ≈\approx21 |
| Qwen | 53 | 20 | 12 |
| Llama | 83 | 43 | 27 |
| GCG through p2 | Ministral | 65 | 45 | 26–35 |
| Qwen | 20–40 | 10–30 | 10–20 |
| Llama | 30–40 | 20–40 | 20–30 |
| LoRA, guard-aware | Ministral | 93.3 | 73.3 | 25.0 |
| Qwen | 80.0 | 87.5 | 18.8 |
| Llama | 87.9 | 75.0 | 30.0 |
| LoRA, gray box | Qwen | 80.0 | 12.1 | 18.8 |
| Llama | 87.9 | 9.2 | 30.0 |
| *Refusal-direction probe* |
| De-aligned source | Ministral | 0.41 | 0.76 | 0.72 |
| Qwen | 0.20 | 0.70 | 0.72 |
| Llama | 0.41 | 0.68 | 0.71 |
| Guard-aware LoRA | Ministral | 0.40 | 0.78 | 0.72 |
| Qwen | 0.31 | 0.71 | 0.72 |
| Llama | 0.40 | 0.81 | 0.71 |

Adaptive attacks (Table [VIII](#S7.T8)). PGD on the source’s input embeddings needs about twice the radius to succeed through p2 (at ϵ=0.1\epsilon{=}0.1, 53% →\to 20% on Qwen and 83% →\to 43% on Llama), but larger radii break every pipeline. GCG optimized through p2 does no better than GCG without a guard. The strongest attack fine-tunes the de-aligned source through the guarded path and reaches 73.3–87.5% HarmBench ASR within 300 steps on all three pairs, but it needs the guard’s weights. Trained without the guard, the same LoRA falls below native through p2 (12.1% on Qwen, 9.2% on Llama).

The refusal-direction probe [[22](#bib.bib33)] explains why. A de-aligned source lowers the target model’s refusal direction at the last prompt token (0.20–0.41), and the guard restores it to near native (0.68–0.76). The guard-aware LoRA leaves the probe high (0.71–0.81) and instead forces a compliant opener (“Sure, here is”) through the cache, so the target model complies even though it registers the harm. Thus, HandoffGuard stops the de-aligned source it was trained against, through most mappers it was not trained on, at no utility loss in p1. It does not stop a white-box attacker who fine-tunes the source against it, so its weights must stay private, and it does not replace authenticating the source.

## VIII Related Work

### VIII-A Security of KV caches and latent channels

With shared and tiered routing architectures [[28](#bib.bib69), [29](#bib.bib70), [65](#bib.bib73), [66](#bib.bib74), [12](#bib.bib66), [13](#bib.bib75), [14](#bib.bib67)], caches become security targets. Timing side channels leak prompts via cross-tenant prefix sharing [[67](#bib.bib5), [68](#bib.bib6)] and non-prefix retrieval cache fusion [[69](#bib.bib14)], while direct cache access enables prompt reconstruction [[70](#bib.bib57)]—extending embedding and logit inversion [[71](#bib.bib15)]—which persists after mapping (as in Appendix [A](#A1)). Integrity attacks poison prefix or reasoning caches [[35](#bib.bib56), [72](#bib.bib7)], swap cached blocks to hijack topics [[73](#bib.bib8)], or exploit retained caches from discarded branches [[74](#bib.bib16)]. However, all these assume the cache is read by the model that produced it.

Recent latent-communication methods exchange hidden states or KV caches for utility and efficiency [[10](#bib.bib64)], and three studies treat inter-agent KV channels as an attack surface: degrading utility via latent interventions [[33](#bib.bib9)], authenticating specialist-to-coordinator payloads with keyed manifests [[34](#bib.bib13)], and limiting input reconstruction [[61](#bib.bib12)]. Yet all three assume homogeneous agents sharing one base model and omit jailbreaks, prompt injection, and cross-model mappers. Closest to our work, [[59](#bib.bib71)] measures non-adversarial safety shifts under direct cache reuse across variants of one base model and repairs them offline via per-head affine maps, without evaluating adversaries or cross-size/cross-family mappers. In contrast, Chasm shows that accuracy-fitted mappers shift refusals even benignly and turn the handoff into an attack surface (templates, model switching, compromised sources, suffix optimization, and calibration poisoning) without direct tensor writes.

### VIII-B Multi-agent threats and defenses

Text and multimodal multi-agent attacks propagate instructions across agents [[75](#bib.bib17)], hijack orchestration [[76](#bib.bib18)], poison shared workspaces [[7](#bib.bib19)], or tamper with exchanged messages [[77](#bib.bib20)], while routing attacks use adversarial prefixes to steer queries to chosen models [[30](#bib.bib21), [78](#bib.bib22)]. Indirect prompt injection is benchmarked on agents [[79](#bib.bib23), [80](#bib.bib24)] and defended at prompt [[81](#bib.bib25), [82](#bib.bib26)], model [[83](#bib.bib27), [24](#bib.bib28), [46](#bib.bib29)], detector [[84](#bib.bib37), [58](#bib.bib99)], or system level [[85](#bib.bib30)]. Crucially, text-channel attacks still pass tokens to the receiver, and prompt-, model-, and detector-level IPI defenses assume the defended model reads untrusted data itself—an assumption broken by delegate-and-return, where the subagent encodes untrusted data and the main agent decodes from the mapped cache, compromising task integrity. Likewise, J2 requires no router manipulation, only cache mapping when the serving model changes.

### VIII-C Alignment fragility and learned mappers

Safety alignment is fragile: it degrades under minimal fine-tuning [[86](#bib.bib38)], pruning or low-rank edits [[87](#bib.bib39)], refusal ablation [[22](#bib.bib33)], and compression [[88](#bib.bib40)], and is bypassed in continuous space via soft prompts [[89](#bib.bib34)], multimodal encoders [[90](#bib.bib41)], or activation steering [[91](#bib.bib42)], prompting latent-adversarial defenses [[92](#bib.bib44)]. In Chasm, a latent handoff with legitimate pipeline components can still contain three optimization-free jailbreaks, while J4 utilizes a GCG [[57](#bib.bib31)] attack end-to-end through the source, mapper, and target.

Cross-model mappers build on representation alignment, including layer stitching [[93](#bib.bib45)] and relative representations [[94](#bib.bib46)]. These settings raise risks: unpaired embedding translation leaks documents [[95](#bib.bib47)] and learned activation maps can transfer refusal steering vectors across models  [[96](#bib.bib48)]. Conversely, we show that KV-cache mappers fitted solely for accuracy do not reliably preserve refusal. Moreover, akin to works
