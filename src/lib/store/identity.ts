/** The identity of a lot (`identity.json`): published last when the lot folder is built, never rewritten. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FILES } from './store.constants.ts'

import type { LotIdentity } from './store.types.ts'

/** The identity of a lot folder; undefined when `identity.json` is absent or does not parse. */
export function readIdentity(params: { lotFolder: string }): LotIdentity | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(join(params.lotFolder, STORE_FILES.identity), 'utf8'))
	} catch {
		return undefined
	}
	if (typeof parsed !== 'object' || parsed === null) return undefined
	if (typeof (parsed as Partial<LotIdentity>).name !== 'string') return undefined
	return parsed as LotIdentity
}
