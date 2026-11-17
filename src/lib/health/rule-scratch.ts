import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { SCRATCH_LEAK_MS, SCRATCH_REPOSITORY, WORKTREE_TEXTS } from './health.constants.ts'
import { timeOf } from './record-run.ts'

import type { HealthFinding, ScratchFolder } from './health.types.ts'

/**
 * The scratch folders of the cli left in the temporary folder for longer than their budget: one amber finding naming
 * the oldest, its detail every leaked path oldest first; none when no folder leaked.
 */
export function findLeakedScratch(params: {
	folders: readonly ScratchFolder[]
	now: Date
	/** Whether a process is alive: a folder whose process runs is no leak. Default: none read. */
	isAlive?: (pid: number) => boolean
}): HealthFinding[] {
	const now = params.now.getTime()
	const leaked = params.folders
		.filter((folder) => now - timeOf(folder.modifiedAt) > SCRATCH_LEAK_MS)
		// a folder whose process still runs (a long rehearsal) is no leak
		.filter((folder) => !(folder.pid !== undefined && params.isAlive?.(folder.pid)))
		.sort((first, second) => timeOf(first.modifiedAt) - timeOf(second.modifiedAt))
	if (leaked.length === 0) return []
	const [oldest] = leaked
	return [
		{
			rule: 'worktrees',
			severity: 'amber',
			repository: SCRATCH_REPOSITORY,
			at: params.now.toISOString(),
			text: fillMessage({
				template: leaked.length === 1 ? WORKTREE_TEXTS.leakedOne : WORKTREE_TEXTS.leaked,
				values: {
					count: String(leaked.length),
					path: oldest.path,
					duration: formatDuration(now - timeOf(oldest.modifiedAt)),
				},
			}),
			detail: leaked.map((folder) => folder.path),
		},
	]
}
