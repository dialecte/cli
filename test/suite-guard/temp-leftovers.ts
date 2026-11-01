/**
 * The leftovers of the suite's temporary folder: what the tests and the commands they spawn made there and
 * did not remove. The suite's global teardown fails the run on any, naming the first ones.
 */
import { readdirSync } from 'node:fs'

import { LEFTOVERS_NAMED } from './temp-leftovers.constants.ts'

/** The names of the entries directly in `folder` (files, folders, links), sorted. */
export function listLeftovers(params: { folder: string }): string[] {
	return readdirSync(params.folder).sort()
}

/**
 * The guard's message for the leftover `names`, in their order: their count, then the first
 * `LEFTOVERS_NAMED` of them, then `and <n> more` when there are others; undefined when there is none.
 */
export function describeLeftovers(params: { names: readonly string[] }): string | undefined {
	const { names } = params
	if (names.length === 0) return undefined
	const noun = names.length === 1 ? 'entry' : 'entries'
	const named = names.slice(0, LEFTOVERS_NAMED).join(', ')
	const more = names.length > LEFTOVERS_NAMED ? ` and ${names.length - LEFTOVERS_NAMED} more` : ''
	return `${names.length} temporary ${noun} left: ${named}${more}`
}
