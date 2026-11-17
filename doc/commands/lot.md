# dialecte lot

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

A lot: started from a brief into the lot store, its declaration .dialecte/lot.json, and its review rounds in its lot or hand-over folder

```text
lot - A lot: started from a brief into the lot store, its declaration .dialecte/lot.json, and its review rounds in its lot or hand-over folder

  dialecte lot start <brief.json> [--effort low|medium|high] [--overlap-ok] [--by <who> --reason <text>] [--dry-run] [--simulate <scenario>] [--json]
  dialecte lot start <brief.json> --on <lot> [the options above]
  dialecte lot status <id> [--json]
  dialecte lot forecast [<id>] [--json] [--against <lot>]
  dialecte lot risk <id|folder> [--json]
  dialecte lot risk <id|folder> --effort low|medium|high [--class high|medium|light] --by <who> [--reason <text>]
  dialecte lot wait <id> [--timeout <seconds>] [--json]
  dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]
  dialecte lot result <id> [--json]
  dialecte lot stop <id> --reason <text> [--by <who>] [--json]
  dialecte lot scope <id> [--drop <path>]... [--add <path>]... [--overlap-ok] --by <who> --reason <text>
  dialecte lot station <id> start <station> [--step <n>] [--round <n>] [--attempt <n>] [--agent <name>] [--executor host|command] [--vendor <name>] [--model <name>] [--tier <name>] [--effort <word>] [--session <id>] [--skill <name|path>]... [--skill-asked <name|path>]... [--event <id>] [--json]
  dialecte lot station <id> end <station> [--run <run>] [--step <n>] [--round <n>] [--attempt <n>] [--agent <name>] [--vendor <name>] [--model <name>] [--tier <name>] [--effort <word>] [--session <id>] [--skill <name|path>]... [--skill-asked <name|path>]... [--event <id>] [--tokens-in <n>] [--tokens-out <n>] [--tokens-cache-read <n>] [--tokens-cache-write <n>] [--tokens-total <n>] [--money <amount> <currency>] [--duration <seconds>] [--exit <n>] [--verdict <word>] [--suite <name>=<runs>]... [--json]
  dialecte lot station <id> --from <file.json> [--json]
  dialecte lot exempt <reason>
  dialecte lot accept <case> <reason> | lot accept --remove <case>
  dialecte lot revised <case|file|glob> <reason> | lot revised --remove <case|file|glob>
  dialecte lot gone <file|glob> <reason> | lot gone --remove <file|glob>
  dialecte lot moved <case> <case> <reason> | lot moved <file> <file|glob> <reason> | lot moved --remove <from> <to>
  dialecte lot mutation <off|changed|audit|gate>
  dialecte lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>
  dialecte lot decide <id|folder> <finding> <open | fix-to-verify | fixed <round> [note] | accepted <reason> | logged <where>>
  dialecte lot snapshot <id|folder> --round <n> [--beyond-cap --by <who> --reason <text>]
  dialecte lot choice <id|folder> --by <who> <decision>
  dialecte lot standard <id|folder> consulted <note> | not-consulted <reason> | outside <note>
  dialecte lot delta <id|folder> --round <n> [--worktree] [--json]
  dialecte lot recap <id|folder>
  dialecte lot verify <id|folder> --by <who> --note <text>
  dialecte lot report <id> [--json]
  dialecte lot report --feature <name> [--simulated] [--json]
  dialecte lot export <id> <dir> [--json]
  dialecte lot brief <id> --from <brief.json> --by <who> --reason <text>
  dialecte lot pr <id> [--print] [--json]
  dialecte lot review <id> [--no-open] | lot review <id> --pull --round <n>
  dialecte lot approve <id> --by <who> [--reason <text>]
  dialecte lot land <id> [--draft]
  dialecte lot close <hand-over name|lot id|index>... [--json]

  start - checks the brief (every refusal at once, exit 2), claims the next index, publishes the lot
          folder in <git common folder>/dialecte-lots/, makes the numbered worktree at the base
          commit with its .dialecte/lot link; --dry-run checks (the store list included), names the
          lot and the start to run next, writing nothing; exit 1 when the worktree cannot be made
          (the lot failed, nothing removed, next: lot stop); a link that cannot be made leaves the
          lot working with a note; every --json exit is JSON, a usage error { error, usage, next:
          null } included
  start - --on <lot> starts the lot on another open lot of the same repository (a stack): its branch
          is cut at that lot's branch tip, its stack.json records the parent and that tip, and the
          parent's scope is its base, never an overlap (every other open lot's still is); a parent
          that is unknown, damaged, not working or ready, of another repository or without its
          branch is refused before anything is written, before any other fault of the brief; lot
          status and the hand-over card show a stack line, on <parent> (#<pull request>, <state>)
  start - a scope meeting another open lot goes ahead when that lot's work reads (its forecast
          against main, run and never written: a new lot has no work, so no conflict can exist),
          printed shares <met> with <lot> (forecast clean); still refused: a damaged lot or one
          whose scope cannot be read, a met lock file (exclusive: a lock file is never shared), a
          forecast that cannot run (forecast unknown: <reason>); after the start the new lot's own
          forecast is recorded (trigger start); the re-check after the start refuses only what still
          refuses (a lot that published meanwhile but has no worktree on disk yet has no work: the
          start goes on)
  start - --overlap-ok accepts an overlap the start refuses, for an overlap that names its paths (a
          lot whose scope cannot be read stays refused; a damaged other lot whose scope reads is
          accepted, its damage recorded beside the go-ahead); it takes --by <who> --reason <text>,
          the same go-ahead as an effort below the class; each accepted overlap is a line of the lot
          folder's overlaps.jsonl (the other lot, the met pairs, who and why), printed by the start
          and its dry run (! overlaps <lot>: ...) and shown on the card's scope line as a warning;
          on an overlap the forecast cleared it is recorded all the same, printed --overlap-ok not
          needed: the forecast cleared <lot>; the re-check after the start refuses a held lot the
          go-ahead did not name
  start - the effort: the risk class of the brief's scope (high when an entry reaches the package's
          dialecte.risk.high list) sets the default (high, medium or low); on a terminal, without
          --json or --dry-run, the effort is asked with that default; an effort below the class
          (from --effort, the brief or the answer) is refused (exit 2, nothing written) without --by
          <who> --reason <text>, which are recorded on an effort line in risk.jsonl with the class's
          derived line, the start printing ! effort <e> below risk class <c> (by <who>: <reason>)
  --simulate - start a simulated lot that plays one of the scenarios (ready, question, person,
               two-questions, limit, failure, slow) under wait: no worktree, no branch, no registry
               entry; it never blocks a real lot
  brief - a working or ready real lot takes a new brief whose only changes are its public text (the
          summary, the issue, step titles and behaviours); any other change is refused naming the
          field, nothing written; the new brief passes the start's field and public-text checks; it
          replaces the stored brief and a brief transition records the sha256 of the old and new
          brief, --by and --reason, the state and position kept; the same brief again answers
          already, nothing written; a simulated lot is refused; brief.json edited any other way
          reads as damage
  pr - renders the lot's pull request from its records through the repository's
       .github/pull_request_template.md: the title is the brief's first commit message, the body its
       summary and other commit messages, step titles and behaviours, the changelog fragments the
       lot adds, tests.json (a part of another tree reads stale), review.jsonl (findings and how
       each closed, the verdicts by reviewer kind, never a name; a row value its writer never writes
       refused), the risk class and effort, the overlaps it accepted (the other lot by its index,
       and why), the issue it closes, and the author's checklist ticked from the records; a missing
       record reads not recorded; the record text is checked first (a reference, a forbidden word, a
       plan entry id, a link or a path outside the tree refused, naming the word and the record);
       the open pull request (landing.json's, else the branch's newest) is edited only when its
       title or body reads otherwise, a person's part after the kept marker kept (a body without
       that heading holding a person's text refused, never dropped); a damaged lot refused; --print
       prints and sends nothing; no pull request yet prints the text and names lot land --draft;
       --json { title, body, pullRequest, head, sent }
  review - the private half of the lot's review, read-only (nothing written): the lot's state and
           branch, its pull request (landing.json's) with the head it is at, the head the lot landed
           and the worktree's HEAD, its checks, the brief's goal and steps (title, spec,
           behaviours), tests.json's tdd counts and gate run, decisions.md, every finding of the
           ledger with its text and state, the standard line, and what lot approve would refuse (or
           the approve command when it would approve); then opens the pull request's changed files
           in the browser (--no-open names the page only; an opener that fails is named, never an
           exit); a lot without a landing prints its private half and names lot land <id> --draft,
           the host never asked
  review --pull - the pull request's line comments come back as findings of round <n> in the lot's
    findings ledger: a thread's first comment only (replies discuss it), each once
    (pulled-comments.jsonl records the comment and its finding; a second pull answers already), its
    severity from a leading blocking:, should-fix: or nit: (dropped from the text, kept when it is
    all the comment says), else should-fix, at its path:line (the path alone for a comment on the
    file), its lines joined into one; review.jsonl written again; private points stay off the pull
    request: lot finding records them
  approve - a person's approval of the lot's pull request: refused (exit 1, nothing recorded,
            nothing queued) unless the lot is at work, the pull request landing.json names is open
            at the head the lot landed and the worktree is at that head too (an unpushed commit
            refuses), its checks ran on that head and are green (a check run again counts by its
            newest run; a failing or pending check, or none yet, refuses) and no finding but a nit
            is open (open, or a fix still to verify), and its text renders over the live body; then
            appends { schema, at, by, reason?, number, head } to the lot folder's approvals.jsonl,
            which review.jsonl shows as a person's approve verdict with that head (a pull request
            text rendered on another head, after a later commit or a rebase, leaves it out; the body
            names it by kind only, never the name; the orchestrator in any casing is recorded as
            orchestrator), renders the pull request's text again from the records, makes a draft
            ready and queues it (gh pr merge --auto); a queue the host refuses keeps the approval
            (exit 1) and the same approval run again answers already approved, writing nothing, and
            queues; --by orchestrator (in any case) approves the cli's own lots only (the package
            named @dialecte/cli), every other package waits for a person (exit 2); a forbidden word
            in --by or --reason, or a --by holding what a public record never holds, refused (exit
            2) before the host is asked; a lot without a landing names lot land <id> --draft
  land - a lot started with --on lands as a stack: its pull request is based on the parent's branch,
         its body's depends-on part names the parent's pull request (a parent without one is
         refused: land it with --draft first); the host's stacks are probed once (gh stack): with
         them, the pull request is linked on the parent's (gh stack link) and queued as a stack up
         to it (gh stack merge --yes --squash, never auto-merge); without, a note says why and it is
         queued only after the parent merged (waits for #<n> otherwise, nothing pushed); before each
         landing it is rebased onto the parent branch's new tip when that moved; once the parent
         merged, it is rebased off the parent's commits onto origin/<base> and its pull request
         retargeted to the base when the host did not, or, as a native stack, it follows the host's
         rewrite of its branch (local commits beyond its last push rebased onto it, that head the
         lease); a conflict names its files, the rebase undone, nothing pushed, exit 2
  land - the lot lands through its pull request: its committed HEAD (uncommitted files stay in the
         worktree, named), rebased onto origin/<base> when behind (a conflict undone and named,
         nothing pushed; with uncommitted tracked changes it is pushed as committed, the rebase left
         for a clean worktree), pushed with a lease, its title and body rendered from the lot's
         records through the repository's .github/pull_request_template.md on the rebased head
         before the push (as lot pr renders them; records that do not render, or a base branch
         origin does not hold, push nothing), its pull request opened with them or reused (edited
         when its title or body reads otherwise, a person's part after the kept marker kept), then
         queued (gh pr merge --auto: the merge queue merges it once its checks pass on top of main);
         --draft opens a draft and never queues it, CI running on every push; the landing (number,
         url, branch, pushed tip, the heads its rebases replaced) recorded in <lot
         folder>/landing.json, read by lot close; a branch with no commit beyond origin's base is
         refused before any push; the committed HEAD is forecast against origin/<base> just fetched
         (git merge-tree, before any entry, rebase or push): a conflict refuses naming its files and
         ranges, a forecast that cannot run refuses (fails closed), a lot on an open parent is not
         compared; the lot's forecast against every other open lot is recorded (trigger land) and
         each pair it does not clear printed (! <lot>: <why>), for information only; the pushed head
         is kept in landing.json at once, so a pull request the host refused to open does not make
         the next push one outside lot land; the host is GitHub through gh, which never prompts
  status - the state derived from the lot records (working, input-required, ready, committed,
           canceled, failed), the worktree and link checks, and the exact next command (and an also:
           line); a working real lot adds a station line (station <what> · round <r>/<cap> · effort
           <level>), the next station walked from its station events and checks (step events, else
           the worktree's tdd ledger and gate records), its next is that station's command and also
           keeps the manual line; --json adds station and rounds (review, cap, beyondCap,
           independent) and effort { level, source, riskClass, below } (source risk-line for an
           effort recorded by lot risk; an effort below its risk class adds a ! effort <e> below
           risk class <c> line, ending (by <who>: <reason>) or (no go-ahead recorded)); --json adds
           forecast { main, pairs }: the newest main line of forecast.jsonl and, per other open lot,
           the newer of its own line against that lot and that lot's line against it (files only); a
           lot whose records do not hold reads damaged with its reason and next: lot stop (exit 6);
           reads only; exit 2 for an unknown or ambiguous id
  forecast - the conflict forecast of a lot's work (its worktree's HEAD plus its uncommitted work,
             as one snapshot commit made on a copy of its index with a fixed identity and date; the
             worktree's index, refs and files never written, ignored files left out) against main
             (origin/<base> as last fetched, never fetched here) and against every other open lot of
             its store, each by git merge-tree --write-tree, without a checkout: clean, conflict
             (each path with its kind, content with the line ranges between the markers), exclusive
             (every conflicted path a lock file) or unknown with its reason (git older than 2.38, a
             damaged lot, worktree of <lot> missing, <ref> does not resolve, snapshot of <lot>
             failed, merge-tree failed, forecast of <lot> over 20 s: each git step is limited to 20
             seconds); each line also lists the files both sides changed (shares); a path that
             conflicts against main for either lot is shown once, on the main line; the verdict is
             the worst line (unknown > conflict > exclusive > clean); default lot: the one whose
             worktree holds the current folder; --against <lot> compares with main and that lot
             only; appends the run to the lot folder's forecast.jsonl (one line per comparison, one
             write, each line at most 4,096 bytes: 10 shared paths, 10 conflict paths, 3 ranges per
             path, the rest counted in moreShared and more) and a forecast event (its trigger:
             start, scope, gate, forecast or land, the verbs that record a run); a pair whose lots
             both change a lock file reads exclusive even when it merges clean; a gate --fast or
             --full run in a lot's worktree forecasts the lot as its last step and prints forecast:
             <verdict> with one ! <against>: <why> line per comparison it does not clear (a warning
             only: the gate's verdict and exit never change); the card shows a conflicts line on a
             conflict or an unknown, a pair seen from either lot (the newer line wins), and its
             scope line names each open lot it shares entries with (forecast <verdict>, <age>);
             --json { lot, verdict, lines }; exit 0 clean, 1 a conflict or an exclusive path (or the
             run could not be written), 3 unknown, 2 usage, an unknown id, a damaged, closed or
             simulated lot, or --against the lot itself or a lot of another store; a clean forecast
             does not promise a semantic merge, three lots landing together, or work not written yet
  risk - reads the lot folder's (or hand-over folder's) risk.jsonl and the worktree's diff against
         the lot's base, writing nothing: the risk class derived now with its reasons (high: a
         changed file in the package's dialecte.risk.high list, the base's and the worktree's
         together, an added destructive call or git argument on a line that is not a comment alone,
         a runtime package (one with an exports map) whose API index changed or whose export source
         changed against the base without its index; light: docs, a version bump, or at most 40
         changed lines in at most 3 files; medium otherwise; a declared reason reads <file>:
         declared [<glob>]), the effort recorded, the cap of review rounds, a ! line when the effort
         is below the class, ending (by <who>: <reason>) or (no go-ahead recorded); a derivation
         that cannot run (no commit to compare to) falls back to the last derived line, else class
         unknown, and ends with ! risk class not derived: <reason>, exit 0; --json the same as one
         object, under a versioned JSON schema (lot-risk.schema.json, version 1); exit 2 for usage,
         an unknown id or a damaged store lot (lot risk: <name> damaged: <reason>)
  risk --effort - appends one effort line { schema, kind: effort, at, effort, class?, by, reason? }
    to risk.jsonl (the last line wins); the same effort, class and reason as the last line answers
    already, nothing written; an effort below the class needs --reason; a derivation that cannot run
    compares against the last derived line, or nothing, and records; --by is required; --json is
    refused here; refused (exit 2, nothing written) for usage, below without --reason, a forbidden
    word, a damaged store lot, or a lot that is committed, canceled or failed; exit 1 when the line
    cannot be written
  wait - returns the status as soon as the lot needs someone (exit 0 ready or committed, 1 failed or
         canceled, 3 input-required, 4 a limit) or --timeout is reached (5); a damaged lot at once
         (6); a real lot is read every second and nothing written, a simulated lot is played to its
         next blocking point, and answered at once when nothing is left to play (5 while it works)
  answer - records the answer to an open question once (the same answer again: already); a person
           question needs --by <who>; a damaged lot takes none (exit 2); runs the onAnswered hooks;
           next: lot wait
  result - never blocks, writes nothing: a ready or committed lot gives its hand-over (card, show
           and run lines), worktree, branch and answered questions; failed or canceled the last
           reason (exit 1); input-required the open questions (3); working exit 5; damaged exit 6
  stop - ends the lot: refused once committed; a pending hand-over is abandoned first (refused while
         its run is in progress), then a canceled transition with the reason and --by (caller
         without it); already canceled exits 0 writing nothing; moves no worktree and deletes
         nothing; a damaged lot has its folder moved to <git common folder>/dialecte-lots-aside/
         with a stopped.json (refused while a live run marker holds it), its index kept claimed
  scope - changes a started lot's scope on the record, its brief left as published; --by and
          --reason are required on every call; --drop removes scope entries (an entry, or a folder
          and the entries inside it), --add widens the scope (a path inside a held entry is recorded
          as its own entry; only an equal entry answers already holds, nothing written, exit 0);
          --drop and --add may come in one call to narrow a folder to files: one append, the drop
          line first; a drop is refused for a path that is no entry or lies inside a wider one, a
          worktree that cannot be read, a drop leaving the lot no scope, or a file the lot's
          worktree changed inside a dropped entry that no entry left covers (an equal entry, a
          literal folder holding it, or a glob matching it; the call's adds count); an add is
          refused when a path is no valid scope entry, or when it meets another open lot's scope and
          that lot still holds it: the lot's work is forecast against it (trigger scope, recorded
          only once the add stands) and a clean pair adds with no overlap record; a forecast
          conflict (its files and ranges), a met lock file, a forecast that cannot run, or a damaged
          or unreadable lot refuse, unless --overlap-ok accepts an overlap that names its paths (a
          damaged lot whose scope reads too, its damage recorded) (recorded in overlaps.jsonl before
          the add with the other lot, the met pairs, --by and --reason, undone with a taken-back
          add; a lot whose scope cannot be read stays refused; --overlap-ok without --add is
          refused); a call whose lines would pass the line limit is refused; an add a lot started or
          widened meanwhile meets is taken back by an undo line, the entries a drop of the same call
          removed put back (exit 2), a take-back that would pass the line limit refusing the call
          first (exit 2), a take-back that cannot be written exiting 1 naming the paths and that
          lot; each change is one line of scope-changes.jsonl ({ schema, at, op, paths, by?, reason?
          }) and a scope.changed event; the effective scope (the brief's with the changes) is what
          the overlap guard, lot status and the card read; a damaged, simulated, committed, canceled
          or failed lot, a forbidden word and a change line that does not read are refused (exit 2),
          nothing written; a line that cannot be written exits 1
  station - appends one station event (by: host) to the lot's events.jsonl, never rewriting a line:
            start answers its run and the end command; end pairs with --run, else with the one open
            start of its station, step, round and attempt (several: refused), else repeats the last
            such end carrying a cost field with the same fields (already, nothing written), else is
            recorded alone (started: null); --event <id> again answers the first event (already) or
            is refused when its fields differ; start is refused on a committed, canceled or failed
            lot, end is accepted in every state; a simulated lot writes simulated: true; text fields
            refuse control, line-break and direction characters, vendor, model, tier, effort and
            session at most 80 characters, step, round and attempt 1-999, tokens, runs and duration
            non-negative, at most 50 skills (hash: sha256 of the path or of the synced
            <folder>/<name>/SKILL.md, else null), a verdict of approve, back, fix-then-repass,
            fixed, disagreed, answered, failed, limit; a line over 4,096 bytes is refused; --from
            takes the same fields plus phase (start|end) as one JSON object, unknown keys refused,
            every fault at once; --json { recorded: new|already, run, next }
  --by - one line, not empty, checked before the lot is read (answer and stop)
  <id> - an index (171 = 0171), a full name, a lot folder or .dialecte/lot; a write verb needs an
         index unique across every store of the store list, a word naming an existing folder is that
         folder
  exempt|accept|revised|gone|moved|mutation - write .dialecte/lot.json at the package root (tab
                                              JSON), keeping the rest
  moved - a case of the lot moved by a split or a rename of its file or describe after its red (its
          own title is part of its test call): two cases, or a file (never a glob) and the file or
          glob its cases moved to under the same names, several files into one each with its entry;
          tdd red carries the red (flag moved) when the test call and the test code it reads are as
          that red froze them and it does not pass on the base production, else refuses
  accept - a case is <file>::<name>
  revised - a file or a glob covers every case of its files
  --remove - drops the accept, revised, gone or moved entry written exactly so (a list left empty
             leaves the file); an entry its list does not hold is refused, naming the closest ones,
             nothing written
  mutation - absent: changed when the diff touches the declared scope, off otherwise; gate = changed
             that the hand-over waits for
  finding - appends R<n>-<k> open to <folder>/findings-ledger.md (made when absent)
  decide - rewrites that finding's state cell, every other byte kept
  snapshot - copies what git status lists to round-<n>/, the deletions to round-<n>.deleted, HEAD to
             round-<n>.base, { schema, at, stateHash } to round-<n>.state; the folder is a lot
             folder or stays outside every repository; -- ends the options; the risk class is
             derived again from the diff first and appended to risk.jsonl as a derived line only
             when the snapshot goes ahead, a refused snapshot writing nothing (a derivation that
             cannot run prints ! risk class not derived: <reason> and appends nothing); the cap of
             review rounds is the rounds of the higher of the effort's class and the class derived
             now (else the last derived line's) (low or light 1, medium 2, high 3; the effort is the
             last line of lot risk --effort, else the lot's; a class above the effort prints ! risk
             class now <class> (<reason>): cap <cap>); with no effort recorded the cap is 1 and a
             later round is refused (exit 2) naming dialecte lot risk <folder> --effort
             low|medium|high --by <who>; a round above the cap of an effort is refused (exit 2),
             naming what set the cap ((effort <e>), or (effort <e>, risk class <c>) when a class
             raised it), unless --beyond-cap --by <who> --reason <text> gives the go-ahead, written
             to decisions.md as round <n> beyond the cap of <cap>: <reason> before the snapshot
             (once: a retry finds it); --beyond-cap within the cap, --by or --reason without it, and
             --by or --reason holding a forbidden word are refused (exit 2), nothing written
  choice - appends | decision | who | yyyy-mm-dd | to <folder>/decisions.md (made when absent)
  standard - writes <folder>/standard.json (state, note, time), read by the card's standard line;
             outside (the lot's asks answered outside the documents, written by ask itself) warns,
             and fails at effort high unless the record's confirmed flag is true (written by ask
             once a person confirmed every outside answer; by hand false): the flag decides, never
             the note text
  delta - per file, the diff from round-<n-1>/ to the worktree now; --worktree adds a throwaway
          worktree holding round n-1 and prints its removal command
  recap - the <details> part of a pull request from the hand-over's records only; writes nothing
  verify - run inside the lot's worktree: appends { schema, at, by, note, state } to
           <folder>/verify.jsonl in one write, state the worktree's state hash; a change of the tree
           after the last round-<n>/ snapshot is a late fix: the card warns and handover run refuses
           it (exit 2) until a verify covers the current state (one later change needs a new
           verify); a snapshot with no round-<n>.state (an older cli) is not checked; no snapshot
           yet (nothing is late), --by or --note missing, blank or not one line, or holding a
           forbidden word are refused (exit 2), nothing written
  report - reads files only (no git, no process, nothing written): the lot's stations, tokens,
           money, time, suites per station by time, heavy steps, folders and review rounds from its
           events.jsonl, transitions, ledger and cards.log; a number nobody reported is unknown,
           never 0, and a step family whose runs may be unrecorded reads unknown with the reason;
           --feature lists every lot of that feature in every store (simulated ones counted apart,
           listed by --simulated; a lot whose folder is gone is read from its cards.log line); next:
           the lot's own next command
  export - copies a lot folder to <dir>/<full name>/ without asks/ (links kept as links, those
           pointing outside it named), adding the lot's cards.log lines and registry entry; refused
           for a <dir> inside a git work tree and for an existing <dir>/<full name>; every copied
           file compared by size and sha256 (events.jsonl as a prefix) before the rename, one more
           copy on a difference; the source is never written
  close - for a committed or abandoned hand-over of the registry (by name or index; a lot id (its
          store folder, 0124-cli-x) closes the hand-over entry registering that folder): its final
          record first, the card line in the repository's cards.log (a catch-up one when none
          exists, for every hand-over of the worktree, read back), then a removing line, then its
          worktree moved to .worktrees/_trash/ and removed in the background by git worktree remove
          without --force (git refuses one written into since the check: it stays in
          .worktrees/_trash/), its node_modules parked in .worktrees/_pool-<repository>-<n>, its
          caches to their own _trash/ entries, then a removed line (trashed or kept); kept first
          when an open lot names it (reason lot <name> <state>; a lot whose hand-over was committed
          outside its folder reads committed once its branch is past the lot's base commit and on
          the base branch, and every outcome of its worktree carries the line lot <name> committed:
          hand-over committed in <folder>, branch on <target>, landed in --json; once closed, every
          reader reads that lot committed, files only; a lot with a live run or a transition later
          than that hand-over reads from its own records), then with why when it is the main
          checkout, on another branch than the hand-over's, locked, another hand-over of the same
          worktree is neither committed nor abandoned, a link from outside it points into it, dirty,
          its HEAD reflog reaches commits that neither the hand-over's branch, the base branch nor a
          remote-tracking ref holds, it holds ignored files its removal would delete that nothing
          else holds (rebuilt folders, dialecte.rebuiltIgnored folders, the .dialecte/lot link, an
          empty or archived .dialecte/lot.json and copies byte-equal to the main checkout's go), a
          process or a mutation run works there, lot close itself runs from inside it, or the
          processes are not known, or the final record cannot be kept or the lot's commit is not
          known; a pull request merged at the worktree's HEAD (a push outside lot land) is
          confirmed, the landing record's head moved; merged at another head: a line naming the
          heads; a reflog-only commit changing only the lot's paths, dropped before the lot's final
          commits, counts as landed; the branch never touched; a hand-over already closed answers
          already closed, exit 0, nothing moved; exit 1 when one is kept, 2 for a name or index the
          registry does not hold

exit codes:
  1  risk --effort: the line could not be written
  2  risk: usage; unknown id; a damaged store lot; --effort below the class without --reason, no --by, a forbidden word, a lot that is committed, canceled or failed
  2  start: an effort below the risk class without --by and --reason
  1  station: the event could not be written
  2  station: usage; refused (a field, the lot state, open starts, --event with other fields, over 4,096 bytes); --run naming no start
  1  report: --feature names no lot
  2  report: usage; unknown or ambiguous id
  1  export: the check failed twice, nothing left
  2  export: usage; refused
  3  wait, result: input-required
  4  wait: an agent failed or hit a limit, run again
  5  wait --timeout, result: still working
  6  status, wait, result: the lot is damaged: a person must look
e.g. dialecte lot finding ../handover --round 1 --severity nit --at src/a.ts:3 "a finding"
```

