import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { LOTS_KEEPING_NOTHING } from '../store/store.constants.ts'
import { WORKTREE_IDLE_MS, WORKTREE_INDEX_PATTERN, WORKTREE_TEXTS } from './health.constants.ts'
import { timeOf } from './record-run.ts'

import type { HealthFinding, HealthLot, HealthRepository, HealthWorktree } from './health.types.ts'

/**
 * The registered worktrees no open lot holds and nobody touched for a day, and the registered worktrees whose folder
 * is gone: one amber finding per repository, whatever the count (a state to clean up, not a run that waits), with the
 * committed hand-overs not yet closed named in its detail. A lot holds a worktree when its identity names it and it has
 * a state that keeps something (a damaged lot holds its worktree). A repository read with no worktrees has none.
 */
export function findIdleWorktrees(params: {
	repository: HealthRepository
	now: Date
}): HealthFinding[] {
	const { repository, now } = params
	const worktrees = repository.worktrees ?? []
	const held = heldPathsOf({ lots: repository.lots })
	const idle = worktrees
		.filter((worktree) => !worktree.gone && !held.has(worktree.path))
		.filter((worktree) => idleMsOf({ worktree, now }) > WORKTREE_IDLE_MS)
	const gone = worktrees.filter((worktree) => worktree.gone).length
	if (idle.length === 0 && gone === 0) return []
	return [
		{
			rule: 'worktrees',
			severity: 'amber',
			repository: repository.name,
			at: now.toISOString(),
			text: idleTextOf({ idle, now }),
			detail: [
				...committedLinesOf({ idle }),
				...(gone === 0
					? []
					: [
							fillMessage({
								template: gone === 1 ? WORKTREE_TEXTS.goneOne : WORKTREE_TEXTS.gone,
								values: { count: String(gone) },
							}),
						]),
			],
		},
	]
}

/** The worktree paths the open lots' identities name, and those of the lots kept on purpose (KEEP 3.5.5). */
function heldPathsOf(params: { lots: readonly HealthLot[] }): Set<string> {
	const held = new Set<string>()
	for (const lot of params.lots) {
		if (lot.worktree === undefined || lot.state === undefined) continue
		if (lot.kept !== true && LOTS_KEEPING_NOTHING.some((closed) => closed === lot.state)) continue
		held.add(lot.worktree)
	}
	return held
}

function idleMsOf(params: { worktree: HealthWorktree; now: Date }): number {
	return params.now.getTime() - timeOf(params.worktree.activeAt)
}

/** The count and the least recently touched idle worktree, or `no idle worktree`. */
function idleTextOf(params: { idle: readonly HealthWorktree[]; now: Date }): string {
	const { idle, now } = params
	if (idle.length === 0) return WORKTREE_TEXTS.noneIdle
	const oldest = idle.reduce((found, worktree) =>
		timeOf(worktree.activeAt) < timeOf(found.activeAt) ? worktree : found,
	)
	return fillMessage({
		template: idle.length === 1 ? WORKTREE_TEXTS.idleOne : WORKTREE_TEXTS.idle,
		values: {
			count: String(idle.length),
			name: oldest.name,
			duration: formatDuration(idleMsOf({ worktree: oldest, now })),
		},
	})
}

/** A line per idle worktree whose hand-over is committed and not closed, by name, with its `lot close` command. */
function committedLinesOf(params: { idle: readonly HealthWorktree[] }): string[] {
	return params.idle
		.filter(
			(worktree) =>
				worktree.handover?.state === 'committed' && worktree.handover.closed === undefined,
		)
		.map((worktree) => worktree.name)
		.sort()
		.map(function lineOf(name) {
			const index = WORKTREE_INDEX_PATTERN.exec(name)?.[0]
			return index === undefined
				? fillMessage({ template: WORKTREE_TEXTS.committedNotClosedNoIndex, values: { name } })
				: fillMessage({ template: WORKTREE_TEXTS.committedNotClosed, values: { name, index } })
		})
}
