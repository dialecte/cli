import type { Profile } from './profile.types.ts'

/** Every value `"dialecte": { "profile" }` may hold. */
export const PROFILES: readonly Profile[] = ['contributor', 'consumer']

/** The profile of a package that declares none. */
export const DEFAULT_PROFILE: Profile = 'consumer'

/** The refusal of a value that is no profile; `{value}` is the value as JSON. */
export const INVALID_PROFILE =
	'dialecte.profile: {value} is not a profile; profiles: contributor, consumer'
