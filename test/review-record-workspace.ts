/** A scratch store lot whose review rounds write `review.jsonl`, and the reads of it the cases compare. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runLot } from '../src/commands/lot.ts'
import { appendPlanMark } from '../src/lib/plan/plan-marks.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { VALID_BRIEF } from './brief-workspace.constants.ts'
import { SNAPSHOT_TIME } from './late-fixes-workspace.constants.ts'
import { lotWithStory } from './late-fixes-workspace.ts'
import { PLAN_ENTRY_ID, PRIVATE_TEXT, TREE_FILE } from './review-record-workspace.constants.ts'
import { temporaryFolder, writeFiles } from './scratch-repository.ts'

import { vi } from 'vitest'

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

/**
 * A plan holding the entry `PLAN_ENTRY_ID` on the branch of the lot's brief, its repository the lot's worktree, marked
 * done on this machine (a scratch state folder) as `dialecte plan mark` does: the plan that holds the lot.
 */
export function markLotPlan(lot: StoryTarget): void {
	vi.stubEnv('XDG_STATE_HOME', temporaryFolder('review-record-state-'))
	const planPath = join(temporaryFolder('review-record-plan-'), 'plan.md')
	const block = {
		schema: 1,
		repositories: { repo: lot.cwd },
		lots: [
			{
				id: PLAN_ENTRY_ID,
				title: 'the records',
				kind: 'lot',
				scope: { repo: ['src/'] },
				match: { branch: VALID_BRIEF.branch },
			},
		],
	}
	writeFileSync(
		planPath,
		`# The plan\n\n\`\`\`json dialecte-lots\n${JSON.stringify(block)}\n\`\`\`\n`,
	)
	appendPlanMark({ planPath, id: PLAN_ENTRY_ID, by: 'a person' })
}
