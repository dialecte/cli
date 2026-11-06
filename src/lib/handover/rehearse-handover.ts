/**
 * `handover run <folder> --rehearse`: the run on a scratch clone that looks like the person's tree - the
 * repository at HEAD, the current working tree on top, the hooks folder, a copy-on-write copy of
 * `node_modules` - so the hooks run as they will for real. The clone lives in a rehearsal folder under a
 * short scratch root, beside links to the repository's sibling folders its relative `file:` dependencies
 * reach, and the hook runs with a short temporary folder inside it. The guards read the repository; the
 * lots are committed in the clone; the whole rehearsal folder is removed at the end unless kept. In a workspace
 * (the repository's parent holds `.worktrees/`) the clone's `node_modules` comes from the pool when an entry
 * matches its lockfile, goes back to the pool at the end, and the folder goes to the trash, removed in the
 * background.
 *
 * Before any clone, each lot is decided (`planRehearsal`) and its line printed: a lot a green record of its
 * tree answers for is committed in the clone without its hook, the others with it; the decisions go to the
 * hand-over folder's `rehearsal.json`. A contributor's hand-over whose tree has no green contrib record runs
 * `dialecte contrib` in the clone first, on the tree the lots leave. When every lot is answered for (and no contrib
 * run is needed), no clone is made: the guards, a reused merge's tree, then the card. The hook and contrib records
 * the clone makes go to the repository's store.
 */
import { spawnSync } from 'node:child_process'
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readlinkSync,
	rmdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { constants } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'

import { contribKeyOf } from '../contrib/contrib-key.ts'
import { runContrib } from '../contrib/run-contrib.ts'
import { isPresent } from '../file-system.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { readHooksFolder } from '../git-hooks.ts'
import { listChangedFiles, mainCheckoutOf, readGit, readGitConfig } from '../git.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { stopLiveGroups } from '../progress/interrupt-forwarding.ts'
import { FORWARDED_SIGNALS } from '../progress/progress.constants.ts'
import { createStepProgress } from '../progress/step-progress.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { provideNodeModules } from '../worktree/add-worktree.ts'
import { checkNodeModules, lockHashOf } from '../worktree/check-node-modules.ts'
import { relinkEscapingLinks } from '../worktree/copy-node-modules.ts'
import { parkNodeModules } from '../worktree/node-modules-pool.ts'
import { spawnDetached, trashFolder } from '../worktree/trash.ts'
import {
	POSIX_REHEARSAL_SCRATCH_ROOT,
	CONTRIB_KEY_PARTS,
	REHEARSAL_CONTRIB_LINE,
	REHEARSAL_CONTRIB_UNANSWERABLE,
	REHEARSAL_CONTRIB_STEP,
	REHEARSAL_DECISION_LINE,
	REHEARSAL_DECISION_WORDS,
	REHEARSAL_DECISIONS_FILE,
	REHEARSAL_FOLDER_PREFIX,
	REHEARSAL_MARKER_FILE,
	REHEARSAL_TEMPORARY_FOLDER,
	REHEARSAL_REASONS,
	REHEARSAL_REMOVED_LINE,
	REUSED_MERGE_TREE_LINE,
	UNTRACKED_WARNING_LIMIT,
} from './handover.constants.ts'
import {
	linkRehearsalSiblings,
	removeRehearsalFolder,
	unlinkRehearsalLinks,
} from './rehearsal-links.ts'
import { planRehearsal } from './rehearsal-plan.ts'
import { runHandoverFolder } from './run-handover-folder.ts'

import type { CheckKey } from '../gate-records/gate-records.types.ts'
import type { Clock } from '../progress/clock.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { BackgroundSpawner } from '../worktree/worktree.types.ts'
import type {
	HandoverFolder,
	HandoverProbe,
	RehearsalDecision,
	RehearsalPool,
	WriteLine,
} from './handover.types.ts'

