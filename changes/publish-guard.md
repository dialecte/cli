### Fixed

- The push to main publishes only from the commit that changes the version, and never a version npm already has: `publish.yml` compares the version with the one of the commit the push started from and asks npm for that exact version, instead of publishing whenever the version differs from npm's latest (a lower version or a re-run of an older commit published too). `publish.yml` has no concurrency group any more, so the run of the version-changing push is never replaced by a later push's pending run.
- Every workflow job runs on a pinned runner image (`ubuntu-24.04`, `windows-2025`), never a `*-latest` one.
