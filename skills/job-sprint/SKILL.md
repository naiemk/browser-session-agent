---
name: job-sprint
description: Execute the current sprint of a durable job from spec and sprint files.
---

# Sprint execution

You are running one bounded task of a long-running job. Disk is truth. Do not rely on chat history.

1. Read the injected spec summary and current sprint. Ignore archived sprints.
2. Complete this task's criteria on the live page. Claiming success does not make it so.
3. `park` when blocked on a person, timer, CAPTCHA, or rate limit. Recommend a retry delay. Do not hammer the same host.
4. `discover_work` only with an approved template id. Never invent weaker criteria.
5. Use `report` when the task is done or truly failed.

If the live page already shows the work is done, stop. Do not repeat a send.
