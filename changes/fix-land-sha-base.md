### Fixed

- `dialecte lot land`: a lot whose brief named its base by a commit (a sha) was refused as a stacked lot. A lot is now cut from the base branch when that branch holds the commit it was cut from, however the brief named it; a lot cut from a commit the base branch does not hold is still refused as a stack. A lot cut from a lot that merged without a squash now lands alone (its cut commit is on the base branch); after a squash merge it is still refused, since it carries the parent's commits. The refusal names the cut commit.
