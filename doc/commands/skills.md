# dialecte skills

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Agent skills shipped in skills/&lt;name&gt;/: sync \| generate \| check \| changed

```text
skills - Agent skills shipped in skills/<name>/: sync | generate | check | changed

  dialecte skills sync [--agent claude,copilot,agents] [--copy] [--from <workspace>] [--contributing | --no-contributing] [--vendor <id>] [--no-session-check] [--agents-file | --no-agents-file]
  dialecte skills generate [zero-config flags]
  dialecte skills check [--workspace <dir>] [zero-config flags]
  dialecte skills changed [--base <ref>]

  sync - install the consumer skills of your dependencies (or of local checkouts) for your agents;
         --contributing adds the contributor skills, remembered until --no-contributing; remembers
         the model vendor; with the contributor skills, a doctor --brief session-start check in
         AGENTS.md and the station agents (--no-session-check leaves the check out); a missing
         AGENTS.md is created only on a yes or with --agents-file, the section is never removed, and
         --no-agents-file leaves AGENTS.md alone
  generate - rewrite the generated blocks (verb map, method index, hook files) from the source
  check - fail on a cited API / path / npm script / cli invocation that does not exist, or a stale
          block
  changed - per skill, hand-written change (evals due) or generated blocks only

e.g. dialecte skills sync --agent claude
```

Verbs: `sync`, `generate`, `check`, `changed`

Flags: `--agent`, `--copy`, `--from`, `--contributing`, `--no-contributing`, `--vendor`, `--no-session-check`, `--agents-file`, `--no-agents-file`, `--namespace`, `--entry`, `--constants-dir`, `--out`, `--version`, `--tsconfig`, `--format-config`, `--no-format`, `--workspace`, `--base`
<!-- /dialecte-reference -->

