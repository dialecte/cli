/** The landing record of a lot (`landing.json` in its store folder), read with files only. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LANDING_FILE } from './land-lot.constants.ts'

import type { LandingRecord } from './land-lot.types.ts'

/**
 * The landing record of the lot whose store folder is `lotFolder`; undefined without one, or one that cannot be read.
 *
 * @intent tell which pull request a lot lands through
 * @internal
 */
export function readLanding(params: { lotFolder: string }): LandingRecord | undefined {
	const path = join(params.lotFolder, LANDING_FILE)
	if (!existsSync(path)) return undefined
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as LandingRecord
		return typeof parsed.number === 'number' && typeof parsed.branch === 'string'
			? parsed
			: undefined
	} catch {
		return undefined
	}
}
