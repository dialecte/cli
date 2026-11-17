### Fixed

- `dialecte lot land`: a lot whose hand-over entry is committed, or a branch holding no commit beyond origin's base, is refused before the lot's hand-over entry is registered: a refused landing leaves no pending entry behind, nor rewrites an existing (abandoned) one back to pending. The committed answer is read from the registry without writing.
