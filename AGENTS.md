# AGENTS.md

## Project-Specific Guidance: Skill Creation

- When creating or updating skills that should run via ClaudeAuto (drop-queue delegation), read `docs/CLAUDEAUTO_SKILL_INTEGRATION.md` first.
- Treat this repository (`_AA_TipTapAi`) as source of truth for skill definitions.
- Avoid direct edits in `_AA_ClaudeAuto` during skill design unless the user explicitly asks for cross-repo synchronization.
- For delegated skills, include:
  - skill docs (`SKILL.md`, `prompts/`, `references/`, `scripts/`)
  - task prompt constraints (single-agent, no subagents, checkpoint/resume)
  - artifact paths and report schema
  - explicit UI warning if the source file should be closed during unattended processing
