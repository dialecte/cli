import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { PackageJson } from '../src/lib/package-json.types.ts'
import type { LotIdentity } from '../src/lib/store/store.types.ts'

/**
 * Where a lot's branch stands in a scratch repository: fast-forwarded into `main`, merged into it by a merge commit,
 * not merged, never given a commit, deleted after the merge, merged while the only branch is `trunk`, merged into
 * `release` only (the package.json names it), reset to a commit behind its base (the base is a later commit of `main`).
 */
export type ProbeShape =
	| 'fast-forward'
	| 'merge-commit'
	| 'unmerged'
	| 'no-commit'
	| 'branch-gone'
	| 'only-trunk'
	| 'release-only'
	| 'behind-base'

/** A scratch repository, the identity of a lot whose base is the commit its branch started from, and one of its hand-over entries. */
export type ProbeScene = {
	root: string
	identity: LotIdentity
	entry: StoreEntry
	packageJson: PackageJson
}
