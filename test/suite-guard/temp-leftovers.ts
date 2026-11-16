/**
 * The leftovers of the suite's temporary folder: what the tests and the commands they spawn made there and
 * did not remove. The suite's global teardown fails the run on any, naming the first ones, the test that made
 * each (recorded by `temporaryFolder`), the first paths it holds and the processes still holding it (what wrote
 * into it after its test).
 */
import { appendFileSync, existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { holdersOf } from './temp-holders.ts'
import {
	LEFTOVER_PATHS_NAMED,
	LEFTOVERS_NAMED,
	ORIGIN_SEPARATOR,
} from './temp-leftovers.constants.ts'

import type { HoldersReader, Leftover } from './temp-leftovers.types.ts'

/** The names of the entries directly in `folder` (files, folders, links), sorted. */
export function listLeftovers(params: { folder: string }): string[] {
	return readdirSync(params.folder).sort()
}

/** Appends to `file` the line saying the test `origin` made the entry `name`. */
export function recordOrigin(params: { file: string; name: string; origin: string }): void {
	appendFileSync(params.file, `${params.name}${ORIGIN_SEPARATOR}${params.origin}\n`)
}

/** The test that made each entry, read from the origins files in `folder` (none when it is missing). */
export function readOrigins(params: { folder: string }): Map<string, string> {
	const origins = new Map<string, string>()
	if (!existsSync(params.folder)) return origins
	for (const file of readdirSync(params.folder).sort())
		for (const line of readFileSync(join(params.folder, file), 'utf8').split('\n')) {
			const separator = line.indexOf(ORIGIN_SEPARATOR)
			if (separator > 0) origins.set(line.slice(0, separator), line.slice(separator + 1))
		}
	return origins
}

/**
 * The leftover `name` of `folder`: the test that made it, from `origins`, the first paths it holds and the processes
 * holding it.
 */
export function leftoverOf(params: {
	folder: string
	name: string
	origins: ReadonlyMap<string, string>
	/** Default: `holdersOf` (/proc, else lsof). */
	readHolders?: HoldersReader
}): Leftover {
	const entry = join(params.folder, params.name)
	const origin = params.origins.get(params.name)
	const holds = innermostPaths({ entry })
	const holders = (params.readHolders ?? holdersOf)({ path: entry })
	return origin === undefined
		? { name: params.name, holds, holders }
		: { name: params.name, origin, holds, holders }
}

/**
 * The guard's message for the `leftovers`, in their order: their count, then the first `LEFTOVERS_NAMED` of them,
 * each with the test that made it, what it holds and who holds it when known, then `and <n> more` when there are others;
 * undefined when there is none.
 */
export function describeLeftovers(params: { leftovers: readonly Leftover[] }): string | undefined {
	const { leftovers } = params
	if (leftovers.length === 0) return undefined
	const noun = leftovers.length === 1 ? 'entry' : 'entries'
	const named = leftovers.slice(0, LEFTOVERS_NAMED).map(describeLeftover).join(', ')
	const more =
		leftovers.length > LEFTOVERS_NAMED ? ` and ${leftovers.length - LEFTOVERS_NAMED} more` : ''
	return `${leftovers.length} temporary ${noun} left: ${named}${more}`
}

/** `name`, then in brackets `made by <test>`, `holds <paths>` and `open in <processes>` when known. */
function describeLeftover(leftover: Leftover): string {
	const details = [
		...(leftover.origin === undefined ? [] : [`made by ${leftover.origin}`]),
		...(leftover.holds.length === 0 ? [] : [`holds ${leftover.holds.join(', ')}`]),
		...(leftover.holders.length === 0 ? [] : [`open in ${leftover.holders.join(', ')}`]),
	]
	return details.length === 0 ? leftover.name : `${leftover.name} (${details.join('; ')})`
}

/**
 * The first `LEFTOVER_PATHS_NAMED` innermost paths under `entry` (files, links, empty folders), relative to it and
 * sorted; none for a file or a link.
 */
function innermostPaths(params: { entry: string }): string[] {
	if (!lstatSync(params.entry).isDirectory()) return []
	return innermostUnder({ folder: params.entry, root: params.entry })
}

/** The innermost paths under `folder`, depth first in name order, at most `LEFTOVER_PATHS_NAMED` of them. */
function innermostUnder(params: { folder: string; root: string }): string[] {
	const names = readdirSync(params.folder).sort()
	if (names.length === 0)
		return params.folder === params.root ? [] : [`${relative(params.root, params.folder)}/`]
	return names.reduce<string[]>(function addPaths(found, name) {
		if (found.length >= LEFTOVER_PATHS_NAMED) return found
		const path = join(params.folder, name)
		const paths = lstatSync(path).isDirectory()
			? innermostUnder({ folder: path, root: params.root })
			: [relative(params.root, path)]
		return [...found, ...paths].slice(0, LEFTOVER_PATHS_NAMED)
	}, [])
}
