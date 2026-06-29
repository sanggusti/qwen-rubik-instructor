## MCP Tools

Two MCP servers are configured for this project (`.mcp.json`). Use them proactively — they are faster and more accurate than guessing.

### `svelte` — `@sveltejs/mcp`

Provides live Svelte/SvelteKit documentation via three tools:

| Tool | When to use |
|---|---|
| `list-sections` | Before any Svelte/SvelteKit work — discover which doc sections are relevant |
| `get-documentation` | Fetch exact API docs for the feature you are about to implement |
| `svelte-autofixer` | After writing or editing `.svelte` files — detect and fix Svelte-specific issues |

**Rules:**
- Always call `get-documentation` before implementing any Svelte 5 rune, SvelteKit routing pattern, or adapter config. Never rely on training-data memory for Svelte APIs.
- After any `.svelte` edit, run `svelte-autofixer` on the changed file before reporting done.
- Section paths to know: `kit/routing`, `kit/load`, `kit/form-actions`, `kit/state-management`, `cli/playwright`, `cli/vitest`.

### `playwright` — `@playwright/mcp`

Controls a Chromium browser to test the frontend at `http://localhost:5173`.

**Rules:**
- Start the dev server (`npm run dev` in `frontend-sveltekit/`) before any browser tool call.
- Use for UI verification when asked to verify, screenshot, or test a feature — not as a substitute for unit tests.
- After any visual change, take a screenshot to confirm the golden path renders correctly.
- Do not use Playwright MCP for logic that can be covered by Vitest unit/component tests.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
