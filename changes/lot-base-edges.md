### Fixed

- A lot whose parent was squash-merged and later edited on the base branch no longer refuses its base after merging the base branch, once the parent's landing is recorded: the base's content wins for the lines the parent changed, and only the lot's own commits replay when it lands. Before the parent's landing is recorded, the refusal names how to record it.
- `dialecte lot land` of a lot started on an open parent that merged the base branch no longer refuses its title for a version the base branch set.
- The change request body of a lot started on another lists only its own changed files and changelog fragments, as `dialecte lot describe` and `lot land` both read it from the lot's own base.
- When git cannot compare the lines a lot holds, the refusal says so instead of reading as a lot that shares no commit with its base; when git prints nothing while joining them, the refusal names what git left out instead of "exit 0".
