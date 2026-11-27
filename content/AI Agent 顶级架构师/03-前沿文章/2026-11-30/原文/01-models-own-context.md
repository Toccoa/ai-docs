# Letting Models Manage Their Own Context: Where We Stand

Alessio Devoto  Avinash Vem  Tara Safavi Sanjay Kariyappa  Yu-Hsuan Tseng  Paul Furgale  Ricardo Silveira Cabral

###### Abstract

Agent harnesses today manage context on the model’s behalf: when the window fills, the harness triggers a compaction that summarizes the history. We study the alternative, *model-driven* context management, in which the model itself decides when and what to compact through a context API. We gave models control over their own context in NOOA, NVIDIA’s open source agent harness, and compared the two strategies on document research and machine learning engineering across context budgets from 8K to 512K tokens. Models that use the context API effectively reach higher accuracy, often with fewer input tokens, especially at tight budgets: GPT 6.1 nearly triples its score at a 32K budget on OfficeQA Pro v2 (21% →\rightarrow 56%), and Kimi gains with up to 41% fewer input tokens. Models differ widely, however, in how often they use the API, how aggressively they compact, and when they start compacting, and prompt changes shift that timing. Finally, we show that inference engines can make model-driven edits cheaper: by reusing the KV cache of the unchanged suffix after an edit, we cut prefill compute by up to 15% per request with no measurable change in accuracy. Together, these results point to a new co-design frontier: models trained to manage their own context, served by inference engines that support KV cache editing.

## 1 Introduction