Every Dialecte package ships the agent skills that describe it in `skills/<name>/SKILL.md` (open
[Agent Skills](https://agentskills.io) format), versioned with its code.

- **In an app**: `npx @dialecte/cli skills sync` links the consumer skills of your `@dialecte/*` (and any
  other) dependencies into `.claude/skills` and `.agents/skills` (Codex, Cursor, Gemini CLI, Copilot read the
  latter; add `--agent copilot` for `.github/skills`). Links follow your installed versions; rerun after
  adding a dependency. `--copy` writes copies instead of links.
- **Consumer and contributor skills**: a skill whose frontmatter says `metadata:` / `audience: contributor` is
  for changing a dialecte package (core's `dialecte-contributing`, `dialecte-lot`); a skill without one is a
  consumer skill. A sync installs the consumer skills only and names the contributor skills it left out;
  `--contributing` installs them too and is remembered (`contributing` in `.dialecte-skills.json`) until
  `--no-contributing` removes them. `dialecte doctor` expects the skills of the audience the manifest says;
  `skills check` refuses another audience value.
- **Station agents (Claude Code)**: when Claude Code is a target (the default), the contributor skills are
  installed and the project's model vendor is anthropic, `skills sync` also writes one agent per station of `dialecte-lot` into
  `.claude/agents/dialecte-<station>.md`: `implementer` and `fixer` (standard tier), `implementer-strong` and
  `reviewer` and `grader` (strong), `eval-runner` and `standard-reader` (standard), `searcher` (fast). Each file
  sets the model (from the `dialecte models` map, as the alias Claude Code accepts: `sonnet`, `opus`,
  `haiku`) and the tools: the reviewer holds the read tools and Bash (it runs the tests) and no Write or Edit,
  the searcher and the grader hold read tools only. These files are adapters: a station's tier and access
  (`read`, `review`, `edit`) are the cli's, its definition is the `dialecte-lot` skill's `references/stations.md`
  (one `### <station>` section with a `- Tier:` and an `- Access:` line), and the Claude tool names are only the
  Claude form of the access. The body is a few lines naming the station and its section in the installed
  `.claude/skills/dialecte-lot/references/stations.md`, the skills to load and the never-list; it never copies a skill.
  The `eval-runner` and the `grader` read neither the page nor a lot skill (they judge the skill under test): their
  brief carries their definition and names the only skill text they read. `skills check`, in a package shipping `dialecte-lot`, refuses a
  `references/stations.md` that is missing, lacks a station, has an unknown section or a `Tier:` / `Access:` line out of
  line with the cli. The files are owned through the manifest: replaced on
  every sync, removed when no longer produced, and a file of your own with the same name is reported, never
  overwritten. `dialecte doctor` warns about a stale or missing one. Other hosts (Copilot / VS Code, Codex,
  Gemini) get no agent files from this command yet: the tier of each station comes from `dialecte models`
  there, as the `Tier:` line of a brief says.
- **Session-start check, every agent**: when `dialecte-lot` is installed by the sync (whatever the targets),
  `skills sync` writes a section in the project's root `AGENTS.md`, between `<!-- dialecte-skills:session-check -->`
  and `<!-- /dialecte-skills:session-check -->`, telling the agent to run `npx --no-install @dialecte/cli doctor --brief`
  at a session start. It is written with a blank line inside each marker, the form a markdown formatter keeps, so a
  formatted `AGENTS.md` stays formatted. An existing `AGENTS.md` gets it appended after one blank line; the body
  between the markers is compared tolerantly (whitespace does not matter: line ends, blank lines, a wrapped
  sentence), and only the marked block is replaced when an older release wrote another sentence: every byte outside
  it stays, line ends included. A missing `AGENTS.md` is created only when you answer yes on a terminal or pass `--agents-file`; without
  either, the sync says it was not created. The section and the file are never removed nor deleted by a sync:
  `--no-session-check`, `--no-contributing` or a sync without `dialecte-lot` leave them in place (delete the section
  by hand if you do not want it). `--no-agents-file` leaves `AGENTS.md` alone altogether (it excludes
  `--agents-file`). A marker without its pair, or a doubled one, leaves the file alone with a warning.
  An `AGENTS.md` holding only the section is no evidence of a vendor.
- **Session-start check (Claude Code)**: the same check as an adapter: `skills sync` adds a `SessionStart` hook running
  `npx --no-install @dialecte/cli doctor --brief` (the installed cli: no download at a session start) to
  `.claude/settings.json`, inserted by a minimal text edit (the rest of your file stays byte for byte), never
  duplicated, removed when you drop the claude target. If you edited the hook's text since, removal cuts only
  our handler (a comment right next to it may go with it) and writes nothing when anything else would change. Agents and hook are written only when `dialecte-lot`
  is installed for Claude Code. `doctor --brief` prints nothing when the skills, the
  versions and the station agents are in sync, otherwise one line per problem with its fix, and always exits 0.
  `--no-session-check` leaves the hook out (and removes the one a sync added). Elsewhere, the `dialecte` skill
  tells the agent to run `doctor` first.
- **Working on Dialecte**: `npx @dialecte/cli skills sync --from ../ --contributing` takes them from your local
  checkouts, the contributor skills included.
- **In a package**: `dialecte skills generate` rewrites the `<!-- dialecte-skills:generated <kind> -->`
  blocks (`extensions`, `core-methods`, `hooks`, `api`, `intents`) from the source; the `api` block lists
  the methods, then one section per package entry (each `exports` subpath shipping a `.d.ts`) with the
  functions it exports.
  `dialecte skills check` verifies every API, path and npm script a page cites, and that every public
  method and every function an entry exports (not `@internal`) has a JSDoc summary and an `@intent` tag; it warns when a summary or an
  intent quotes a sentence, since the generated pages republish the JSDoc. A page about several
  repositories declares `<!-- dialecte-skills workspace -->` and is fully verified with
  `--workspace <folder>`; a deliberate outside mention goes in `<!-- dialecte-skills ignore: token -->`.
  It also verifies every cli invocation a page cites in code (inline code, fenced blocks tagged `sh`, `bash` or
  `shell`, and in an untagged fence only a line starting `dialecte ` and a command of the map; a fence with any
  other tag - `text`, `mermaid`, a diagram, a sample - is never read; never prose; generated blocks left out): one starting with `dialecte` or `@dialecte/cli`, after `npx`, a
  `$ ` prompt or a shell operator. Its command, its verb and each `--flag` must be in the command map of the
  cli the package uses (the cli's own map in the cli itself, else what the installed `@dialecte/cli` answers to
  `dialecte --help --json`); an unknown one, or an old form of a command renamed in 1.0 (see "Renamed in
  1.0"), is an error at `page:line` naming the closest valid form, or the new form, on a workspace page too. A quoted word, a
  `<placeholder>` and what follows a bare `--` are not checked; `ignore:` takes the offending word (`record`,
  `--fats`). With no installed cli, or one before the map, the invocations are not checked: one warning says
  why and the summary line says so. Inside a `<placeholder>`, an option group `[...]` or a flag group
  `(--a | --b)` a `|` is no pipe; each kind of group is counted on its own (a `)` never closes a `<`), and a
  process substitution `<(dialecte ...)` is read like any invocation. A versioned `@dialecte/cli@<version>` and
  what follows an unclosed `<`, `[` or `(--` are not read.