Verbs: `start`, `status`, `forecast`, `risk`, `wait`, `answer`, `result`, `stop`, `scope`, `station`, `exempt`, `accept`, `revised`, `gone`, `moved`, `mutation`, `finding`, `decide`, `snapshot`, `choice`, `standard`, `delta`, `recap`, `verify`, `report`, `export`, `brief`, `pr`, `review`, `approve`, `land`, `close`

Flags: `--effort`, `--overlap-ok`, `--by`, `--reason`, `--dry-run`, `--simulate`, `--json`, `--on`, `--against`, `--class`, `--timeout`, `--drop`, `--add`, `--step`, `--round`, `--attempt`, `--agent`, `--executor`, `--vendor`, `--model`, `--tier`, `--session`, `--skill`, `--skill-asked`, `--event`, `--run`, `--tokens-in`, `--tokens-out`, `--tokens-cache-read`, `--tokens-cache-write`, `--tokens-total`, `--money`, `--duration`, `--exit`, `--verdict`, `--suite`, `--from`, `--remove`, `--severity`, `--at`, `--beyond-cap`, `--worktree`, `--note`, `--feature`, `--simulated`, `--print`, `--no-open`, `--pull`, `--draft`
<!-- /dialecte-reference -->

- `dialecte lot start <brief.json> [--effort low|medium|high] [--by <who> --reason <text>] [--dry-run] [--simulate <scenario>] [--json]` starts a lot from its brief
  (`schema`, `feature`, `repository`, `branch`, `base`, `goal`, `plan`, `scope`, `steps`, `lots`, `effort`, and
  the optional public `summary` and `issue`). `summary` is one sentence a pull request may show (one line, at most
  200 characters); a path, a link or a `file:line` in it is refused (`summary: public-text - summary holds a path or
  a link`), as are a plan tag, a ticket number, a standard citation, a reference the package declares, a consumer
  name and a forbidden word (`summary holds a <label>`, the text never printed). `issue` is a positive integer, the
  issue the lot's pull request closes. `goal` stays private.
  Every check runs first and every refusal is printed at once (`<field>: <rule> - <detail>`, `{ refused }` with
  `--json`, exit 2), before anything is created: the fields, the repository's main checkout, a new valid branch,
  a base that resolves to a commit, the plan and each step's heading in it, the scope and the lots covering it
  (a lot path is inside a scope entry by path segments: `lib/x` is inside `lib/`, `lib-other/x` and `libx` are
  not; an entry whose glob cuts a name, `src/data*`, compares by string prefix), and the overlap with the open
  lots of the same store, judged by the conflict forecast: a met lot whose work reads clears (a new lot has no work,
  so no conflict can exist; printed `shares <met> with <lot> (forecast clean)`), while a damaged or unreadable lot,
  a met lock file or a forecast that cannot run still refuse, unless `--overlap-ok --by <who> --reason <text>`
  accepts an overlap that names its paths (each one a line of the lot folder's `overlaps.jsonl`, printed
  `! overlaps <lot>: ...` and shown on the card; `lot scope --add --overlap-ok` accepts one the same way, where a
  forecast conflict between the two lots' work refuses too). Then it claims the next worktree index, publishes the lot folder
  `<git common folder>/dialecte-lots/<index>-<repository>-<branch tail>/` (the brief, a copy of the plan, the
  first transition, `identity.json` last; every record written once, read-only), makes the numbered worktree at
  the recorded base commit and its `.dialecte/lot` link to the lot folder. The store is appended to the user's
  store list (`$XDG_STATE_HOME/dialecte/lot-stores`, else `~/.local/state/dialecte/lot-stores`), refused when
  that list sits inside a git work tree. `--dry-run` runs the checks (the store-list refusal included, no
  hard-link probe), names the lot and the start to run next (`next: dialecte lot start <brief path as given>`),
  writing and claiming nothing. A worktree that cannot be made leaves the lot
  `failed` (exit 1), nothing removed, with `next: dialecte lot stop <full name> --reason <text>`; a link that
  cannot be made leaves the lot working (exit 0, a `note:` line, `notes` in JSON; `lot status` reports the link
  missing). Every `--json` exit is JSON: `{ lot, folder, worktree, runner, notes, next }` started,
  `{ dryRun: true, lot, worktree, next }` dry run, `{ lot, folder, state, reason, next }` failed,
  `{ refused, next: null }` a refused brief, `{ error, usage, next: null }` a usage error (exit 2),
  `{ error, next: null }` any other exit before a lot exists.
  The effort: the risk class of the scope sets the default (high when a scope entry reaches the package's
  `dialecte.risk.high` list, or may reach it: `src/**` holds `src/lib/store/**`; `effort high (risk) · risk class
  high: ...`). On a terminal, without `--json` or `--dry-run`, the effort is asked with that default
  (`effort for risk class high [high]: `). An effort below the class, from `--effort`, the brief or the answer,
  is refused (exit 2, nothing written, also on `--dry-run`) unless `--by <who> --reason <text>` give the
  go-ahead (both or neither); given, they are recorded on an effort line in the lot's `risk.jsonl` and the start
  prints `! effort medium below risk class high (by <who>: <reason>)`.
- `dialecte lot risk <id|folder> [--json]` reads the folder's `risk.jsonl` and derives the risk class now from
  the worktree's diff against the lot's base, writing nothing: `lot risk: class <c> · effort <e> · cap <n>`, a
  `! effort <e> below risk class <c> (by <who>: <reason>)` line when it is (`(no go-ahead recorded)` when no
  reason is recorded), then one line per reason (`<file>:<line>: <detail>`; a declared file reads `<file>:
  declared` when the list names it, else `<file>: declared <glob>`).
  High: a changed file in the package's `dialecte.risk.high` list (the base's and the worktree's together, so
  a change that drops a glob still counts it; the cli declares its store, events, cleanup, review rounds and
  hand-over commit paths), an added destructive call or git argument in a source file (a line
  that is a comment alone, starting with `//`, `/*` or `*`, is not read), or a runtime package (one with an
  `exports` map) whose API index changed, or whose export source changed against the base while its index did
  not or there is none; light: docs, a version bump, the lockfile, or at most 40 changed lines in at most 3
  files; medium otherwise. A derivation that cannot run (a repository with no commit yet) falls back to the
  last derived line, else `class unknown`, and the read ends with `! risk class not derived: <reason>`, exit 0.
  `--json` prints the read as one object `{ class, reasons, effort, below, cap }`, versioned by the JSON schema
  `src/commands/lot-risk.schema.json` (draft 2020-12, version 1). `dialecte lot risk <id|folder> --effort low|medium|high [--class
  high|medium|light] --by <who> [--reason <text>]` appends `{ schema: 1, kind: "effort", at, effort, class?, by,
  reason? }` to `risk.jsonl` (the last line wins; the same effort, class and reason again: `already`, nothing
  written, so a reason given after the class rose is a new line);
  an effort below the class needs `--reason`; when the derivation cannot run, the effort is compared to the last
  derived line, or to nothing, and recorded. Exit 0 read or recorded; 2 for a usage error, an unknown id, a
  damaged store lot (`lot risk: <name> damaged: <reason>`, read or write), no `--by`, below without `--reason`,
  a forbidden word or a committed, canceled or failed lot, nothing written; 1 when the line cannot be
  written. `lot snapshot` (only when it goes ahead) and `handover write` append a `{ kind: "derived", class,
  reasons, from }` line; a derivation that cannot run prints `! risk class not derived: <reason>` and appends
  nothing.