When we released NOOA ([Furgale et al., 2026](#bib.bib1)), NVIDIA’s open source agent harness, we built it around six core ideas. One was to give the model direct control over the harness through APIs, including context compaction. The motivation was simple: an agent should be able to decide which parts of its history to keep in context, which to summarize, and which to retrieve when needed ([Cabral and Furgale, 2026](#bib.bib10)).

Interest in model-driven context management has grown since. Research such as SideQuest ([Kariyappa and Suh, 2026](#bib.bib4)) and Context Language Models ([Shao et al., 2026](#bib.bib5)) explores the idea directly, and agent harnesses are starting to let models manage their own context too. Codex, for example, has introduced an experimental context-management mode ([OpenAI Codex, 2026b](#bib.bib16)) that combines history and notes with a \inlinecodenew_context tool for starting a fresh context window.

This raises practical questions: Can current models manage their own context effectively? Does it improve task performance? And can inference engines turn model-managed context into cheaper inference?

We compared two context management strategies on document research and machine learning engineering tasks. In *harness-driven* context management, the default in today’s harnesses, the harness triggers compaction when the context window fills. In *model-driven* context management, the model decides when and what to compact. Four takeaways stand out:

## 2 From Harness-Driven to Model-Driven Context Management

Figure 1: In harness-driven context management (top), the harness triggers compaction when context usage reaches a threshold. In model-driven context management (bottom), the model edits its own context along the way.

As an agent works on a task, its history of tool calls, outputs, and model turns keeps growing, making it harder for the model to find and use relevant information (context rot ([Chroma Research, 2025](#bib.bib9))) and eventually exceeding the context window.

Most harnesses handle this automatically: when context usage crosses a threshold, the harness summarizes the history (Figure [1](#S2.F1), top), a process commonly referred to as compaction. We call this harness-driven context management. The harness’ heuristic policy decides when compaction happens and which parts of the history it covers, while the model only generates the summary. While simple, this approach can be lossy and lead to loss of key task-relevant information in the model’s context.

Model-driven context management takes a different approach and lets the model decide when and what to compact (Figure [1](#S2.F1), bottom). In NOOA, the model can inspect its history and replace a range of events with a summary through its context API (the \inlinecodecollapse call). Compacted events are archived, so the model can retrieve the originals by tag.

Listing [2](#S2.F2) shows the two operations it needs: collapsing a range of events into a summary, and retrieving an archived event by its original tag.

Figure 2: Collapsing events and retrieving an archived event by its original tag through NOOA’s context API.

## 3 Experimental Setup

To test model-driven context management across different kinds of work, we use two benchmarks.

OfficeQA Pro v2 ([Databricks AI Research Team, 2026](#bib.bib11)) contains 90 questions about U.S. federal receipts and expenditures. The agent answers them by searching and reading a large pre-parsed document corpus. Reading documents fills the context quickly, which makes this a good setting for studying how agents retain evidence across a research task.

MLE-bench Lite ([Chan et al., 2024](#bib.bib28); [OpenAI, ](#bib.bib12)) contains 22 Kaggle competitions, where the agent has to inspect datasets, write and debug code, evaluate results, and submit predictions. The agent has to track experiments, implementation choices, and execution feedback as it iterates.

We compare two context management strategies:

- •

Harness-driven: at 80% of the context budget, the harness summarizes the earlier history, preserving the initial instructions and the 10 most recent events.

- •

Model-driven: the model receives NOOA’s context API, a live context-usage indicator, an instruction to consider compacting only once usage reaches 85%, and a *context-pressure warning* added to the request when the context approaches its limit.

We sweep context budgets from 8K to 512K tokens. Shrinking the budget raises *context pressure*, the ratio of what the task needs to what the window holds, and simulates the effect of much longer tasks. Each budget is a hard limit on request size. If a request exceeds it, a fallback removes the oldest events and retries; after three failures, the run counts as a wrong answer.

We evaluate four models: We evaluate four models: GPT-6.1 Sol ([OpenAI, 2026](#bib.bib25)), Kimi K3 ([Kimi Team, 2026](#bib.bib2)), DeepSeek V4 Pro ([DeepSeek AI, 2026](#bib.bib26)), and Claude Opus 5.5 ([Anthropic, 2026](#bib.bib27)).

## 4 The Promise of Model-Driven Context Management

In our experiments, we found that models that understand and use NOOA’s context API effectively can reach substantially higher accuracy at the same context budget compared to harness-driven compaction, without extra training. GPT-6.1 Sol shows the clearest benefit, improving accuracy by nearly 3×3\times over harness-driven context management at a 32K context budget on OfficeQA Pro v2 (Figure [3](#S4.F3)). However, we found that gains are not consistent across all models: DeepSeek V4 Pro shows less improvement, and Opus 5.5 rarely uses the context API.

 harness-driven  model-driven

Figure 3: Score vs. context budget, OfficeQA Pro v2, harness-driven vs. model-driven, by model. Score is passed tasks over all 90 trials, including errors. Points are equal-weight replicate means; bars span replicate min–max.

 harness-driven  model-driven

Figure 4: Score vs. context budget, MLE-bench Lite, harness-driven vs. model-driven, by model. Mean over 22 tasks. Scores are leaderboard percentile (missing scores count as zero). Each point averages the verified runs at that budget.

The strongest gains are at tight budgets, where the agent has to manage its history repeatedly to make progress, and they shrink as the budget grows. GPT and Kimi are ahead of the harness baseline at small budgets, while Opus trails it until the budget is large enough that the strategies converge. On MLE-bench Lite the effect is much smaller and limited to the tightest budgets (Figure [4](#S4.F4)), probably because its tasks need far less context.

This corroborates recent work ([Shao et al., 2026](#bib.bib5); [Fan et al., 2026](#bib.bib6); [Kontonis et al., 2026](#bib.bib8)), which finds that context management helps most when the window is tight relative to the task length.

The differences between models raise a further question: are they making different context-management decisions, or failing to use the capability at all? To find out, we looked at how each model used the API.

## 5 Some Models Get It More Than Others

All models receive the same context API and instructions, yet they use them very differently. GPT, Kimi, and DeepSeek call it in 42–53% of tasks. Opus rarely reaches for it: it edits its context in only 4% of tasks (Figure [5](#S5.F5)).

Figure 5: Models differ in how often they use the context API. Share of tasks with at least one compaction call, model-driven runs, all budgets.

The effect of each compaction varies as well. When GPT compacts its context, the request shrinks by a median of 3.7×3.7\times (Figure [6](#S5.F6), left). The other models shrink it less: the median is 2.1×2.1\times for Kimi, 1.8×1.8\times for DeepSeek, and 1.5×1.5\times for Opus. Compacting harder is not free, though. Compacted events are archived, and models sometimes go back for them: GPT retrieves the archived content again after 19% of its compaction calls, against 7% for Kimi and 3% for DeepSeek (Figure [6](#S5.F6), right). Opus is at 14%, but it compacts so rarely that this estimate is noisy. Taken together, GPT looks like the model most comfortable with the context API: it knows when to call it, compacts the most per call, and retrieves archived content when it needs it.

Compression factor per compaction
how many times smaller the request gets, log scale

Compactions later reopened
% of compaction calls, content retrieved again

Figure 6: Left: compression factor per compaction call, the input tokens of the request in which the model decided to compact divided by the input tokens of the next request, which also carries the executed cell’s output. A factor of 2×2\times means the context was halved; below 1×1\times means it grew. Boxes span the middle half of calls with the median inside, whiskers span the 5th to 95th percentile, and the axis is logarithmic. All confirmed compaction calls are pooled across context budgets. Right: share of compaction calls whose archived events were later retrieved again (\inlinecodeself.events[…] or \inlinecode.get). This is a lower bound.

Models also differ in what they do when the context fills up. At a 64K budget, we followed each model from the first context-pressure warning until the episode ended, either with an accepted final answer or with a compaction call. Opus mostly acknowledges the warning and wraps up: it returns an answer in most of its episodes instead of continuing. The other models mostly compact, and many consult something first: GPT reads the API docs before compacting in 69% of episodes and DeepSeek inspects the event history first in 46%, while Kimi compacts straight away in 49% (Figure [7](#S5.F7)). This is consistent with Opus calling the API so rarely in Figure [5](#S5.F5).

 Return an answer  Compact straight away  Read docs, then compact  Inspect history, then compact  Other

Figure 7: What models do under context pressure. Share of first-warning episodes by how they resolved, 64K context budget. When the context approaches its limit, we send the model a warning and observe how it responds.

This makes training a natural question. Working in a harness that compacts history automatically does not necessarily teach a model when to compact, what to remove, or how to keep useful information.

Harnesses such as Mainplane ([16](#bib.bib14)) now offer context management similar to NOOA’s, and Codex’s experimental mode with history, notes, and a new-context tool ([OpenAI Codex, 2026a](#bib.bib15)) makes it plausible that related capabilities receive attention during GPT development. We conjecture that training for model-driven context management may contribute to GPT’s stronger results. The feature’s existence does not tell us how the evaluated model was trained, however, or whether any such training transfers to NOOA’s interface.

Our results motivate investigating how training can make context management more reliable and effective.

## 6 Context Anxiety

Even models that use the API can compact more aggressively than they need to, keeping their context small while space remains. We call this context anxiety, following prior work ([Igbinedion et al., 2026](#bib.bib3)) on models that misjudge their remaining token budget.

We measure compaction timing as *the fraction of the context budget in use when the model makes its first compaction call in a task*. With the instruction to consider compacting only at 85% usage, most models wait until they are close to that point. Removing the instruction changes the behavior substantially for some of them (Figure [8](#S6.F8)).

 model-driven (85% instruction)  no timing instruction

Figure 8: Context in use at the first compaction: median % of the context budget, with and without the timing instruction. Each point is the median over tasks of the first compaction decision in that task. It measures when a model starts compacting. A budget with no point means the model never compacted at that budget.

Kimi and DeepSeek compact much earlier without the instruction. Kimi’s median first compaction drops from about 84% of the budget to 29% at 128K, and DeepSeek’s from 83% to 40% at 256K. GPT is less sensitive, which may reflect how it was trained. Opus almost never compacts with the instruction, but without it, it compacts regularly and early, at a median of 16% of the budget at 128K.

Kimi K3 shows the effect in token usage too (Figure [9](#S6.F9)). At a 32K budget, both strategies have the same maximum context size, yet the model-driven agent processes 41% fewer cumulative input tokens (36M vs. 62M) and scores slightly higher (43% vs. 41%). The same budget does not mean the same use of it.

 harness-driven  model-driven

Figure 9: Kimi K3: score vs. cumulative input tokens on OfficeQA Pro v2, each point labelled with its context budget. Cumulative input counts all input tokens, cached or not, at every turn.

Keeping less context can come at a cost. At budgets of 128K and above, the variants without the timing instruction score about 8 points below the harness baseline for Kimi and DeepSeek. GPT and Opus show no comparable change in accuracy.

Why do some models compact early? Many models are trained to keep their context short. Kimi K3, for example, is trained with RL penalties for overly long rollouts ([Kimi Team, 2026](#bib.bib2)), which may teach it to economize on tokens even when space remains.

## 7 From Fewer Tokens to Cheaper Inference

Context management pays off most when a model reaches equal or better accuracy with fewer input tokens. Model-driven context management can do exactly that: at a 64K budget, Kimi uses about 11% fewer cumulative input tokens than its harness baseline while scoring higher (57% vs. 52%). The effect varies by model: GPT shows no comparable saving, and the other models fall in between (Figures [10](#S7.F10) and [11](#S7.F11)).

 harness-driven  model-driven

Figure 10: Score vs. token usage, OfficeQA Pro v2, harness-driven vs. model-driven, by model. Cumulative input tokens; points at 8K–64K are labelled with their context budget. Cumulative input counts all input tokens, cached or not, at every turn. Points are ordered by tokens, so labels may not ascend. Runs below 95% trace coverage are excluded.

 harness-driven  model-driven

Figure 11: Score vs. token usage, MLE-bench Lite, harness-driven vs. model-driven, by model. Total input + output tokens, points labelled with their context budget. Token usage is the total recorded input and output tokens per run, including repeated prompts. Lines join increasing budgets and may turn back in token usage. Kimi K3 points combine several context budgets using equal-weight averages.

However, input-token counts tell only part of the story. Inference engines avoid reprocessing the prompt on every turn by reusing cached computation (the KV cache) for the prefix of the prompt that hasn’t changed ([Zheng et al., 2024](#bib.bib22); [vLLM Team, ](#bib.bib23)). Editing the context, for example replacing part of the history with a summary, keeps that cache valid up to the edit but invalidates everything after it, even text that didn’t change (Figure [12](#S7.F12)), so a shorter context isn’t automatically cheaper. It also depends on how much the engine has to recompute after each edit.

Figure 12: Compacting B shortens the prompt, but the summary and everything after it must be computed again.

To address this, recent papers such as SideQuest ([Kariyappa and Suh, 2026](#bib.bib4)) from NVIDIA, Context Language Models ([Shao et al., 2026](#bib.bib5)), and Cache Engineering for Agents ([Fu et al., 2026](#bib.bib7)) propose to reuse the KV cache of unchanged *suffix* text after an edit instead of recomputing it, which is an approximation aimed at preserving useful model state while reducing serving compute work. We paired NOOA’s context API with a suffix KV reuse prototype implemented in the SGLang serving engine ([Zheng et al., 2024](#bib.bib22)), using Qwen3.6-27B ([Qwen Team, 2026](#bib.bib24)). On MLE-bench Lite, OfficeQA Pro and the agentic coding benchmark DeepSWE ([Datacurve, 2026](#bib.bib13)), it cut prefill compute by 4–15% per request compared with standard prefix caching, with no measurable impact on task accuracy (Figure [13](#S7.F13)). Savings are largest on OfficeQA Pro because the suffix text that survives an edit is large, about 10K tokens or roughly 60% of the prompt on average, because the agent’s tool calls retrieve long documents that remain in context.

 Model-driven (NOOA’s context API)  Harness-driven (summarize, keep last 10 events)

Reduction in prefill tokens per request
% vs. standard prefix caching, higher is better

Task reward delta
suffix KV reuse minus no KV reuse, with ±\pm error

Figure 13: Suffix KV reuse versus standard prefix caching, Qwen3.6-27B at 32K context, under model-driven (NOOA’s context API) and harness-driven (summarize, keep the last 10 events) context management. Left: reduction in prefilled input tokens per request. Right: change in reward, measured in each benchmark’s own metric (DeepSWE: fail-to-pass rate; MLE-bench Lite: mean leaderboard percentile; OfficeQA Pro: task score).

These results suggest that model-driven context management opens up a new design space for agentic systems. When models actively shape their own context, the harness and the inference engine no longer just carry out their own roles. They become partners in deciding what to keep and how to serve it efficiently. We are actively exploring this co-design of model, harness and inference engine to push the accuracy-efficiency frontier for agentic workloads.

## 8 Limitations

Our results should be read with the following caveats.

- •

Small benchmarks. OfficeQA Pro v2 has 90 questions and MLE-bench Lite has 22 competitions, so small differences between strategies or models may not be significant.

- •

Simulated context pressure. We shrink the context budget to emulate longer tasks. This is a proxy: it does not capture every property of genuinely long-horizon work, and the fallback that drops the oldest events at the limit can itself affect scores.

- •

Four models, unknown training. We evaluate four models and do not know how they were trained. Our explanation for GPT’s stronger results is a conjecture, not a tested claim.

- •

Single open model for KV reuse. The suffix KV-reuse prototype was evaluated with one open model (Qwen3.6-27B) in one serving engine. It is an approximation to full recomputation, and we measured prefill compute, not end-to-end latency or cost.

## 9 Related Work

Models that manage their own context. A growing line of work gives models explicit control over the information available to them. MemGPT ([Packer et al., 2023](#bib.bib21)) introduces hierarchical memory management, while Recursive Language Models ([Zhang et al., 2025](#bib.bib17)) place long inputs in an external programming environment that the model can inspect and process through recursive calls. More directly concerned with the evolving reasoning or interaction context, MEMENTO ([Kontonis et al., 2026](#bib.bib8)), AgentFold ([Ye et al., 2025](#bib.bib19)), and Context-Folding ([Sun et al., 2025](#bib.bib20)) develop learned mechanisms for retaining, condensing, or restructuring past computation. SelfCompact ([Li et al., 2026](#bib.bib18)) studies model-triggered compaction with a prompting rubric and no fine-tuning. Context Language Models ([Shao et al., 2026](#bib.bib5)) expose the live context as an editable file, evaluating both existing models and learned context-management strategies, while SideQuest ([Kariyappa and Suh, 2026](#bib.bib4)) uses an auxiliary reasoning task to select KV cache content for removal. Our work provides a complementary empirical study of current models under a shared context-management API, focusing on how their behavior and task performance change with context pressure and how these changes interact with serving efficiency.

Efficient serving of edited contexts. Standard prefix caching reuses cached states only for a matching prefix, so edits within the history can require re-prefilling the retained suffix. For agent context management, Context Language Models ([Shao et al., 2026](#bib.bib5)) introduce Suffix Cache Reuse to retain cached states beyond the matching prefix. A related approach operates directly on the active KV cache: SideQuest ([Kariyappa and Suh, 2026](#bib.bib4)) removes selected cache content, and Cache Engineering for Agents ([Fu et al., 2026](#bib.bib7)) co-designs cache operations and a serving engine to avoid re-prefilling retained context. We pair a prototype supporting suffix cache reuse with a model-driven context API and measure its effect on prefill compute and accuracy (Section [7](#S7)).

## 10 Discussion and Conclusion

We compared harness-driven and model-driven context management across four models and two benchmarks. Giving models control over their own context can improve accuracy and often reduces input tokens, especially at tight budgets, but the benefit depends heavily on the model: models differ in how often they use the API, how aggressively they compact, and when they start. Inference engines can make the resulting edits cheaper by reusing the KV cache of the unchanged suffix.

We expect model-driven context management to become a standard capability of frontier models. Getting there takes two things: training that teaches models when and what to compact, and inference engines that make context edits cheap. This points to two directions:

- •

Improve the underlying capability. Some models already use context APIs they were never trained on, and GPT gains substantially from it at tight budgets. We believe training models to use these APIs correctly and effectively will make the capability reliable across models.

- •

Connect the harness to the inference engine. Design serving so that context edits preserve reusable computation and release KV cache entries that are no longer needed.
