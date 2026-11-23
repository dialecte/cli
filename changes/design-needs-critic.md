### Changed

- **Breaking:** `dialecte lot design --approve` used to approve any recorded design without reading a review. It now refuses (exit 2, nothing written) unless a saved review passes exactly the recorded design. A review is a `*.md` file in the design's folder, or one named with `--verdict`, that holds `Design: <hash prefix>` and `Verdict: READY`. A READY of an earlier revision does not carry over, and a review of the same hash that does not pass it blocks the approval. The refusal names the folder, the hash, the two lines to save, `--verdict` and `--waive`.
- `dialecte lot design --waive` also covers a design recorded on a lot that needs none, which used to stay stuck until approved.

### Added

- `dialecte lot design --approve --verdict <file>` (repeatable) adds review files to those of the design's folder.
- The approved line records `reviews: [{ name, hash }]`, and the lot folder keeps each review it rests on as `design-reviews/<sha256>.md`.
- While a design is not approved, `dialecte lot design <id>` and `--from` print a verdict line, and `--json` holds `verdict`.
