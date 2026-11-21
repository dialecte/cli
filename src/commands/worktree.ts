/**
 * `dialecte worktree add <repository> <branch> [--from <ref>] [--json]` - a worktree under the
 * workspace's `.worktrees/`, with the hooks folder, the links to sibling checkouts its `file:`
 * dependencies need, a `node_modules` (the pool's entry of its lock key, else a near entry completed by an
 * incremental install, else `npm ci`, a copy-on-write copy only when `npm ci` fails) read against
 * `package-lock.json` and the hygiene baseline; prints its card (with the `npm ci` to run when `node_modules`
 * differs from the lockfile).
 *
 * `dialecte worktree prune [--root <workspace>] [--yes] [--json]` - what a merge leaves behind: merged
 * worktrees and branches, committed hand-over folders, rehearsal clones. Prints each removal command with
 * its absolute `cd`; runs them only with `--yes`, after a confirmation on a terminal.
 *
 * `dialecte worktree prune [--root <workspace>] --reclaim [--dry-run] [--older-than <days>]` - the node_modules of
 * worktrees idle for `--older-than` days (default 2) parked in the pool or sent to the trash, the code left (a review
 * throwaway's too); one line per worktree and the total; `--dry-run` moves nothing.
 */
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { renderCard } from '../lib/card/render-card.ts'
import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { LIST_DEPTH } from '../lib/handover/handover.constants.ts'
import { findHandoverFolders } from '../lib/handover/list-handovers.ts'
import { machineScratchRoots } from '../lib/handover/rehearse-handover.ts'
import { jsonOf, printOut } from '../lib/print/print.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { COMMIT_PLAN_FOLDER, WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { findWorkspace } from '../lib/workspace.ts'
import {
	addWorktree,
	nodeModulesDetailOf,
	refuseRepositoryPath,
} from '../lib/worktree/add-worktree.ts'
import { listProcessFolders } from '../lib/worktree/process-folders.ts'
import {
	executeReclaim,
	planPrune,
	planReclaim,
	reclaimItemLine,
	reclaimTotalLine,
	trashPoolLeftOver,
	scratchTrashOf,
	trashPrunedFolder,
} from '../lib/worktree/prune-worktrees.ts'
import { spawnDetached } from '../lib/worktree/trash.ts'
import {
	NODE_MODULES_PROBLEMS_SHOWN,
	PACKAGE_LOCK_FILE,
	RECLAIM_OLDER_THAN_DAYS,
	RECLAIM_OLDER_THAN_PATTERN,
	RECLAIM_USAGE,
} from '../lib/worktree/worktree.constants.ts'

import type { Card, CardRow } from '../lib/card/card.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	AddedWorktree,
	BackgroundSpawner,
	NodeModulesSource,
	NpmRunner,
	PruneItem,
	ProcessFolder,
	PrunePlan,
	SiblingLink,
	WorkspacePrunePlan,
} from '../lib/worktree/worktree.types.ts'

