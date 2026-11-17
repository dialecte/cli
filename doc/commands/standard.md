# dialecte standard

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Index and search the standards kept on this machine (DIALECTE\_STANDARD: one folder per standard); the index lives in the cache

```text
standard - Index and search the standards kept on this machine (DIALECTE_STANDARD: one folder per standard); the index lives in the cache

  dialecte standard index [--standard <id>] [--package <name>] [--rebuild] [--json]
  dialecte standard find "<terms>" [--standard <id>] [--package <name>] [--about <Tag>] [--limit <n>] [--json]
  dialecte standard show <file id>:<from>-<to> [--json]
  dialecte standard eval <gold.jsonl> [--standard <id>] [--package <name>] [--angles] [--packs [--effort low|medium|high]] [--reports <asks folder>] [--json]

  the vocabulary - the tags, attributes and enumeration values of the installed dialectes (--package
    <name>: that one only); index, find and eval print it first
  index - builds (or reuses) the index of each standard folder, prints its quality per file
  find - the ranked slices of whole lines that hold the terms, then the clauses they refer to
         [linked]; --about <Tag> adds a tag of the installed dialectes
  show - the normalised text of a range of original lines; a file id is <standard id>/<file name
         without .md>
  eval - recall at 5 and 10 of find over a local gold file of { question, about?, expected: [{ file,
         quote }] } lines; the expected quotes are alternatives; --angles runs each question through
         the ask ladder (no fact read or written, no ask kept) and scores its merged slices; each
         gold line may also hold kind (fact | polarity | exception | not-in-text), answer and status
  eval --packs - the recall at 5 and 10 of the slices the round-1 readers are given (the ask ladder,
    no fact read or written, no ask kept, nothing written): reader A in its order, and the A and B
    slices together (A1, B1, A2, B2, a slice met twice kept once); --effort low|medium|high sets the
    readers (default medium)
  eval --reports - the agreed-wrong rate of recorded asks: the asks of an asks folder whose question
    equals a gold question are judged by their last answered round (a not-in-text item the readers
    did not agree not-in-text, an item with an answer they agreed not-in-text, a gold answer
    starting yes or no and the other verdict, a value its gold answer does not hold: wrong; no rule
    decides the rest: unjudged); rate = wrong over agreed and wrong, null (printed -) when nothing
    is judged; runs outside a package, writes nothing
  eval --json - schema 1; packs: { readerA: { recallAt5, recallAt10 }, union: { ... } } only with
    --packs, reports: { agreed, wrong, unjudged, rate } only with --reports
  the standard is never copied into a repository: its index is in $XDG_CACHE_HOME/dialecte (else
    ~/.cache/dialecte)
  the card's standard line - a lot's standard.json in state outside (its asks answered outside the
    documents) warns, and fails at effort high unless the record's confirmed flag is true (a person
    confirmed every outside answer; lot standard ... outside writes it false): the flag decides,
    never the note text

exit codes:
  1  index: no indexable file · find: nothing matched · show: only blank or dropped lines · eval: no item with an expected quote · a file changed during the build
  2  usage · no standard configured · a root or cache inside a git work tree · colliding ids · an unknown standard, file, --package or --about tag · eval: a gold line that is not an item (kind not one of the four), --effort not low, medium or high or without --packs, --packs outside a package with a dialecte installed, a --reports folder that does not exist
e.g. dialecte standard find "data object" --limit 5
```

Verbs: `index`, `find`, `show`, `eval`

Flags: `--standard`, `--package`, `--rebuild`, `--json`, `--about`, `--limit`, `--angles`, `--packs`, `--effort`, `--reports`
<!-- /dialecte-reference -->

`dialecte standard` indexes the standards you hold on your machine and answers from them, in slices of whole
lines with their original line numbers. The cli ships no standard and never copies one into a repository.