export async function rehearseHandover(params: {
	handover: HandoverFolder
	write: WriteLine
	clock: Clock
	colour: boolean
	/** Asks whether the repository's own cli runs hand-overs, for the card's run line. */
	probe: HandoverProbe
	/** The folder the rehearsal folder is made in (`rehearsalScratchRoot`). */
	scratchRoot: string
	keep: boolean
	/** Where the clone and each lot announce themselves; default: start and running lines through `write`. */
	progress?: StepProgress
	/** The progress draws on a terminal. */
	tty?: boolean
	/** The terminal's width: the card wraps to it. */
	columns?: number
	/** The cli running the rehearsal, named by the card's run line when the repository's own cannot run it. */
	cliPath?: string
	/** `--resume-merge`, passed on to the guards. */
	resumeMerge?: boolean
	/** `--full`: every lot is rehearsed, whatever the records say. */
	full?: boolean
	/** Starts the background removals of the trash (the tests stand in for it); default: a detached process. */
	spawner?: BackgroundSpawner
	/** Re-points the clone's `node_modules` links at the end of a rehearsal (the tests stand in for it, to make it throw). */
	relink?: (params: { from: string; to: string; real: boolean }) => void
}): Promise<number> {
	const { handover, write } = params
	const decisions = decideLots({ handover, full: params.full ?? false })
	writeFileSync(
		join(handover.folder, REHEARSAL_DECISIONS_FILE),
		`${JSON.stringify({ at: new Date().toISOString(), lots: decisions }, null, 2)}\n`,
	)
	const contribRun = decisions.find((decision) => decision.contrib === 'run')
	// a contrib run of the tree the lots leave needs the clone, whatever the lots' records say
	const everyLotReused =
		!contribRun && decisions.every((decision) => decision.decision === 'reused')
	for (const decision of decisions) {
		write(
			REHEARSAL_DECISION_LINE.replace('{number}', String(decision.lot))
				.replace('{count}', String(decisions.length))
				.replace('{decision}', REHEARSAL_DECISION_WORDS[decision.decision])
				.replace('{reason}', decision.reason),
		)
		// no clone commits the merge: its tree, which the real run requires in the lot, is said here
		if (everyLotReused && handover.lots[decision.lot - 1].merge)
			write(REUSED_MERGE_TREE_LINE.replace('{tree}', decision.tree))
		if (decision.contrib === 'run')
			write(
				REHEARSAL_CONTRIB_LINE.replace('{number}', String(decision.lot))
					.replace('{count}', String(decisions.length))
					.replace('{tree}', decision.tree.slice(0, SHORT_SHA_LENGTH)),
			)
	}
	if (everyLotReused)
		return runHandoverFolder({
			handover,
			write,
			clock: params.clock,
			colour: params.colour,
			probe: params.probe,
			progress: params.progress,
			tty: params.tty,
			columns: params.columns,
			cliPath: params.cliPath,
			resumeMerge: params.resumeMerge,
			rehearsal: true,
			skipCommits: true,
		})
	const progress =
		params.progress ??
		createStepProgress({
			live: { tty: false, writeLine: write, rewriteLines: () => undefined },
			clock: params.clock,
		})
	const repository = handover.lotsFile.repository
	const pool = params.keep ? undefined : poolOf(repository)
	const folder = mkdtempSync(join(params.scratchRoot, REHEARSAL_FOLDER_PREFIX))
	const clone = join(folder, basename(repository))
	const hookTemporary = join(folder, REHEARSAL_TEMPORARY_FOLDER)
	mkdirSync(hookTemporary)
	write(`rehearsal in ${clone}`)
	const links: string[] = []
	/** The hook's process group is stopped first (SIGKILL after its grace), then the rehearsal folder goes. */
	function interrupted(signal: NodeJS.Signals): void {
		void stopLiveGroups(signal).then(function cleanUp() {
			removeRehearsalFolder({ folder, links })
			write(`interrupted (${signal}): the hook stopped, the rehearsal folder removed`)
			process.exit(128 + constants.signals[signal])
		})
	}
	// `on`, not `once`: the child's forwarding sees this listener and leaves the exit to it
	for (const signal of FORWARDED_SIGNALS) process.on(signal, interrupted)
	try {
		const unseen = untrackedOutsideLots(handover)
		if (unseen.length)
			write(
				`warning: untracked file(s) a hook could read in the repository, absent from the rehearsal clone (list them in .gitignore or .git/info/exclude): ${shortList(unseen)}`,
			)
		const startedAt = params.clock.now()
		const running = progress.start({
			name: 'rehearsal clone',
			...(params.tty && { detail: 'the repository, your working tree, hooks, node_modules' }),
		})
		try {
			prepareClone({ repository, clone, branch: handover.lotsFile.branch, write, pool })
			const siblings = linkRehearsalSiblings({ repository, folder, clone })
			links.push(...siblings.links)
			for (const line of siblings.lines) write(line)
		} catch (error) {
			running.finish('✗ rehearsal clone')
			throw error
		}
		running.finish(`✓ rehearsal clone  ${formatDuration(params.clock.now() - startedAt)}`)
		const contribUnanswerable = contribRun
			? await runContribInClone({
					repository,
					clone,
					branch: handover.lotsFile.branch,
					head: readGit({
						root: repository,
						args: ['rev-parse', `${handover.lotsFile.head}^{commit}`],
					}).trim(),
					tree: contribRun.tree,
					write,
					progress,
					clock: params.clock,
				})
			: undefined
		return await runHandoverFolder({
			handover,
			commitRoot: clone,
			write,
			clock: params.clock,
			colour: params.colour,
			probe: params.probe,
			progress,
			tty: params.tty,
			columns: params.columns,
			cliPath: params.cliPath,
			resumeMerge: params.resumeMerge,
			hookEnvironment: { TMPDIR: hookTemporary },
			withoutHook: new Set(
				decisions
					.filter((decision) => decision.decision === 'reused')
					.map((decision) => decision.lot),
			),
			storeRoot: repository,
			contribUnanswerable,
		})
	} finally {
		for (const signal of FORWARDED_SIGNALS) process.off(signal, interrupted)
		if (params.keep) write(`kept the rehearsal folder: ${folder}`)
		else if (pool)
			for (const line of trashRehearsalFolder({
				folder,
				clone,
				links,
				pool,
				spawner: params.spawner ?? spawnDetached,
				relink: params.relink,
			}))
				write(line)
		else {
			removeRehearsalFolder({ folder, links })
			write(REHEARSAL_REMOVED_LINE)
		}
	}
}

