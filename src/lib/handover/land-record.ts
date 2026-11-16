/** The landing record of a lot (`landing.json` in its store folder), read with files only. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LANDING_FILE } from './land-lot.constants.ts'

import type { LandingRecord } from './land-lot.types.ts'

/**
 * The landing record of the lot whose store folder is `lotFolder`; undefined without one, one that cannot be read, or
 * one holding only the heads a rebase replaced before any pull request was known.
 *
 * @intent tell which pull request a lot lands through
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
	return {
		...(parsed as LandingRecord),
		replaced: replacedOf(parsed),
	}
}

/**
 * The heads the rebases of the lot's landings on `branch` replaced, oldest first (`replaced` in `landing.json`): none
 * without a record, for another branch, or a record written before they were kept.
 *
 * @intent tell which commits a lot's landing rebased away
 * @internal
 */
export function readReplacedHeads(params: { lotFolder: string; branch: string }): string[] {
	const parsed = readRawLanding(params)
	return parsed !== undefined && parsed.branch === params.branch ? replacedOf(parsed) : []
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

/** The record's `replaced` heads, the strings only; none when it holds no list. */
function replacedOf(parsed: Record<string, unknown>): string[] {
	const replaced = parsed.replaced
	return Array.isArray(replaced)
		? replaced.filter((head): head is string => typeof head === 'string')
		: []
}
