# dialecte run

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Run a script against an in-memory project of the installed dialecte; one structured outcome

```text
run - Run a script against an in-memory project of the installed dialecte; one structured outcome

  dialecte run <script.ts> [--in <file>] [--out <file>] [--prepare] [--expect <file>]
  dialecte run <script.ts> [--seed <n>] [--now <iso>] [--package <name>] [--timeout <ms>] [--json]

  the script's default export gets { project, doc, documentId, dialecte, helpers, utils }; ids
    seeded
  --prepare - stages the first transaction and commits nothing
  --expect - checks a JSON array of { tag, where?, under?, count? }
  Node 22.18+: .ts scripts run through Node's built-in type stripping

exit codes:
  1  the script failed or an expectation was not met
e.g. dialecte run add-part.ts --in assembly.xml --expect expected.json
```

Flags: `--in`, `--out`, `--prepare`, `--expect`, `--seed`, `--now`, `--package`, `--timeout`, `--json`
<!-- /dialecte-reference -->

`dialecte run <script.ts>` runs a script against an in-memory project of the dialecte your project
installs (with `@dialecte/core` 0.8.0 or later) and answers one structured outcome. The script is a
module whose default export receives `{ project, doc, documentId, dialecte, helpers, utils }`; what it
returns is the outcome's `result`.

```ts
// add-part.ts
export default async function addPart({ doc }) {
	const [assembly] = await doc.query.findByAttributes({
		tagName: 'Assembly',
		attributes: { name: 'A1' },
	})
	await doc.transaction(async (tx) =>
		tx.addChild(assembly, { tagName: 'Part', attributes: { name: 'P2' } }),
	)
}
```

```
dialecte run add-part.ts --in assembly.xml --expect expected.json
failed: expectations not met
operations: Assembly +0 ~1 -0, Part +1 ~0 -0
diagnostics: none
expectations: 0 passed, 1 failed
  ✗ expected 3 Part under Assembly[name="A1"], found 2
```

- `--in <file>` imports a file first (an empty document otherwise); its import diagnostics are in the
  outcome. `--out <file>` writes the document once the script ran.
- `--prepare` stages the script's first transaction instead of committing it and stops the script
  there: the records it would write, and what its callback returned (a lifecycle report), nothing
  committed. Any other write is refused and fails the run, even when the script catches the refusal:
  a second transaction, `commit()` on a prepared transaction, a transaction on a document opened
  through `project.openDocument`, the project's own writes (`importFile`, `removeDocument`,
  `undo`, ...) and its raw database (`getDatabaseInstance`). In every mode the runner alone commits:
  `tx.commit`, `tx.finishStaging` and `tx.clearStagedOperations` are refused inside a callback, and a
  transaction nested in another fails with `CONCURRENT_TRANSACTION`. The guarantee covers the API a
  script is handed; a deliberate call around it (`Object.getPrototypeOf(doc).transaction.call(...)`, a
  store reached by other means) is outside it.
- `--expect <file>`: a JSON array of expectations `{ "tag", "where"?, "under"?, "count"? }`, checked on
  the result (on the staged transaction under `--prepare`); each one not met is named with the count
  found. `count: 0` means none, no `count` at least one.
- Deterministic: ids come from a seeded generator (`--seed <n>`, 0 by default), `--now <iso>` freezes
  the clock, both from the moment the script module loads (an id minted at its top level is seeded
  too). The same script, input and seed give the same outcome.
- Operations are counted per record, as each commit merges them: an element created then updated in
  one transaction is one creation.
- A thrown structured error is answered as code, key, detail, `meta` and the element's path from the
  root (`/Root/A/AA_2[2]`); `dialecte explain <code>` says what it means.
- `--json` prints the outcome as data. `--package <name>` names the dialecte when the project depends
  on none or several (`@dialecte/scl/v2019C1`, `@dialecte/core/test`). `--timeout <ms>` (120 s by
  default): the run then answers a timeout and the command exits; called as a library, the script may
  keep running in the caller's process. Exit 0 ok, 1 failed or an expectation not met, 2 usage. The
  script's own console output goes to stderr. A value the script returns that is not JSON (a cycle, a
  BigInt) is given as text with a note.
- Needs Node 22.18 or later: a `.ts` script runs through Node's built-in type stripping, no build step
  (erasable TypeScript only: types, no enums or namespaces).

`dialecte explain <code | key>` reads the error catalogue of the installed core and the error and
diagnostic catalogues the dialecte exports: the message, when it is raised, the usual fix, the docs
page. `--json` for the entries as data; exit 1 when no catalogue knows the code.