- `dialecte lot status <id> [--json]` derives the lot's state from its records (`working`, `input-required`,
  `ready`, `committed`, `canceled`, `failed`), with the worktree and link checks and the exact next command (the
  text form adds an `also:` line when there is one, five lines at most); it
  reads files only, runs no git and writes nothing. A real working lot's next station is walked from its
  records (`nextStation`: per step test-writer, `tdd red`, test-reviewer at medium or high effort,
  implementer, `tdd green` and `gate --fast`; per review round its snapshot, reviewer, fixer or adjudicator
  and `gate --fast`; then `gate --full` after the last edit station, `contrib` for a producer, the
  independent review, the hand-over to write; the first unmet one wins): the text form prints it after the
  state line, `station implementer step 2 of 3 · round -/2 · effort medium` (`<what>` may be `reviewer
  round 1`, `tdd green and gate --fast (implementer step 2 ended, claim unchecked)`, `implementer running
  since <at> (run <run>)`, `lot snapshot round 2`, `question to the person (round cap 2 reached)`, `handover write (no
  hand-over written)`, `unknown (<why>)`), the position line given up first, and `next` is that station's
  command (`dialecte lot station <name> start implementer --step 2`, `... end <station> --run <run>`, the
  check's command, `dialecte lot snapshot <name> --round <r>`, at the cap its `--beyond-cap` form), `also`
  keeping the manual line; a hand-over to write and an unknown position keep the manual line. A station
  is ended by an end with exit 0 or none and a verdict other than `failed` or `limit`; a start with no end
  is running until a later station start or end or a snapshot comes (a check never closes it: the
  station's own `tdd red`, `tdd green` and `gate --fast` run inside it), `no end` after; an end that names
  its run and gives no `--step`/`--round` takes its start's; an end of another name, or one with no start
  that places it, is `unplaced`. A claim is checked by a later `step.end` of its kind with exit 0 in
  the lot's own worktree (never `throwaway`, no later failed run of the kind, no newer failed gate
  record), or by one inside the station's run whose `stateHash` is the one its end recorded (the tree it
  handed over); when the events say the worktree's cli writes no step events, its tdd ledger and green gate
  records after the end stand in (a later green record of a gate mode covers every earlier claim of that
  mode), else `unknown (the worktree's cli records no steps)`. A reviewer or test-reviewer end approves only
  with `approve`: none or another word reads `unknown (<station> ended without a verdict)` or `unknown
  (<station> ended with <word>)`. `--json` adds `station` (`{ kind, station, check, step, round, why,
  unplaced, noEnd }`, `null` for a simulated lot) and `rounds` (`{ review, cap, effort, steps, beyondCap:
  [{ round, by, reason }], independent }`, `effort` the level the cap is taken from or `null`, `steps` the
  brief's count; the text form prints from them) and `effort` (`{ level, source, riskClass, below }`,
  `source` `risk-line` for an effort recorded by `lot risk`, `riskClass` the last derived line or `null`; the
  text form adds `! effort <e> below risk class <c> (by <who>: <reason>)` when it is below, `(no go-ahead
  recorded)` when no reason is recorded). Other states, a
  simulated lot and `lot start` keep their next. A damaged lot (a folder of the store whose name has a lot
  name's shape and whose records do not hold: no readable `identity.json`, one naming another folder, or a record
  that fails its check) answers `<name> damaged: <reason>` then `next: dialecte lot stop <name> --reason <text>`
  (`{ lot, state: "damaged", reason, next }` with `--json`), exit 6, never `no lot`; the reason is a fixed word
  of the cli, never a field of the record, and a lot with an unreadable identity is named by its folder. Exit 0 for a lot found, 2 for an unknown or ambiguous id
  (`{ error, next: null }` with `--json`) or a usage error (`{ error, usage, next: null }`). An
  `<id>` is an index (`171` = `0171`), a full name, a lot folder or `.dialecte/lot`; a word naming an existing
  folder is that folder; a damaged lot is named by its id (index or full name), a path to it does not find it. The review rounds' verbs take `<id|folder>` the same way (a write needs an index
  unique across every store of the list), and a lot folder is accepted as their hand-over folder although it
  sits in the git folder. Two workspaces of the store list may give the same full name (the same index,
  repository folder name and branch tail): that name is then ambiguous (exit 2 listing both); give the lot
  folder instead.
