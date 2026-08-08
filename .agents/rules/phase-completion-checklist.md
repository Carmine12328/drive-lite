# Phase Completion Checklist

After completing any implementation phase/step from the frontend plan
(FE_IMPLEMENTATION_PLAN.md), you MUST execute all of the following before
considering the phase done:

## 1. Build Verification
- Run `ng build --configuration development` and confirm zero errors and
  zero warnings.

## 2. Dev Server Verification
- Start `ng serve` and confirm the server compiles cleanly.
- Verify the page is accessible at the dev server URL (e.g., http://localhost:4200).
- Check for zero console errors in the server output.

## 3. Documentation Update
- Mark all completed sub-tasks as `[x]` in `FE_IMPLEMENTATION_PLAN.md`.
- Update the `> [!IMPORTANT]` current state header at the top of the plan
  to reflect the new state of the project.

## 4. Git Commit
- Stage all changes with `git add -A`.
- Write a descriptive commit message following conventional commits format
  (e.g., `feat(frontend): implement Step N — <summary>`).
- Include a body listing what changed, grouped by sub-task.

Do NOT skip any of these steps. Do NOT wait for the user to ask — execute
them proactively as part of completing the phase.