/**
 * The pool and the trash of the repository's workspace: its main checkout's parent holds `.worktrees/`;
 * undefined elsewhere (a repository on its own is rehearsed as before, nothing written beside it).
 */
function poolOf(repository: string): RehearsalPool | undefined {
	const main = mainCheckoutOf(repository)
	const worktreesFolder = join(dirname(main), WORKTREES_FOLDER)
	return existsSync(worktreesFolder) ? { main, worktreesFolder } : undefined
}

/**
 * The end of a rehearsal in a workspace: the clone's `node_modules` parked in the pool, the rehearsal folder
 * renamed into the trash and removed in the background; removed here when the trash is on another file system.
 * The lines to print.
 */
function trashRehearsalFolder(params: {
	folder: string
	clone: string
	links: readonly string[]
	pool: RehearsalPool
	spawner: BackgroundSpawner
	relink?: (params: { from: string; to: string; real: boolean }) => void
}): string[] {
	const { pool } = params
	const now = new Date()
	const lines: string[] = []
	const nodeModules = join(params.clone, 'node_modules')
	// a park that fails never replaces the rehearsal's result: one line, and the folder goes all the same
	try {
		// read and re-pointed while the sibling links beside the clone still resolve its `file:` dependencies
		// the lockfile's hash read with the check: the pool entry is stamped with what the check read
		const checkedLockHash = lockHashOf(params.clone)
		const check = existsSync(nodeModules) ? checkNodeModules({ worktree: params.clone }) : undefined
		if (check)
			(params.relink ?? relinkEscapingLinks)({ from: nodeModules, to: nodeModules, real: true })
		unlinkRehearsalLinks(params.links)
		if (check) {
			const parked = parkNodeModules({
				worktree: params.clone,
				repository: pool.main,
				worktreesFolder: pool.worktreesFolder,
				now,
				spawner: params.spawner,
				// the caches go with the rehearsal folder
				discardInto: params.folder,
				check,
				checkedLockHash,
			})
			lines.push(
				typeof parked === 'string'
					? `node_modules not parked: ${parked}`
					: `node_modules parked in ${parked.entry}`,
			)
		}
	} catch (error) {
		lines.push(`node_modules not parked: ${(error as Error).message}`)
	}
	try {
		const { trashed } = trashFolder({
			folder: params.folder,
			worktreesFolder: pool.worktreesFolder,
			now,
			spawner: params.spawner,
		})
		lines.push(`sent the rehearsal folder to the trash: ${trashed}`)
	} catch {
		// another file system (a rename cannot cross it): removed here, as without a trash
		// the links still there when the park failed before unlinking them
		removeRehearsalFolder({ folder: params.folder, links: params.links })
		lines.push(REHEARSAL_REMOVED_LINE)
	}
	return lines
}

/**
 * Each lot's decision; when the plan cannot be made (git cannot build a lot's tree), every lot is rehearsed
 * and the guards say what is wrong.
 */
function decideLots(params: { handover: HandoverFolder; full: boolean }): RehearsalDecision[] {
	try {
		return planRehearsal(params)
	} catch (error) {
		const reason = REHEARSAL_REASONS.noPlan.replace(
			'{error}',
			(error instanceof Error ? error.message : String(error)).split('\n')[0],
		)
		return params.handover.lots.map((_lot, index) => ({
			lot: index + 1,
			tree: '',
			decision: 'rehearsed',
			reason,
		}))
	}
}