- The host loop: `lot start -> lot wait -> (lot answer -> lot wait)* -> lot result`. Every output names the exact
  next command with the lot's full name, and the exit code says what the host does next (section below). Every
  answer of `status`, `wait`, `answer`, `result` and `stop` goes to standard output, whatever its exit code; only
  a usage error or a refusal (exit 2), and an answer hook that threw (exit 1 of `answer`), go to standard error.
  `inbox` follows the same rule (its exit 1, nothing waits, is an answer). `lot start` stays outside it: a
  refused start (exit 2) or a failed one (exit 1, the lot `failed`) is an error on standard error, naming the lot
  and its next command. The answer line of a caller's question carries no `--by` (it defaults to `caller`); a person's names
  `--by <who>`.
- `dialecte lot wait <id> [--timeout <seconds>] [--json]` returns the status as soon as the lot needs someone:
  exit 0 `ready` or `committed`, 1 `failed` or `canceled`, 3 `input-required` (at once, every time, costing
  nothing), 4 when the last transition is a limit (run again), 5 when `--timeout` is reached while the lot still
  works. A real lot is looked at every second, by a stat of its folders and of the registry, and read again only
  when one changed, nothing written; on a terminal a `waiting <name> (<state>,
  <elapsed>)` line refreshes (never under `--json`). A simulated lot is played up to its next blocking point; one
  with nothing left to play (no `scenario.json`, or every step played) never waits: it answers its state at once,
  as `lot result` does (a working lot: exit 5), whatever `--timeout`. A damaged lot answers at once with exit 6,
  as `lot status` prints it.
