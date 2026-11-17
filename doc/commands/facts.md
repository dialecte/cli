# dialecte facts

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

List, show and forget the facts the agents recorded, kept in the data folder (one ledger per person, never in a repository)

```text
facts - List, show and forget the facts the agents recorded, kept in the data folder (one ledger per person, never in a repository)

  dialecte facts list [--about <Tag>] [--state <state>|all] [--json]
  dialecte facts show <id> [--json]
  dialecte facts forget <id> --reason <text> [--json]

  the ledger is $XDG_DATA_HOME/dialecte/facts (else ~/.local/share/dialecte/facts): one file per
    fact (F-<n>.json) and its history (F-<n>.history.jsonl); nothing is ever deleted
  list - every question's current fact, whatever its state; --state valid | stale | unverifiable |
         unchecked | forgotten: the current facts in that state now; orphan: the fact files no
         question points to; all: every fact file, superseded and unreadable ones included; --about
         <Tag>: the facts about that tag
  states - valid; stale (a source moved since: a standard's files, a dialecte's definition);
           unverifiable (a source cannot be compared now); unchecked (from outside the documents, or
           a person's answer given without them); forgotten
  show - the question, the answer, its source and effort, its state now, its sources, how many
         pieces of evidence, and its history in order
  forget - marks the fact forgotten, its reason in the history (cut at 200 characters); the file is
           kept; forgetting it again writes nothing

exit codes:
  1  show, forget: no fact of that id (the closest ids named) or a fact file that is not readable JSON
  2  usage · the ledger inside a git work tree (set XDG_DATA_HOME to a folder outside the repository)
e.g. dialecte facts list --state stale
```

Verbs: `list`, `show`, `forget`

Flags: `--about`, `--state`, `--json`, `--reason`
<!-- /dialecte-reference -->

`dialecte facts` reads the facts an agent recorded when it answered a question about a dialecte or a standard,
and retires the ones that no longer hold. A fact is a question (its words, its subject, its kind), its answer,
where the answer comes from (`schema`, `dialecte`, `standard`, `person` or `outside`), the effort it took, the
evidence and the sources it rests on. One question has one current fact; a better answer replaces it (an answer
checked against the documents always replaces an unchecked one, whatever the efforts), and the replaced fact is
kept, marked `superseded by F-<n>`.

**Where the ledger is.** In your data folder only: `$XDG_DATA_HOME/dialecte/facts/` (else
`$HOME/.local/share/dialecte/facts/`), one ledger per person, shared by every repository you work in. Each fact is a
file `F-<n>.json` and its history `F-<n>.history.jsonl`, one line per event (`created`, `reused`, `stale`,
`superseded`, `forgotten`, `rechecked`); `by-key/` holds one pointer per question to its current fact. Nothing is
ever deleted: a fact file is written once, afterwards only its state, its `supersededBy` and its sources change,
and its history only grows (a history line is at most 4,096 bytes: longer lists and strings in it are cut, and
a line still too long has each list replaced by its length, `fromCount` for `from`; the line marked `cut`, the
fact file always holding its sources whole). Every verb refuses (exit 2, nothing written) a ledger inside a git work tree, naming
the folder, the work tree and the fix: set `XDG_DATA_HOME` to a folder outside the repository. Only the data
folder counts, never the folder the command runs in.

**States.** A fact's state is the state now, checked on every read:

- `valid` - its sources still hold;
- `stale` - a source moved since it was recorded: the files of the standard it quotes (any file changed, added or
  removed), or the definition of the dialecte it read. Written to the fact once, with a `stale` line holding why
  (the source that failed and the fix), which every later read shows;
- `unverifiable` - a source cannot be compared now (no standard configured, its folder gone, the dialecte not
  installed). Shown only, never written;
- `unchecked` - an answer from outside the documents; a person's answer given without them is `valid` and marked
  `unchecked` on its line;
- `forgotten` - retired by `facts forget`.

A person's fact is never checked. A fact file no question points to (a record a crash stopped) is an `orphan`; a
file that is not readable JSON is `unreadable`. A read repairs what a crash or two writers at once left: the
previous fact of a question gets its `supersededBy`, with a `superseded` line marked `repaired`.

- `dialecte facts list [--about <Tag>] [--state <state>|all] [--json]`: one line per question, its current fact
  whatever its state: `<id>  <state>  <effort>  <source>  <question>` (the question cut). A `stale` fact (found by
  this read, or by an earlier one: the reason its `stale` line keeps) or one this read found `unverifiable` ends
  its line with `- <why>`: the source that failed and the fix (for example: set `DIALECTE_STANDARD`, the expected
  layout of a refused standard root, run from the package that installs the dialecte). `--state valid`, `stale`, `unverifiable`,
  `unchecked` or `forgotten`: the current facts in that state now; `--state orphan`: the fact files no question
  points to; `--state all`: every fact file, superseded, orphan and unreadable ones (with their path) included, a
  superseded fact's line holding `superseded by F-<n>` before its question:
  `<id>  <state>  <effort>  <source>  superseded by F-<n>  <question>`. `--about <Tag>`: the facts whose subject
  holds that tag. `--json` answers `{ facts: [{ id, path, fact?, state, current, reason? }] }` (no `fact` for an
  unreadable file). An unknown state is
  a usage error naming the states. The schema sources are compared with the dialectes installed in the folder the
  command runs in; run from a folder with no `package.json`, they are `unverifiable`, never an error.
- `dialecte facts show <id> [--json]`: the fact's question, answer, source, effort, state now (with `- <why>` when
  stale or unverifiable), sources and number of pieces of evidence, then its history in order; `--json` answers
  `{ fact, state, current, reason?, history }`.
- `dialecte facts forget <id> --reason <text> [--json]`: marks the fact `forgotten` and appends a `forgotten` line
  holding the reason (cut at 200 characters, the line then marked `cut`); the file is kept. Forgetting it again says so and writes nothing.
  `--json` answers `{ id, state, already }`. No reason, or a blank one, is a usage error.

`show` and `forget` answer exit 1 for an id with no fact (the closest ids named) or a fact file that is not
readable JSON (its path named).
