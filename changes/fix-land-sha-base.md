### Fixed

- `dialecte lot land`: a lot whose brief named its base by a commit (a sha) was refused as a stacked lot. A lot is now cut from the base branch when that branch holds the commit it was cut from, however the brief named it; a lot cut from a commit the base branch does not hold is still refused as a stack.
