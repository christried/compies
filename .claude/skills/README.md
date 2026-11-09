# Skills

Every folder here except `thermo-nuclear-code-quality-review` and `implement-spec-max` is a copy of [mattpocock/skills](https://github.com/mattpocock/skills) **1.3.1** (commit `49dd158`): the skills its `.claude-plugin/plugin.json` ships, without the Codex-only `agents/openai.yaml` files.

They're committed because cloud sessions load a repo's `.claude/skills/` but no plugins. `.claude/settings.json` turns the `mattpocock-skills` plugin off in this repo, so local sessions load these copies too, under the same names. `code-review` here replaces Claude Code's built-in `/code-review`; the built-in stays reachable as `/review`.

## COMPIES patches

Each patch is a paragraph starting with `**COMPIES:**` that points at the rules in `docs/agents/`. The rules live there; a patch stays a pointer. `grep -rn "COMPIES:" .claude/skills` lists them:

- `code-review`: both sub-agents on `sonnet`, each in its own worktree
- `implement-spec`: subagent rules, frontier tickets only, integration branch from and into `staging` (where `Closes #n` closes nothing), clean merges by the orchestrator, delivery, the 300k context limit with its handoff, the Release review in place of `code-review`, the worktree cleanup
- `implement`: delivery
- `implement-spec-max`: a copy of the patched `implement-spec` whose extra paragraph, `**COMPIES (max):**`, and closing section, `## Model tiers`, put every subagent on `fable`, or on `opus` or `sonnet` at `effort: "high"`, by how hard its task is. A change to `implement-spec` is mirrored here: `diff .claude/skills/implement-spec/SKILL.md .claude/skills/implement-spec-max/SKILL.md` shows only the name, the description, that paragraph and that section.
- `grill-with-docs`, `to-spec`, `to-tickets`: design hand-off flags and tickets; migration numbers, ADR citations, changelog groups and site counts come from the repo (retro 0.10)
- `handoff`: names the subagents still running

## Updating to a new release

1. List the patches with the `grep` above.
2. Copy the new release's skill folders over these, leaving out `agents/`.
3. Re-apply each patch where it still fits, then update the version and commit at the top of this file.

## License

The copied skills are under the MIT license:

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
