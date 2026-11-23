### Fixed

- `dialecte lot review`'s approve line names every refusal `dialecte lot approve` gives, read by the same reader: a stacked lot whose parent is not queued or merged, a host without stacks, and a change request text that does not render are no longer shown as ready.
- `dialecte lot approve` names every reason at once (the text checked once a stacked lot's route stands), where it stopped at the first group that refused.
- A text that does not render, and a checks read the host refuses, read as the refused line of `lot approve`: `<lot> not approved: <reason>; nothing recorded, nothing queued`.