/**
 * The folder rehearsals are made in: a short one, so the paths under it (a tool's socket in the hook's
 * temporary folder among them) stay within the system's limits.
 */
export function rehearsalScratchRoot(params: {
	platform: NodeJS.Platform
	/** The system's temporary folder (`os.tmpdir()`). */
	systemTemporaryFolder: string
}): string {
	// a Windows temporary folder has no short fixed counterpart: it stays
	return params.platform === 'win32' ? params.systemTemporaryFolder : POSIX_REHEARSAL_SCRATCH_ROOT
}

/**
 * Untracked files outside .gitignore and .git/info/exclude that no lot commits: a hook may read them. A
 * folder untracked as a whole holding several files is one entry (`scratch/`); one holding a single file
 * is that file.
 */
function untrackedOutsideLots(handover: HandoverFolder): string[] {
	const root = handover.lotsFile.repository
	const committed = handover.lots.flatMap((lot) => [...lot.files, ...lot.deletedFiles])
	const files = readGit({ root, args: ['ls-files', '--others', '--exclude-standard'] })
		.split('\n')
		.filter((file) => file && !committed.includes(file))
	return readGit({ root, args: ['ls-files', '--others', '--exclude-standard', '--directory'] })
		.split('\n')
		.flatMap(function entriesOf(entry) {
			if (!entry.endsWith('/')) return files.includes(entry) ? [entry] : []
			const inside = files.filter((file) => file.startsWith(entry))
			return inside.length > 1 ? [entry] : inside
		})
}

/** The first entries, then how many more: a warning stays one short line. */
function shortList(entries: readonly string[]): string {
	const shown = entries.slice(0, UNTRACKED_WARNING_LIMIT).join(', ')
	const more = entries.length - UNTRACKED_WARNING_LIMIT
	return more > 0 ? `${shown} and ${more} more` : shown
}

