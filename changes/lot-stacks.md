### Added

- `dialecte lot start <brief.json> --on <lot>`: a lot starts on another open lot of the same repository (a stack). Its branch is cut at the parent's branch tip, `stack.json` in its folder records the parent and that tip, and the parent's scope is its base, never an overlap (every other open lot's still is). A parent that is unknown, damaged, not working or ready, of another repository or without its branch is refused before anything is written.
- `dialecte lot land` of a stacked lot: its pull request is based on the parent's branch and its body's new "Depends on" part names the parent's pull request (`not recorded` for a lot not stacked). With the host's stacks (`gh stack`), it is linked on the parent's and queued as a stack (`gh stack merge`, never auto-merge); without, a note says why and it queues only after the parent merged. It is rebased onto the parent's new tip when the parent moved, and off the parent's commits once the parent merged (its pull request retargeted to the base), or, as a native stack, follows the host's rewrite of its branch. A conflict names its files, the rebase undone, nothing pushed, exit 2.
- `dialecte lot status` and the hand-over card of a stacked lot: a `stack` line, `on <parent> (#<pull request>, <state>)`.

### Changed

- The pull request template gains a `<!-- dialecte:depends -->` part, which `lot pr` and `lot land` require.
