import { SHORT_HASH_LENGTH } from './health.constants.ts'

import type { CheckKey } from '../gate-records/gate-records.types.ts'

/** The first characters of a hash, as a finding prints it. */
export function shortHash(hash: string): string {
	return hash.slice(0, SHORT_HASH_LENGTH)
}

/** A check key's hashes, shortened, as the finding templates name them (`tree`, `lock`, `command`, `linked`). */
export function keyValues(key: CheckKey | undefined): Record<string, string> {
	return {
		tree: shortHash(key?.tree ?? ''),
		lock: shortHash(key?.lockHash ?? ''),
		command: shortHash(key?.commandHash ?? ''),
		linked: shortHash(key?.linked ?? ''),
	}
}