- `dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]` records the answer to an open question
  once, then prints the status with `next: dialecte lot wait <name>`. The answer is one line; a question with
  options takes one of them (compared trimmed, case-folded, recorded as the option is written); the same answer
  again is `already`, another one is refused. A person's question needs `--by <who>` (not `caller`); a caller's
  defaults to `caller`. `--by` is one line, not empty, checked before the lot is read (exit 2 naming `--by`).
  A refusal's text form escapes the options, answer and `--by` it quotes (a line feed in them prints as
  `\u{a}`, the refusal stays one line); `--json` carries them as stored. A damaged lot takes no answer (exit 2,
  naming the lot, its damage and the stop to run; nothing written).
- `dialecte lot result <id> [--json]` never blocks and writes nothing. A `ready` or `committed` lot exits 0 with
  `{ lot, state, handover: { name, folder, state, card, show, run }, worktree, branch, questions, simulated }`:
  the card is the one `handover show --json` computes, `handover.state` the hand-over's own state read from git
  (`committed` once its lots are committed, even before the registry says so), `questions` the answered ones
  (`{ id, text, answer, by }`); a simulated lot's `handover` is `{ simulated: true }`, nothing to show or run.
  `failed` and `canceled` exit 1 with `{ state, reason, at, position }` of the last transition, `input-required`
  exits 3 with the open questions, `working` exits 5, a damaged lot exits 6 (as `lot status` prints it). The text
  form prints agent text escaped.
- `dialecte lot stop <id> --reason <text> [--by <who>] [--json]` ends a lot. A `committed` lot is refused
  (exit 2). A pending hand-over is abandoned first, as `handover abandon` does (`abandoned.json`, the registry
  entry `abandoned`, the lock released when it names that hand-over); while its run is in progress, or once it is
  committed, the stop is refused (exit 2) and publishes nothing. Then a `canceled` transition (cause `stop`, the
  reason, `--by` or `caller`), and the registry is read once more: a hand-over registered meanwhile is abandoned
  at once. A lot already `canceled` exits 0 writing nothing; one whose entry is still `pending` (a crash inside an
  earlier stop) is repaired. It moves no worktree and deletes nothing; `lot close` and `worktree prune` let the
  worktree go once the lot is canceled. The reason and `--by` are one line, not empty (exit 2). A damaged lot is
  stopped by moving its folder aside, never deleted and nothing written into its broken records first: to
  `<git common folder>/dialecte-lots-aside/<name>` (`-2`, `-3`, ... appended when the name is taken, an empty
  folder included), with a `stopped.json` (`reason`, `by`, `at`, `damage`) inside the moved folder (a lot folder
  that is a symbolic link: the link is moved, never its target, and the record is `<aside name>.stopped.json`
  beside it). It prints `stopped <name>: damaged (<reason>); its folder is now <path>` (`{ lot, state:
  "moved-aside", damage, folder }` with `--json`). Its index stays claimed, its worktree and branch stay; refused
  (exit 2, nothing moved) while a live run marker holds the folder or a pending registry entry names it (first:
  `handover abandon <entry>`); a stop that finds the folder gone (another
  stop moved it) says `no lot <id>`. Until it is moved aside, a damaged lot holds its paths: the scope of its
  `brief.json` when that reads as a list of texts, else every path, so `lot start` refuses an overlap with it
  (`overlap with <name> (damaged: <reason>): ...`, or `its scope cannot be read: it holds every path`); one whose
  identity reads simulated holds none.