**Where the standards are.** `DIALECTE_STANDARD` names one root folder holding one folder per standard; the
folder's name, lowercased, is the standard's id, and its top-level, non-hidden `.md` files are the standard
(subfolders are ignored; a symlink to a folder or a file counts). A file's id is `<standard id>/<file name
without .md>`, lowercased.

```
$DIALECTE_STANDARD/
  <standard id>/
    <part>.md
    <amendment>.md
  <other standard id>/
    <part>.md
```

Refused with exit 2, nothing built: `DIALECTE_STANDARD` not set, empty or naming a path that does not exist; a
root that is a file, that holds `.md` files directly (they are named, with the expected layout) or that holds no
standard folder; two folders,
or two files of a folder, whose ids differ only by case (both named); a `--standard <id>` with no folder (the
known ids named); the root, a standard folder or the cache inside a git work tree. A folder with no `.md` file
is reported as `no indexable file` and skipped.

**Where the index is.** In the cache only: `$XDG_CACHE_HOME/dialecte/standard/<standard id>/<manifest hash>/`
(else `~/.cache/dialecte/...`), one folder per standard and per set of file contents (the manifest hash is the
sha256 of the index format and each file's id and sha256). A folder is built into `<hash>.tmp-<pid>/` and renamed
into place once complete: a file changed during the build aborts it (exit 1, the file named, nothing kept); a
second builder reuses the first one's folder; a temporary folder left by a process that is gone is removed at the
next build. A complete folder is reused, never rebuilt, unless `--rebuild` (the old folder is moved aside, the new
one renamed in, then the old one removed: a reader never sees a half-removed index); the links to the vocabulary of the
installed dialectes are a file of their own, written beside the rest when the selected dialectes change.
Old folders are kept. While a build runs, a running line with its elapsed time goes to stderr on a terminal.

**The vocabulary.** The tags, attributes and enumeration values of the dialectes installed where the command runs
(every one, or the one `--package <name>` names) are exact names: case kept, never stemmed, then scored like a
word (1 per clause or table, doubled in its heading or caption, weighted by the lines naming it). An attribute under three
characters counts only as `@name`, `name=` or a table cell equal to it, an enumeration value under three
characters only as a table cell equal to it; a name in lowercase letters only, from three characters, is searched
as an ordinary word. The tags file is named by the hash of the selected dialectes' `name@version` list. `index`,
`find` and `eval` print `vocabulary <name@version>[, ...]` (or `vocabulary none (no dialecte installed)`) as their
first line, and `vocabulary: { packages }` in `--json`. A `--package` that is not installed answers exit 2 with
the installed ones named.

**Words.** Other words are searched by their stem: lowercased, the plural removed, then `-ied` and `-ying` to `-y`,
a final `-ing` or `-ed` (with its doubled consonant) and a final `e` removed; common English, modal and question
words are not searched. A word in capitals and digits with two capitals or more (an acronym) is kept from two
characters, never split nor stemmed; its plural (the acronym and one lowercase `s`) is searched as the acronym.

- `dialecte standard index [--standard <id>] [--package <name>] [--rebuild] [--json]`: builds or reuses the index of each standard
  (or of `--standard <id>` only), then per standard `<id>  <n> files  built|reused in <time>  manifest <hash>`,
  per file its lines, quality verdict, noise share, headings kept over candidates, tables and definitions, and
  the lines repeated often enough to be a watermark (information only: nothing is dropped for being repeated).
  Exit 1 when no selected folder holds a `.md` file.
- `dialecte standard find "<terms>" [--standard <id>] [--package <name>] [--about <Tag>] [--limit <n>] [--json]`:
  the slices that hold the terms, ranked over every selected standard (each slice names its file id): a header
  `<file id>:<from>-<to>  <clause> <title>  score <s>`, then the normalised text. A slice starts at the first hit
  of its clause's or table's densest run of terms (at most 60 lines holding the most distinct terms, weighted as
  in the score) and runs to the last hit, 60 lines at most; a table starts at its caption when that run ends
  within 60 lines of it. After the `--limit` (10)
  direct slices come the clauses and tables they refer to, marked `[linked]`. `--about <Tag>` adds a tag of the
  installed dialectes (an unknown one answers the closest; none installed is a usage error). Exit 1 when nothing
  matches.
- `dialecte standard show <file id>:<from>-<to> [--json]`: the normalised text of the logical lines overlapping
  the range, each with its original lines. Exit 1 when the range holds only blank or dropped lines; 2 for a
  malformed range, an unknown file id (the known ones named), a start after its end or an end after the file's
  last line.
- `dialecte standard eval <gold.jsonl> [--standard <id>] [--package <name>] [--json]`: recall at 5 and at 10 of `find` over a gold
  file you keep, one `{ "question": ..., "about"?: ..., "expected": [{ "file": "<file id>", "quote": ... }] }` per
  line (other fields are ignored); a line may also hold `kind` (`fact`, `polarity`, `exception`, `not-in-text`; another word refuses the line, naming the four), `answer` and `status` (free text). The expected quotes of an item are alternatives: the item is found at the best
  rank of any of them. A quote is matched in plain words: table pipes, `<br>` tags, `**`/`__` and a leading `#`
  run are left out on both sides, then the text is normalised and case is ignored. Each missed item names its
  closest quote and why (`ranked <r>`, `not found by find`, `not in the text`, `unknown file <id>`). Items with
  no expected quote are counted apart. Exit 1 when no item has one; 2 for a gold file that cannot be read or a
  malformed line (its number named).
