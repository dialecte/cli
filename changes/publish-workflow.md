### Fixed

- The cli's release publishes again: the push to main builds, publishes to npm and tags from `.github/workflows/publish.yml`, the workflow file npm trusted publishing names; `ci.yml` runs the checks of pull requests and the merge queue only (install, build, the suite in shards, lint, `ci-ok`), both over the same reusable workflows.
