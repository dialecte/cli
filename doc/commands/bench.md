# dialecte bench

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Measure the type-instantiation cost of the change against its base (tsc --extendedDiagnostics); --check to gate it

```text
bench - Measure the type-instantiation cost of the change against its base (tsc --extendedDiagnostics); --check to gate it

  dialecte bench [--check] [--base <ref>] [zero-config flags]

  the head (the working tree) against the base it goes onto, measured fresh: --base <ref> (its
    merge-base with HEAD), else DIALECTE_CHANGE_BASE (the base CI and contrib hand: a revision read
    as its commit), else the order rules shares (the lot base of the store lot read from git, else
    the merge-base with the base branch, HEAD itself on the base branch, else the last release tag
    <name>@v<version>); nothing is stored, no baseline is written
  the base is exported at its commit into a scratch folder (no worktree), its file: siblings linked,
    its node_modules the head's when they install its lock, else npm ci; both trees are measured
    with the head's compiler and the head's probe generator, one run per scenario, and the base
    removed after
  tsgo (TypeScript 7+) runs with one checker (--checkers 1), so a file set always gives the same
    count
  each scenario within 5% of its base, a gain, over, new or gone; a row over is explained by a line
    the change adds to its changelog fragment (- Type cost: <why>) or no-entry note (Type cost:
    <why>), else --check fails
  no base outside CI and outside a lot: the head alone, nothing compared; dialecte bench --base
    <name>@v<x.y.z> reports the cost since a release

exit codes:
  1  --check: a scenario over 5% of its base that no type-cost line of the change explains
  2  refused: a base that cannot be read or is no commit, a lot with no base, no base in CI with --check, a head whose node_modules does not install its lock, a head with no version, a base tree that cannot be made or measured, method discovery failing at the head with --check
e.g. dialecte bench --check
```

Flags: `--check`, `--base`, `--namespace`, `--entry`, `--constants-dir`, `--out`, `--version`, `--tsconfig`, `--format-config`, `--no-format`
<!-- /dialecte-reference -->
