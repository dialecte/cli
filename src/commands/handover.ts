/**
 * `dialecte handover <lots.json> [--out <dir>] [--rehash] [--json]` - the commit-by-lots hand-over a human
 * runs. From a lots file (repository, expected branch and HEAD, lots with paths and messages) it checks
 * every guard, then writes the hand-over folder (the lots file, the snapshot and a one-line `commit.sh`)
 * and the card a person reviews, and takes the repository's hand-over lock.
 *
 * `dialecte handover run <folder> [--rehearse [--keep]]` - what `commit.sh` runs: the guards again, each
 * on its own line with its duration, then lot after lot with the hook's output, a heartbeat while it is
 * silent, and the card at the end; a rerun resumes after the lots already committed.
 *
 * `dialecte handover list [--root <dir>] [--json]` - every hand-over folder and where it stands.
 *
 * The agent never commits; the run never pushes.
 */
import { existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { renderCard } from '../lib/card/render-card.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { buildHandoverCard, handoverCardRows } from '../lib/handover/handover-card.ts'
import { readHandoverLock } from '../lib/handover/handover-lock.ts'
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'
import { listHandovers } from '../lib/handover/list-handovers.ts'
import { planHandover } from '../lib/handover/plan-handover.ts'
import { readHandoverFolder } from '../lib/handover/read-handover-folder.ts'
import { readLotsFile } from '../lib/handover/read-lots-file.ts'
import { rehearseHandover } from '../lib/handover/rehearse-handover.ts'
import { runHandoverFolder } from '../lib/handover/run-handover-folder.ts'
import { writeHandover } from '../lib/handover/write-handover.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { readReferencePatterns } from '../lib/rules/committed-text.ts'
import { COMMIT_PLAN_FOLDER } from '../lib/workspace.constants.ts'
import { findWorkspace } from '../lib/workspace.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HandoverListing, WriteLine } from '../lib/handover/handover.types.ts'
import type { Clock } from '../lib/progress/clock.types.ts'

export async function run(argv: string[]): Promise<void> {
	const colour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
	if (argv[0] === 'run') {
		const exitCode = await runHandoverRun({
			argv: argv.slice(1),
			write: (line) => console.log(line),
			clock: createSystemClock(),
			colour,
			scratchRoot: tmpdir(),
		})
		if (exitCode !== 0) process.exit(exitCode)
		return
	}
	const result =
		argv[0] === 'list'
			? runHandoverList({ argv: argv.slice(1), cwd: process.cwd(), now: Date.now() })
			: runHandover({ argv, cliPath: realpathSync(process.argv[1]), colour })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runHandover(params: {
	argv: string[]
	/** The cli writing the hand-over: the script's fallback when the repository installs none that runs it. */
	cliPath: string
	colour?: boolean
}): CommandResult {
	const { argv } = params
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

	const heldBy = readHandoverLock(lotsFile.repository)
	if (heldBy && heldBy !== scriptPath && existsSync(heldBy))
		return refused([`the repository is held by ${heldBy}: run it, or delete it and its lock`])

	const referencePatterns = readReferencePatterns(lotsFile.repository)
	const { plan, refusals } = planHandover({ lotsFile, referencePatterns })
	if (refusals.length) return refused(refusals)

	writeHandover({ plan, lotsFile, lotsPath: absoluteLotsPath, out, cliPath: params.cliPath })
	const card = buildHandoverCard({
		root: plan.repository,
		folder: out,
		branch: plan.branch,
		head: plan.head,
		gates: plan.gates,
		lots: plan.lots,
		commits: [],
	})
	if (hasFlag(argv, 'json'))
		return { exitCode: 0, output: JSON.stringify({ folder: out, ...card }, null, 2) }
	return {
		exitCode: 0,
		output: [
			renderCard({ card: handoverCardRows(card), colour: params.colour ?? false }),
			`Review the card, then run it (the repository stays locked for \`dialecte gate\` until every lot is committed):`,
			card.command,
		].join('\n'),
	}
}

/** `handover run <folder> [--rehearse [--keep]]`; `handover run --probe` answers that this cli has the command. */
export async function runHandoverRun(params: {
	argv: string[]
	write: WriteLine
	clock: Clock
	colour: boolean
	/** Where `--rehearse` makes its clone. */
	scratchRoot: string
}): Promise<number> {
	const { argv, write } = params
	if (hasFlag(argv, 'probe')) {
		write('handover run')
		return 0
	}
	const [folder] = positionalArguments({ argv, valueOptions: [] })
	if (!folder) {
		write('handover run: expected the hand-over folder (where commit.sh is)')
		return 2
	}
	const handover = readHandoverFolder(folder)
	if (typeof handover === 'string') {
		write(`handover run: ${handover}`)
		return 2
	}
	write(`handover run ${handover.folder}`)
	if (hasFlag(argv, 'rehearse'))
		return rehearseHandover({
			handover,
			write,
			clock: params.clock,
			colour: params.colour,
			scratchRoot: params.scratchRoot,
			keep: hasFlag(argv, 'keep'),
		})
	return runHandoverFolder({ handover, write, clock: params.clock, colour: params.colour })
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
	const rows = [
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
	]
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
