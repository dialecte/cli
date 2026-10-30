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
import { findCommittedLots } from './find-committed-lots.ts'
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
	/** `--resume-merge`: a merge of the next lot's tip in progress, someone else's too, is aborted and redone. */
	resumeMerge?: boolean
}): Promise<number> {
	const { handover, write, clock } = params
	const { lotsFile, lots } = handover
	const startedAt = clock.now()
	const commitRoot = params.commitRoot ?? lotsFile.repository
	const rehearsal = commitRoot !== lotsFile.repository
	const guarded = checkHandoverGuards({
		handover,
		write,
		clock,
		rehearsal,
		resumeMerge: params.resumeMerge,
	})
	if (!guarded) return 1
	const committed = await commitLots({
		root: commitRoot,
		lots,
		commits: guarded.commits,
		write,
		clock,
		onProcessGroup: params.onProcessGroup,
		progress: params.progress,
		tty: params.tty,
	})
	// a stopped run: the lots it did commit, for the card (the hand-over is partly committed)
	const commits =
		committed ??
		findCommittedLots({
			root: commitRoot,
			head: guarded.head,
			tip: 'HEAD',
			lots,
			compareContent: false,
		}).commits
	if (committed) {
		if (!rehearsal) releaseLock({ root: lotsFile.repository, folder: handover.folder })
		const made = committed.length - guarded.commits.length
		write(
			`${rehearsal ? 'rehearsed' : 'done'}: ${made} commit(s) on ${lotsFile.branch} in ${formatDuration(clock.now() - startedAt)}${rehearsal ? ' in the scratch clone' : ''}. Nothing pushed.`,
		)
	}
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
		// the repository's hand-over is done only by a real run that committed every lot
		done: !rehearsal && commits.length === lots.length,
	})
	const box = renderCard({
		card: handoverCardRows(card),
		colour: params.colour,
		width: params.columns,
	})
	for (const line of box.split('\n')) write(line)
	// whole on one line, whatever the width: a person copies it
	if (!card.done) write(card.command)
	return committed ? 0 : 1
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
