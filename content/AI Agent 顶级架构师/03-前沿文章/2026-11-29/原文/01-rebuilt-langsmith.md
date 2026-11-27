# We rebuilt LangSmith around the agent

Sam Crowder ｜ November 16, 2026 ｜ 8 min read

Last week we [announced our series C](https://www.langchain.com/blog/series-c) and introduced the new **LangSmith Agent Platform**: a single place to build, run, improve, and govern every agent. With this, agents are now the core object across LangSmith, connecting fragmented workflows for developers and enabling platform teams to manage agents across the business.

In this post, we discuss why we reorganized the product, how the agent model works, what it unlocks, and where we're taking it next.

## Why did we rebuild LangSmith?

2026 brought a step change in agent adoption as new [harnesses](https://www.langchain.com/deep-agents), models, and engineering approaches made it possible to build agents that can [reliably perform complex, high value work](https://www.langchain.com/blog/how-stripe-built-their-knowledge-ai-platform-on-deep-agents).

Companies now run many agents across the business: engineering uses coding agents, product is building customer-facing agents, and teams across the organization have various internal productivity agents. These agents are built with different frameworks, hosted on various runtimes, and use a variety of tools and models.

The result is fragmented workflows for both engineers and platform teams.

**Engineers** work across disconnected surfaces. [Tracing](https://www.langchain.com/blog/agent-traces-ai-search-langsmith), [monitoring](https://www.langchain.com/langsmith/observability), and [deployments](https://docs.langchain.com/oss/python/langchain/deploy) all live in different places. This requires frequent context switching, and in practice results in teams skipping difficult but important steps like building the evals.

**AI Platform teams** have difficulty answering basic governance questions. Which agents exist, and who owns each of them? What do they cost, and how are they performing? When costs spike, there is often no obvious person to ask what happened.

We wanted to make it simple for teams to manage the entire [agent development lifecycle](https://www.langchain.com/blog/the-agent-development-lifecycle) from one place, using any stack, with ownership and governance across all of it.

## One platform for the entire agent development lifecycle

LangSmith supports the entire agent development lifecycle: build, run, improve, and govern. Now, we've connected the entire process through a unique agent record.

- **Build:** Describe an agent with the new [natural language builder](https://docs.langchain.com/langsmith/build-an-agent) in LangSmith Studio, build in code with our open source harnesses, or use any other framework.
- **Run:** Deploy on [LangSmith Agent Server](https://www.langchain.com/langsmith/agent-server) or keep the agent on the runtime you already use.
- **Improve:** Tracing, evals, datasets, annotation, and [Engine](https://www.langchain.com/langsmith/engine) work on any agent that sends traces to LangSmith.
- **Govern:** LangSmith agent registry and [LLM Gateway](https://www.langchain.com/langsmith/llm-gateway) provide org-level visibility and strict controls over every registered agent.

When you open an agent record, its traces, evals, Agent Server, and Engine issues are accessible with one click, so you don’t need to navigate multiple surfaces to find them. Each agent’s local, dev, staging, and production environments sit under the same agent ID, so comparing performance after making changes is simple.

LangSmith is composable, so you can choose the parts you need. If you already run your agent on another platform, you can connect it to LangSmith to improve and govern it without changing any other workflows.

If you build and run on LangSmith, you get more than a single place to manage the lifecycle. LangSmith products build on each other, so you can find, fix, ship, and verify issues in your agents faster. For example, LangSmith Engine can [validate a proposed fix](https://www.langchain.com/blog/langsmith-engine-v2-redteam) against an Agent Server preview before you merge it to production.

## The new data model for agents

Before, traces sent to LangSmith used a flat project hierarchy not associated with any particular agent. The traces from a single agent in different environments had no association with each other.

Now there is one agent record, with environments and traces grouped under it. Every stage of the development lifecycle connects to the agent record.

Every agent record includes three properties:

- **Owner:** a named person responsible for the agent
- **ID:** a globally unique, immutable identifier
- **Type:** what kind of agent it is, which determines the information surfaced in its dashboard, its data connections, and evaluation criteria

## Evals and governance for different agent types

Different agents do different work, so you need different types of evaluation to govern and improve them. For example, a coding agent is judged by whether the code it writes gets merged, while a customer support agent requires low latency. Agent types build these distinctions into the LangSmith architecture, so each agent record provides useful resources designed around the agent’s goals.

Agent types provide three things:

**A data view built around the agent’s work:** Each agent type has a tailored dashboard with key statistics and evaluation criteria. For a general purpose agent, this includes a description of the agent, its recent activity, online monitoring, common models and tools it uses, and agent failures surfaced by Engine. For a coding agent, it's merged PRs, token cost, and what type of work the agent completes.

**Consistent data without manual setup:** The dashboards are intentionally opinionated. When you assign an agent a type, its dashboard is ready to go with no custom views to build first. Every agent of a given type is measured the same way, so when you have three people running coding agents, the measures are comparable across all three.

**Data connections:** The coding agent type allows you to connect your GitHub repo to track downstream outcomes of agent usage. As we build more agent types, we'll continue to build integrations that enable you to see and act on relevant data for your agents.

We've started with general purpose and coding agents, and we're expanding into additional types for agents that have unique evaluation. For example, voice agents don't just need to solve customer problems, but to interact with customers with low latency and good audio quality. With agent types, we can surface these specific data by default, and make it easier for developers to find failures and fix them.

## Govern every agent, wherever it runs

Agent sprawl has become a governance problem, and it comes from three directions. Engineering teams build custom agents. Business units adopt agents from vendor platforms, like ServiceNow for IT and Glean for enterprise search. And employees pick up coding and productivity agents on their own.

Platform teams and AI leaders are accountable for all of them, but asking every team to standardize on one platform isn’t realistic.

With LangSmith, they don’t have to. It works for agents running on any platform that supports OpenTelemetry Protocol (OTLP), including labs and hyper scalers. Connect the agent and it’s registered along with the agents your engineers built, and it’s measured the same way.

Every registered agent has an owner, ID, and type. For admins, this provides a consistent way to monitor and manage the entire agent fleet. Cost and quality metrics roll up to each agent across every environment. If there’s a cost spike from a Glean agent, there is a named owner to contact, along with trace details that indicate what went wrong.

## Where LangSmith is going next

The agent record is a new foundation for LangSmith, and we’re excited to keep building on it. With every trace, environment, and deployment pinned to the agent, we can make more workflows simple for developers, with governance built in.

Here’s an idea of what we’re building toward: Engine [red teams your agent](https://www.langchain.com/blog/langsmith-engine-v2-redteam), finds failures, and monitors for regressions after you ship a fix. Your team reviews production traces in a [custom annotation app](https://www.langchain.com/blog/langsmith-custom-apps) built around its own review process, and the reviewed examples automatically flow into eval datasets. [Trajectories](https://www.langchain.com/blog/langsmith-trajectories-tracing) from your best runs become data for [fine-tuning a model](https://www.langchain.com/blog/langsmith-fine-tuning) that lowers cost and improves agent performance. All of it is connected to the same agent record, with KPIs monitored in real time.

Each of these pieces exists in LangSmith today. Now we’re connecting them to make the develop experience even easier.

Also on the roadmap:

**More agent types:** General purpose and coding agent types are available today, and voice is on the horizon. We’ll keep expanding to enable teams to standardize how they evaluate and govern more kinds of agents, each with the relevant data connections and analytics.

**Org level dashboards:** Centralized dashboards are available at a workspace-level today. We're working on org level dashboards, so leaders can see aggregated performance metrics and trends across the entire company in one view.

**Identity**: Every agent already has a unique, immutable ID. Next, you'll be able to register agents in your identity provider so that security teams can manage and audit them like any other identity in your organization.

## How to get started with the new LangSmith

The new LangSmith is available globally in cloud, BYOC, and self-hosted environments. You can try it by [logging in or signing up today](https://smith.langchain.com/).

The fastest way to get started is by building your first agent with [LangSmith Studio](https://docs.langchain.com/langsmith/build-an-agent) or [connecting an agent](https://docs.langchain.com/langsmith/create-an-agent#name-an-agent-traced-from-outside-langsmith) you already run.
