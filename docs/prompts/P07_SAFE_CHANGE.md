# P07: SAFE CHANGE PROTOCOL

Stage: Build | Run: EVERY task (features, bug fixes, refactors, database
changes, audit fixes)
Output: working change + report + updated docs/PROGRESS.md

Two parts:
- P07-A: permanent rules. They live in CLAUDE.md (see CLAUDE_TEMPLATE.md) so
  the AI loads them in every session.
- P07-B: this protocol. Paste it (or say "Follow docs/prompts/P07") with each
  task.

ONE-TIME SETUP PER PROJECT
1. In tsconfig.json under compilerOptions: "noUnusedLocals": true and
   "noUnusedParameters": true, so unused code fails the type check
   automatically.
2. Commit to git before every task. "Restore the last commit" is the safety
   net no prompt can match.
3. If an AI tool is connected to the database (e.g. Supabase MCP), use
   read-only mode or a dev project. Never give it write access to
   production.

---

## P07-B: SAFE CHANGE PROTOCOL

TASK: [describe the change]
TYPE: [FEATURE / BUG FIX / REFACTOR / DATABASE / CONFIG / AUDIT FIX: finding ID]

Follow CLAUDE.md and these phases in order. Do not skip phases.

PHASE 1 - PLAN (then STOP for my approval)
- Confirm the working tree is clean; if not, remind me to commit a
  checkpoint first.
- Run type check, lint, build, and tests BEFORE changing anything, and
  report the baseline. List existing failures; don't hide or fix them
  silently.
- Restate the task, and check it against docs/PROJECT_PLAN.md. Flag
  conflicts. Client projects: flag if the task is outside the agreed scope
  (it may need a change request).
- List:
  - Files you will create or modify, and why
  - Existing features that could be affected (impact analysis)
  - Any database, configuration, or dependency changes needed
- BUG FIX tasks, additionally:
  - Reproduce the bug first (exact steps, or a failing test)
  - Find the root cause with evidence (code, logs, data). Explain it in
    plain language BEFORE proposing a fix. No guess-and-patch.
  - Propose the fix, and a test that would catch this bug if it came back
- DATABASE tasks, additionally:
  - Inspect the live schema with read-only queries: affected tables,
    columns, types, constraints, access policies, and any views,
    functions, or triggers that reference them
  - The migration (or rules-file change), marked ADDITIVE or DESTRUCTIVE,
    with every existing table, query, policy, or feature it affects
  - Rollback script to undo it
  - Whether a backup is recommended before running it

PHASE 2 - IMPLEMENT (after my approval)
- Make only the approved changes.
- Apply database changes only in the way I approve (dev first if a dev
  database exists).
- Regenerate database types after schema changes, and fix any type errors
  they reveal (these usually mean a query no longer matches the schema).
- If the same error survives two fix attempts, STOP and explain what you've
  learned instead of trying a third workaround.

PHASE 3 - VERIFY (show real output for each)
- Type check (with unused checks on), lint, build, tests
- Unused-code tool (e.g. knip) on changed files. List removals for my
  approval; never delete silently.
- Compare with the Phase 1 baseline: nothing that passed before may fail now
- Every query in changed files matches the regenerated types
- Bug fixes: the reproduction steps no longer produce the bug
- If you cannot run a check, say so and give me the exact command.

PHASE 4 - REPORT (use exactly this format)
1. Summary: what changed, in plain language
2. Files changed: list with one line each
3. Database changes: what was applied (yes/no, where) and the rollback
   script location
4. Check results: pass/fail for each, with output
5. ACTIONS FOR ME: env variables to add (and where, e.g. Vercel),
   migrations to run, settings to change, packages to install, commits to
   make, anything to tell the client. Write "None" if none.
6. MANUAL TEST CHECKLIST: step-by-step things to click through to confirm
   the change works AND that nearby features still work
7. Risks and follow-ups: anything uncertain, skipped, or worth watching
8. Update docs/PROGRESS.md: date, task, what changed, what's next, known
   issues (keep recent entries; summarise older ones)
