### Changed

- The cli's CI is one workflow (`ci`) for every event: a pull request and the merge queue (`merge_group`) run every check, the full suite in four shards; a push to `main` (the queue's merge of a commit it already tested) builds and publishes, never tests again. One job, `ci-ok`, is green only when every check of the run passed: the only check `main`'s ruleset requires. A new push of a pull request cancels the run it supersedes.
