# dialecte ask

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Answer a question about a dialecte: a fact recorded before, the definition, the catalogues and api indexes, else the slices of the standard for readers

```text
ask - Answer a question about a dialecte: a fact recorded before, the definition, the catalogues and api indexes, else the slices of the standard for readers

  dialecte ask "<question>" [--about [<Parent>/]<Tag>[@<attr>] | --code <code> | --method <path>] [--kind <kind>] [--decision] [--package <name>] [--effort low|medium|high] [--lot <id|folder>] [--limit <n>] [--no-facts] [--no-standard] [--person-only] [--json]
  dialecte ask pack <ask-id> [--out <dir>] [--outside] [--web] [--lot <id|folder>] [--json]
  dialecte ask verdict <ask-id> [<report.json>...] [--missing <letter>]... [--adjudicator] [--lot <id|folder>] [--json]
  dialecte ask answer <ask-id> "<answer>" --by <who> [--verdict yes|no|depends|value] [--cite <file id>:<from>-<to> --quote "<quote>"] [--lot <id|folder>] [--json]

  the ladder - rung 0 a fact of the same question (reused at its effort or above), rung 1 the
    definition (a structural question: children, parents, required, values, default, fixed, type,
    variants, documentation), rung 2 the catalogues (a code) and the api indexes (a method), rung 3
    the slices of the standard found from the angles of the question
  --about [<Parent>/]<Tag>[@<attr>], --code, --method name the subject; --kind forces the kind;
    --decision skips rung 1 (a choice the definition does not make)
  --decision reads the definition as the boundary of what is valid (boundary: <answer> (definition),
    never the answer): a stored schema fact is a candidate only; a standard or person fact answers
    inside it; one naming what the XSD rejects is cut to the boundary (a list) or takes its answer,
    and a ! conflict: line flags it (standard-vs-xsd, exit 0): the XSD wins, fix it and ask again
  an answer from rung 1 or 2 is recorded as a fact in $XDG_DATA_HOME/dialecte/facts at the ask
    effort; --no-facts reads and records none
  an ask is a folder A-<n> holding ask.json (the --json object, schema: 1, with boundary and
    conflict): with --lot <id|folder> in <lot folder>/asks/ (a store lot by index, name or folder,
    or a hand-over folder outside every repository), inside a lot worktree in its lot, else in
    <state home>/dialecte/asks/ (an absolute $XDG_STATE_HOME, else ~/.local/state)
  the events (ask.parsed, ask.rung, ask.fact, ask.state, ask.pack, ask.answer) go to the lot
    events.jsonl, else <state home>/dialecte/asks/events.jsonl; they hold the question length and
    key hash, never its text; ask.state says conflict: true|false, never what conflicts; ask.pack
    the round, the readers and skipped; ask.answer rung 6, the reader miss and citeRefused, never
    the answer or a quote
  the documents - the DIALECTE_STANDARD folder whose id matches the dialecte standard name; without
    one the ask goes to outside readers (--no-standard is refused while documents are readable)
  --effort - a lot ask takes the lot effort; elsewhere --effort, else medium
  pack - the next round of readers of an ask (the ask folder keeps request.json beside ask.json:
         what the ask read): rounds/round-<r>/ gets reader-<A|B|C>.md and .json (the slices with
         their line numbers, the report schema, a nonce each) and pack.json; A reads by rank, B by
         angle family, C (high) as B without the top slice, each up to 1,500 non-noise lines; a
         later round gives no slice a reader of the same letter had; pack again on an open round
         prints the same briefs; --out copies them; --outside [--web] for an ask without documents
  verdict - checks the reports of the open round, one report file per reader the round gave (refused
            ones too; else exit 2, nothing recorded) (each cite inside a slice given to its reader,
            each quote in its lines, each nonce used once: rounds/round-<r>/used/<nonce>) and writes
            rounds/round-<r>/verdict.json; reports agree on the verdict, the value and a shared line
            or clause: low 2 readers 1 round, medium 2 readers 2 rounds, high 3 readers 3 rounds (a
            verified dissent is another round); nothing verified searches again while something is
            left, up to 5 rounds; an agreed answer is recorded as a fact (the union of the verified
            cites, the shortest answer; a --decision ask held inside the boundary); outside readers
            answer in one round, all agreeing, recorded unchecked by source (model, web) unless the
            definition says otherwise
  the adjudicator - at high, readers that never agree or a polarity conflict go to the adjudicator:
    ask pack writes rounds/round-<r>/adjudicator.md and .json (the reports with their checks, the
    union of their cited ranges, a nonce); its report goes through the same checks with ask verdict
    <id> <report.json> --adjudicator: verified, the fact (rung 5); else a person
  answer - the person answers an ask that is not answered, or confirms one the outside readers
           answered (a person fact superseding the outside one, unchecked while the ask read no
           documents; <ask>/confirm.json marks it confirmed; a second confirmation refused) (rung
           6); --verdict yes|no|depends|value keeps that verdict on the person fact (value: the
           answer as the value), else it says person; a person fact by <who> (unchecked: true when
           the ask read no documents, or under --person-only), answer.json in the ask folder; --cite
           (with --quote) is checked as a reader cite and recorded as a reader miss (given or not to
           a reader, and the round), a refused cite named (citeRefused) while the answer is still
           recorded; an ask of a store lot that reaches the person raises one question on the lot
           (its text <ask-id>: <question>, at most 500 characters, the full text in its details),
           and lot answer on it records the same person fact; in a hand-over folder or outside a lot
           the ask answer command is printed
  the lot note - after ask, verdict and answer, a lot's standard.json is recomputed from every ask's
    latest state (consulted; outside when any ask past rung 2 went outside, every ask listed, with
    confirmed: true and ending (all confirmed) when a person answered or confirmed each outside ask,
    else (all unchecked)), under <lot folder>/standard.json.lock; a lot whose asks all stopped at
    rungs 0-2 records nothing; a verdict run holds rounds/round-<r>/verdict.claim while it runs, a
    second run on that round is refused; ask verdict and ask answer hold <ask>/ask.claim, so one of
    them records the ask's fact, the other is refused (in progress); a retry after a crash closes
    the ask on the fact already recorded

exit codes:
  1  no rung answers and a person answers next (--person-only) · pack: nothing new to give (the round skipped, the adjudicator or the person next) · verdict: the person next (no agreement, nothing found, the adjudicator refused)
  2  usage · an unknown --about tag or attribute (the closest named) · several dialectes without --package · two standard folders of one key · --no-standard with documents · --effort other than the lot effort · a --lot folder inside a repository · pack: an unknown or answered ask, no request.json, a file changed since the ask, --outside on a documents ask or the reverse · verdict: an answered ask, no round open, a closed round, every report of another ask or round or unreadable, --adjudicator on an ask not waiting for it, a round another verdict run holds (nothing recorded) · answer: an unknown or answered ask, no --by, --cite without --quote (nothing recorded)
  3  readers answer next: dialecte ask pack <id> (the slices of the documents, or --outside without them) · verdict: another round, or the adjudicator (dialecte ask pack <id> writes its brief)
e.g. dialecte ask "children of Bay"
```

