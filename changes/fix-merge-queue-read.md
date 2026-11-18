### Fixed

- Every pull request read failed (`Unknown JSON field: "isInMergeQueue"`), so `dialecte lot land`, `lot approve`, `lot review` and `lot close` could not reach the host: `gh pr view` has no merge-queue field. Whether a pull request is queued (auto-merge on, or in the merge queue) is now read through one GraphQL query, only where it decides: `lot land`'s check before its push and `lot approve`'s stack parent. The fields asked of `gh pr view` are held to the list gh itself prints, pinned with its version, by a test.
