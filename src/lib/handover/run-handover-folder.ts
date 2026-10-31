/**
 * `dialecte handover run <folder>`: the guards, then the lots not committed yet, then the card. With a
 * rehearsal, the guards read the repository and the lots are committed in its scratch clone. A real run
 * that leaves every lot committed then moves the lot file (`.dialecte/lot.json`) into the folder: the next
 * lot on the branch starts from an empty declaration, not from this lot's entries.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderCard } from '../card/render-card.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { checkHandoverGuards } from './check-handover-guards.ts'
import { commitLots } from './commit-lots.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import { buildHandoverCard, handoverCardRows } from './handover-card.ts'
import { handoverLockPath } from './handover-lock.ts'
import {
	ARCHIVED_LOT_FILE,
	COMMIT_SCRIPT_FILE,
	EMPTY_LOT_DECLARATION,
	LOT_FILE_ARCHIVED,
} from './handover.constants.ts'

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
	// after the card, which shows the entries the lot file held
	if (card.done) {
		const archived = archiveLotFile({ root: lotsFile.repository, folder: handover.folder })
		if (archived) write(LOT_FILE_ARCHIVED.replace('{path}', archived))
	}
	// whole on one line, whatever the width: a person copies it
	if (!card.done) write(card.command)
	return committed ? 0 : 1
}

/**
 * Moves the worktree's lot file into the hand-over folder and leaves an empty declaration in its place;
 * the archived path, or undefined when there is nothing to archive (no lot file, an empty one) or the
 * folder holds one already (a second run: the first archive stays).
 */
function archiveLotFile(params: { root: string; folder: string }): string | undefined {
	const source = join(params.root, LOT_FILE)
	const target = join(params.folder, ARCHIVED_LOT_FILE)
	if (!existsSync(source) || existsSync(target)) return undefined
	if (isEmptyDeclaration(readFileSync(source, 'utf8'))) return undefined
	copyFileSync(source, target)
	writeFileSync(source, EMPTY_LOT_DECLARATION)
	return target
}

/** A JSON object with no key (`{}`, ` { }`): a lot file that declares nothing. */
function isEmptyDeclaration(text: string): boolean {
	try {
		const declaration: unknown = JSON.parse(text)
		return (
			typeof declaration === 'object' &&
			declaration !== null &&
			!Array.isArray(declaration) &&
			Object.keys(declaration).length === 0
		)
	} catch {
		// not JSON: it holds something the lot wrote, kept with the hand-over
		return false
	}
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
