### Fixed

- `rules` without a gate base, `contrib`'s rules row and the empty-tree gate base (`gate --release`) judge a store lot against its lot base read from git, its fork point from the base branch, or from its parent's line while the lot it was started on is open, instead of the base recorded at `lot start`. A lot rebased onto a newer main, or one that merged main, no longer counts main's lines since its cut as its own, and a stacked lot no longer counts its parent's. The base line still names the lot (`rules: base <sha> (the lot <name>)`).
- A lot base that cannot be read, such as a stack parent the store does not hold, gives no base and the line `rules: no base (<why>)`, never the base branch's merge-base, which would take in the parent's commits.
- A lot with no base branch found and none configured takes the release tag, else no base: HEAD is no lot base, so its committed lines count as added.
- `lot risk`, and the risk class `lot start` and the views derive for a store lot, are derived against the lot base, so a file main added since the cut is no reason; the base recorded at the start is used only when no lot base reads.