Verbs: `pack`, `verdict`, `answer`

Flags: `--about`, `--code`, `--method`, `--kind`, `--decision`, `--package`, `--effort`, `--lot`, `--limit`, `--no-facts`, `--no-standard`, `--person-only`, `--json`, `--out`, `--outside`, `--web`, `--missing`, `--adjudicator`, `--by`, `--verdict`, `--cite`, `--quote`
<!-- /dialecte-reference -->

`dialecte ask "<question>" [--about [<Parent>/]<Tag>[@<attr>] | --code <code> | --method <path>] [--kind <kind>]
[--decision] [--package <name>] [--effort low|medium|high] [--lot <id|folder>] [--limit <n>] [--no-facts]
[--no-standard] [--person-only] [--json]` answers a question about the installed dialecte from the cheapest
source that holds the answer, and never answers from anything else: past the dialecte's own files it hands the
question on (to readers of the documents, or a person) instead of guessing.

The question's subject is read from the names of the installed dialectes it holds (tags, attributes, catalogue
codes, api methods: exact names, case kept; a name that is also an ordinary word counts only as `@name`, `name=`
or through `--about`). `--about`, `--code` and `--method` name the subject instead; `--kind` forces the kind
(`children`, `parents`, `required`, `values`, `default`, `fixed`, `type`, `variants`, `documentation`, `code`,
`method`, `semantic`). A tag of several installed dialectes needs `--package` unless the folder is one of them.

