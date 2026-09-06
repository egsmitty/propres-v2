# AI Instructions for PresenterPro

## Core Workflow Guidelines

Follow a strict step-by-step process for any code change or suggestion:

1. Propose the minimal change needed to achieve the goal.
2. Simulate running the linter and formatter (ESLint + Prettier) on the updated
   code and fix any formatting, style, or syntax issue in your proposal.
3. Run the completion gate and report results exactly as specified in
   `.cursor/rules/testing-standards.mdc` — that rule is the single source of
   truth for testing policy.
4. Output the final, linted, test-passing diff.

## Roles & governance

- The multi-agent workflow — roles, stages, and the **Self-Review gate** — is
  defined in [`AI_OPERATING_MANUAL.md`](AI_OPERATING_MANUAL.md). That manual
  orchestrates these rules; when the two disagree, **the rule file wins**.
- **Roles** (full definitions in the manual): **Architect** (Ethan) owns product
  decisions, scope, and final verification; **Planner** (strong model) writes the
  executable plan + Compliance Manifest and never writes production code in the
  same pass; **Executor** (fast model) implements the plan literally and stays
  inside its file list; **Reviewer** (fast model, fresh context) audits the diff
  against the plan and these rules.
- **Architect-only boundaries.** As an agent you must **not**, on your own
  initiative: edit files under `.cursor/rules/`, this `AGENTS.md`, or
  `AI_OPERATING_MANUAL.md`; change a task's scope; or accept a regression. Only
  the Architect may do these. If a rule seems wrong or blocks you, stop and
  surface it rather than editing it.
- **Never accept a regression to go green.** Fix the root cause, or record it as
  a suspected regression for the Architect to decide. Never delete features,
  weaken an assertion, or loosen a comparison to pass.

## This project

PresenterPro is a **local-first Electron desktop app** for worship
presentations — a simpler, PowerPoint-style alternative to ProPresenter.

- **Renderer:** React 18 + Zustand + Tailwind, built by `electron-vite`.
- **Main process:** `electron/main/` — window management, native menus,
  `better-sqlite3` persistence, multi-display output assignment.
- **The IPC seam is the highest-risk surface in this codebase.** Payloads
  crossing `electron/main` ↔ renderer have historically been the source of the
  most bugs. Type them first, test them first, and never widen an IPC contract
  without a test that pins its shape.

### Language policy

- Existing `.js` / `.jsx` files are type-checked via `checkJs` + JSDoc. Add
  JSDoc types at module boundaries (store actions, IPC handlers, exported utils)
  when you touch a file — not everywhere at once.
- **Every new file is written in TypeScript** (`.ts` / `.tsx`). Vite compiles it
  alongside existing JSX with no extra configuration.
- Never rename an existing file to `.ts` as a side effect of an unrelated
  change. Conversions are their own task with their own tests.

### Architectural invariants

Do not break these without an explicit Architect decision:

- Renderer command handling is centralized in `src/utils/appCommands.js` so
  native menu events and custom menu clicks stay consistent.
- Presentation load/save/open helpers live in `src/utils/presentationCommands.js`.
- Background inheritance is normalized through `src/utils/backgrounds.js` so
  slide, section, and presentation background behavior stays predictable.
- Background rendering resolves locally in renderer windows rather than
  requiring every IPC call to carry a full media payload.
- Section background is the primary background model. A background persists
  underneath text across slide changes within a section until it is changed.

## Error Handling Rules

- Always address errors by debugging and fixing the root cause in the code.
- Never resolve an issue by deleting features or code — preserve functionality.
- A failing test means the code is wrong until proven otherwise. Investigate
  before you touch the test.

## Testing

All testing policy — TDD, test-modification rules, the never-weaken-assertions
rule, the completion gate (`npm run gate`), snapshot discipline, jsdom/Vitest
mechanics, and test placement — lives in
[`.cursor/rules/testing-standards.mdc`](.cursor/rules/testing-standards.mdc).
That rule is the single source of truth; follow it for every code change.

Writing a new test? Start from the copy-paste skeletons in
[`.cursor/rules/writing-tests.mdc`](.cursor/rules/writing-tests.mdc).

## Planning

Any implementation plan another agent will execute must follow
[`.cursor/rules/writing-executable-plans.mdc`](.cursor/rules/writing-executable-plans.mdc)
and end with a complete **Compliance Manifest**. A plan without one is not
finished.

## General Best Practices

- Be concise: focus on code output with brief reasoning.
- Reference specific files, lines, or existing patterns in this project.
- Base suggestions only on provided context or standard best practices — never
  invent APIs, file paths, or Electron behavior you have not verified.
