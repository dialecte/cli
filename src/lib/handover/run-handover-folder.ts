/**
 * `dialecte handover run <folder>`: the gate config (`resolveHandoverGateScope`: refused when invalid, the
 * hand-over base handed to the hooks when they run a scoped step), the guards, then the lots not committed yet,
 * then the card. With a rehearsal, the guards read the repository and the lots are committed in its scratch clone,
 * or not at all when a green record answers for every lot. A real run
 * that leaves every lot committed then records the hand-over `committed` in the store (when it is registered)
 * and, when it made commits, moves every lot file of the worktree (the root's `.dialecte/lot.json` and each
 * package's) into the folder: the next lot on the branch starts from empty declarations, and appends the lot's final record (its `card` line) to the
 * repository's `cards.log`. The card after a real run
 * has no notes: they were written for the person about to run it, and what the run proved is in its gates.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { renderSectionCard } from '../card/render-section-card.ts'
import { realPathOf } from '../file-system.ts'
import { linesOf, textOf } from '../print/print.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { LOT_FILE_KEPT, LOT_FILE_NOT_OWNED } from './archived-declarations.constants.ts'
import { archivedDeclarationPath, moveDeclarations } from './archived-declarations.ts'
import { checkHandoverGuards } from './check-handover-guards.ts'
import { commitLots } from './commit-lots.ts'
import { findCommittedLots } from './find-committed-lots.ts'
import { buildHandoverCard, handoverCardSections } from './handover-card.ts'
import { resolveHandoverGateScope } from './handover-gate-scope.ts'
import { handoverLockPath, readLockFile } from './handover-lock.ts'
import { findHandoverStore, recordHandoverState } from './handover-store.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_FILES,
	LOT_FILE_ARCHIVED,
	REHEARSAL_SKIPPED_LINE,
} from './handover.constants.ts'
import { recordCardLine } from './record-card-line.ts'

import type { Clock } from '../progress/clock.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { MovedDeclaration } from './archived-declarations.types.ts'
import type { CloneLotTree } from './clone-lot-tree.types.ts'
import type { HandoverGateScope } from './handover-gate-scope.types.ts'
import type { HandoverFolder, HandoverProbe, WriteLine } from './handover.types.ts'
import type { NotALotGoAhead } from './store-lot-guard.types.ts'

/**
 * The exit code: 0 when every lot is committed, 1 when a guard or a commit refused, 2 when the gate config is one
 * the cli cannot run (read before the guards, nothing staged), a guard that sets it refused (`target`), or the
 * install guard refused a lot.
 */