**The rungs**, in order; the first that answers ends the ask:

- 0, a fact: the current fact of the same question in the facts ledger, reused when it is valid at the asked
  effort or above (a person's fact at any effort). A fact that does not answer (lower effort, stale,
  unverifiable, unchecked) is listed as a candidate, never the answer. `--no-facts` reads and records none.
- 1, the definition: a structural question whose element resolves to one declaration (`--about <Parent>/<Tag>`
  for a tag declared several ways), answered from the dialecte's definition. `--decision` skips it as an
  answer and reads it as the boundary (below).
- 2, the dialecte's files: a code answered by the one catalogue entry that explains it, a method by the api
  index entry whose intents hold every content word of the need (else the closest five listed).
- 3, the documents: the slices of the standard for the question (find's own list, then the slices its angles
  add), handed to readers.

A rung 1 or 2 answer is recorded as a fact at the ask's effort. A fact recorded from the definition is checked
again when the definition changes: answering the same, it is kept with the new hash; else it is stale and a new
fact replaces it.

**The boundary (`--decision`).** The definition (the XSD) is what validates, so on a `--decision` ask it is the
hard limit of what is valid, never the answer: it is read live (`boundary` in `--json`, `boundary: <answer>
(definition)` in the text) when the question is structural and its element resolves to one declaration. A stored
fact recorded from the definition is a candidate only; the answer comes from the prose inside the boundary (a
standard or person fact, or the readers). The values of an attribute with no enumeration are open (any value of its
type is valid): the prose values stand, no conflict. Prose naming what the definition rejects (a list item it does
not hold, an enumeration value it does not list, another yes/no, another value) is answered within it: the list cut to the boundary's items, else the boundary's
own answer; `conflict` in `--json` names the fact and what it named outside (`{ kind: 'standard-vs-xsd', fact,
outside }`), the text adds `! conflict: the standard names <items> the XSD rejects; the XSD wins - fix the XSD and
ask again`, and the ask still exits 0. Without `--decision` neither is read (`boundary` and `conflict` null).

**The documents.** The `DIALECTE_STANDARD` folder whose id has the key of the dialecte's declared standard name
(both lowercased, letters and digits only); every folder when the dialecte declares none. With none, the ask
skips rung 3 and goes to outside readers (when the root holds other folders, a line on stderr names the
declared name, its key and those folders).
`--no-standard` is refused while documents are readable for the dialecte (outside readers run only when the
documents cannot answer), and is the outside route without them. `--person-only` sends the ask to a person after
rung 2. Once documents exist, each `unchecked` fact of the dialecte's standard is asked again, once: a new ask
holding its question and `reask: <fact id>` (never its answer), and a `rechecked` line on the fact.

**States and exit codes.** `answered` exit 0; `needs-person` exit 1; `needs-readers` exit 3 (next:
`dialecte ask pack <id>`, with `--outside` without documents); exit 2 for usage and refusals, nothing written: an
unknown `--about` tag or attribute (the closest named), an attribute the element lacks, several dialectes without
`--package`, two standard folders of one key, `--no-standard` with documents, an `--effort` other than the lot's,
a `--lot` folder inside a repository. A `needs-person` ask names `dialecte ask answer <id> "<answer>" --by <who>`
as its next command; in a store lot it raises one question on the lot (its text `<ask-id>: <question>`, at most
500 characters, the full text in its details) and its next is `dialecte lot answer <lot> <question>`.

