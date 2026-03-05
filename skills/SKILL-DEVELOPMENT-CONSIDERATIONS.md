# Important Considerations When Developing and Deploying Skills

**Applies to:** TipTap AI + AA_ClaudeAuto skill system
**Last updated:** 2026-03-05

---

## How Skills Actually Work

### Two Execution Modes

All skills land in one of two execution modes, determined in `main.js` (`skills-apply` IPC handler):

| Mode | How it works | When used |
|------|-------------|-----------|
| `terminal-hint` | Sends a short message to the active Claude CLI terminal listing the skill's file paths. Claude reads the files and acts. | **Default for all skills** |
| `claudeauto-delegated` | Writes a `.task` file to `~/.config/aa-claudeauto/refinement-drop/`. ClaudeAuto picks it up and runs it autonomously. | **Only for hardcoded slugs** (currently only `rechtschreibung-grosse-dokumente`) |

### terminal-hint Mode in Detail

`buildTerminalSkillHint()` produces a message like:

```
Bitte nutze fuer die naechste Aufgabe diesen Skill:
- SKILL.md: /path/to/skills/<name>/SKILL.md
- Prompt-Bausteine: /path/to/skills/<name>/prompts/default-prompts.md
- Vorgehensweise: /path/to/skills/<name>/references/usage-guide.md
Lies die Dateien und bestaetige kurz, dass du den Skill-Kontext uebernommen hast.
```

This text is sent as a **bracketed paste** (`\x1b[200~` ... `\x1b[201~`) directly to the Claude CLI PTY session. The user then types the actual task.

**Consequence:** The skill files are not injected as a system prompt. Claude must actively read them with its Read tool. If Claude does not have file access or skips the read, the skill has no effect.

### claudeauto-delegated Mode in Detail

For the hardcoded spellcheck skill, `buildClaudeAutoSpellcheckTaskPrompt()` constructs a full `.task` file:

```
MODELL: haiku
TITEL: ...
AUSFUEHRUNG: stepwise
KRITERIUM: ...

Nutze fuer diesen Task zwingend den Skill:
- /path/to/SKILL.md
- /path/to/prompts/default-prompts.md
- /path/to/references/usage-guide.md
- /path/to/references/report-schema.md
- /path/to/references/dictionary-schema.md

Zu pruefende Datei: ...
[detailed operational instructions]
```

ClaudeAuto wraps this further with DONE/BLOCKED markers before sending it to Haiku as a bracketed paste.

---

## The Role of `prompts/default-prompts.md`

This is the most important non-obvious fact about the skill system:

> **`default-prompts.md` is shown as a UI preview in the Skills modal, but is NOT automatically executed or injected anywhere.**

### What it IS used for

- Displayed in the Skills modal under "Prompt-Bausteine" (read-only preview).
- Listed in the `terminal-hint` message as a path Claude should read.
- Listed in the `claudeauto-delegated` task prompt as a reference file Claude should read.

### What it is NOT

- Not a system prompt.
- Not automatically sent to the Claude API.
- Not parsed or processed by TipTap AI in any way — it is read as plain text by Claude when instructed to.

### Discovery (fixed 2026-03-05)

When the `claudeauto-delegated` skill was originally built, `default-prompts.md` was **not included** in the task prompt's reference file list. Claude had no way to read the orthographic rules. This was discovered by tracing the code path from `skills-apply` → `enqueueSpellcheckTaskForClaudeAuto` → `buildClaudeAutoSpellcheckTaskPrompt` → the `.task` file content.

**Fix:** `promptFilePath` was added as a parameter to `buildClaudeAutoSpellcheckTaskPrompt` and inserted into the reference list in `main.js`.

---

## Adding a New terminal-hint Skill

No code changes required. Just create the directory structure:

```
skills/<your-skill-name>/
  SKILL.md                          # Required — frontmatter: name, description
  references/
    usage-guide.md                  # Required
  prompts/
    default-prompts.md              # Optional but recommended
```

