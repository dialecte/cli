/** `landed.json`: the fact that a lot merged, written once by a verb that acts, read by every reader of lot state. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { replaceWhole } from '../store/publish.ts'
import {
	LANDED_COMMIT_PATTERN,
	LANDED_DAMAGE,
	LANDED_FILE,
	LANDED_SCHEMA,
} from './landed-record.constants.ts'
import { LANDING_EVIDENCES } from './landing-state.constants.ts'

import type { LandedDamage, LandedFact } from './landed-record.types.ts'
import type { LandingEvidence } from './landing-state.types.ts'

/**
 * Writes the lot's landed fact whole (a crash never leaves half of it).
 *
 * @intent record once that a lot merged
 * @internal
 */
export function writeLanded(params: { lotFolder: string; fact: LandedFact }): void {
	replaceWhole({
		path: join(params.lotFolder, LANDED_FILE),
		text: `${JSON.stringify(params.fact, null, 2)}\n`,
	})
}

/**
 * The lot's landed fact; its damage when the file does not read as one; undefined when there is none.
 *
 * @intent read whether a lot is recorded merged
 * @internal
 */
export function readLanded(params: { lotFolder: string }): LandedFact | LandedDamage | undefined {
	const path = join(params.lotFolder, LANDED_FILE)
	if (!existsSync(path)) return undefined
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return damaged('no JSON')
	}
	const reason = faultOf(value)
	return reason === undefined ? (value as LandedFact) : damaged(reason)
}

/** Why `value` is no landed fact; undefined when it is one. */
function faultOf(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'no object'
	const fact = value as Record<string, unknown>
	if (fact.schema !== LANDED_SCHEMA) return `schema is not ${LANDED_SCHEMA}`
	if (!LANDING_EVIDENCES.includes(fact.how as LandingEvidence))
		return `how is none of ${LANDING_EVIDENCES.join(', ')}`
	if (typeof fact.tip !== 'string' || !LANDED_COMMIT_PATTERN.test(fact.tip))
		return 'tip is no commit'
	if (typeof fact.base !== 'string' || fact.base === '') return 'base is no branch'
	if (typeof fact.at !== 'string' || Number.isNaN(Date.parse(fact.at))) return 'at is no time'
	if (fact.pull !== undefined && !isPull(fact.pull)) return 'pull is no pull request'
	return undefined
}

/** A pull request as the fact keeps it: its number and url. */
function isPull(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false
	const pull = value as Record<string, unknown>
	return typeof pull.number === 'number' && typeof pull.url === 'string'
}

/** The damage of a landed.json, naming why. */
function damaged(reason: string): LandedDamage {
	return { damage: fillMessage({ template: LANDED_DAMAGE, values: { reason } }) }
}
