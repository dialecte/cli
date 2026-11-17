# dialecte api

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Find a method by what you need (find), read its contract (show)

```text
api - Find a method by what you need (find), read its contract (show)

  dialecte api find "<need>" [--source] [--package <name>] [--limit 5] [--json]
  dialecte api show <path> [--package <name>] [--json]
  dialecte api show <file>#<name> [--json]

  find - the methods whose intents, summary or name match the need, best first
  show - signature, summary, intents, routes, declaration, example (info.of, tx.addChild)
  --source - also the exported functions of the own package src/ (show src/lib/git.ts#readGit),
             cached in the git folder

e.g. dialecte api find "add a child element"
```

Verbs: `find`, `show`

Flags: `--source`, `--package`, `--limit`, `--json`
<!-- /dialecte-reference -->

- `dialecte api find "<need>" [--package <name>] [--limit 5]` searches the `api.json` every installed
  package ships next to its skill's `api.md` (written by `skills generate`): one line per method - route,
  `q | tx | doc | project | export`, the intent that matched, the package. Ranking, in order: how many words of the
  need the method's `@intent` tags hold, then its summary, then its name - one intent word beats any number
  of summary words; stop words dropped, word forms reduced to a light stem (`copied`, `copies`, `copying`
  → `copy`); ties put a dialecte's verb before core's, then sort by route.
- `dialecte api find --source "<need>"` also searches the exported functions of the package you are in (the
  nearest `package.json` at or above the folder): every exported function declaration, arrow or function-expression
  `const` of its tracked and untracked-not-ignored `src/**/*.ts` files, tests left out, read from the syntax alone
  (a local `export { name }` counts, a re-export does not; an overload set is one function, at its first overload).
  A source row prints `<file>#<name>  source  <file>:<line>`, then the intent that matched, its summary or
  `(no summary)`. A function without `@intent` ranks on the words its summary and name hold together; at equal
  hits an indexed method comes first, and a function the package's `api.json` already lists is shown once, by its
  route. A file that does not parse is left out with a `note:` line. What each file holds is cached by its content
  hash in `dialecte-source-index.json` in the worktree's git folder, shared by the packages of the repository and
  rebuilt by another cli version (outside a git work tree, every file is read).
  `dialecte api show <file>#<name>` (`src/lib/git.ts#readGit`) prints one source function's signature, summary,
  intents and declaration, with or without `--source`; an unknown name in a file that was read names up to five of
  that file's functions, the closest first; an unknown file names the closest source paths, or the
  `api find --source` call that lists them.
- `dialecte api show <path>` (`info.of`, `doc.query.info.of`, `tx.reference.applyUuidRemap`): signature as
  declared, summary, intents, other routes, where it is declared in its repository, and one call: the
  method's JSDoc `@example` when it is short and calls the method, else a call from the test next to it
  whose arguments a caller can copy (written-out values first; never a test case field, a fixture constant
  or a cast). No such call, no example.