function prepareClone(params: {
	repository: string
	clone: string
	branch: string
	write: WriteLine
	/** Where the clone's `node_modules` is taken from first; none: a copy, as before. */
	pool: RehearsalPool | undefined
}): void {
	const { repository, clone, write } = params
	const head = readGit({ root: repository, args: ['rev-parse', 'HEAD'] }).trim()
	readGit({
		root: dirname(clone),
		args: ['clone', '-q', '--shared', '--no-checkout', repository, clone],
	})
	readGit({ root: clone, args: ['checkout', '-q', '-B', params.branch, head] })
	writeFileSync(
		join(clone, '.git', REHEARSAL_MARKER_FILE),
		`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
	)
	for (const key of ['user.name', 'user.email', 'commit.gpgsign']) {
		const value = readGitConfig({ root: repository, key })
		if (value !== undefined) readGit({ root: clone, args: ['config', key, value] })
	}

	const changed = copyWorkingTree({ repository, clone })
	write(`  working tree: ${changed} changed file(s) on top of ${head.slice(0, 12)}`)

	const hooks = readHooksFolder(repository)
	if (hooks.configured && isAbsolute(hooks.configured))
		readGit({ root: clone, args: ['config', 'core.hooksPath', hooks.configured] })
	else if (hooks.configured) {
		if (existsSync(hooks.folder))
			cpSync(hooks.folder, join(clone, hooks.configured), { recursive: true })
		readGit({ root: clone, args: ['config', 'core.hooksPath', hooks.configured] })
	} else if (existsSync(hooks.folder))
		cpSync(hooks.folder, join(clone, '.git', 'hooks'), { recursive: true })
	write(`  hooks: ${hooks.configured ?? 'git hooks folder'} copied`)

	const provided = provideNodeModules({
		checkout: clone,
		repository: params.pool?.main ?? repository,
		worktreesFolder: params.pool?.worktreesFolder,
		from: join(repository, 'node_modules'),
	})
	if (provided)
		write(
			provided.method === 'pooled'
				? `  node_modules: pooled ${provided.from}`
				: `  node_modules: ${provided.method}${provided.relinked.length ? `, ${provided.relinked.length} link(s) re-pointed` : ''}`,
		)
	spawnSync('git', ['update-index', '-q', '--refresh'], { cwd: clone })
}

/**
 * The repository's working tree on top of the clone at HEAD: each changed, untracked or deleted file as it is in the
 * repository. How many files were changed.
 */
function copyWorkingTree(params: { repository: string; clone: string }): number {
	const { repository, clone } = params
	const changed = listChangedFiles({ root: repository, withDeleted: true })
	for (const file of changed) {
		const source = join(repository, file)
		const target = join(clone, file)
		if (isPresent(source)) {
			mkdirSync(dirname(target), { recursive: true })
			// a link is copied as the link it is (relative, never followed), as git commits it
			if (lstatSync(source).isSymbolicLink()) {
				rmSync(target, { force: true })
				symlinkSync(readlinkSync(source), target)
			} else cpSync(source, target)
		} else {
			rmSync(target, { force: true })
			removeEmptiedFolders({ clone, folder: dirname(target) })
		}
	}
	return changed.length
}

/**
 * `dialecte contrib` in the clone, before any lot is committed there: at the lots file's HEAD (the HEAD the real
 * run's `contrib` guard keys the record with), on the tree the lots leave checked out over the working tree. Its
 * record goes to the repository's store, marked as a rehearsal's, so the card reads it and the real run's guard
 * accepts it. When the key the clone would record is not the one the guard asks for - the lots change the contrib
 * steps (a merge bringing another `dialecte.contrib`), the install or the linked dependencies, or the clone does not
 * hold the tree - no record of this hand-over can answer the real run: contrib is not run, and why is answered (and
 * printed). Afterwards the clone is put back as it was: at its branch, the repository's working tree on top, the
 * files the run left removed.
 */
async function runContribInClone(params: {
	repository: string
	clone: string
	branch: string
	/** The lots file's HEAD, as a full commit. */
	head: string
	tree: string
	write: WriteLine
	progress: StepProgress
	clock: Clock
}): Promise<string | undefined> {
	const { repository, clone, head, tree, write } = params
	const startedAt = params.clock.now()
	const running = params.progress.start({
		name: REHEARSAL_CONTRIB_STEP,
		detail: `dialecte contrib on tree ${tree.slice(0, SHORT_SHA_LENGTH)}`,
	})
	const untrackedBefore = listUntracked(clone)
	const moved = readGit({ root: clone, args: ['rev-parse', 'HEAD'] }).trim() !== head
	try {
		if (moved) readGit({ root: clone, args: ['checkout', '-q', '-f', '--detach', head] })
		readGit({ root: clone, args: ['read-tree', '-u', '--reset', tree] })
		const differing = differingKeyParts({
			expected: contribKeyOf({ root: repository, tree, head }),
			actual: contribKeyOf({ root: clone, tree: computeStateTree(clone), head }),
		})
		if (differing.length) {
			const reason = REHEARSAL_CONTRIB_UNANSWERABLE.replace('{parts}', differing.join(', '))
			running.finish(`! ${REHEARSAL_CONTRIB_STEP}  ${reason}`)
			return reason
		}
		const result = await runContrib({ cwd: clone, argv: [], storeRoot: repository })
		running.finish(
			`${result.exitCode === 0 ? '✓' : '✗'} ${REHEARSAL_CONTRIB_STEP}  ${formatDuration(params.clock.now() - startedAt)}`,
		)
		for (const line of result.output.split('\n')) write(`  ${line}`)
		return undefined
	} finally {
		if (moved) readGit({ root: clone, args: ['checkout', '-q', '-f', params.branch] })
		readGit({ root: clone, args: ['read-tree', '-u', '--reset', 'HEAD'] })
		for (const file of listUntracked(clone).filter((path) => !untrackedBefore.includes(path))) {
			rmSync(join(clone, file), { force: true })
			removeEmptiedFolders({ clone, folder: dirname(join(clone, file)) })
		}
		copyWorkingTree({ repository, clone })
		spawnSync('git', ['update-index', '-q', '--refresh'], { cwd: clone })
	}
}

/** The parts of a contrib key that differ, by what a person would change: the contrib steps, the install... */
function differingKeyParts(params: { expected: CheckKey; actual: CheckKey }): string[] {
	const { expected, actual } = params
	return CONTRIB_KEY_PARTS.filter((part) => expected[part.field] !== actual[part.field]).map(
		(part) => part.name,
	)
}

/** The untracked files of the clone git does not ignore. */
function listUntracked(clone: string): string[] {
	return readGit({ root: clone, args: ['ls-files', '--others', '--exclude-standard'] })
		.split('\n')
		.filter(Boolean)
}

/** A deleted file's folder, and each parent up to the clone, removed while empty: as git leaves the tree. */
function removeEmptiedFolders(params: { clone: string; folder: string }): void {
	for (
		let folder = params.folder;
		folder !== params.clone && folder.startsWith(params.clone) && existsSync(folder);
		folder = dirname(folder)
	) {
		if (readdirSync(folder).length) return
		rmdirSync(folder)
	}
}
