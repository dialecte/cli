### Fixed

- `tdd green` runs every case of the changed test files and of the test files moved with their bytes, and refuses
  every case that does not pass, whatever its proof: a red, an unchanged case, an accepted one, one revised by a
  case or file entry, or the base's case of a moved file. A case proven without a red records its proof again when
  its last run was at another production or at other bytes of its test file.
- The commit hook's tdd step refuses a commit holding a case of the lot that is not proven passing at the production
  committed, whatever its proof: `stale` (proven at another production) or `refused` (its last run refused it), both
  naming `dialecte tdd green`, or `unproven` (a case moved into a file a red ran before the move) naming
  `dialecte tdd red`. A case skipped as written is never listed.
- A test file git reports renamed is read at the base at its old path: its untouched cases stay `unchanged`, a
  `moved` entry may name that old path, a `gone` entry naming it is refused (a case removed in the rename is gone at
  the new path), and a file-level `moved` entry on a pair tdd matches itself is listed `not needed`, never `unused`.

A lot in flight that holds a test file moved with its bytes, a case proven without a red before a production change,
or such a case in a test file edited since its proof, needs one `dialecte tdd green` before its next commit. One
holding a case moved into a file a red ran before the move (the hook now lists it `unproven`) needs one
`dialecte tdd red`. A `gone` entry naming the old path of a git rename is now refused before any run: drop it with
`dialecte lot gone --remove <old path>` and declare a case removed in the rename as gone at the new path.
