/**
 * `dialecte handover <lots.json> [--out <dir>] [--rehash] [--json]` - the commit-by-lots hand-over a human
 * runs. From a lots file (repository, expected branch and HEAD, lots with paths and messages) it checks
 * every guard, then writes the hand-over folder (the lots file, the snapshot and a one-line `commit.sh`)
 * and the card a person reviews, and takes the repository's hand-over lock.
 *
 * `dialecte handover run <folder> [--rehearse [--keep] [--full]]` - what `commit.sh` runs: the guards again, each
 * on its own line with its duration, then lot after lot with the hook's output, a heartbeat while it is
 * silent, and the card at the end; a rerun resumes after the lots already committed.
 *
 * Every hand-over written is registered in the repository's store (`<git-common-dir>/dialecte-handover/`):
 * one entry `<name>.json` (`<yyyy-mm-dd>-<branch slug>[-<n>]`) pointing to its folder, which stays where it
 * was written. A name stands for its folder wherever a verb below takes one.
 *
 * `dialecte handover show [<name|folder>] [--json]` - the card again, recomputed, nothing written; without an
 * argument the newest hand-over of the current branch.
 *
 * `dialecte handover run` without a folder runs the store's one hand-over still to run (refused with two).
 *
 * `dialecte handover abandon [<name|folder>]` - marks a hand-over that will not run and releases its lock.
 *
 * `dialecte handover list [--root <dir>] [--json]` - every hand-over folder and where it stands.
 *
 * `dialecte handover --legend` - every term the card can print: what it means, whether to look.
 *
 * The agent never commits; the run never pushes.
 */
import { existsSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { DEFAULT_CARD_COLUMNS } from '../lib/card/card.constants.ts'
import { renderSectionCard, resolveCardColumns } from '../lib/card/render-section-card.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { realPathOf } from '../lib/file-system.ts'
import { currentBranchOf } from '../lib/git.ts'
import {
	abandonedMarkerPath,
	readAbandonedMarker,
	writeAbandonedMarker,
} from '../lib/handover/handover-abandoned-marker.ts'
import {
	buildHandoverCard,
	handoverCardData,
	handoverCardSections,
} from '../lib/handover/handover-card.ts'
import {
	handoverHoldRefusal,
	handoverLockPath,
	readHandoverLock,
} from '../lib/handover/handover-lock.ts'
import {
	readRunMarker,
	runningRefusal,
	writeRunMarker,
} from '../lib/handover/handover-run-marker.ts'
import {
	entryOfArgument,
	findHandoverStore,
	newestOfBranch,
	readStoreEntries,
	recordHandoverState,
	registerHandover,
	resolveHandoverArgument,
} from '../lib/handover/handover-store.ts'
import {
	COMMIT_SCRIPT_FILE,
	HANDOVER_ABANDON_TEXTS,
	HANDOVER_FILES,
	HANDOVER_INTERLEAVING_REFUSALS,
	HANDOVER_REHASH_ABANDONED_REFUSAL,
	HANDOVER_RUN_TEXTS,
	HANDOVER_SHOW_TEXTS,
	HANDOVER_STORE_REFUSALS,
	HANDOVER_WRITTEN_NOTE,
	RUNNABLE_STATES,
} from '../lib/handover/handover.constants.ts'
import { handoverState, listHandovers } from '../lib/handover/list-handovers.ts'
import { planHandover } from '../lib/handover/plan-handover.ts'
import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { readLotsFile } from '../lib/handover/read-lots-file.ts'
import { rehearsalScratchRoot, rehearseHandover } from '../lib/handover/rehearse-handover.ts'
import { probeRepositoryCli } from '../lib/handover/repository-cli-probe.ts'
import { runHandoverFolder } from '../lib/handover/run-handover-folder.ts'
import { countChangedSinceReview, recomputeHandoverCard } from '../lib/handover/show-handover.ts'
import { writeHandover } from '../lib/handover/write-handover.ts'
import { HANDOVER_LEGEND } from '../lib/legend/legend.constants.ts'
import { renderLegend } from '../lib/legend/render-legend.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { workTreeTopOf } from '../lib/review-rounds/worktree-state.ts'
import { readReferencePatterns } from '../lib/rules/committed-text.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { COMMIT_PLAN_FOLDER } from '../lib/workspace.constants.ts'
import { findWorkspace } from '../lib/workspace.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	HandoverFolder,
	HandoverListing,
	HandoverProbe,
	InterleavingSeam,
	RegisteredState,
	StoreEntry,
	WriteLine,
} from '../lib/handover/handover.types.ts'
import type { Clock } from '../lib/progress/clock.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

