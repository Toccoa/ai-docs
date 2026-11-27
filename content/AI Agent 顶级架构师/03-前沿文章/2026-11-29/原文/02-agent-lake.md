# The Agent Lake

Sam Crowder ｜ November 24, 2026 ｜ 8 min read

The trace of an agent is the system of record of what the agent did. It contains rich information about user intent, agent trajectory, and final outcome achieved. The simplest way to use these traces is as a debugging tool to visualize the sequence of steps an LLM application took and determine what went wrong. As agent traces become longer (as agents become more powerful) and more plentiful (as agents reach production), this manual debugging no longer scales.

In order to use this trace data to drive continuous improvement of agents at scale, you need two things:

- An efficient database optimized for agent traces
- “Intelligent compute” designed to query and process these traces

We’ve been working on both of these for nearly two years. The first big piece we launched was [SmithDB](https://www.langchain.com/blog/introducing-smithdb), a purpose-built database for traces.

Over the past few months, we’ve been increasing our focus on “intelligent compute”. The reason you need “intelligent compute” is that these agent traces themselves are traces of unstructured reasoning, so intelligence is required to analyze them.

In traditional data engineering, a data lake stores a shared corpus of data that different engines can query and process. As we’ve built LangSmith, we’ve noticed our platform architecture converging to that as well: a shared corpus of agent data (stored in SmithDB) with many different forms of “intelligent compute” running over it.

Traditional data lakes like Snowflake and Databricks don’t have storage or “intelligent compute” optimized for this agent data. As more and more of the data a company generates becomes agent traces, we think it is important to develop this new type of platform.

We’re calling this new type of platform an agent lake.

*Agent Lake: a platform that combines storage optimized for agent traces with intelligent compute to query, analyze, and learn from them, powering continuous agent improvement*

## What is in the agent lake

Most of what lands in the agent lake is traces. A trace records every step of an agent run, from the user’s input through each model call and tool call to the final output, and multi-turn conversations are grouped into ***threads*** so the whole interaction can be read together.

Our agent lake, LangSmith, ingests traces from billions of agent runs per month. Some customers, like Clay, send us hundreds of millions of events per day. This kind of scale is why [we built SmithDB](https://www.langchain.com/blog/introducing-smithdb), which is the industry’s most performant database specifically for real-time workloads on top of agent trace data.

The agent lake also holds outcomes. Traces show you how the agent worked; outcomes show you the impact of that work. There are two dimensions on which to think about outcomes.

First is how outcomes map to **threads** and/or **traces**. Some outcomes map 1-to-1 to a thread or trace. For example, a thumbs down on a trace means that agent response for that turn was bad; a low score for an entire conversation means that whole thread was bad. Other outcomes may map many-to-many. For example, we recently launched a “coding agents” type in LangSmith. One of the outcomes we track there is merged pull requests (PRs). One thread may open many PRs that are merged, or one PR may be contributed to by many threads.

Second is how these outcomes are generated. Sometimes they may come from users directly (thumbs down). Other times they may come from observing the system the agent interacts with (merged PRs, copied code snippets). Yet another way is to automatically generate a proxy for these outcomes as feedback with LLM-as-a-judge. And finally, developers or builders of the system could label the threads themselves by hand in annotation queues.

Crucially, an agent lake contains not just traces, but also outcomes. That’s ultimately how you judge ROI and tell if your agents are working or improving.

## Intelligent compute

Teams running agents at scale have two primary needs for “intelligent compute”:

1. drilling down to find traces of interest
2. intelligent automation of the agent improvement loop

‍

### Finding high-signal traces at scale

In the early days of LangSmith, developers would look through each trace one by one to ensure that the model was following instructions at every step. At large scale, this is no longer possible, and developers need more automated means of finding high-signal traces in such vast amounts of data.

Online evaluators are the starting point for sifting through agent traces to find the ones most useful for driving agent improvement. LangSmith comes with a standard set of tuned evaluator prompts for things like hallucination, toxicity, and user satisfaction. Online evaluators are crucial for judging how your agent is performing, so you don’t just want to use these evaluators blindly; you’ll want to make sure they are capturing interesting signals for your use case, and adjust them if they are not.

One big hurdle to using LLM-as-a-judge for online evals is that they are expensive. The [introduction of decision models by TypeSafe AI](https://typesafe.ai/blog/introducing-system-one-models-and-jev) in September provided a new way of evaluating production traces at lower cost. LangSmith now offers [several decision models](https://docs.langchain.com/langsmith/llm-gateway-decision-models) for affordable trace classification, and this area of low cost (but intelligent) online evals is an active area of research for us.

These online evaluators leave feedback on traces. This makes it super easy for developers to find relevant traces (they just need to filter on feedback!). One downside to this, however, is that it requires you to define up front what signals you want to measure.

Sometimes you may want to find high-signal traces in the moment, without having first created an online evaluator. For this pattern, we built [AI Search](https://www.langchain.com/blog/agent-traces-ai-search-langsmith), which enables searching over trace data in natural language. We run a decision model (fast and cheap!) over the search results, adding in a “semantic” filter. This allows you to search for things like “threads where the user got frustrated” or “traces that contain PII”. Note that you can combine these semantic filters with normal, structured queries for even more powerful searching.

Agent lakes need to support quick and intelligent search over traces. Online evals and AI Search provide intelligence to make that a reality.

### Intelligent automation

Online evaluators and AI Search are used to surface high-signal traces. That data mining exercise is part of a general “agent improvement loop” process that teams stand up. It is a valuable piece of that process, but there is more to do after that. Someone still has to work out what they mean and what to change in the agent. At the volumes our customers run, this work has to be automated too, so we’ve built agents of our own to do this “intelligent automation” of the agent improvement loop.

[Insights](https://docs.langchain.com/langsmith/insights) shows how people are actually using your agent. You ask a question about your traffic, like “where is my agent failing?”, and Insights groups recent traces into categories, then keeps sorting new conversations into them as they arrive so you can see which kinds of requests are trending in the wrong direction.

[LangSmith Engine](https://www.langchain.com/blog/introducing-langsmith-engine) looks for concrete problems to fix. It scans your traces on a schedule and groups recurring failures into issues, using the same evaluator scores and user feedback described above to decide where to look. With a repository connected, Engine diagnoses the root cause and proposes a fix as a pull request, and since Engine v2 it can test that fix against an eval set before your team ever sees it. Engine has analyzed more than 60 million production traces across our customer base.

When an agent keeps making the same mistakes after its harness has been tuned, the next step is often to train a custom model, and the agent lake already holds the corpus of data used to do this. [SmithTune](https://www.langchain.com/blog/langsmith-fine-tuning) is a CLI that fine-tunes a model on your best trajectories with Fireworks or Baseten, then compares it against the base model in LangSmith. We ran this on Engine itself, fine-tuning Kimi K3 on trajectories from one of Engine’s agents. On a subset of IssueBench, our internal benchmark for detecting and grouping issues in traces, the tuned model scored 96, against 90 for base Kimi K3 and 87 for GPT-5.6 Sol.

Insights, Engine, and SmithTune are examples of “intelligent compute” that runs on top of traces to automate more of the agent improvement loop. All of these can be used with online evals. In fact, they are particularly powerful when done so! Online evals provide signals that can be used by Insights / Engine / SmithTune to more quickly and accurately filter/cluster issues.

## The agent lake keeps filling up

As agents do more and more work for a company, they will generate more and more data for a company. This data is *incredibly* valuable, as it can be used to improve the agents themselves. That agent improvement loop is a core part of owning your intelligence. In order to do that you will need an agent lake that provides two things:

- a way to efficiently store all this agent data
- “intelligent compute” on top of the traces to help you spin that agent improvement loop

The value is not in each trace itself but in everything you can do in the agent lake on top of those traces. [Try LangSmith today](https://www.langchain.com/langsmith-platform) and get one step closer to continuous improvement of your agents!
