# AI Team Operating Manual — PresenterPro

> Single source of truth for how the Architect and AI agents work together in
> this repo. This manual orchestrates the rule files in `.cursor/rules/`.
> When this manual and a rule file disagree, **the rule file wins**.

---

## Purpose

Turn one architect + multiple models into a high-leverage system where:

- A **strong model** creates high-quality executable plans
- **Fast models** implement them faithfully
- The **architect** only spends attention on product judgment and final
  verification

The goal is to reach the point where you can **trust a clean self-review** and
rarely need to deep-read diffs.

---

## 1. Roles

| Role | Owner | Primary responsibility | Hard boundaries |
|---|---|---|---|
| **Architect** | Ethan | Product decisions, scope, final verification, rule ownership | Only role allowed to change scope, edit rule files, accept regressions, or merge |
| **Planner** | Strong model | Create executable plan + Compliance Manifest | Never writes production code in the same pass |
| **Executor** | Fast model | Implement the plan literally | Never weakens assertions or goes outside the plan's file list |
| **Reviewer** | Fast model, fresh context | Audit the diff against the plan and rules | Did not write the code; never accepts a reported result without re-running it |

**Core principle:** the Executor's job is **faithfulness**, not creativity. If
something is unclear or blocked, it stops and reports.

---

## 2. Workflow

```
Intake → Plan (Strong) → Architect Approves Plan → Execute (Fast)
       → Self-Review (Fast, Fresh Context) → Architect Local Verify → Merge
```

| Stage | Owner | Key action | Architect time cost |
|---|---|---|---|
| **Intake** | Architect | Shape task (intent + acceptance signal) | Low |
| **Plan** | Strong model | Create executable plan + Compliance Manifest | High leverage (2–5 min) |
| **Execute** | Fast model | Follow the plan literally, todo by todo | None |
| **Self-Review** | Fast model (fresh) | Audit against plan and rules | **Main time saver** |
| **Local Verify** | Architect | Read Self-Report → re-run gate → test the feature in the running app | Medium |
| **Post-Local Fix** | Fast model | Fix issues found during local testing | Low |

**Rule:** never merge without a clean Self-Review Report *and* you personally
running the completion gate.

**Desktop-app addendum:** this is an Electron app, so a green gate is necessary
but never sufficient. Every user-facing change must also be verified in a real
running window (`npm run dev`) before merge. Multi-display output assignment,
native menus, and presentation mode cannot be fully covered by unit tests.

---

## 3. Core prompts

### 3.1 New task intake (Strong model)

```text
You are the Planner. Create an executable plan only — do not write code.

Task: <<paste task description>>

Requirements:
- Follow .cursor/rules/writing-executable-plans.mdc exactly.
- Explicitly guard against assertion weakening, list sampling, and quantifier erosion.
- For every comparison, clearly state whether order, count, and exactness matter.
- Include the anti-weakening clause verbatim.
- Provide exactly one sanctioned escape hatch (initially empty allowlist constant).
- End with a complete Compliance Manifest. Copy every relevant checklist from the
  rule files and give each item a disposition (todo number or `N/A — reason`).
  No blanks.
- List every file to create or modify with full paths.
- Define the bounded blast radius (what files must not be changed).
- Enforce TDD ordering with a named todo.
- Final todo must run `npm run gate` and report passed/total.
- If the change is user-facing, add a todo naming the exact manual verification
  steps in the running app.

If the task is ambiguous, ask clarifying questions first. Do not start planning.
```

### 3.2 AI Self-Review (critical gate)

> Mechanical backing: this gate's line-by-line checks live in the
> **"Reviewer checklist"** of `.cursor/rules/writing-executable-plans.mdc`.
> Keep this prompt and that checklist in sync.

```text
You are an adversarial reviewer working in a fresh context. You did not write
this code.

Inputs:
- The approved plan
- Current diff (`git diff main...HEAD`)

Produce a structured Self-Review Report with these sections:

1. Manifest Audit — check every item in the Compliance Manifest. Flag any blank
   or unjustified `N/A`.
2. Scope Integrity — does the diff stay within the plan's file list?
3. Assertion Integrity — flag any weakened comparison, deleted assertion, or
   loosened check.
4. Escape Hatches — list every allowlist entry and whether it has a justifying
   comment.
5. Snapshots — for every refreshed snapshot, can you articulate exactly why it
   changed? If not, flag it.
6. Gate Results — re-run `npm run gate` yourself and report passed/total.
7. IPC Surface — did this change alter any `ipcMain` / `ipcRenderer` channel or
   payload shape? If so, is there a test pinning the new shape?
8. Verdict — PASS or FAIL + the top issues the architect must check locally.

Be strict. Your job is to protect the architect's time.
```

### 3.3 Post-local fix

```text
You are fixing a defect discovered during local testing.

Repro: <<paste exact steps + expected vs actual>>

Rules:
- Write a failing test first that reproduces the bug (TDD).
- Fix the root cause. Do not weaken assertions or mask the problem.
- If this reveals a flaw in the original plan, explicitly note what the plan missed.
- Finish by running the full completion gate (`npm run gate`).

Output a short summary: root cause, test added, and whether any rule file should
be updated.
```

---

## 4. Context management

- **One context = one stage.** Never mix planning, execution, and review in the
  same chat.
- **The plan is the hand-off.** Executors should be able to work from the plan +
  codebase alone.
- **Rule files carry standing context.** Keep prompts short by referencing them
  instead of repeating rules.
- **`tasks/` and GitHub are long-term memory.** Important decisions and accepted
  regressions belong in `tasks/todo.md` or on the PR.

---

## 5. Evolving the system

- Recurring issues found during local verification become inputs for improving
  prompts or rule files.
- Only the Architect edits rule files.
- Prefer **mechanically enforceable** improvements (lint rules, CI gates,
  self-checking assertions) over adding more prose. Prose degrades under
  execution; a failing check does not.

---

## 6. Non-negotiables

1. Never weaken an assertion to make a test pass.
2. No merge without a clean Self-Review *and* an architect-run completion gate.
3. Every plan must end with a complete Compliance Manifest (no blanks).
4. Executors must stay inside the plan's defined file list.
5. Only the Architect edits rule files or accepts regressions.
6. One context per stage.
7. Any user-facing change is verified in a running app window before merge.
