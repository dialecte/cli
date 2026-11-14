import { STANDARD_KEY_DROPPED_PATTERN, STANDARD_KEY_FORM } from './ask.constants.ts'

/** The key of a standard name or folder id: NFKC, lowercase, only `[a-z0-9]` kept. */
export function standardKeyOf(name: string): string {
	return name.normalize(STANDARD_KEY_FORM).toLowerCase().replace(STANDARD_KEY_DROPPED_PATTERN, '')
}
