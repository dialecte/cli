/** A semver version for ordering: major, minor and patch, and the pre-release identifiers (none for a release). */
export type SemVer = {
	core: readonly [number, number, number]
	prerelease: readonly string[]
}

/** The lower bound of a range's alternative: a version, none (it admits anything below), or no semver range. */
export type LowerBound =
	| { kind: 'version'; version: string }
	| { kind: 'none' }
	| { kind: 'invalid' }
