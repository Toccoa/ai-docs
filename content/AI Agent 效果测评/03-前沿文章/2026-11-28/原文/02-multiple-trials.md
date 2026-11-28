# 原文存档｜Running Multiple Trials per Task for AI Agent Evaluation

> 来源：Hugging Face Blog（社区文章）　｜　日期：2026-11-19
> 原文链接：https://huggingface.co/blog/phranzia/running-multiple-trials-per-task-for-ai-agent-eval
> 说明：本文件为原文存档（HTML 清洗后的纯文本），供与中文译文对照。

---

Running Multiple Trials per Task for AI Agent Evaluation
Community Article
Published November 19, 2026
Upvote
•
•
•

Golda Manuel
phranzia
Follow

•	Why run multiple trials per task
•
•	Choosing how many trials to run
•
•	Understanding pass@1, pass@k, and pass^k
•
•	Deciding between more trials vs. more tasks
•
•	Conclusion
•
Determine how many trials to run per task and when to prioritize broader task coverage over additional trials.

Once an agent completes a task with your product, the next question is how consistently it can do it again. Even with the same instructions, tools, and documentation, it may take a different route, spend longer on the work, or get stuck on something it previously completed easily.
When developers rely on agents to use your product, unpredictable behavior can interrupt their work and make the experience harder to trust. Repeated trials help you find where the workflow breaks down and test whether clearer documentation, better tools, or more useful error messages help them complete tasks more consistently.
Why run multiple trials per task
Running the same task multiple times helps you measure how consistently an agent succeeds and uncover failures a single run might miss. Each execution, or trial, uses a defined agent configuration and starts independently, with an empty environment and no conversation history or intermediate work carried over from another trial. When comparing product versions, this repetition also helps you assess whether a change improved performance or the results simply varied between runs.
Agent behavior can vary even under apparently deterministic settings. In the 2026 study On Randomness in Agentic Evals, researchers collected 60,000 coding-agent trajectories on SWE-bench Verified. Across ten complete evaluation runs of each configuration, scores varied by 2.2 to 6 percentage points from the lowest to the highest run. Variation persisted even when the temperature of the underlying LLMs was set to zero. For engineers depending on agents to get work done, those inconsistencies can become a recurring source of friction.
Multiple trials also give you more behavior to inspect. A task that passes four times and fails once offers a useful opportunity to compare approaches. Did the agent find different documentation? Choose another tool? Misinterpret a response? Reviewing those differences can point toward changes you can test.
Choosing how many trials to run
The ranges below offer a starting point for choosing trials per task. You’ll generally need more trials when results change from run to run, you’re looking for a small improvement, or you’re trying to catch a failure that rarely happens.
Suggested Trial Counts by Evaluation Goal
Evaluation goal
Starting trial count per task and configuration
Why start here
Check a new task and its validation
One run can reveal obvious setup or validation problems before you spend more on repeated trials.
Explore inconsistent behavior
A few runs can reveal different approaches and recurring problems, giving you an initial look at how behavior varies.
Pilot a comparison between product versions
5–10 for each version
Repeating both versions gives you an initial estimate of the performance difference and how much it changes between runs.
Detect a small improvement
Base the trial count on how much your initial results vary and how small an improvement you want to detect.
Small gains are harder to distinguish from normal variation. The required count depends on the size of the gain and how variable the results are.
Investigate rare failures or measure task reliability
Choose a trial count based on the failure rate you want to detect or the reliability you want to establish.
Uncommon failures can go unnoticed in a few trials. Detecting them or supporting a strong reliability claim requires a budget matched to the failure rate and confidence needed.
Even major AI labs use different trial counts. OpenAI averaged four attempts per task on SWE-bench Verified, while Anthropic averaged 25 trials. For your evaluation, the useful count depends on how much the results vary and how small an improvement you want to detect. Research on coding agents shows that smaller improvements can require substantially more repetition. Start with a pilot to understand that variability, then use it to plan the trials your comparison needs.
The smaller the improvement you want to detect, the more trials you’ll generally need to distinguish it from normal variation. For example, this coding-agent study estimated that, at its median observed variability, detecting a two-percentage-point improvement would require approximately nine complete benchmark runs per system. Detecting one point would require 36. Those estimates assumed 80% statistical power and a 5% significance threshold, with 500 tasks in each complete run.
Understanding pass@1, pass@k, and pass^k
There are three important metrics worth understanding when evaluating agents: pass@1, pass@k, and pass^k. The first two grew out of code generation research, where tests could check whether a system produced a working solution in one attempt or among several candidates. OpenAI’s 2021 HumanEval paper refined how to estimate these probabilities.
As evaluations expanded to agents handling everyday workflows, consistency became another important question. The 2024 τ-bench paper introduced pass^k to measure the probability that all k independent trials succeed, averaged across tasks. Together, these metrics describe success on a single attempt, success within multiple attempts, and consistency across repeated runs.
Measuring Agent Success and Consistency
Metric
Question it answers
When to use it
pass@1
How likely is the agent to succeed on a single attempt?
Measuring performance when the agent gets one attempt to complete the task.
pass@k
How likely is at least one of k attempts to succeed?
Evaluating workflows that allow multiple attempts and can identify a correct result.
pass^k
How likely are all k attempts to succeed?
Measuring how consistently the agent completes the same task across repeated runs.
Results from the 2024 τ-bench retail evaluation show why it helps to measure success across repeated trials. GPT-4o’s function-calling agent achieved 61.2% average success on a single attempt, measured by pass@1. Its pass^8 score fell below 25%, meaning that, averaged across tasks, the probability of succeeding in all eight independent trials was less than 25%.
Deciding between more trials vs. more tasks
Agent evaluations take time and compute, so choosing between more tasks and more trials comes down to what you need to learn. Add tasks when important workflows or conditions are missing. Run more trials when you need stronger evidence about how consistently agents handle the cases you already cover.