**The ask folder.** Each ask is a folder `A-<n>` holding `ask.json` (the `--json` object, versioned by its `schema`
member, now `1`: the subject, kind, rung, state, answer, fact, source, boundary, conflict, candidates, methods,
angles, slices, effort, next and what was read of the documents). With `--lot <id|folder>` (a store lot by index, name or folder, or a hand-over folder outside every
repository) it is in `<lot folder>/asks/`; run in a lot's worktree, in that lot; else in
`<state home>/dialecte/asks/` (an absolute `$XDG_STATE_HOME`, else `~/.local/state`). An ask of a lot that reaches the documents or the outside route rewrites the lot's note (see **The lot note**
below). The ask folder also keeps `request.json`, what the ask read: the request (question, `about`, `code`,
`method`, `package`, kind, `decision`, limit, effort) and the documents (configured or not, the declared name and
its key, the folders and their files keys, and the manifest: each file's id, sha256 and line count), so a later
`ask pack`, `ask verdict` or `ask answer` reads the documents as the ask read them. A lot's ask takes the lot's
effort; elsewhere `--effort`, else `medium`.

**Events.** `ask.parsed`, `ask.rung` (one per rung run, with its time), `ask.fact` and `ask.state` go to the
lot's `events.jsonl`, else `<state home>/dialecte/asks/events.jsonl`; they hold the question's length and key
hash, never its text, a quote or a slice's text; `ask.state` says `conflict: true|false`, never what conflicts.
`ask pack` adds `ask.pack` (`{ round, readers, skipped }`); `ask verdict` adds `ask.state`, `ask.verdict`
(`{ round, state, reason, accepted, refused: { <reason>: <n> }, polarityConflicts, adjudicator }`) and, on a fact
recorded, `ask.fact` (`{ hit: null, candidates: 0, new: <fact id>, stale: 0, rung }`, rung 4 the readers, 5 the
adjudicator); `ask answer` and the `lot answer` hook add `ask.answer` (`{ rung: 6, miss, citeRefused }`) and
`ask.state` (answered, rung 6). None holds a question, an answer, a quote or a url. An event that cannot be
written prints one line on stderr and never changes the exit code.

## Readers: `ask pack`

`dialecte ask pack <ask-id> [--out <dir>] [--outside] [--web] [--lot <id|folder>] [--json]` opens the ask's next
round of readers (rung 4). The pool is rebuilt from `request.json`: the documents read again as the ask read them
(a file of its manifest moved, removed, or one added since, refuses, exit 2, naming the ask to make again), then
the ask's own list of slices first and a wider search's other slices.

- Readers: effort low and medium give readers A and B, high A, B and C. A reads the slices by rank, B by angle
  family, C as B without the top-ranked slice; each is given up to 1,500 non-noise lines, never an unreadable
  slice. A later round gives no reader a slice its letter had, and withholds a slice found only by an angle a
  verified cite already came from.
- The round folder `rounds/round-<r>/` gets, per reader, `reader-<L>.md` and `reader-<L>.json` (the question, the
  subject, the angles, the slices with their original line numbers, the report schema, a nonce of its own), then
  `pack.json` last (`schema: 1`: the ask, the round, `outside`, `web`, and each reader's letter, nonce, slice ids
  and the slices as the ranges it was given, `{ id, file, from, to, clause, linked }`); the round is open from
  `pack.json`. Packing an open round again prints the same briefs, nothing rewritten; `--out <dir>` copies the
  briefs there too.
- `--outside` opens the one round of outside readers of an ask without documents: no slice, the declared name of
  the standard, the model's own knowledge; `--web` lets them search the web too. A second outside pack has
  nothing to give.
- The adjudicator: after a high round closed at `needs-adjudicator`, the pack writes the adjudicator's brief in
  the next round folder instead: `adjudicator.md` and `adjudicator.json` (the readers' accepted reports with their
  checks, from the round's `accepted.json`; the union of their cited ranges; its own nonce).
- Nothing new to give: the round is recorded skipped, `rounds/round-<r>/skipped.json` (`schema: 1`,
  `{ ask, round, state: "needs-person", reason, at }`, written once; a pack again answers the same), the ask is at
  `needs-person` and the person route follows (in a store lot the question raised once, next `lot answer`). A high
  documents round whose last accepted reports hold an answering one goes to the adjudicator's brief instead.
- `--json` (`schema: 1`): `ask`, `round`, `state` (`needs-readers`, `needs-adjudicator`, `needs-person`),
  `readers` (`letter`, `brief`, `slices`), `next`.
- Exit 0 the briefs ready (the adjudicator's too); 1 nothing new to give; 2 usage, an unknown or answered ask, an
  ask without `request.json` (made before the readers), a file changed since the ask, `--outside` on a documents
  ask or the reverse, a round being written.

## Readers' reports: `ask verdict`

`dialecte ask verdict <ask-id> [<report.json>...] [--missing <letter>]... [--adjudicator] [--lot <id|folder>]
[--json]` checks the reports of the open round, closes it, and records an agreed answer as a fact.

- A report is one JSON object as its brief shows (`schema` 1: the ask, the round, the reader, its nonce, the
  verdict `yes`, `no`, `depends`, `value` or `not-in-text` (`not-known` for an outside reader), the value, the
  answer, the claims with their cites, what was not found, the families read, the session, optionally its model
  `tier`). It is accepted against the ask, the round, the nonce issued to that reader and not used before (claimed
  by an exclusive file `rounds/round-<r>/used/<nonce>`), one accepted report per session and no body equal to an
  earlier one, across every round of the ask; a report of another ask or round, or one that does not read, is
  never counted.
- Each cite must name a file of the manifest unchanged since the ask, lie inside a slice given to its reader (the
  ranges `pack.json` recorded; the adjudicator: its brief's ranges), span at most 40 non-noise lines, and quote 8
  to 40 words (or one whole table row or code line) found on word boundaries in the named lines only; a quote that
  folds to nothing is refused `quote-length`. Each claim must name a key term and the subject (or sit in a clause
  headed by it) and back the report's verdict. A claim saying the opposite of the question, or an exception cue
  quoted without a `depends` condition, is a polarity conflict: it never counts toward agreement.
- Every reader the round gave a brief needs a report file (accepted or refused), or `--missing <letter>` when it
  wrote nothing (recorded refused `missing`); with every letter declared, no file is needed. A letter missing
  otherwise refuses, exit 2, naming `--missing <letter>`, nothing recorded.
- Agreement: equal verdicts, equal values (as sets for a list) and verified cites sharing a line or a clause. Effort
  low takes 2 readers and 1 round, medium 2 readers and 2 rounds, high 3 readers and 3 rounds; a verified dissent
  asks for another round, two votes never outvote it. Nothing verified searches again while something is left to
  give, up to 5 rounds. A round with nothing left goes to the adjudicator at high, else to the person.
- The adjudicator: `--adjudicator` checks its one report against its brief's ranges; verified, the fact is
  recorded at rung 5; refused, a polarity conflict or `not-in-text`: the person.
- Outside readers answer in one round: every reader agreeing, none `not-known` or hedged, no polarity conflict,
  and not contradicting the definition read live (`contradicts-definition`); the fact is recorded `unchecked`, by
  its sources (`model`, `web`).
- A re-ask whose readers agree on another answer than its unchecked fact (or a person's fact without
  `--verdict`) records nothing: the person is next, reason `reask-differs`, the readers' answer kept in
  `verdict.json`.
- An agreed answer is recorded as a fact: the union of the verified cites, the shortest agreeing answer, the
  agreeing readers' tiers; a `--decision` ask's answer held inside the boundary.
- The round keeps `verdict.json` (`schema: 1`: each report with its claims' checks, a claim reading a poor block
  flagged `quality: "poor"`, and of each accepted report its session, the sha256 of its body, its answer,
  `familiesRead`, `notFound` and `notKnown`; the outcome and its reason, the angles verified, the state, `next`
  and the fact). A round closed for the adjudicator also keeps `accepted.json` (`schema: 1`, the accepted reports
  with their checks). While it closes, the round holds `answering.json` (`schema: 1`: the ask, the round, the
  nonces claimed, the key of the fact draft): a retry after a crash counts those nonces as its own and finishes on
  the fact already recorded.
- `--json` (`schema: 1`): `ask`, `round`, `state`, `reason` (null once answered), `reports` (never a session, a
  body hash or a reader's text), `fact`, `conflict`, `next`.
- Exit 0 answered; 1 the person next (in a store lot the question raised once, after the round is closed, its
  details pointing to the round's `verdict.json`, next `dialecte lot answer <lot> <question>`; elsewhere
  `dialecte ask answer <id> "<answer>" --by <who>`); 2 usage or a refusal, nothing recorded (an answered ask, no
  round open, a closed round, no report of the round, a missing letter, `--adjudicator` on an ask not waiting for
  it, another run holding the round or the ask); 3 another round or the adjudicator next (`dialecte ask pack <id>`).
  Run again on a round closed at the person in a store lot, it raises the question if none is open, then refuses
  the closed round naming its `lot answer` next.

## The person: `ask answer`

`dialecte ask answer <ask-id> "<answer>" --by <who> [--verdict yes|no|depends|value] [--cite <file id>:<from>-<to>
--quote "<quote>"] [--lot <id|folder>] [--json]` records the person's answer to an ask that is not answered
(rung 6).

- A person fact by `<who>`, holding the text; `unchecked: true` when the ask read no documents (an outside ask, a
  `--person-only` one), so it is asked again once documents exist. The ask folder keeps `answer.json` (`schema: 1`:
  the ask, who, the text, the cite, `citeRefused`, the reader miss, the fact, the time), published once.
- `--verdict` keeps that verdict on the person fact (`value`: the answer as its value), so a later re-ask whose
  readers agree with it supersedes it; without it the fact says `person` and a re-ask's readers are shown to the
  person. Another word is refused, exit 2, naming it and the four.
- `--cite` (with `--quote`) is checked as a reader cite against the whole documents, then recorded as a reader
  miss: given or not to a reader, and the first round it was given in. A refused cite is named (`citeRefused`; a
  file changed since the ask: `file-changed`) and the answer is recorded all the same, without evidence.
- An ask the outside readers answered takes the person's confirmation: a person fact supersedes the outside fact
  (unchecked while the ask read no documents) and `<ask>/confirm.json` (`schema: 1`, `{ ask, fact, by, at }`)
  marks the ask confirmed; a second confirmation is refused, naming it confirmed. Every other answered ask is
  refused.
- `--json` (`schema: 1`): `ask`, `fact`, `miss`, `citeRefused`.
- Exit 0 recorded; 2 usage or a refusal, nothing recorded (an unknown or answered ask, one made before the readers,
  no `--by`, `--cite` without `--quote`, an unknown `--verdict`, another run holding the ask).
- `lot answer <lot> <question> "<answer>" --by <who>` on the question an ask raised records the same person fact
  through a registered `onAnswered` hook, under the same claim, and rewrites the lot note before it returns.

## Claims

`ask verdict` and `ask answer` (and the hook) hold `<ask>/ask.claim`, so one of them records the ask's fact and
the other is refused as in progress; a verdict also holds `rounds/round-<r>/verdict.claim`; the note writer holds
`<lot folder>/standard.json.lock`. A claim file holds its holder's pid and its start time, one per line. A claim
whose process is gone, or whose pid runs under another start time (a pid reused; read with `ps` in the C locale,
an unknown start time leaving the running pid to decide), is taken over once older than its stale limit, under an
exclusive `<claim>.takeover` file; any claim held more than 10 minutes is taken over. A held claim refuses with
the claim, its process and when it may be taken over.

## The lot note

After `ask`, `ask verdict`, `ask answer` and a skipped pack, the lot's `standard.json` is written again, whole,
from every ask's latest state: `consulted` with a note naming each ask and its state (`asks A-0001 answered F-0002
· A-0002 needs-readers`); `outside` when any ask past rung 2 went outside the documents (the documents asks listed
beside them), with `confirmed: true` and the note ending `(all confirmed)` when a person answered or confirmed each
outside ask, else `confirmed: false` and `(all unchecked)`. A lot whose asks all stopped at rungs 0-2 records
nothing. A note that cannot be written prints one line on stderr; the command's exit code is kept.