export async function run(argv: string[]): Promise<void> {
	const colour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
	// the card's width: the terminal's columns, else $COLUMNS, else 80
	const columns = resolveCardColumns({
		terminalColumns: process.stdout.isTTY ? process.stdout.columns : undefined,
		environmentColumns: process.env.COLUMNS,
	})
	if (argv[0] === 'run') {
		const live = openProcessLiveOutput()
		const exitCode = await runHandoverRun({
			argv: argv.slice(1),
			write: live.writeLine,
			live,
			clock: createSystemClock(),
			colour,
			columns,
			probe: probeRepositoryCli,
			scratchRoot: rehearsalScratchRoot({
				platform: process.platform,
				systemTemporaryFolder: tmpdir(),
			}),
		})
		if (exitCode !== 0) process.exit(exitCode)
		return
	}
	const result = runHandoverVerb({ argv, colour, columns })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/** The verbs that answer at once (every one but `run`), dispatched on the first word. */
function runHandoverVerb(params: {
	argv: string[]
	colour: boolean
	columns: number
}): CommandResult {
	const { argv, colour, columns } = params
	const cwd = process.cwd()
	const cliPath = realpathSync(process.argv[1])
	const rest = argv.slice(1)
	if (argv[0] === 'list') return runHandoverList({ argv: rest, cwd, now: Date.now() })
	if (argv[0] === 'abandon') return runHandoverAbandon({ argv: rest, cwd })
	if (argv[0] === 'show')
		return runHandoverShow({
			argv: rest,
			cwd,
			colour,
			columns,
			probe: probeRepositoryCli,
			cliPath,
		})
	return runHandover({ argv, cliPath, colour, columns, probe: probeRepositoryCli })
}

export function runHandover(params: {
	argv: string[]
	/** The cli writing the hand-over: the script's fallback when the repository installs none that runs it. */
	cliPath: string
	colour?: boolean
	/** The card's width: it is exactly that wide, every line wrapped to it. Default: no wrapping. */
	columns?: number
	/** Asks whether the repository's own cli runs hand-overs, for the card's run line. */
	probe: HandoverProbe
	/** The most the repository's own cli may take to answer the `handover run --probe` check, in milliseconds. */
	probeTimeout?: number
	/** The time the hand-over is registered at (its name is dated from it). Default: now. */
	now?: Date
	/** Called between the pick of the entry's name and the write of the entry (a test forces another writer there). */
	afterNamePicked?: InterleavingSeam
	/** The git version line (`git version 2.43.0`): merge lots need git 2.38 or later. Default: asks git. */
	gitVersion?: () => string
}): CommandResult {
	const { argv } = params
	if (hasFlag(argv, 'legend'))
		return {
			exitCode: 0,
			output: renderLegend({
				groups: HANDOVER_LEGEND,
				width: params.columns ?? DEFAULT_CARD_COLUMNS,
			}),
		}
	const [lotsPath] = positionalArguments({ argv, valueOptions: ['out'] })
	if (!lotsPath) return usage('handover: expected the path of a lots file')
	const absoluteLotsPath = resolve(lotsPath)
	const lotsFile = readLotsFile(absoluteLotsPath)
	if (typeof lotsFile === 'string') return usage(`handover: ${lotsFile}`)
	const out = resolve(getArg(argv, 'out') ?? dirname(absoluteLotsPath))
	const scriptPath = join(out, COMMIT_SCRIPT_FILE)
	if (existsSync(scriptPath) && !hasFlag(argv, 'rehash'))
		return usage(
			`handover: ${scriptPath} exists: pass --rehash to take the snapshot again after an edit`,
		)
	// an abandoned hand-over is replaced by a new folder, never revived
	if (readAbandonedMarker(out))
		return usage(
			HANDOVER_REHASH_ABANDONED_REFUSAL.replace('{folder}', out).replace(
				'{marker}',
				abandonedMarkerPath(out),
			),
		)

	const heldBy = readHandoverLock(lotsFile.repository)
	if (heldBy && heldBy !== scriptPath && existsSync(heldBy))
		return refused([
			handoverHoldRefusal({
				script: heldBy,
				lock: handoverLockPath(lotsFile.repository),
				why: '',
			}),
		])

	const referencePatterns = readReferencePatterns(lotsFile.repository)
	const { plan, refusals } = planHandover({
		lotsFile,
		lotsPath: absoluteLotsPath,
		referencePatterns,
		gitVersion: params.gitVersion,
	})
	if (refusals.length) return refused(refusals)

	writeHandover({ plan, lotsFile, lotsPath: absoluteLotsPath, out, cliPath: params.cliPath })
	// before the card, which names the hand-over by its entry
	registerHandover({
		root: lotsFile.repository,
		folder: out,
		branch: lotsFile.branch,
		now: params.now ?? new Date(),
		afterNamePicked: params.afterNamePicked,
	})
	const card = buildHandoverCard({
		root: plan.repository,
		folder: out,
		branch: plan.branch,
		head: plan.head,
		notes: plan.gates,
		lots: plan.lots,
		commits: [],
		cliPath: params.cliPath,
		probeTimeout: params.probeTimeout,
		probe: params.probe,
	})
	if (hasFlag(argv, 'json'))
		return {
			exitCode: 0,
			output: JSON.stringify({ folder: out, ...handoverCardData(card) }, null, 2),
		}
	return {
		exitCode: 0,
		output: [
			renderSectionCard({
				card: handoverCardSections(card),
				colour: params.colour ?? false,
				width: params.columns,
			}),
			HANDOVER_WRITTEN_NOTE.replace('{lots}', shellQuote(absoluteLotsPath)),
			card.command,
		].join('\n'),
	}
}

/** `handover run <folder> [--rehearse [--keep] [--full]]`; `handover run --probe` answers that this cli has the command. */
export async function runHandoverRun(params: {
	argv: string[]
	write: WriteLine
	clock: Clock
	colour: boolean
	/** Asks whether the repository's own cli runs hand-overs, for the card's run line. */
	probe: HandoverProbe
	/** Where `--rehearse` makes its rehearsal folder. */
	scratchRoot: string
	/** A terminal that redraws its last line (spinner), or lines only; default: lines through `write`. */
	live?: LiveOutput
	/** The cli running it, for the card's run line; default: this process's script. */
	cliPath?: string
	/** The card's width: it is exactly that wide, every line wrapped to it. Default: the live output's columns, else no wrapping. */
	columns?: number
	/** Where `run` without an argument looks for the repository's store. Default: the process's folder. */
	cwd?: string
	/** Called between the check of the abandoned marker and the write of the run marker (a test forces `abandon` there). */
	afterCheck?: InterleavingSeam
}): Promise<number> {
	const { argv, write } = params
	const live = params.live ?? { tty: false, writeLine: write, rewriteLines: () => undefined }
	const progress = createStepProgress({ live, clock: params.clock })
	const cliPath = params.cliPath ?? realpathSync(process.argv[1])
	if (hasFlag(argv, 'probe')) {
		write('handover run')
		return 0
	}
	const [argument] = positionalArguments({ argv, valueOptions: [] })
	const cwd = params.cwd ?? process.cwd()
	const store = storeOfFolder(cwd)
	const folder = argument
		? resolveHandoverArgument({ argument, store, cwd })
		: pickHandoverToRun({ cwd, store, write, probe: params.probe })
	if (typeof folder === 'number') return folder
	const gone = argument && goneEntryRefusal({ verb: 'run', argument, store })
	if (gone) {
		write(gone)
		return 2
	}
	const handover = readHandoverFolder(folder)
	if (typeof handover === 'string') {
		write(`handover run: ${handover}`)
		return 2
	}
	if (readAbandonedMarker(handover.folder)) {
		write(
			HANDOVER_RUN_TEXTS.abandoned
				.replace('{folder}', handover.folder)
				.replace('{marker}', abandonedMarkerPath(handover.folder)),
		)
		return 2
	}
	write(`handover run ${handover.folder}`)
	if (hasFlag(argv, 'rehearse'))
		return rehearseHandover({
			handover,
			write,
			clock: params.clock,
			colour: params.colour,
			probe: params.probe,
			scratchRoot: params.scratchRoot,
			keep: hasFlag(argv, 'keep'),
			progress,
			tty: live.tty,
			columns: params.columns ?? live.columns,
			cliPath,
			resumeMerge: hasFlag(argv, 'resume-merge'),
			full: hasFlag(argv, 'full'),
		})
	params.afterCheck?.()
	// a real run marks its folder: a gate does not run under a hand-over committing now
	const releaseRunMarker = writeRunMarker({ folder: handover.folder, now: new Date() })
	// an abandon that checked before this marker existed: its marker wins, nothing is committed
	if (readAbandonedMarker(handover.folder)) {
		releaseRunMarker()
		write(
			HANDOVER_INTERLEAVING_REFUSALS.run
				.replace('{folder}', handover.folder)
				.replace('{marker}', abandonedMarkerPath(handover.folder)),
		)
		return 2
	}
	try {
		return await runHandoverFolder({
			handover,
			write,
			clock: params.clock,
			colour: params.colour,
			probe: params.probe,
			progress,
			tty: live.tty,
			columns: params.columns ?? live.columns,
			cliPath,
			resumeMerge: hasFlag(argv, 'resume-merge'),
		})
	} finally {
		releaseRunMarker()
	}
}

/**
 * `handover show [<name|folder>] [--json]`: the card of a hand-over, recomputed, nothing written; then the
 * files changed since the review and the run command, each on its own line (none once done or abandoned).
 * Without an argument the newest hand-over of the current branch; none: the store's entries, exit 1.
 */
export function runHandoverShow(params: {
	argv: string[]
	cwd: string
	colour?: boolean
	columns?: number
	probe: HandoverProbe
	/** The cli named in the run line when the repository's own cli cannot run hand-overs. */
	cliPath?: string
}): CommandResult {
	const { argv, cwd } = params
	const [argument] = positionalArguments({ argv, valueOptions: [] })
	const store = storeOfFolder(cwd)
	const chosen = argument
		? readNamedHandover({ verb: 'show', argument, store, cwd })
		: newestHandoverOfBranch({ cwd, store })
	if ('exitCode' in chosen) return chosen
	const { handover } = chosen
	const { lotsFile } = handover
	if (!existsSync(lotsFile.repository))
		return {
			exitCode: 1,
			output: HANDOVER_SHOW_TEXTS.repositoryMissing
				.replace('{folder}', handover.folder)
				.replace('{repository}', lotsFile.repository),
		}
	const card = recomputeHandoverCard({ handover, probe: params.probe, cliPath: params.cliPath })
	const runnable = !card.done && card.verdict !== 'ABANDONED'
	const committed = card.lots.filter((lot) => lot.commit).length
	const changed = runnable ? countChangedSinceReview({ handover, committed }) : 0
	if (hasFlag(argv, 'json'))
		return {
			exitCode: 0,
			output: JSON.stringify(
				{ folder: handover.folder, ...handoverCardData(card), changedSinceReview: changed },
				null,
				2,
			),
		}
	return {
		exitCode: 0,
		output: [
			renderSectionCard({
				card: handoverCardSections(card),
				colour: params.colour ?? false,
				width: params.columns,
			}),
			...(changed
				? [
						HANDOVER_SHOW_TEXTS.changed
							.replace('{count}', String(changed))
							.replace('{lots}', join(handover.folder, HANDOVER_FILES.lots)),
					]
				: []),
			...(runnable ? [card.command] : []),
		].join('\n'),
	}
}

/**
 * `handover abandon [<name|folder>]`: marks a hand-over that will not run, records it abandoned in the store
 * and releases the lock of its worktree when it names the hand-over's script. Without an argument the
 * hand-over the worktree's lock names. Refused while a real run of it is in progress and once every lot is
 * committed; never touches the index, a ref or a commit.
 */
export function runHandoverAbandon(params: {
	argv: string[]
	cwd: string
	now?: Date
	/** Called between the check of the run marker and the write of the abandoned marker (a test forces a run there). */
	afterCheck?: InterleavingSeam
}): CommandResult {
	const { argv, cwd } = params
	const [argument] = positionalArguments({ argv, valueOptions: [] })
	const root = workTreeTopOf(cwd)
	let target = argument
	if (!target) {
		if (!root) return usage(storeRefusal({ verb: 'abandon', cwd }))
		const held = readHandoverLock(root)
		if (!held)
			return { exitCode: 1, output: HANDOVER_ABANDON_TEXTS.nothingHeld.replace('{root}', root) }
		target = dirname(held)
	}
	const chosen = readNamedHandover({
		verb: 'abandon',
		argument: target,
		store: root && findHandoverStore(root),
		cwd,
	})
	if ('exitCode' in chosen) return chosen
	const { folder, lotsFile } = chosen.handover
	const abandoned = readAbandonedMarker(folder)
	if (abandoned)
		return {
			exitCode: 0,
			output: HANDOVER_ABANDON_TEXTS.already
				.replace('{folder}', folder)
				.replace('{at}', abandoned.at),
		}
	const running = readRunMarker(folder)
	if (running)
		return usage(runningRefusal({ template: HANDOVER_ABANDON_TEXTS.running, folder, running }))
	if (handoverState(chosen.handover) === 'committed')
		return usage(HANDOVER_ABANDON_TEXTS.committed.replace('{folder}', folder))
	params.afterCheck?.()
	writeAbandonedMarker({ folder, now: params.now ?? new Date() })
	// a run that checked before this marker existed: it goes on, so the abandon is taken back
	const crossed = readRunMarker(folder)
	if (crossed) {
		rmSync(abandonedMarkerPath(folder))
		return usage(
			runningRefusal({
				template: HANDOVER_INTERLEAVING_REFUSALS.abandon,
				folder,
				running: crossed,
			}),
		)
	}
	recordHandoverState({
		store: findHandoverStore(lotsFile.repository) ?? (root && findHandoverStore(root)),
		folder,
		state: 'abandoned',
	})
	return {
		exitCode: 0,
		output: [
			HANDOVER_ABANDON_TEXTS.abandoned.replace('{folder}', folder),
			...releaseLockOf({ repository: lotsFile.repository, folder }),
		].join('\n'),
	}
}

/** The lock of `repository` removed when it names the script of `folder`; one line saying what became of it. */
function releaseLockOf(params: { repository: string; folder: string }): string[] {
	if (!existsSync(params.repository)) return []
	const script = readHandoverLock(params.repository)
	if (!script) return []
	const lock = handoverLockPath(params.repository)
	if (realPathOf(script) !== realPathOf(join(params.folder, COMMIT_SCRIPT_FILE)))
		return [HANDOVER_ABANDON_TEXTS.lockKept.replace('{lock}', lock).replace('{script}', script)]
	rmSync(lock)
	return [HANDOVER_ABANDON_TEXTS.lockReleased.replace('{lock}', lock)]
}

/** The store of the repository `folder` is in; undefined outside every repository. */
function storeOfFolder(folder: string): string | undefined {
	const root = workTreeTopOf(folder)
	return root && findHandoverStore(root)
}

/** The refusal of an argument naming an entry whose folder is gone (it names the folder); none otherwise. */
function goneEntryRefusal(params: {
	verb: string
	argument: string
	store: string | undefined
}): string | undefined {
	const entry = entryOfArgument(params)
	if (!entry || existsSync(entry.folder)) return undefined
	return HANDOVER_STORE_REFUSALS.folderGone
		.replace('{verb}', params.verb)
		.replace('{name}', entry.name)
		.replace('{folder}', entry.folder)
}

/**
 * The hand-over an argument of `show` or `abandon` names; an entry whose folder is gone: exit 1 naming the
 * folder; else the refusal naming the argument (exit 2).
 */
function readNamedHandover(params: {
	verb: string
	argument: string
	store: string | undefined
	cwd: string
}): { handover: HandoverFolder } | CommandResult {
	const gone = goneEntryRefusal(params)
	if (gone) return { exitCode: 1, output: gone }
	const folder = resolveHandoverArgument(params)
	const handover = readHandoverFolder(folder)
	if (typeof handover !== 'string') return { handover }
	return usage(
		HANDOVER_STORE_REFUSALS.noHandover
			.replace('{verb}', params.verb)
			.replace('{argument}', params.argument)
			.replace('{reason}', handover),
	)
}

/**
 * The newest registered hand-over of the current branch, whatever its state (gone: exit 1 naming its folder);
 * none: says the store is empty (exit 1), or lists its entries with their branch and state (exit 1).
 */
function newestHandoverOfBranch(params: {
	cwd: string
	store: string | undefined
}): { handover: HandoverFolder } | CommandResult {
	const { cwd, store } = params
	const root = workTreeTopOf(cwd)
	if (!root || !store) return usage(storeRefusal({ verb: 'show', cwd }))
	const entries = readStoreEntries(store)
	if (entries.length === 0)
		return { exitCode: 1, output: HANDOVER_SHOW_TEXTS.emptyStore.replace('{store}', store) }
	const branch = currentBranchOf(root)
	const newest = newestOfBranch({ entries, branch })
	if (newest) return readNamedHandover({ verb: 'show', argument: newest.name, store, cwd })
	return {
		exitCode: 1,
		output: [
			HANDOVER_SHOW_TEXTS.noneForBranch.replace('{branch}', branch).replace('{store}', store),
			renderColumns(entries.map((entry) => [entry.name, entry.branch, registeredStateOf(entry)])),
		].join('\n'),
	}
}

/** Where a registered hand-over stands: its folder's state while the folder reads back, else `gone`. */
function registeredStateOf(entry: StoreEntry): RegisteredState {
	const handover = readHandoverFolder(entry.folder)
	return typeof handover === 'string' ? 'gone' : handoverState(handover)
}

/**
 * `handover run` without a folder: the store's one registered hand-over whose folder is pending or partly
 * committed. None: says so (exit 1); two or more: one line per candidate with its branch and verdict, nothing
 * run (exit 2).
 */
function pickHandoverToRun(params: {
	cwd: string
	store: string | undefined
	write: WriteLine
	probe: HandoverProbe
}): string | number {
	const { cwd, store, write } = params
	if (!store) {
		write(storeRefusal({ verb: 'run', cwd }))
		return 2
	}
	const candidates = readStoreEntries(store).flatMap(function runnable(entry) {
		const handover = readHandoverFolder(entry.folder)
		if (typeof handover === 'string') return []
		return RUNNABLE_STATES.includes(handoverState(handover)) ? [{ entry, handover }] : []
	})
	if (candidates.length === 1) return candidates[0].handover.folder
	if (candidates.length === 0) {
		write(HANDOVER_RUN_TEXTS.nothingToRun.replace('{store}', store))
		return 1
	}
	write(
		HANDOVER_RUN_TEXTS.several
			.replace('{count}', String(candidates.length))
			.replace('{store}', store),
	)
	const rows = renderColumns(
		candidates.map(({ entry, handover }) => [
			entry.name,
			entry.branch,
			// the verdict only: no run line, so no probe of the repository's cli
			recomputeHandoverCard({ handover, probe: params.probe }).verdict,
		]),
	)
	for (const row of rows.split('\n')) write(row)
	return 2
}

/** The refusal of a store verb run outside every repository. */
function storeRefusal(params: { verb: string; cwd: string }): string {
	return HANDOVER_STORE_REFUSALS.noRepository
		.replace('{verb}', params.verb)
		.replace('{cwd}', params.cwd)
}

/** `handover list [--root <dir>] [--json]`: default root the workspace's `_commit-plan`, else the cwd. */
export function runHandoverList(params: {
	argv: string[]
	cwd: string
	now: number
}): CommandResult {
	const { argv, cwd } = params
	const workspace = findWorkspace(cwd)
	const commitPlan = workspace && join(workspace, COMMIT_PLAN_FOLDER)
	const root = resolve(
		cwd,
		getArg(argv, 'root') ?? (commitPlan && existsSync(commitPlan) ? commitPlan : cwd),
	)
	const listings = listHandovers({ root, now: params.now })
	if (hasFlag(argv, 'json')) return { exitCode: 0, output: JSON.stringify(listings, null, 2) }
	if (listings.length === 0)
		return { exitCode: 0, output: `handover list: no hand-over under ${root}` }
	return { exitCode: 0, output: renderListings(listings) }
}

function renderListings(listings: readonly HandoverListing[]): string {
	return renderColumns([
		['folder', 'repository', 'worktree', 'branch', 'lots', 'age', 'state'],
		...listings.map((listing) => [
			listing.folder,
			listing.repository,
			listing.worktree,
			listing.branch,
			listing.lots === undefined ? '-' : String(listing.lots),
			formatDuration(listing.age),
			listing.state,
		]),
	])
}

/** Rows of cells, each column as wide as its widest cell, two spaces between columns. */
function renderColumns(rows: readonly string[][]): string {
	const widths = rows[0].map((_cell, column) => Math.max(...rows.map((row) => row[column].length)))
	return rows
		.map((row) =>
			row
				.map((cell, column) => cell.padEnd(widths[column]))
				.join('  ')
				.trimEnd(),
		)
		.join('\n')
}

function usage(message: string): CommandResult {
	return { exitCode: 2, output: message }
}

function refused(reasons: string[]): CommandResult {
	return {
		exitCode: 1,
		output: [
			'handover refused, nothing written:',
			...reasons.map((reason) => `  - ${reason}`),
		].join('\n'),
	}
}
