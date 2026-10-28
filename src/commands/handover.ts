/**
 * `dialecte handover <lots.json> [--out <dir>] [--rehash]` - the commit-by-lots hand-over a human runs.
 * From a lots file (repository, expected branch and HEAD, lots with paths and messages) it checks every
 * guard, then writes `commit.sh` with the same guards for the moment it runs, and takes the
 * repository's hand-over lock. The agent never commits; the script never pushes.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { getArg, hasFlag } from '../lib/config.ts'
import { readHandoverLock } from '../lib/handover/handover-lock.ts'
import { COMMIT_SCRIPT_FILE, HEAD_PATTERN } from '../lib/handover/handover.constants.ts'
import { planHandover } from '../lib/handover/plan-handover.ts'
import { writeHandover } from '../lib/handover/write-handover.ts'
import { readReferencePatterns } from '../lib/rules/committed-text.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LotsFile, LotSummary } from '../lib/handover/handover.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runHandover({ argv })
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runHandover(params: { argv: string[] }): CommandResult {
	const { argv } = params
	const lotsPath = argv.find(
		(argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--out',
	)
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

	const summaries = writeHandover({ plan, referencePatterns, out })
	const fileCount = summaries.reduce((total, summary) => total + summary.fileCount, 0)
	return {
		exitCode: 0,
		output: [
			`handover: ${summaries.length} lot(s), ${fileCount} file(s), on ${plan.branch} at ${plan.head.slice(0, 12)}`,
			...summaries.map(renderSummary),
			'Run it (the repository stays locked for `dialecte gate` until it has committed):',
			`cd ${JSON.stringify(out)} && bash ${COMMIT_SCRIPT_FILE}`,
		].join('\n'),
	}
}

/** The lots file, with a relative repository resolved from its folder; or what is wrong with it. */
function readLotsFile(path: string): LotsFile | string {
	if (!existsSync(path)) return `${path} does not exist`
	let parsed: Partial<LotsFile>
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LotsFile>
	} catch (error) {
		return `${path} is not JSON (${error instanceof Error ? error.message : String(error)})`
	}
	const { repository, branch, head, lots } = parsed
	if (typeof repository !== 'string' || typeof branch !== 'string' || typeof head !== 'string')
		return `${path} needs "repository", "branch" and "head"`
	if (!HEAD_PATTERN.test(head))
		return `${path}: "head" must be a commit sha or a prefix of one (7 to 40 hexadecimal digits)`
	if ([repository, branch].some((value) => !value || /[\r\n]/.test(value)))
		return `${path}: "repository" and "branch" are one non-empty line each`
	if (
		!Array.isArray(lots) ||
		lots.length === 0 ||
		!lots.every((lot) => Array.isArray(lot?.paths) && typeof lot?.message === 'string')
	)
		return `${path} needs "lots": [{ "paths": [...], "message": "..." }]`
	return {
		...parsed,
		repository: isAbsolute(repository) ? repository : resolve(dirname(path), repository),
		branch,
		head,
		lots,
	}
}

function renderSummary(summary: LotSummary): string {
	return `  lot ${summary.index}  ${summary.fileCount} file(s)  +${summary.insertions} -${summary.deletions}  ${summary.snapshot.slice(0, 12)}  ${summary.subject}`
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
