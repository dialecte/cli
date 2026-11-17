# dialecte ci

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The CI files shipped as a template: write them into the package, report drift, run the publish guard

```text
ci - The CI files shipped as a template: write them into the package, report drift, run the publish guard

  dialecte ci sync [--dry-run]
  dialecte ci check
  dialecte ci publish-decision

  the template: the workflows (ci.yml, publish.yml and their reusables),
    .github/pull_request_template.md, .nvmrc and changes/.gitkeep; ci.yml selects its jobs from
    package.json: type-perf with a type-bench:check script, docs with a doc:build script, the
    Playwright install with a playwright dependency; a build script is required (publish.yml builds
    the package)
  the repository owns .github/workflows/_test.yml (ci.yml calls it: a workflow_call trigger; a mode
    input of type string gets pr on a pull request, full in the merge queue) and every other
    workflow file the template does not name; they are listed, never written
  sync - writes what differs from the template, deletes the retired files (pr.yml, _lint.yml) and
         the reusables no job of the package calls; an update prints its diff; a second run is in
         step; --dry-run writes nothing
  check - the same comparison, read-only: each drifted file with its diff, then the fix; the
          template's _check.yml runs it on every pull request
  publish-decision - the publish guard of the push to main (BEFORE, GITHUB_OUTPUT): publish above
                     npm's latest, a pre-release under next, a missing release tag pushed alone, a
                     failed npm query refused
  publish.yml keeps its name and its push trigger: npm trusted publishing names the file

exit codes:
  1  sync: the own _test.yml is missing or breaks the contract (the managed files are written); check: drift or a broken contract; publish-decision: refused, or BEFORE, GITHUB_OUTPUT, package.json or git failed
  2  usage, no package.json, a package.json with no name or no build script
e.g. dialecte ci sync --dry-run
```

Verbs: `sync`, `check`, `publish-decision`

Flags: `--dry-run`
<!-- /dialecte-reference -->

Every Dialecte package runs the same CI: the pull request and the merge queue run `ci.yml`, whose one required check
is `ci-ok`; the queue's merge to main runs `publish.yml`, which builds, publishes a changed version and tags it. The
cli ships these files as a template, so a package stays in step with the cli version it pins: a bump of the pin runs
`dialecte ci sync` and commits what it writes in the same change; `_check.yml` runs `dialecte ci check` on every pull
request, so a hand edit of a written file, or a bump without the sync, fails CI.

What differs between packages is read, never configured: the jobs come from the scripts the package.json already
has, the Playwright install from its dependencies, the `mode` passed to the tests from the package's own
`_test.yml`. In the cli's own repository the workflows run the cli from its sources (`node src/cli.ts`); everywhere
else they run the installed devDependency (`npx dialecte`).

`sync` deletes only the files it knows: the retired `pr.yml` and `_lint.yml`, and the template's own reusables no job
of the package calls. Any other file under `.github/workflows/` is listed as the repository's own and left as it is.

What stays by hand, per repository: the repository settings and ruleset (the merge queue on main, `ci-ok` the only
required check, one entry per merge: the publish decision relies on it), and npm trusted publishing, which names
`publish.yml` - the template never renames that file nor changes its trigger.