export async function runHandoverFolder(params: {
	handover: HandoverFolder
	/** Where the lots are committed: the repository (default), or a rehearsal clone at its HEAD. */
	commitRoot?: string
	write: WriteLine
	clock: Clock
	colour: boolean
	/** Asks whether the repository's own cli runs hand-overs, for the card's run line. */
	probe: HandoverProbe
	onProcessGroup?: (pid: number) => void
	/** Added to the environment the commits and their hooks run in (a rehearsal's short `TMPDIR`). */
	hookEnvironment?: Record<string, string>
	/** Where each lot announces itself; default: start and running lines through `write`. */
	progress?: StepProgress
	/** The progress draws on a terminal. */
	tty?: boolean
	/** The card's width: it is exactly that wide, every line wrapped to it. Default: no wrapping. */
	columns?: number
	/** The cli running the hand-over: the card's run line names it when the repository's own cli cannot run it. */
	cliPath?: string
	/** `--resume-merge`: a merge of the next lot's tip in progress, someone else's too, is aborted and redone. */
	resumeMerge?: boolean
	/** A rehearsal; default: the lots are committed elsewhere than in the repository. */
	rehearsal?: boolean
	/** A rehearsal a green record answers for every lot of: the guards, then the card, no commit. */
	skipCommits?: boolean
	/** The lots (numbered from 1) a rehearsal commits without their hook. */
	withoutHook?: ReadonlySet<number>
	/** The repository whose store holds the hook records, when the lots are committed in a clone of it. */
	storeRoot?: string
	/** A rehearsal clone's working tree around each lot: it holds exactly that lot's tree while it is committed. */
	lotTree?: CloneLotTree
	/** A rehearsal whose contrib run in the clone cannot answer the real run: why, for the `contrib` guard. */
	contribUnanswerable?: string
	/** The gate scope a rehearsal read before its clone; default: read here, before the guards. */
	gateScope?: HandoverGateScope
	/** Called once the lots are committed (or the run stopped), before the card is built: what the card reads. */
	beforeCard?: () => void
	/** `--not-a-lot --by --reason`: the person's go-ahead for a hand-over that is not a store lot. */
	notALot?: NotALotGoAhead
}): Promise<number> {
	const { handover, write, clock } = params
	const { lotsFile, lots } = handover
	const startedAt = clock.now()
	const commitRoot = params.commitRoot ?? lotsFile.repository
	const rehearsal = params.rehearsal ?? commitRoot !== lotsFile.repository
	// a gate config the cli cannot run stops the run before anything is staged
	const gateScope = params.gateScope ?? resolveHandoverGateScope({ handover })
	if ('refusal' in gateScope) {
		write(textOf([gateScope.refusal]))
		return 2
	}
	const guarded = checkHandoverGuards({
		handover,
		write,
		clock,
		rehearsal,
		resumeMerge: params.resumeMerge,
		contribUnanswerable: params.contribUnanswerable,
		notALot: params.notALot,
	})
	if ('exitCode' in guarded) return guarded.exitCode
	if (params.skipCommits) write(REHEARSAL_SKIPPED_LINE)
	// a refusal of the install guard exits as the guards do (2); a failed commit exits 1
	let refusalExitCode: number | undefined
	const committed = params.skipCommits
		? guarded.commits
		: await commitLots({
				root: commitRoot,
				lots,
				commits: guarded.commits,
				write,
				clock,
				onProcessGroup: params.onProcessGroup,
				hookEnvironment: params.hookEnvironment,
				progress: params.progress,
				tty: params.tty,
				withoutHook: params.withoutHook,
				storeRoot: params.storeRoot,
				lotTree: params.lotTree,
				scoped: gateScope.scoped,
				handoverBase: gateScope.handoverBase,
				// the record lands in the hand-over folder, the refusal names the repository (never a rehearsal clone)
				installRecord: join(handover.folder, HANDOVER_FILES.install),
				worktree: lotsFile.repository,
				onInstallRefusal: function keepExitCode(refusal) {
					refusalExitCode = refusal.exitCode
				},
			})
	// a stopped run: the lots it did commit, for the card (the hand-over is partly committed)
	const commits =
		committed ??
		findCommittedLots({
			root: commitRoot,
			head: guarded.head,
			tip: 'HEAD',
			lots,
		}).commits
	// the commits this run made: none when it committed nothing (a stopped run, a done hand-over run again)
	const made = committed && !params.skipCommits ? committed.length - guarded.commits.length : 0
	if (committed && !params.skipCommits) {
		if (!rehearsal) releaseLock({ root: lotsFile.repository, folder: handover.folder })
		write(
			textOf([
				`${rehearsal ? 'rehearsed' : 'done'}: ${made} commit(s) on ${lotsFile.branch} in ${formatDuration(clock.now() - startedAt)}${rehearsal ? ' in the scratch clone' : ''}. Nothing pushed.`,
			]),
		)
	}
	params.beforeCard?.()
	const card = buildHandoverCard({
		root: lotsFile.repository,
		commitRoot,
		folder: handover.folder,
		branch: lotsFile.branch,
		head: guarded.head,
		// the notes are for the person about to run: a rehearsal's card keeps them, a real run's drops them
		notes: rehearsal ? lotsFile.gates : undefined,
		lots,
		commits,
		cliPath: params.cliPath,
		probe: params.probe,
		// the repository's hand-over is done only by a real run that committed every lot
		done: !rehearsal && commits.length === lots.length,
		rehearsal,
		release: lotsFile.release === true,
	})
	const box = renderSectionCard({
		card: handoverCardSections(card),
		colour: params.colour,
		width: params.columns,
	})
	for (const line of linesOf(box)) write(line)
	// after the card, which shows the entries the lot file held
	if (card.done) {
		recordHandoverState({
			store: findHandoverStore(lotsFile.repository),
			folder: handover.folder,
			state: 'committed',
		})
		// the lot files are this lot's declarations only when this run committed lots: a re-run of a done hand-over
		// meets the next step's files, left as they are
		const moved = moveDeclarations({
			worktree: lotsFile.repository,
			folder: handover.folder,
			owned: made > 0,
		})
		for (const line of movedDeclarationLines({ moved, folder: handover.folder }))
			write(textOf([line]))
		// the lot's final record: a failure warns and changes no exit, the commit is made
		recordCardLine({ handover, card, commitRoot })
	}
	// whole on one line, whatever the width: a person copies it
	if (!card.done) write(textOf([card.command]))
	return committed ? 0 : (refusalExitCode ?? 1)
}

/**
 * One line per lot file a move archived (its archive) or left non-empty as it is (why); none for the rest.
 */
function movedDeclarationLines(params: {
	moved: readonly MovedDeclaration[]
	folder: string
}): string[] {
	return params.moved.flatMap(function movedLine(declaration): string[] {
		const { decision, file } = declaration
		if (decision.kind === 'write') return [LOT_FILE_ARCHIVED.replace('{path}', declaration.archive)]
		if (decision.kind === 'untouched' && !declaration.empty)
			return [LOT_FILE_NOT_OWNED.replace('{path}', file)]
		if (decision.kind === 'keep')
			return [
				LOT_FILE_KEPT.replace('{path}', file)
					.replace(
						'{archived}',
						archivedDeclarationPath({
							folder: params.folder,
							packagePath: declaration.packagePath,
							name: 'lot.json',
						}),
					)
					.replace(
						'{landed}',
						archivedDeclarationPath({
							folder: params.folder,
							packagePath: declaration.packagePath,
							name: 'lot.landed.json',
						}),
					),
			]
		return []
	})
}

/**
 * The repository's hand-over lock goes when it names this folder's script, by real path (the folder may be named
 * through a link the lock does not hold).
 */
function releaseLock(params: { root: string; folder: string }): void {
	const lockPath = handoverLockPath(params.root)
	const script = readLockFile(lockPath)
	if (
		script !== undefined &&
		realPathOf(script) === realPathOf(join(params.folder, COMMIT_SCRIPT_FILE))
	)
		rmSync(lockPath)
}