- `dialecte standard eval <gold.jsonl> --angles [...]`: the same recall, each question run through the `ask` ladder
  instead of `find` alone (kind `semantic`, no fact read or written, no ask kept, no event): find's own list for
  the whole question first and untouched, then at most 3 slices the angles found in clauses that list does not
  cover, then the linked slices. A question the ladder refuses (an `about` no dialecte declares, a tag of several
  dialectes without `--package`) scores find's own list. The answer adds `added +<n>` (`added` in `--json`): the
  items whose quote only the added slices hold. Run from a package (exit 2 outside one).
- `dialecte standard eval <gold.jsonl> --packs [--effort low|medium|high] [...]`: the recall at 5 and at 10 of the
  slices the round-1 readers are given (the ask ladder; no fact read or written, no ask kept, nothing written):
  reader A in its order, and the slices of A and B together (A1, B1, A2, B2, a slice met twice kept once). The
  answer adds `packs  reader A recall@5 <n>  recall@10 <n>  union recall@5 <n>  recall@10 <n>` (`packs` in `--json`:
  `{ readerA: { recallAt5, recallAt10 }, union: { ... } }`); `--effort` sets the readers (default `medium`), and
  needs `--packs`. Run from a package with a dialecte installed (exit 2 otherwise).
- `dialecte standard eval <gold.jsonl> --reports <asks folder> [...]`: the agreed-wrong rate of recorded asks. The
  asks of the folder whose question equals a gold question are judged by their last readers' round that answered
  (the adjudicator's round is never judged): wrong for a `not-in-text` item the readers did not agree
  `not-in-text`, an item with an answer they agreed `not-in-text`, a gold answer starting yes or no and the other
  verdict, or a value the gold answer does not hold; agreed otherwise; unjudged when no rule decides. The answer
  adds `reports  agreed <n>  wrong <n>  unjudged <n>  rate <n>` (`reports` in `--json`:
  `{ agreed, wrong, unjudged, rate }`); rate is wrong over agreed and wrong, `null` (printed `-`) when nothing is
  judged. Runs outside a package, writes nothing; a folder that does not exist refuses, exit 2.

`show`, `find` and `eval` build the index first when it is missing. Every verb answers exit 2 with how to set
`DIALECTE_STANDARD` when no standard is configured.