Repeated trials help you understand how consistently an agent handles a task, but the benefit of repetition has limits. Once you have a clearer picture of that behavior, testing more representative tasks, rather than more trials of a smaller set of tasks, may tell you more about performance across your product. Use your initial results to decide where uncertainty remains. If you’re trying to detect a small improvement, you may need more tasks, more trials, or both.
Conclusion
Use repeated trials to assess how reliably agents complete the workflows your product supports. Inspect outcomes and traces, identify where behavior varies, and test whether changes to tools, documentation, or error messages address those problems. Balance repetition with representative task coverage so your results support conclusions about both individual workflows and the broader product experience.
More from this author

How to Test Your MCP Server with Coding Agents
•
•
November 12, 2026

Choosing the Right Tasks for AI Agent Evaluation
•
•
November 5, 2026
Community

Twu31
8 days ago

I’d add one detail to the independent-reset protocol: interleave runs of the two configurations when they share an external service. Running all of A before all of B can turn a temporary tool outage or rate limit into an apparent regression. Keeping the task IDs and run times also makes it easier to compare failures on the same workflows afterward.
See translation
•
•
•	2 replies
·
👍
+

phranzia
Article author 7 days ago

Yes, great point. We’ve been looking at this during peak usage too. The same task can run smoothly in the morning and hit a rate limit in the afternoon, so I like the idea of giving both configurations a turn in the same window.
See translation

Expand 1 reply

wanvideo
8 days ago

Balancing pass^k trial count against broader task coverage is one of the trickiest eval budgeting calls right now. Single-run evals hide non-determinism, while too many trials on a narrow suite mask edge-case regressions.
See translation
•
•	1 reply
·
👍
+

phranzia
Article author 7 days ago

That balance is tricky while teams are still figuring out how people use their products. Early on, I’d spend more of our eval budget on distinct workflows. Once we know which ones people rely on most, I’d run those a few more times to catch intermittent failures, especially where a missed failure would be costly. New features and the occasional customer surprise can keep expanding the suite from there.
See translation
