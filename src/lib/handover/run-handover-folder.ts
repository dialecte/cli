/**
 * `dialecte handover run <folder>`: the guards, then the lots not committed yet, then the card. With a
 * rehearsal, the guards read the repository and the lots are committed in its scratch clone.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { renderCard } from '../card/render-card.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { checkHandoverGuards } from './check-handover-guards.ts'
import { commitLots } from './commit-lots.ts'
import { buildHandoverCard, handoverCardRows } from './handover-card.ts'
import { handoverLockPath } from './handover-lock.ts'
import { COMMIT_SCRIPT_FILE } from './handover.constants.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { HandoverFolder, WriteLine } from './handover.types.ts'

/** The exit code: 0 when every lot is committed, 1 when a guard or a commit refused. */
export async function runHandoverFolder(params: {
	handover: HandoverFolder
	/** Where the lots are committed: the repository (default), or a rehearsal clone at its HEAD. */
	commitRoot?: string
	write: WriteLine
	clock: Clock
	colour: boolean
	onProcessGroup?: (pid: number) => void
	/** Where each lot announces itself; default: start and running lines through `write`. */
	progress?: StepProgress
	/** The progress draws on a terminal. */
	tty?: boolean
	/** The terminal's width: the card wraps to it. */
	columns?: number
	/** The cli running the hand-over: the card's run line names it when the repository's own cli cannot run it. */
	cliPath?: string
}): Promise<number> {
	const { handover, write, clock } = params
	const { lotsFile, lots } = handover
	const startedAt = clock.now()
	const guarded = checkHandoverGuards({ handover, write, clock })
	if (!guarded) return 1
	const commitRoot = params.commitRoot ?? lotsFile.repository
	const commits = await commitLots({
		root: commitRoot,
		lots,
		commits: guarded.commits,
		write,
		clock,
		onProcessGroup: params.onProcessGroup,
		progress: params.progress,
		tty: params.tty,
	})
	if (!commits) return 1

	const rehearsal = commitRoot !== lotsFile.repository
	if (!rehearsal) releaseLock({ root: lotsFile.repository, folder: handover.folder })
	const made = commits.length - guarded.commits.length
	write(
		`${rehearsal ? 'rehearsed' : 'done'}: ${made} commit(s) on ${lotsFile.branch} in ${formatDuration(clock.now() - startedAt)}${rehearsal ? ' in the scratch clone' : ''}. Nothing pushed.`,
	)
	const card = buildHandoverCard({
		root: lotsFile.repository,
		commitRoot,
		folder: handover.folder,
		branch: lotsFile.branch,
		head: guarded.head,
		gates: lotsFile.gates,
		lots,
		commits,
		cliPath: params.cliPath,
	})
	write(renderCard({ card: handoverCardRows(card), colour: params.colour, width: params.columns }))
	// whole on one line, whatever the width: a person copies it
	write(card.command)
	return 0
}

/** The repository's hand-over lock goes when it names this folder's script. */
function releaseLock(params: { root: string; folder: string }): void {
	const lockPath = handoverLockPath(params.root)
	if (
		existsSync(lockPath) &&
		readFileSync(lockPath, 'utf8').trim() === join(params.folder, COMMIT_SCRIPT_FILE)
	)
		rmSync(lockPath)
}
