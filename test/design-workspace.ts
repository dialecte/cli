/** A scratch store lot for the `lot design` cases, the design file in its repository, and the reads the cases compare. */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import {
	DECLARED_GLOB,
	DESIGN_PATH,
	DESIGN_TEXT,
	DESIGN_TIME,
} from './design-workspace.constants.ts'
import { createStationLot } from './lot-station-workspace.ts'
import { writeFiles } from './scratch-repository.ts'

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
			...(params.declared && {
				'package.json': `${JSON.stringify({ name: 'scratch', dialecte: { risk: { high: [DECLARED_GLOB] } } })}\n`,
			}),
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