export async function run(argv: string[]): Promise<void> {
	const [subcommand, ...rest] = argv
	const result =
		subcommand === 'add'
			? runWorktreeAdd({
					argv: rest,
					cwd: process.cwd(),
					now: new Date(),
					colour: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
				})
			: subcommand === 'prune'
				? await runWorktreePrune({
						argv: rest,
						cwd: process.cwd(),
						...machineScratchRoots({ cwd: process.cwd() }),
						isTerminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
						confirm: askOnTerminal,
					})
				: resultOf({
						exitCode: 2,
						lines: [
							'worktree: add <repository> <branch> [--from <ref>] | prune [--root <dir>] [--yes] | prune [--root <dir>] --reclaim [--dry-run] [--older-than <days>]',
						],
					})
	printOut({ stream: result.exitCode === 0 ? 'stdout' : 'stderr', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runWorktreeAdd(params: {
	argv: string[]
	cwd: string
	now: Date
	colour: boolean
	/** Runs `npm install` / `npm ci` in the new worktree (the tests stand in for it); default: spawns `npm`. */
	install?: NpmRunner
}): CommandResult {
	const { argv } = params
	const [repository, branch] = positionalArguments({ argv, valueOptions: ['from'] })
	if (!repository || !branch)
		return resultOf({
			exitCode: 2,
			lines: ['worktree add: expected <repository> <branch> [--from <ref>]'],
		})
	const repositoryPath = resolve(params.cwd, repository)
	const refusal = refuseRepositoryPath(repositoryPath)
	if (refusal) return resultOf({ exitCode: 2, lines: [`worktree add: ${refusal}`] })
	const added = addWorktree({
		repository: repositoryPath,
		branch,
		from: getArg(argv, 'from'),
		now: params.now,
		install: params.install,
	})
	if (typeof added === 'string') return resultOf({ exitCode: 1, lines: [`worktree add: ${added}`] })
	if (hasFlag(argv, 'json')) return { exitCode: 0, output: jsonOf(added, 2) }
	return { exitCode: 0, output: renderCard({ card: worktreeCard(added), colour: params.colour }) }
}

export async function runWorktreePrune(params: {
	argv: string[]
	cwd: string
	/** Where rehearsal clones are looked for. */
	scratchRoot: string
	/**
	 * Where earlier cli versions made rehearsal clones (the system's temporary folder), looked in too when
	 * it is not `scratchRoot`.
	 */
	formerScratchRoot?: string
	/** The cli's scratch root, whose leaked folders go to the trash; default: none read. */
	scratchFolderRoot?: string
	isTerminal: boolean
	confirm: (question: string) => Promise<boolean>
	/** The clock `--reclaim` measures idleness from, and a pool left-over's age; default: now. */
	now?: Date
	/**
	 * Lists the processes and their working folders for `--reclaim` and the pool left-overs (the tests stand in for it);
	 * default: the system's.
	 */
	listProcesses?: () => ProcessFolder[] | string
	/** Starts the background removals of the trash, `--reclaim`'s and a pool left-over's (the tests record them); default: `spawnDetached`. */
	spawner?: BackgroundSpawner
}): Promise<CommandResult> {
	const { argv } = params
	if (hasFlag(argv, 'reclaim')) return runWorktreeReclaim(params)
	if (hasFlag(argv, 'dry-run') || hasFlag(argv, 'older-than'))
		return resultOf({
			exitCode: 2,
			lines: ['worktree prune: --dry-run and --older-than go with --reclaim', RECLAIM_USAGE],
		})
	const workspace = resolve(
		params.cwd,
		getArg(argv, 'root') ?? findWorkspace(params.cwd) ?? params.cwd,
	)
	const plan = planPrune({
		workspace,
		handoverFolders: findHandoverFolders({
			folder: join(workspace, COMMIT_PLAN_FOLDER),
			depth: LIST_DEPTH,
		}),
		scratchRoot: params.scratchRoot,
		formerScratchRoot: params.formerScratchRoot,
		scratchFolderRoot: params.scratchFolderRoot,
		now: params.now,
		listProcesses: params.listProcesses,
	})
	const removals = [
		...plan.repositories.flatMap((repository) => repository.items),
		...plan.scratch,
		...plan.poolLeftOver,
	]
		.filter((item) => item.command)
		.sort((left, right) => removalOrder(left) - removalOrder(right))
	if (hasFlag(argv, 'json')) return { exitCode: 0, output: jsonOf(plan, 2) }
	const report = renderPrunePlan({ plan, removals })
	if (!hasFlag(argv, 'yes') || removals.length === 0)
		return resultOf({
			exitCode: 0,
			lines: [
				...report,
				removals.length ? 'Run them with --yes (asks first), or one by one.' : 'Nothing to remove.',
			],
		})
	if (!params.isTerminal)
		return resultOf({
			exitCode: 2,
			lines: [
				...report,
				'worktree prune --yes asks for a confirmation on a terminal: there is none here, run the commands above yourself.',
			],
		})
	if (!(await params.confirm(`Remove these ${removals.length} item(s)? [y/N] `)))
		return resultOf({ exitCode: 0, lines: [...report, 'Nothing removed.'] })
	const worktreesFolder = join(workspace, WORKTREES_FOLDER)
	let processes: readonly ProcessFolder[] | string | undefined
	/** The processes, listed once for the whole run and only when a pool left-over is about to go. */
	function listProcessesOnce(): readonly ProcessFolder[] | string {
		processes ??= (params.listProcesses ?? listProcessFolders)()
		return processes
	}
	const outcomes = removals.map(function remove(item) {
		// a park that never finished goes to the trash, its keep rules read again just before
		if (item.kind === 'pool left-over')
			return trashPoolLeftOver({
				folder: item.name,
				worktreesFolder,
				now: params.now ?? new Date(),
				spawner: params.spawner ?? spawnDetached,
				listProcesses: listProcessesOnce,
			})
		// a hand-over folder goes to the workspace's trash: the move its line shows, never a removal in place
		if (item.kind === 'hand-over')
			return trashPrunedFolder({
				folder: item.name,
				worktreesFolder,
				now: params.now ?? new Date(),
				spawner: params.spawner ?? spawnDetached,
			})
		// a rehearsal clone or a scratch folder goes to the trash its line names: the workspace's for its own scratch
		// root, else the scratch root's own (a move never crosses file systems)
		if (item.kind === 'rehearsal clone' || item.kind === 'scratch folder') {
			const trash = scratchTrashOf({ root: dirname(item.name), worktreesFolder })
			return trashPrunedFolder({
				folder: item.name,
				worktreesFolder: dirname(trash),
				trashName: basename(trash),
				now: params.now ?? new Date(),
				spawner: params.spawner ?? spawnDetached,
			})
		}
		const result = spawnSync('sh', ['-c', item.command ?? ''], { encoding: 'utf8' })
		return result.status === 0
			? `✓ ${item.command}`
			: `✗ ${item.command}: ${(result.stderr || result.stdout).trim()}`
	})
	return resultOf({
		exitCode: outcomes.some((line) => line.startsWith('✗')) ? 1 : 0,
		lines: [...report, ...outcomes],
	})
}

/**
 * `worktree prune --reclaim [--dry-run] [--older-than <days>]`: one line per worktree, the moves done (none with
 * `--dry-run`), the total (worktrees, files, size) at the end.
 */
function runWorktreeReclaim(params: {
	argv: string[]
	cwd: string
	scratchRoot: string
	formerScratchRoot?: string
	now?: Date
	listProcesses?: () => ProcessFolder[] | string
	spawner?: BackgroundSpawner
}): CommandResult {
	const { argv } = params
	const olderThanDays = readOlderThanDays(argv)
	if (olderThanDays === undefined)
		return resultOf({
			exitCode: 2,
			lines: [
				'worktree prune --reclaim: --older-than takes a positive whole number of days',
				RECLAIM_USAGE,
			],
		})
	const workspace = resolve(
		params.cwd,
		getArg(argv, 'root') ?? findWorkspace(params.cwd) ?? params.cwd,
	)
	const scratchRoots = [
		...new Set([params.scratchRoot, params.formerScratchRoot ?? params.scratchRoot]),
	]
	const now = params.now ?? new Date()
	const plan = planReclaim({
		workspace,
		now,
		olderThanDays,
		listProcesses: params.listProcesses,
		scratchRoots,
	})
	if (hasFlag(argv, 'dry-run'))
		return resultOf({
			exitCode: 0,
			lines: [
				...plan.items.map((item) => reclaimItemLine({ item, workspace })),
				reclaimTotalLine(plan.items),
			],
		})
	const outcomes = executeReclaim({
		plan,
		workspace,
		now,
		spawner: params.spawner,
		listProcesses: params.listProcesses,
		scratchRoots,
	})
	const moved = new Set(
		outcomes.filter((outcome) => outcome.moved).map((outcome) => outcome.worktree),
	)
	return resultOf({
		exitCode: 0,
		lines: [
			...outcomes.map((outcome) => outcome.line),
			reclaimTotalLine(plan.items.filter((item) => moved.has(item.worktree))),
		],
	})
}

/** `--older-than <days>`: a positive whole number, `RECLAIM_OLDER_THAN_DAYS` without the flag; undefined when invalid. */
function readOlderThanDays(argv: string[]): number | undefined {
	if (!hasFlag(argv, 'older-than')) return RECLAIM_OLDER_THAN_DAYS
	const value = getArg(argv, 'older-than') ?? ''
	return RECLAIM_OLDER_THAN_PATTERN.test(value) ? Number(value) : undefined
}

/** Worktrees first (a branch checked out in one cannot be deleted), then branches, folders, clones. */
function removalOrder(item: PruneItem): number {
	return [
		'worktree',
		'branch',
		'hand-over',
		'rehearsal clone',
		'scratch folder',
		'pool left-over',
	].indexOf(item.kind)
}

function renderPrunePlan(params: { plan: WorkspacePrunePlan; removals: PruneItem[] }): string[] {
	const lines: string[] = []
	for (const repository of params.plan.repositories) lines.push(...renderRepository(repository))
	for (const [heading, kind] of [
		['rehearsal clones', 'rehearsal clone'],
		['scratch folders', 'scratch folder'],
	] as const) {
		const items = params.plan.scratch.filter((item) => item.kind === kind)
		if (items.length) lines.push(heading)
		for (const item of items)
			lines.push(item.kept ? `  keep    ${item.name}  (${item.kept})` : `  remove  ${item.name}`)
	}
	// what prune never touches: the pool is taken by the next worktree, the trash empties itself
	const pooled = params.plan.pool.reduce((total, repository) => total + repository.entries, 0)
	if (pooled > 0)
		lines.push(
			`pool: ${pooled} entr${pooled === 1 ? 'y' : 'ies'} (${params.plan.pool.map((repository) => `${repository.repository} ${repository.entries}`).join(', ')})`,
		)
	for (const item of params.plan.poolLeftOver)
		lines.push(
			`pool: ${item.name} left over (no pool.json: a park that never finished), ${item.kept ? `kept: ${item.kept}` : 'to the trash'}`,
		)
	for (const trash of params.plan.scratchTrash)
		if (trash.folders > 0)
			lines.push(
				`rehearsal trash: ${trash.folders} folder${trash.folders === 1 ? '' : 's'} in ${trash.folder}, being deleted or left over`,
			)
	if (params.plan.trash > 0)
		lines.push(
			`trash: ${params.plan.trash} folder${params.plan.trash === 1 ? '' : 's'}, being deleted or left over`,
		)
	if (params.removals.length)
		lines.push('Removal commands:', ...params.removals.map((item) => item.command ?? ''))
	return lines
}

function renderRepository(plan: PrunePlan): string[] {
	const header =
		plan.baseBranch === undefined
			? plan.repository
			: `${plan.repository}  (base ${plan.baseBranch})`
	if (plan.skipped) return [`${header}: skipped, ${plan.skipped}`]
	if (plan.items.length === 0) return [`${header}: nothing merged to remove`]
	return [
		header,
		...plan.items.map((item) =>
			item.kept
				? `  keep    ${item.kind}  ${item.name}  (${item.kept})`
				: `  remove  ${item.kind}  ${item.name}`,
		),
	]
}

function worktreeCard(added: AddedWorktree): Card {
	return {
		title: 'worktree',
		rows: [
			{ label: 'repository', lines: [added.repository] },
			{ label: 'worktree', lines: [added.worktree] },
			{ label: 'branch', lines: [`${added.branch} (from ${added.from})`] },
			...(added.fetchProblem ? [{ label: 'origin', lines: [added.fetchProblem] }] : []),
			{ label: 'HEAD', lines: [added.head.slice(0, 12)] },
			{ label: 'hooks', lines: [added.hooks ? `${added.hooks} copied` : 'none to copy'] },
			...linksRows({
				links: added.siblingLinks,
				workspace: dirname(added.repository),
				worktree: added.worktree,
			}),
			{
				label: 'node_modules',
				lines: [nodeModulesLine(added.nodeModules)],
			},
			{ label: 'lockfile', lines: [lockfileLine(added)] },
			...(added.nodeModulesCheck.command
				? [{ label: 'next', lines: [added.nodeModulesCheck.command] }]
				: []),
			{
				label: 'hygiene',
				lines: [
					`baseline: HEAD ${added.head.slice(0, 12)}, ${added.baseline.stashCommits.length} stash entr${added.baseline.stashCommits.length === 1 ? 'y' : 'ies'} known`,
				],
			},
			{ label: 'go', lines: [`cd ${shellQuote(added.worktree)}`] },
		],
	}
}

/**
 * One line per sibling link: the link from the workspace, the dependency's path from the worktree, the
 * outcome (`.worktrees/core -> ../core created`); no row without one.
 */
function linksRows(params: {
	links: SiblingLink[]
	workspace: string
	worktree: string
}): CardRow[] {
	const { links } = params
	if (links.length === 0) return []
	return [
		{
			label: 'links',
			lines: links.map(
				(link) =>
					`${relative(params.workspace, link.link)} -> ${relative(params.worktree, link.link)} ${link.outcome}`,
			),
		},
	]
}

/**
 * Where `node_modules` came from and how long it took: `pooled  _pool-cli-1  0.1 s`, `near  _pool-cli-1, 1 package(s)
 * differ  4.2 s`, `installed  npm ci (pool empty)  31.0 s`, `copy-on-write  npm ci failed: <its first line>  46.2 s`.
 */
function nodeModulesLine(source: NodeModulesSource | undefined): string {
	if (!source) return 'none in the main checkout'
	const detail = nodeModulesDetailOf(source)
	return `${source.method}${detail && `  ${detail}`}  ${source.seconds.toFixed(1)} s`
}

/** `node_modules` against the lockfile: matching, the first packages that differ, or not checked. */
function lockfileLine(added: AddedWorktree): string {
	const { lockfile, notChecked, problems } = added.nodeModulesCheck
	if (lockfile === undefined) return `no ${PACKAGE_LOCK_FILE}: not checked`
	if (notChecked) return `${lockfile} ${notChecked}: not checked`
	if (problems.length === 0)
		return `✓ node_modules matches ${lockfile} (${added.lockedPackages} packages)`
	const shown = problems
		.slice(0, NODE_MODULES_PROBLEMS_SHOWN)
		.map((problem) => `${problem.package} ${problem.problem}`)
	const more = problems.length - shown.length
	return `✗ ${problems.length} package(s) differ from ${lockfile}: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}`
}

async function askOnTerminal(question: string): Promise<boolean> {
	const terminal = createInterface({ input: process.stdin, output: process.stdout })
	const answer = await terminal.question(question)
	terminal.close()
	return /^y(es)?$/i.test(answer.trim())
}
