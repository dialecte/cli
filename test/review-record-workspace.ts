/** A scratch store lot whose review rounds write `review.jsonl`, and the reads of it the cases compare. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { SNAPSHOT_TIME } from './late-fixes-workspace.constants.ts'
import { lotWithStory } from './late-fixes-workspace.ts'
import { PRIVATE_TEXT, TREE_FILE } from './review-record-workspace.constants.ts'
import { writeFiles } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { StoryTarget } from './late-fixes-workspace.types.ts'
import type { StationLot } from './lot-station-workspace.types.ts'

/** A store lot whose worktree holds `TREE_FILE`, not yet added to git. */
export function reviewedLot(): StationLot {
	const lot = lotWithStory([])
	writeFiles({ root: lot.cwd, files: { [TREE_FILE]: 'export const reviewed = 1\n' } })
	return lot
}

/** `lot <verb> <folder> <words...>` from the lot's worktree; the lot's own folder unless another is given. */
export function lotVerb(params: {
	lot: StoryTarget
	verb: string
	words: string[]
	folder?: string
}): CommandResult {
	return runLot({
		cwd: params.lot.cwd,
		argv: [params.verb, params.folder ?? params.lot.lotFolder, ...params.words],
		now: SNAPSHOT_TIME,
	})
}

/** A finding of round 1 at `at`, its text the private one (or the one given), in the lot's folder or another. */
export function finding(params: {
	lot: StoryTarget
	severity: string
	at: string
	text?: string
	folder?: string
}): CommandResult {
	return lotVerb({
		lot: params.lot,
		verb: 'finding',
		folder: params.folder,
		words: [
			'--round',
			'1',
			'--severity',
			params.severity,
			'--at',
			params.at,
			params.text ?? PRIVATE_TEXT,
		],
	})
}

/** The text of the folder's `review.jsonl`; empty without the file. */
export function reviewTextOf(folder: string): string {
	const file = join(folder, STORE_FILES.review)
	return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** The rows of the folder's `review.jsonl`, each line read as JSON; none without the file. */
export function reviewRowsOf(folder: string): unknown[] {
	return reviewTextOf(folder)
		.split('\n')
		.filter(Boolean)
		.map(function rowOfLine(line) {
			return JSON.parse(line)
		})
}
