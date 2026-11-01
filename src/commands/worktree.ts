/**
 * `dialecte worktree add <repository> <branch> [--from <ref>] [--json]` - a worktree under the
 * workspace's `.worktrees/`, with the hooks folder, the links to sibling checkouts its `file:`
 * dependencies need, a copy-on-write `node_modules` read against `package-lock.json` and the hygiene
 * baseline; prints its card (with the `npm ci` to run when `node_modules` differs from the lockfile).
 *
 * `dialecte worktree prune [--root <workspace>] [--yes] [--json]` - what a merge leaves behind: merged
 * worktrees and branches, committed hand-over folders, rehearsal clones. Prints each removal command with
 * its absolute `cd`; runs them only with `--yes`, after a confirmation on a terminal.
 */
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { renderCard } from '../lib/card/render-card.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { LIST_DEPTH } from '../lib/handover/handover.constants.ts'
import { findHandoverFolders } from '../lib/handover/list-handovers.ts'
import { rehearsalScratchRoot } from '../lib/handover/rehearse-handover.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { COMMIT_PLAN_FOLDER } from '../lib/workspace.constants.ts'
import { findWorkspace } from '../lib/workspace.ts'
import { addWorktree } from '../lib/worktree/add-worktree.ts'
import { planPrune } from '../lib/worktree/prune-worktrees.ts'
import {
	NODE_MODULES_PROBLEMS_SHOWN,
	PACKAGE_LOCK_FILE,
} from '../lib/worktree/worktree.constants.ts'

import type { Card, CardRow } from '../lib/card/card.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	AddedWorktree,
	PruneItem,
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
						scratchRoot: rehearsalScratchRoot({
							platform: process.platform,
							systemTemporaryFolder: tmpdir(),
						}),
						formerScratchRoot: tmpdir(),
						isTerminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
						confirm: askOnTerminal,
					})
				: {
						exitCode: 2,
						output:
							'worktree: add <repository> <branch> [--from <ref>] | prune [--root <dir>] [--yes]',
					}
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runWorktreeAdd(params: {
	argv: string[]
	cwd: string
	now: Date
	colour: boolean
}): CommandResult {
	const { argv } = params
	const [repository, branch] = positionalArguments({ argv, valueOptions: ['from'] })
	if (!repository || !branch)
		return { exitCode: 2, output: 'worktree add: expected <repository> <branch> [--from <ref>]' }
	const added = addWorktree({
		repository: resolve(params.cwd, repository),
		branch,
		from: getArg(argv, 'from'),
		now: params.now,
	})
	if (typeof added === 'string') return { exitCode: 1, output: `worktree add: ${added}` }
	if (hasFlag(argv, 'json')) return { exitCode: 0, output: JSON.stringify(added, null, 2) }
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
	isTerminal: boolean
	confirm: (question: string) => Promise<boolean>
}): Promise<CommandResult> {
	const { argv } = params
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
	})
	const removals = [...plan.repositories.flatMap((repository) => repository.items), ...plan.scratch]
		.filter((item) => item.command)
		.sort((left, right) => removalOrder(left) - removalOrder(right))
	if (hasFlag(argv, 'json')) return { exitCode: 0, output: JSON.stringify(plan, null, 2) }
	const report = renderPrunePlan({ plan, removals })
	if (!hasFlag(argv, 'yes') || removals.length === 0)
		return {
			exitCode: 0,
			output: removals.length
				? `${report}\nRun them with --yes (asks first), or one by one.`
				: `${report}\nNothing to remove.`,
		}
	if (!params.isTerminal)
		return {
			exitCode: 2,
			output: `${report}\nworktree prune --yes asks for a confirmation on a terminal: there is none here, run the commands above yourself.`,
		}
	if (!(await params.confirm(`Remove these ${removals.length} item(s)? [y/N] `)))
		return { exitCode: 0, output: `${report}\nNothing removed.` }
	const outcomes = removals.map(function remove(item) {
		const result = spawnSync('sh', ['-c', item.command ?? ''], { encoding: 'utf8' })
		return result.status === 0
			? `✓ ${item.command}`
			: `✗ ${item.command}: ${(result.stderr || result.stdout).trim()}`
	})
	return {
		exitCode: outcomes.some((line) => line.startsWith('✗')) ? 1 : 0,
		output: [report, ...outcomes].join('\n'),
	}
}

/** Worktrees first (a branch checked out in one cannot be deleted), then branches, folders, clones. */
function removalOrder(item: PruneItem): number {
	return ['worktree', 'branch', 'hand-over', 'rehearsal clone'].indexOf(item.kind)
}

function renderPrunePlan(params: { plan: WorkspacePrunePlan; removals: PruneItem[] }): string {
	const lines: string[] = []
	for (const repository of params.plan.repositories) lines.push(...renderRepository(repository))
	if (params.plan.scratch.length) {
		lines.push('rehearsal clones')
		for (const item of params.plan.scratch)
			lines.push(item.kept ? `  keep    ${item.name}  (${item.kept})` : `  remove  ${item.name}`)
	}
	if (params.removals.length)
		lines.push('Removal commands:', ...params.removals.map((item) => item.command ?? ''))
	return lines.join('\n')
}

function renderRepository(plan: PrunePlan): string[] {
	const header = `${plan.repository}  (base ${plan.baseBranch})`
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
			{ label: 'HEAD', lines: [added.head.slice(0, 12)] },
			{ label: 'hooks', lines: [added.hooks ? `${added.hooks} copied` : 'none to copy'] },
			...linksRows({
				links: added.siblingLinks,
				workspace: dirname(added.repository),
				worktree: added.worktree,
			}),
			{
				label: 'node_modules',
				lines: [
					added.nodeModules
						? `${added.nodeModules.method}${added.nodeModules.relinked.length ? `, ${added.nodeModules.relinked.length} link(s) re-pointed` : ''}`
						: 'none in the main checkout',
				],
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
