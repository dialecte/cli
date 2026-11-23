/** The landing record of a lot (`landing.json` in its store folder), read with files only. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LANDING_FILE } from './land-lot.constants.ts'

import type { LandingRecord } from './land-lot.types.ts'

/**
 * The landing record of the lot whose store folder is `lotFolder`; undefined without one, one that cannot be read, or
 * one holding only the head a push recorded before any change request was known.
 *
 * @intent tell which change request a lot lands through
 * @internal
 */
export function readLanding(params: { lotFolder: string }): LandingRecord | undefined {
	const parsed = readRawLanding(params)
	if (
		parsed === undefined ||
		typeof parsed.number !== 'number' ||
		typeof parsed.branch !== 'string'
	)
		return undefined
	return parsed as LandingRecord
}

/**
 * `landing.json` as written, an object; undefined without one or one that cannot be read.
 *
 * @intent read a landing record before its fields are checked
 * @internal
 */
export function readRawLanding(params: { lotFolder: string }): Record<string, unknown> | undefined {
	const path = join(params.lotFolder, LANDING_FILE)
	if (!existsSync(path)) return undefined
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined
	} catch {
		return undefined
	}
}
