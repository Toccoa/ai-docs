# Why agent governance starts with observability

Christine Manegan ｜ November 19, 2026 ｜ 10 min read

## Key Takeaways

- The teams we work with that ship governed agents keep a central view of every agent running across the company, so costly or unauthorized usage doesn't slip through. They also look at the full trajectory of each run, since the same agent can take different paths and call different tools on the same input.
- Both strategies depend on agent observability, the ability to record and analyze every step an agent takes. Traces show whether preventative controls like guardrails are working, and they're the foundation for detective controls that monitor agents in production.
- Problems that detective controls catch in production feed back into prevention, turning a newly discovered failure into a tighter guardrail or a new regression test.

AI applications can range from simple internal chatbots to customer-facing, mission-critical agents, but all LLM-based solutions have the capacity to reason independently, so establishing governance has become a key consideration for any degree of AI adoption. [Recent headlines](https://openai.com/index/hugging-face-incident-and-the-road-ahead/) on agent security breaches have driven even greater urgency to set up governance as a prerequisite for AI usage and development.

While the need for agent governance is widely recognized in most organizations, most are still figuring out where to start. There is some top-down guidance on agent governance from governing bodies, such as the [OWASP Agentic AI Threats & Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/), [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework), or [AI Agents under EU Law](https://arxiv.org/html/2604.04604v1). These guidelines outline agent risks, but don’t define how to mitigate these issues or verify that governance is working.

When teams we work with *are* shipping agents with governing standards in place, we see two main strategies in common among them:

**Centralizing visibility across agents.** Organizations need a central view of the agents running across the company, so costly operations, unauthorized usage, and rogue agents don't fall through the cracks. This visibility makes it possible to establish limits on agents and audit their behavior to verify that guardrails are upheld.

**Understanding individual agent behavior.** Agents are non-deterministic, so the same agent can take different paths and call different tools on the same input. The issues that surface are often specific to each agent's task and execution path, so teams need access to [the full trajectory](https://www.langchain.com/blog/langsmith-trajectories-tracing) of each agent run to understand its actions and alert on unexpected behavior.

## What is agent observability

At the core of both of these strategies is [**agent** **observability**](https://www.langchain.com/resources/agent-observability), the ability to record, inspect, and analyze every step of your AI agent takes. This typically means tracing the steps and attributes of your agent, having the ability to query and access this data readily, and leveraging capabilities to interpret the agent behavior at scale.

Observability is the cornerstone for governance strategies because a guardrail or spend/usage limit doesn't guarantee an agent will follow it, and agents need to be accurately monitored to verify that those guardrails work as intended. The metrics from observability then provide the data to continuously harden overall governance posture.

### Preventive vs detective agent governance

We can think of agent governance methods at a company as either **preventative or detective.**

**Preventative governance:** Guardrails enforced at runtime to block disallowed actions, including limits, agent identity, and policies on tools, data access, models, and cost. Pre-production testing is another preventative measure, where agents are evaluated against defined quality and safety standards with a required threshold before shipping.

**Detective governance:** Monitoring of agent behavior quickly after execution to identify concerning actions, quality issues, and unexpected changes in behavior. These measures include online evaluations, alerts, pattern recognition, human review, and regression and drift detection.

Both types of governance depend on **observability**. Preventative governance relies on traces to verify guardrails work as intended and use test results to meaningfully improve agents before shipping. Detective governance uses traces to evaluate behavior, identify issues, and determine what needs to be fixed in production.

### Preventative governance is verified by observability

Preventative controls start as predictions about how an agent will behave and are enforced by guardrails and gateways. These controls should be tested and gated prior to deploying to production, but also must be continuously monitored to audit that they are working as intended during agent execution.

#### Pre-production testing with evals and red-teaming

Pre-production testing gives teams a way to establish a quality threshold that agents must meet before they can ship. For example, a company might require every team to evaluate its agents against [a golden dataset](https://www.langchain.com/resources/llm-evaluation-benchmarks) and meet a certain threshold of quality scores  – like below 2% hallucination, no PII leakage, or above 90% correctness against human labels – before deployment.

A trace is the detail of an agent invocation, and [trajectories](https://www.langchain.com/blog/langsmith-trajectories-tracing) are the chronological, human-readable conversational view of an AI agent session. Centralized tracing provides users with visibility into all agents being built across the organization and to confirm pre-production testing is happening to begin with, and trajectories make longer running agent actions interpretable.

After a pre-production evaluation run, its traces and trajectories describe where the agent fell on each metric. These records surface the reasons for failure and point to how to improve the agent’s behavior.

[Traces](https://www.langchain.com/blog/from-traces-to-insights-understanding-agent-behavior-at-scale) also show teams where an agent needs additional guardrails. Some limits can be set before an agent runs, such as PII redaction before LLM calls or shutting down if a denylisted tool is called.  Other limits are surfaced only by running evals in development, or red-teaming agents with adversarial test examples. These tests surface when an agent needs more specific guardrails, like a block on how much money a customer service agent can issue in a refund.

#### Production verification with traces and trajectories

Runtime guardrails are a core preventative measure, but setting these guardrails isn’t enough to confirm that they are working each time an agent runs. Before the agent is shipped, teams need audibility in place to confirm that these guardrails work every time an agent is invoked, and ways to explain what happened when they fail.

Tracing and trajectories are critical for recording and understanding the agent’s behavior in production, and function as an audit trail for regulators, security bodies, and teams to confirm that guardrails are in place or investigate when guardrails have been bypassed.

Audibility is key because agents may find alternative ways to reach a goal that involve undesirable intermediate steps, sometimes known as “gaming” the path to a desired end state, in ways that didn’t appear in pre-production testing. For example, an agent without `write` access to a database might reach the same table through a sandbox, or a support agent with a refund approval limit might split one large refund into two smaller ones to bypass it. Subtle changes to the agent, like model drift or tool failures, can exacerbate these effects.

### Detective governance is built on observability

Detective governance uses the observed agent behavior to check if agents are operating within an organization's specific standards, set agent-level quality checks, identify and alert on violations or degradation, and trigger improvements when needed. These operations all depend on being able to inspect and analyze agent traces in production.

#### Online evaluations, dashboards, and alerts

Online evaluations run automatically over live traces to score agent behavior against quality and safety standards. They can catch issues like PII leakage, excessive tool-calling loops, and exposed secrets, as well as domain-specific failures. For example, a customer service agent handling refund requests could be evaluated on whether it verifies a customer's identity and checks order details before issuing a refund.

[Dashboards](https://docs.langchain.com/langsmith/dashboards) bring signals like evaluation scores, failure patterns, error rates, latency, cost per run, and behavioral trends together, giving teams visibility into agent quality, safety, reliability, and operational performance over time. With a more granular view, teams can identify emerging issues, investigate root causes, and understand whether changes improve performance.

*Alerts* turn these metrics into actionable items. For instance, teams can set thresholds on qualitative evaluation scores such as PII leakage occurrences or hallucinations, and operational metrics such as error rates, retries, or cost.

These capabilities, which run on top of the metadata from traces or evaluation computed on an agents’ trajectory, help teams identify concerning behavior as it happens and route issues to the right people for review and remediation.

#### Identify patterns and drift across agent traces

Certain agent degradations or risks only become evident when inspecting patterns among traces.

In the customer support agent’s case, the conversations may start involving requests outside the agent’s original scope. While the agent may decline politely without raising an error, satisfaction would drop in that specific category while barely affecting the overall satisfaction rate. In this scenario, a single trace may look correct without an error, but by comparing and clustering behavioral patterns, the satisfaction drop for a particular topic would be evident.

Observability tools like [LangSmith Insights reports](https://docs.langchain.com/langsmith/insights) automatically cluster large volumes of trace data into common agent behaviors, failure modes, and specified metrics, helping teams identify issues that individual evaluations or alerts may miss.

Regression and drift detection also help teams determine whether changes to an agent introduce new failures or degrade previously reliable behavior. [Offline evaluations](https://docs.langchain.com/langsmith/evaluation-types#offline-evaluation-types) run against datasets built from reviewed traces that represent correctly handled cases. Teams can test the agent against the same dataset daily to detect regression and drift, or test new agent configurations against these datasets to compare evaluation scores before and after a change.

Categorizing trends at scale also helps identify when a shared change affects several agents at once, allowing teams to catch risks before they become larger production issues.

#### Diagnose and review

Evaluations and alerts can identify concerning behavior, but they cannot anticipate every failure mode. In non-deterministic systems, the issue space is large and open-ended, and agents can degrade as their context, tools, and operating conditions change, even when the agent itself has not been modified.

[Human review](https://docs.langchain.com/langsmith/annotation-queues) helps teams investigate cases where automated checks are insufficient. Domain experts can audit flagged traces, score agent behavior, and promote correctly handled examples into reference datasets for ongoing testing.

In our customer service agent example, reviewers might inspect conversations where the agent declined out-of-scope requests to understand whether it handled them appropriately.

Observability makes this process more manageable by surfacing the runs most relevant for review, such as those with low correctness scores or flagged actions, rather than requiring reviewers to inspect thousands of traces manually.

Traces also contain signals about failures and governance breaches that existing evals, guardrails, or alerts can miss. However, manually reading production traces at scale is often impractical, so teams need ways to surface these problems automatically from trace signal.

[LangSmith Engine](https://docs.langchain.com/langsmith/engine) can analyze traces to identify recurring failures, propose fixes, and test them against the traces associated with the issue. The customer service agent may repeatedly attempt to call a non-existent tool when handling a particular type of refund request. Engine can help identify this recurring behavior, propose a fix, and test it against the affected traces before deployment.

The findings also feed back into preventative governance; a newly discovered failure can lead to a tighter guardrail or a new regression test, for example. In this way, detective governance helps teams continually improve the controls that govern agent behavior.

### Governance through observability enables faster iteration

Across more than 16,000 production agents deployed on LangSmith, 87% of teams had tracing in place before their first deployment. Preventative controls are scoped from and verified by observed behavior, and detective controls run on it.

With governance built on centralized tracing, teams understand their agents better, catch and fix issues sooner, and avoid reinventing each guardrail and observability layer from scratch. We can think of this like a seatbelt: teams drive with more confidence because they know they’re protected by safeguards. Teams can ship more quickly when they trust that a system is put in place to ensure their agent stays auditable and explainable in production.

For more detail on how agent governance is implemented with LangSmith, see our blog: [*Building Governed Agents: A Framework for Cost, Control, and Compliance*](https://www.langchain.com/blog/building-governed-agents-a-framework-for-cost-control-and-compliance)*.*
