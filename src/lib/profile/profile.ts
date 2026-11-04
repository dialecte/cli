/** The profile a package declares in its package.json, the way every command that reads it resolves it. */
import { readPackageJson } from '../package-json.ts'
import { DEFAULT_PROFILE, INVALID_PROFILE, PROFILES } from './profile.constants.ts'

import type { Profile } from './profile.types.ts'

/** `"dialecte": { "profile" }` of the package.json at `root`: the default when absent, a refusal when no profile. */
export function readProfile(root: string): Profile {
	const declared: unknown = readPackageJson(root).dialecte?.profile
	if (declared === undefined) return DEFAULT_PROFILE
	const profile = PROFILES.find((known) => known === declared)
	if (!profile) throw new Error(INVALID_PROFILE.replace('{value}', JSON.stringify(declared)))
	return profile
}