The slug is the directory name (kebab-case). TipTap AI discovers skills by scanning `skills/`.

### Minimum viable SKILL.md

```markdown
---
name: your-skill-name
description: "One-line description in English"
---

# Your Skill Title

## Instructions
What Claude should do.

## Constraints
What Claude must not do.
```

---

## Adding a New claudeauto-delegated Skill

This **requires code changes in `main.js`**:

1. Add a slug constant:
   ```js
   const YOUR_SKILL_SLUG = 'your-skill-name';
   ```

2. Add a task prompt builder function:
   ```js
   function buildYourSkillTaskPrompt({ filePath, ...paths }) {
     return `MODELL: haiku\nTITEL: ...\nKRITERIUM: ...\n\n...`;
   }
   ```

3. Add the skill's files to `ensureClaudeAutoSpellcheckSkillFiles()` or create an equivalent sync function.

4. Add a case in the `skills-apply` IPC handler:
   ```js
   if (skillSlug === YOUR_SKILL_SLUG) {
     const dispatchResult = await enqueueYourSkillTask(payload.filePath);
     return { success: true, mode: 'claudeauto-delegated', ...dispatchResult };
   }
   ```

5. Implement the enqueue function that writes the `.task` file to `CLAUDE_AUTO_DROP_DIR`.

---

## Task File Format (ClaudeAuto)

ClaudeAuto reads `.task` files from `~/.config/aa-claudeauto/refinement-drop/`. The format:

```
MODELL: haiku|sonnet|opus
TITEL: Short title (max 60 chars)
AUSFUEHRUNG: classic|stepwise
KRITERIUM: file_exists:/path | file_modified:/path | output_contains:<regex> | session_exited

<Task prompt body>
```

ClaudeAuto wraps the body further before sending to Claude:
```
Task title: ...
<prompt body>
Acceptance check: ...
---
AUTOMATION: When done, output: AA_CLAUDE_AUTO_DONE|task_id=...|nonce=...|...
```

---

## Prompt Delivery to Claude

Both modes ultimately deliver prompts via **bracketed paste to a PTY**:

```js
await api.sendInput('\x1b[200~');   // bracketed paste start
await api.sendInput(promptText);
await api.sendInput('\x1b[201~');   // bracketed paste end
await api.sendInput('Use the pasted text attachment as the full task instructions. Execute it exactly and follow its DONE/BLOCKED marker rule.');
await api.sendInput('\r');          // submit
```

There is **no Claude API call**. TipTap AI and ClaudeAuto both interact with the `claude` CLI running in a PTY. There is no separate system prompt channel — everything is a user turn.

---

## Skill Sync Between TipTap AI and ClaudeAuto

The `rechtschreibung-grosse-dokumente` skill exists in two locations:

| Location | Purpose |
|----------|---------|
| `_AA_TipTapAi/skills/rechtschreibung-grosse-dokumente/` | Source of truth, versioned in TipTap AI's git repo |
| `_AA_ClaudeAuto/skills/rechtschreibung-grosse-dokumente/` | Runtime copy used by ClaudeAuto |

`ensureClaudeAutoSpellcheckSkillFiles()` in `main.js` syncs from source to runtime on each skill application, with inline fallbacks if source files are missing.

**Implication:** Always edit skill files in `_AA_TipTapAi/skills/`. The ClaudeAuto copy is overwritten on next use.

---

## XML Prompt Structure

The `<proofreader-config>` XML in `default-prompts.md` follows Anthropic's recommended prompt engineering conventions (XML tags for structured sections). This works well because:

- Claude understands XML structure natively.
- Tags like `<rules>`, `<instructions>`, `<do_not_flag>` create clear semantic sections.
- The format survives being delivered as a user message (no system prompt required).

The Anthropic API's `system:` / `human:` turn separation is **not applicable here** — the entire prompt arrives as a single user turn.
