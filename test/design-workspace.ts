/** A scratch store lot for the `lot design` cases, the design file in its repository, and the reads the cases compare. */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { recordBaseDeclared } from '../src/lib/design/base-declared.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import {
	DECLARED_GLOB,
	DESIGN_PATH,
	DESIGN_TEXT,
	DESIGN_TIME,
} from './design-workspace.constants.ts'
import { createStationLot } from './lot-station-workspace.ts'
import { git, writeFiles } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { DesignLot } from './design-workspace.types.ts'

/**
 * A working store lot (scope `src/`) whose repository holds the design at `DESIGN_PATH`; with `declared`, its
 * `package.json` declares `DECLARED_GLOB` a shared area, so the lot needs a design. The verbs run from the repository,
 * the main checkout: the lot's worktree is another folder.
 */
export function designLot(
	params: { declared?: boolean; state?: 'working' | 'committed' } = {},
): DesignLot {
	const lot = createStationLot({ state: params.state })
	writeFiles({
		root: lot.cwd,
		files: {
			[DESIGN_PATH]: DESIGN_TEXT,
			...(params.declared && { 'package.json': declaringManifest() }),
		},
	})
	return { ...lot, designFile: realpathSync(join(lot.cwd, DESIGN_PATH)) }
}

/** `lot design <lot's full name> <words...>` from `cwd` (the repository unless given), at `DESIGN_TIME`. */
export function design(params: { lot: DesignLot; words: string[]; cwd?: string }): CommandResult {
	return runLot({
		cwd: params.cwd ?? params.lot.cwd,
		argv: ['design', params.lot.name, ...params.words],
		now: DESIGN_TIME,
	})
}

/** The lines of the lot's `design.jsonl`, each read as JSON; none without the file. */
export function designLinesOf(lot: DesignLot): unknown[] {
	const file = join(lot.lotFolder, STORE_FILES.design)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function lineOf(line) {
			return JSON.parse(line)
		})
}

/** The names of the lot folder's design copies, sorted; none without the folder. */
export function designCopiesOf(lot: DesignLot): string[] {
	const folder = join(lot.lotFolder, STORE_FILES.designCopies)
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** The text of a design copy. */
export function designCopyText(params: { lot: DesignLot; name: string }): string {
	return readFileSync(join(params.lot.lotFolder, STORE_FILES.designCopies, params.name), 'utf8')
}

/**
 * Commits a `package.json` declaring `DECLARED_GLOB` in the lot's repository, records it as the lot's base snapshot,
 * then writes the repository's working `package.json` without it: a main checkout (or a worktree) whose files no
 * longer hold an area its base declares. Returns the commit.
 */
export function baseDeclaringLot(lot: DesignLot): string {
	writeFiles({ root: lot.cwd, files: { 'package.json': declaringManifest() } })
	git({ root: lot.cwd, args: ['add', 'package.json'] })
	git({ root: lot.cwd, args: ['commit', '-qm', 'chore: declare the shared area'] })
	const commit = git({ root: lot.cwd, args: ['rev-parse', 'HEAD'] }).trim()
	recordBaseDeclared({ lotFolder: lot.lotFolder, root: lot.cwd, ref: commit })
	writeFiles({
		root: lot.cwd,
		files: { 'package.json': `${JSON.stringify({ name: 'scratch' })}\n` },
	})
	return commit
}

/** A `package.json` declaring `DECLARED_GLOB` a shared area. */
export function declaringManifest(): string {
	return `${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED_GLOB] } } })}\n`
}
