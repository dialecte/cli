### Changed

- **Breaking:** `dialecte lot pr --json` names the change request `changeRequest`, not `pullRequest`: `{ title, body, changeRequest, head, sent }`.
- `landed.json` keeps the change request a lot landed through under `changeRequest`, not `pull`. A `landed.json` written before this keeps reading as landed: it names no change request, so its landed line says the pull request merged without a number.