- `dialecte lot start --simulate <scenario>` starts a simulated lot that plays one of the scenarios (`ready`,
  `question`, `person`, `two-questions`, `limit`, `failure`, `slow`) under `lot wait`, publishing the records a
  real run would: it writes only its lot folder, one line of the store list and one index claim, never a branch,
  a worktree or a registry entry, and never blocks a real lot. A host proves its loop on it before a real run.
  With `--dry-run` it is the dry run of that simulated start: exit 0, the findings a real start would refuse for
  listed (`wouldRefuse` in JSON, `worktree: null`), no worktree named, and `next` the same start with
  `--simulate <scenario>`; nothing claimed or written.

- `dialecte lot exempt <reason>`, `lot accept <case> <reason>`, `lot revised <case|file|glob> <reason>`,
  `lot gone <file|glob> <reason>` write the lot declaration `.dialecte/lot.json` at the package root (the
  nearest package.json above the current folder) as tab-indented JSON, keeping what it holds; the same
  case (or file) again replaces its reason. `accept` needs a case `<file>::<name>`; `gone` refuses one
  (it writes `"gone": [{ "file": "<file or glob>", "reason": "..." }]`).
- `lot accept --remove <case>`, `lot revised --remove <case|file|glob>`, `lot gone --remove <file|glob>` drop the
  entry written exactly so, keeping the rest (a list left empty leaves the file). An entry its list does not hold is
  refused, naming the closest entries, nothing written. A receipt only exempts, so removing one makes `tdd` and the
  gate stricter: receipts never need a hand edit.
- `lot moved <case> <case> <reason>` or `lot moved <file> <file|glob> <reason>` declares a case of the lot moved by a
  split or a rename after its red. `tdd red` carries the earlier label's red under the new one (flag `moved`) when the
  case's test call is the one that red froze; the next `tdd green` proves it as any red. A call changed in the move,
  or an earlier case with no red, is refused. The file form covers a whole split, the cases keeping their names.
  `lot moved --remove <from> <to>` drops one.
- `dialecte lot mutation <off|changed|audit|gate>` writes the lot's mutation switch (`"mutation"`, no
  reason). Without it, `dialecte mutants run` mutates the changed lines when the lot's diff touches the
  declared scope and nothing otherwise; `audit` mutates the whole scope; `gate` runs as `changed`.
