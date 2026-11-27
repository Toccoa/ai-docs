# From tasks to goals

Harrison Chase ｜ November 16, 2026 ｜ 5 min read

As agents become more powerful, we’re moving from giving them tasks to giving them goals.

Tasks are:

- Write this email
- Draft this blog
- Fix this bug

Goals are:

- ‍**Reduce my coordination burden while keeping important commitments on track**‍
- Maintain a blog
- Make this product successful

Under the hood, this move from tasks to goals consists of two more practical shifts:

- From specifying an action to specifying an outcome
- From a bounded assignment to an ongoing responsibility

This is changes what an agent does, what it needs, how its built, and we interact with it.

## The agent chooses the tasks

Previously, the user would specify tasks. Now, the user specifies a goal, and the agent iterates towards that goal by deconstructing into tasks, doing some of them, updating the task list, etc.

The agent needs to be good at brainstorming and selecting different tasks, which requires new context engineering and prompting strategies. It needs to be somewhat creative - and varied - in brainstorming potential tasks (if it keeps on suggesting the same tasks over and over again, that’s not great).

***Practical consideration: you need some way to see what tasks the agent is doing (e.g. a to-do list), as well as prompting for the agent to be creative in coming up with tasks***

## Tool calls are way less known

When you give an agent task, you largely have an idea of what tools it will call. When you give it a goal - you don’t really know what tools it will call, and you may not even know what tools it will need to call.

E.g.

- If you ask an agent to send an email (task), you know it needs the gmail tool, maybe a calendar tool.
- If you ask an agent to **reduce my coordination burden while keeping important commitments on track** (goal), you don’t know when it will need a email, text, search tool, a browser tool, or possibly other tools.

***Practical consideration: you need more controls over what tools an agent can or cannot call***

## Inbox to ask questions

When you give an agent a task, you’re naturally in the loop. If you don’t provide all the information up front, its easy for the agent to ask follow up questions in chat.

When you give an agent a goal - it may be running in the background and need to get clarification on certain points. It needs a way to ask questions to humans - whether through Slack or a dedicated UI.

***Practical consideration: you need a mechanism for a background agent to ask you for clarification***

## Way to get feedback

The agent needs to know how its doing as it progresses towards a goal. This could either be by checking in on a metric to see if it is improving, or by getting explicit feedback from a human on how its doing. The more closely tied to a metric, the better in some sense (easy for it to track automatically!) but its never wise to blindly optimize a metric, so explicit human feedback may be the best thing. This is why its important to [design goals](https://www.langchain.com/blog/goal-engineering) in a way where its easy to give feedback.

You can have both metrics for the agent to drive towards, and a way to get feedback from users. Define how the agent will assess progress, and give people a way to correct its interpretation of success.

***Practical consideration: you need to design goals in a way that is aligned with feedback, and also set up a mechanism where the agent gets feedback***

## Ongoing work needs triggers (and stopping rules)

When you give agents tasks, they run until its completed.

When you give them a goal, they need to work in the background. They are not always running - they wake up at times to do some work. How do they wake up?

Some methods we see:

- Heartbeats every X minutes
- Recurring cron
- One-off cron (reminder)
- Listening to event stream

That being said, it also needs a way to stop or pause or ignore these triggers. If it gets a heartbeat every thirty minutes, and pings you the same question every time - that’s a terrible UX.

Ongoing responsibility does not mean the agent should always find something to do. Sometimes doing nothing is the right action.

***Practical consideration: you need crons and event triggers to wake the agent, and prompting for it to decide when to act.***

## Memory lets feedback compound

While memory sounds really cool and has captured the imagination of developers for the past few years, in reality it has not been that needed in a task based world (unless you are doing the same task repeatedly).

With individual tasks, the user can supply the relevant context each time. As you delegate an ongoing responsibility, more of that burden shifts to the agent. It needs to carry forward decisions and feedback without requiring you to repeat them.

E.g: rejecting a blog topic should inform future topic selection, not just the current draft.

***Practical considerations: The agent needs to retain and use relevant decisions and feedback across runs.***

## In Conclusion

Giving an agent a goal isn’t simply giving it a bigger prompt. You’re delegating decisions about what work to do and when to do it. Your role shifts from specifying each task to setting direction, defining boundaries, and reviewing progress.