- `dialecte lot standard <id|folder> consulted <note> | not-consulted <reason> | outside <note>` writes
  `<folder>/standard.json` (`{ state, note, at }`, the note's words joined by single spaces) for the card's
  `standard` line; `outside` records that the lot's asks were answered outside the documents, with
  `confirmed: false` (only an ask's own note sets it true). The line references of what was read stay in the
  findings ledger. Another state, or no note, is a usage error (exit 2); a folder inside a repository is refused as
  below.
- `dialecte lot finding`, `decide`, `snapshot`, `choice`, `delta` and `verify` keep a lot's review rounds in its
  lot folder, or in a hand-over folder (`_commit-plan/<topic>-<date>/`) that stays outside every repository:
  each refuses any other folder inside a git work tree or a git folder (`.git/`, a bare repository). `--` ends the options: the
  words after it are taken as they are, so a finding or a reason may start with `--`. Each writes its file
  whole (a temporary file renamed over it), so a reader never sees half a ledger.
  - `lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>`
    appends the row `| R<n>-<k> | <n> | <severity> | <file:line> | <finding> | open |` to
    `<folder>/findings-ledger.md` (the folder, the file and its table made when absent; k one past the
    highest of the round). A `|` is written `\|`; a line break is refused. A hand-written ledger keeps
    every other byte.
  - `lot decide <id|folder> <finding> <state>` rewrites that row's state cell: `open`, `fix-to-verify`,
    `fixed <round> [note]` (a round after the one that raised it), `accepted <reason>`, `logged <where>`.
    An id not in the ledger is refused, naming the ids it holds.
  - `lot choice <id|folder> --by <who> <decision>` appends `| <decision> | <who> | <yyyy-mm-dd> |` to
    `<folder>/decisions.md` (made with its title and table when absent): a decision made outside the
    findings ledger, the user's above all. A `|` is written `\|`; an empty `--by`, a line break, or more
    than one decision word (quote it) is refused.
  - `lot snapshot <id|folder> --round <n>` copies every file `git status --porcelain -z
    --untracked-files=all` lists at the worktree root (the old path of a rename included) to
    `round-<n>/` at its repository-relative path - bytes, mode, a symlink as a symlink; a path gone from
    disk (or now a folder) that HEAD holds goes in `round-<n>.deleted`, NUL-separated, sorted; HEAD in
    `round-<n>.base`. An existing round, an untracked nested repository and a submodule (a gitlink in the
    index or at HEAD) are refused; a run that
    stops part-way leaves only `.partial` names, which the next run removes. `.dialecte/lot.json` is
    never part of it. `round-<n>.state` (`{ "schema": 1, "at", "stateHash" }`, the worktree's state hash)
    is written and renamed with the others. The risk class is derived again from the diff first, and appended
    to `risk.jsonl` only when the snapshot goes ahead (a refused snapshot writes nothing); the cap is the
    rounds of the higher of the effort's class and that class (low or light 1,
    medium 2, high 3; the effort is the last `lot risk --effort` line, else the lot's), and a class above the
    effort prints `! risk class now high (src/cleanup.ts:2: rmSync): cap 3`. With no effort recorded the cap
    is 1 and a later round is refused, exit 2, naming `dialecte lot risk <folder> --effort low|medium|high --by
    <who>`. A round above the cap of an effort is refused, exit 2, naming what set the cap (`(effort medium)`,
    or `(effort medium, risk class high)` when a class raised it) and `dialecte lot snapshot <folder>
    --round <n> --beyond-cap --by <who> --reason <text>`. With them the row `| round <n> beyond the cap of
    <cap>: <reason> | <who> | <day> |` goes to `decisions.md` first, then the snapshot (a retry finds the
    row of that round and adds none; once it stands, the plain `--round <n>` takes the round too). `--beyond-cap` within the cap, `--by` or `--reason` without it or
    blank, and a `--by` or `--reason` holding a forbidden word (`lot snapshot: --by holds a forbidden word:
    nothing written`, the word never printed) are refused, exit 2, nothing written; an existing round
    stays exit 1.
  - `lot verify <id|folder> --by <who> --note <text>`, run inside the lot's worktree, appends `{ schema: 1,
    at, by, note, state }` to `<folder>/verify.jsonl` in one write, `state` the worktree's state hash: the
    late fixes of that tree verified (the card's `late fixes` line, the `verify` guard). One later change
    needs a new verify. Exit 0 recorded; 2 for `--by` or `--note` missing, blank or not one line, a
    forbidden word in either, a run in another work tree than the lot identity's worktree (both named), or
    no snapshot yet (nothing is late), nothing written; 1 outside a git work tree, or a line over the event
    line limit.
  - `review.jsonl` in the folder holds the review's public rows, what a pull request may show, derived and written
    whole by `lot finding`, `lot decide`, `lot verify` and a `reviewer` / `independent-reviewer` `lot station end`:
    a `finding` row per ledger row (`id`, `round`, `severity` blocking / should-fix / nit, `file`, `state` open /
    fix-to-verify / fixed / accepted / logged, `closedBy: { round }` for fixed), then a `verdict` row per review by
    time (`by: { kind: "station", station, round }` with the `vendor` and `model` its end or start gave, or
    `by: { kind: "verify", name }` with verdict `verified`). Never a finding's text, a note, a reason or a where; a
    `file` only when the lot's worktree or base holds it; a cell the parser cannot read is left out. A record not
    written adds `! review.jsonl not written: <reason>`, the verb's own write standing.
  - `lot delta <id|folder> --round <n> [--worktree] [--json]` (n ≥ 2) prints, for each file of
    `round-<n-1>/`, of `round-<n-1>.deleted` or of the worktree's status, what changed since round n-1,
    in the form that fits where the file is: the snapshot copy against the worktree file (or
    `/dev/null` when it is gone), `/dev/null` against a file deleted then and back now or new and absent
    from the base, `git diff HEAD` for a file round n-1 had at the base. Files unchanged since round n-1
    are left out; colour, external diff and textconv settings never apply. It refuses when HEAD moved
    since `round-<n-1>.base`, and refuses a nested repository or a submodule as `lot snapshot` does. `--worktree` adds a throwaway worktree on the branch
    `<lot branch>-round-<n-1>` from the lot's branch tip, in `.worktrees/<index>-<repository>-<branch
    tail>-round-<n-1>` with the lot's own index when its worktree is numbered (no new claim; else the
    workspace's next): the deletions applied with `git rm
    --pathspec-from-file`, then `round-<n-1>/` copied over, so a new test can run on the old code; it
    prints its path and the removal command with its absolute `cd`. The lot's worktree is never
    changed. Its `node_modules` comes from the pool, or a copy, as for `worktree add`.
  - `lot close <hand-over name|index>... [--json]` closes finished lots: for each hand-over of the registry
    named (by its name or its worktree's index) whose state is `committed` or `abandoned`, its worktree (the
    path the registry entry holds) is closed: every decision first, for every argument with every rule, its
    own state and branch included (one worktree reached by several names or indexes closes only when every
    one of them may close, and then once, the other arguments answered "the same worktree as ..."; when one
    keeps it, every one of them is kept, each line with the reason), its
    `node_modules` read against the lockfile where it is; then the links of its `node_modules`
    made absolute where they are, the worktree moved to the trash (`.worktrees/_trash/`, by
    `git worktree move`), its `node_modules` parked in the pool (`.worktrees/_pool-<repository>-<n>`) from
    there, its caches (`.vite`, `.cache`) sent to their own `_trash/` entries, and last the trashed worktree
    removed in the background by `git worktree remove` without `--force`: git refuses a worktree written into
    since the check, which then stays registered in `.worktrees/_trash/` for you to look at (one line says so
    when something closed). Paths are compared by their real path as spelled on disk (a path typed in another
    case on a case-insensitive volume matches). Before the move, the lot's final record is kept: the card line
    of its `cards.log` (the one `handover run` wrote when it committed; else a recomputed one, marked
    `recomputed`, built without the probe), read back and parsed, then a `removing` line naming the worktree,
    its branch and the branch tip; after the move a `removed` line says `trashed` or `kept`. Kept also, with
    why: `final record not kept: <reason>` when the record cannot be written or read back, and `the lot's
    commit is not known` (with where to look and how to remove the worktree by hand) when a committed lot's
    commit can be found neither among its lot commits nor in the worktree's hook record (read only when no
    other committed hand-over shares the worktree). Every other hand-over of the worktree gets its card line
    too, `head` its last lot commit or `null`. Kept,
    with why and nothing done for that hand-over: first, a worktree a lot of the repository's store names
    (by real path) while the lot is not `committed` nor `canceled`, reason `lot <full name> <state>` (the
    store read once, no git process per lot but the one probe below). A lot whose hand-over was committed
    outside its own folder (no registry entry for the lot folder, every entry naming its worktree and branch
    `committed`) reads `committed` once its branch is past the lot's base commit (the base an ancestor of the
    tip, the tip not the base) and on the base branch. Such a lot keeps nothing, and every outcome of its
    worktree carries the line `lot <full name> committed: hand-over committed in <folder>, branch on <target>`
    (under the outcome's line, indented; `landed` in `--json`); the other keep rules below still apply to it.
    Once `lot close` has closed that hand-over, every reader (`lot status`, `lot wait`, the overlap at `lot
    start`, `worktree prune`, `plan next` among them) reads the lot `committed`, files only and without the
    probe, so a branch deleted afterwards never reopens it. A lot with a live run, or a transition later than
    that hand-over (resumed after it), reads from its own records, never landed nor closed by it. A hand-over
    still `pending`; its worktree is the main
    checkout (never parked, moved or trashed); no registered worktree at that path (closed already, or one
    in the trash or the pool: never a target again); a worktree on another branch than the hand-over's
    (both branches named: it holds other work now); a `locked` worktree (`git worktree lock`); another
    hand-over registered for the same worktree that is neither `committed` nor `abandoned` (named); a mutation
    run started from it that still runs or died before reporting; `lot close` itself run from inside it
    (run it from another folder); a process whose working folder is in it;
    the processes not known (`lsof` failed or took longer than 20 s); a link from outside the worktree
    pointing into it (`the link <path> points to it`: the links directly in the workspace, `.worktrees/`,
    `_commit-plan/` and the scratch roots, and those in `node_modules/` and `node_modules/@*/` of every
    worktree and main checkout of the workspace's repositories, read once per call; the worktree's own links
    never count); a `dirty` worktree (anything
    `git status --porcelain --untracked-files=normal` lists, untracked files included whatever
    `status.showUntrackedFiles` says); a HEAD reflog reaching commits that neither the hand-over's branch, the
    base branch nor a remote-tracking ref holds (a commit made on a detached HEAD: the reflog goes with the
    worktree); ignored files its removal would delete that nothing else holds (`ignored files git worktree
    remove would delete: .env`, the first three named past three): rebuilt folders (`node_modules/`, `dist/`,
    the VitePress caches, the hooks folder, the `dialecte.rebuiltIgnored` folders, the coverage outDir read from the
    main checkout's package, a nested `node_modules` beside its own `package.json`, `.venv/`, `.pytest_cache/`), `.DS_Store`, the
    `.dialecte/lot` link, a `.dialecte/lot.json` that is empty or byte-equal to the one archived by a
    committed hand-over of this worktree, and files byte-equal, mode included, to the same path in the main
    checkout go; anything else keeps it, `.dialecte/notes.md` included. The branch is never touched (`worktree prune` still lists the merged
    ones). Each line names the folder it moved and where `node_modules` went (`closed  <name>: 0007-cli-x;
    node_modules pooled in _pool-cli-1`, or `trashed: <why it was not parked>`); a failure part-way keeps
    that hand-over with the error and what was already moved, the others go on. A hand-over it closes gets
    `closed` (the time) on its registry entry; closing it again prints `<name> already closed`, nothing
    decided nor moved (an entry without it, a worktree removed by hand, is still kept: `nothing to close`).
    Exit 0 when every named hand-over closed (or was already closed), 1 when one was kept, 2 for a name or
    index the registry does not hold (then nothing is closed); `--json` prints
    `[{ handover, closed: true, already?: true, landed? } | { handover, kept, landed? }]`.
- Recording a lot. Every record below is appended to a file, never rewritten; a reader skips a half line and a line
  it cannot parse, and counts them.
  - `dialecte lot station <id> start <station> [flags]` and `lot station <id> end <station> [--run <run>] [flags]`
    append one station event to the lot's `events.jsonl` (`by: host`): the host says which station ran, with
    which step, round, attempt, agent, vendor, model, tier, effort, session and skills (`--skill` seen,
    `--skill-asked` asked by the brief), and, at its end, tokens (`--tokens-in`, `--tokens-out`,
    `--tokens-cache-read`, `--tokens-cache-write`, `--tokens-total`), `--money <amount> <currency>`,
    `--duration`, `--exit`, `--verdict` and `--suite <name>=<runs>` for suites the agent ran itself. Nothing but
    the station is required; a field nobody gave stays unknown. `start` answers a `run` and the `end` command to
    run; `end` pairs with `--run` (an end that gives no `--step`/`--round` then takes its start's), else with the one open start of its station whose step, round and attempt match
    the ones it gives (several: refused), else is recorded alone. `--event <id>` makes a retry safe: the same id
    with the same fields answers the first event (`already`) and writes nothing, other fields are refused.
    `start` is refused on a committed, canceled or failed lot, `end` is accepted in every state. An `end`
    records `stateHash`, the state hash of the lot's worktree (left out when it cannot be read; a retry does
    not compare it): a check the station ran on that tree inside its run counts for its claim. The station
    names `shared` and `outside` are the report's own labels and are refused. `lot station <id> --from
    <file.json>` takes the same fields as one JSON object, plus `phase` (`start` or `end`); an unknown key
    is refused, every fault at once. A line over 4,096 bytes is refused. Exit 1 when the event cannot be written, 2
    for a usage error or a refusal.
  - Step events: the cli writes `step.start` and `step.end` events (`by: cli`) into the lot's `events.jsonl` for
    `gate --fast`, `--full`, `--release` and `--hook`, `contrib`, `tdd red`, `tdd green`, `mutants run`,
    `handover run` (real and rehearsal), `lot delta --worktree` and `worktree add`: the step, whether it is heavy,
    its exit, its time, whether a gate reused records, and per gate step its status, counts, time and selection. A
    step in a worktree that links no lot, or none matching, writes nothing. The `step.end` of `tdd red` and
    `tdd green` carries `stateHash`, the worktree's state hash after the run (computed only in a lot). A write that fails prints one
    `events: not recorded: <reason>` line and never changes the step's exit; a step killed after its start writes
    its end as interrupted where it can. Long lists are cut, failing parts first. A step run in a worktree whose
    link names a lot that lives elsewhere (a copied or moved worktree) is written to that lot as `step.foreign`.
  - `dialecte.stepEvents` in the cli's own `package.json` (`"stepEvents": 1`) tells a host that this cli writes step
    events. Each event notes the capability of the cli installed in the lot's worktree; a cli without it (an
    older release or source) writes none, so the report shows the step counts of such a lot as unknown rather
    than 0.
  - Heavy steps (`gate --full`, `--release`, `contrib`, `mutants run`, a rehearsal, a gate step the package
    declares heavy, and for the last only while that part runs) write a live marker in
    `<state folder>/dialecte/heavy/` (`$XDG_STATE_HOME`, else `~/.local/state`): the step, the lot, the
    worktree, the process and its start time. The step removes it at its end; a marker whose process is gone, or
    runs with another start time, is dead and ignored. A person's run outside any lot writes the marker too, and
    no event. This is how a host sees which heavy step runs now, and since when.
  - `dialecte lot report <id> [--json]` reads files only (no git, no process, nothing written) and prints one lot:
    its state, feature, effort, steps and rounds; per station run the agent, tier, model, tokens, time, suites
    and skills; totals for tokens (each field with how many stations did not report it, a lower bound when a
    total is not exact), money per currency (with how many stations reported none), and time (the lot's elapsed time as agents, cli steps, waiting for
    answers, waiting for the machine and the rest); the suites per step family with their counts, reuse and
    reruns, attributed to the station whose time holds the step (`shared` when several, `outside stations`
    when none, and always for the steps the orchestration runs; a step a person runs by hand during a
    station lands on that station); the heavy steps, the folders (worktree add, throwaways, trash), the review
    rounds from the findings ledger, the events counted (damaged, duplicates, unknown kinds) and the next
    command. A number nobody reported is `unknown` in the text and `null` in `--json`, never 0. A step family
    reads unknown, with the reason, when the worktree's cli writes no step events, when a record of a step has
    no run in the events, or when nothing of the lot's steps left a trace. `dialecte lot report --feature <name>
    [--simulated] [--json]` gives one line per lot of the feature, in every store of the store list and the
    current folder, then the totals by station and by tier; simulated lots are counted apart and listed by
    `--simulated`; a lot whose folder is gone is listed from its `cards.log` line. Exit 1 when the feature names
    no lot, 2 for an unknown or ambiguous id.
  - The hand-over card gains a `usage` row (tokens, agents, runs, agent time, and the report's command) when the
    hand-over folder is a lot folder holding a station event; `handover show --json` carries `usage`. A folder
    with no station event shows no row.
  - `cards.log`, in `<git common folder>/dialecte-handover/`, one per repository: one JSON line per record,
    appended in one write, never rewritten, never rotated. A `card` line is a lot's final record: its hand-over
    card, usage and the times of its gate, tdd and hook records (a worktree's records go with it), written by
    `handover run` once a commit is recorded, or by `lot close` when none exists. A `removing` line is written
    before a worktree moves (its path, branch, branch tip and record times), a `removed` line after it (the same
    id; `trashed` or `kept`). A `removing` without its `removed` reads as unknown. The report reads these lines
    for lots whose worktree or folder is gone.
  - `dialecte lot export <id> <dir> [--json]` copies a lot folder to `<dir>/<full name>/`, `asks/` left out, links
    kept as links (one pointing outside the folder is named), with the lot's `cards.log` lines and registry
    entry added as `cards.log` and `registry.json`. It is refused (exit 2, nothing written) for an unknown or
    ambiguous id, for a `<dir>` inside a git work tree or a git folder, and when `<dir>/<full name>` exists.
    The copy is made into a temporary folder beside it and each file's size and checksum compared with the
    source's (`events.jsonl` as a prefix, since a running lot appends); a difference makes one more copy of
    that file, a second one removes the temporary folder and exits 1 naming the file; a match renames it. The
    source is never written; another run's temporary folder is named, never removed.

- `dialecte lot recap <id|folder>` prints the expandable part (`<details>`) as GitHub markdown, from the
  records only: the commits of the lots (or `not committed yet`), the test cases the newest gate record of the
  current tree judged red then green, counted per test file, the gate and rules lines (and `mutation`), the
  lot's mutation runs (`Mutation`: each run of the branch and of the branches it merges, oldest first, with
  its mode, id and counts or its state; each survivor those runs killed or recorded; each survivor first seen
  on those branches and scheduled, with its follow-up; `No mutation run.`, or `No mutation scope declared.`
  for a package without one), the review rounds from
  the findings ledger, the decisions (accepted findings, the lot declaration's `accept` and `revised` entries,
  the rows of `decisions.md`, then, in a lot folder, one row per answer `answers/q<k>.json` in `k` order:
  `q<k> <question text> -> <answer>`, by who answered, on the UTC day of the answer; an answer is never copied
  into `decisions.md`), the logged findings as follow-ups, and who reviewed and posted it (`git config
  user.name`; no name set is refused). Every section is always there, saying so in one line when empty; a
  branch that does not hold the lots on top of the recorded base lists none as committed and says so. Each
  finding is printed with its id, its text without one leading reviewer tag `[...]`. The ledger is read whole:
  every row after its header with the header's cell count is a finding, whatever its id (`R<n>-<k>`, `TR3-1`,
  `F-a`, printed as written), notes between rounds included; its round is the round cell's, else the one an
  `R<n>-` id names, else the row is refused. A state is read as a history (`fix wrong 2 (...) - fixed 3
  (reasoned)`): it starts with `fixed`, `accepted`, `logged`, `open`, `fix to verify`, `fix wrong` or
  `reopened`, and a spaced dash starts a new part only before `fixed <n>`, `reopened <n> by <id>`, `fix wrong
  <n>`, `fix to verify`, a closing `open`, or a later `accepted` or `logged` followed by ` (`, `: ` or a
  spaced dash; any other spaced dash belongs to the text before it. The last part decides (`fix wrong`,
  `reopened` and `fix to verify` leave the finding open), an accepted one's reason being the rest (in its
  parentheses, or after `- ` / `: `); a state recap cannot read is refused with the row's id. A `file:line` is
  printed relative to the repository, or to the workspace folder for a sibling repository (the parent of the
  main checkout; of the `.worktrees` folder when the repository is gone), never absolute: an absolute path
  outside both, or one the rewrite does not reach (a `/` starting a path segment after a backtick, a quote,
  `=`, `[`, `-`; `~/`), is refused with the row's id; a `/` starting no segment (`a.ts / b.ts`, `+/- 2`) and
  URLs stay. Where a finding was logged, the hand-over folder and the lots file's notes are left out. It writes
  nothing.

## Landing through the merge queue

`dialecte lot land <id>` lands a lot through its pull request: the committed HEAD (a push carries only commits: uncommitted
files stay in the worktree and are named, `uncommitted, not pushed: N files`), rebased onto `origin/<base>` when
behind it (a conflict undone, its files named, nothing pushed; with a tracked file changed git cannot rebase: the lot
is pushed as committed, a line saying the rebase waits for a clean worktree; CI tests the merge with the base), pushed
with a lease, its pull request opened or reused with the title and body `lot pr` renders from the lot's records
through `.github/pull_request_template.md`, on the rebased head before the push: the title is the lot's own message
(the first commit lot of its brief), never the branch's last commit, so a merge of main never becomes the squash title,
and the body is the lot's final state, never its commit bodies. A reused pull request whose title or body reads
otherwise is edited, a person's part after the template's kept marker kept; records that do not render push nothing.
Then it is queued with `gh pr merge --auto`. The merge queue runs the full suite on the
lot on top of main and the lots ahead of it, then squashes it onto main; nothing reaches main another way. `--draft`
opens a draft and never queues it: CI runs on every push while the lot goes on; land it again without `--draft` to
queue it. The landing is recorded in `<lot folder>/landing.json` (with `replaced`, the heads its rebases replaced: `lot close`
counts their commits as landed, so a worktree `lot land` rebased closes, and a landed lot's final record takes the head
its landing pushed) and as the lot's hand-over entry (`pending`); `lot close`
first marks the lot committed once that pull request merged at the head it pushed (a squash commit holds none of the
lot's own commits), after bringing the local base branch up to origin's. The push's lease is pinned to the head the
last landing pushed, a lot must be on its branch, and a lot cut from another lot is refused until stacks land.

## Review on the pull request page

The pull request page is the review tool: its Files tab holds the file tree, the full files and the line comments.
`dialecte lot review <id>` adds the half that never goes on GitHub: it prints the lot's state, its pull request with the
head it is at, the head the lot landed and the worktree's HEAD, the checks, the brief's goal and steps, the tests
record, `decisions.md`, every finding with its text and state, the standard line, and what `lot approve` would refuse;
then it opens the Files tab. It writes nothing.

Points that can be public are line comments on the pull request, prefixed `blocking:`, `should-fix:` or `nit:`
(should-fix when none). `dialecte lot review <id> --pull --round <n>` brings them back as findings of round n, each
comment once; the lot fixes them as a review round. Private points (the plans, the standard) never go on GitHub: they
are recorded with `lot finding`.

`dialecte lot approve <id> --by <who> [--reason <text>]` is the approval: once the pull request is at the head the lot
landed, its checks are green there and no finding but a nit is open, it records a person's `approve` verdict
(`approvals.jsonl`, shown in `review.jsonl` and in the body by kind only, for that head: a later commit needs a new
approval), renders the body again and queues the pull
request. The cli's own lots take `--by orchestrator` after the orchestrator's independent review; every other package
waits for a person.
