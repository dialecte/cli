/**
 * `dialecte ci sync [--dry-run] | check | publish-decision`: the CI-first file set shipped as a template
 * (`templates/ci/`). `sync` writes it into the package (workflows, PR template, `.nvmrc`, `changes/.gitkeep`) and
 * deletes the retired and unselected files it manages; `check` reports what differs (CI runs it in `_check.yml`);
 * `publish-decision` is the publish guard `_check-npm-version.yml` runs on the push to main. The repository's own
 * `_test.yml` is never written: it is checked against what ci.yml needs of it.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { readCiFacts } from '../lib/ci/ci-facts.ts'
import { OWN_TEST_PATH, RETIRED_PATHS } from '../lib/ci/ci-template.constants.ts'
import { planCiSync, readCiTemplate, renderCiFiles } from '../lib/ci/ci-template.ts'
import { unifiedDiff } from '../lib/ci/text-diff.ts'
import { printLines, printOut, textOf } from '../lib/print/print.ts'
import { runPublishDecision } from '../lib/release/publish-decision.ts'
import { CI_LINES, CI_USAGE, DRY_RUN_FLAG, PUBLISH_DECISION_VERB } from './ci.constants.ts'

import type { CiChange, CiPlan, TestContract } from '../lib/ci/ci-template.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { CommandResult as ProcessResult } from '../lib/release/publish-decision.types.ts'
import type { DecisionResult, PrintedLine } from './ci.types.ts'

export async function run(argv: string[]): Promise<void> {
	if (argv.length === 1 && argv[0] === PUBLISH_DECISION_VERB) {
		const decision = runCiPublishDecision({ cwd: process.cwd(), environment: process.env })
		for (const printed of decision.lines)
			printLines({ stream: printed.stream, lines: [printed.line] })
		if (decision.exitCode !== 0) process.exit(decision.exitCode)
		return
	}
	const result = runCi({ cwd: process.cwd(), argv })
	printOut({ stream: result.exitCode === 0 ? 'stdout' : 'stderr', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

/** sync and check (publish-decision runs through `runCiPublishDecision`); any other word is a usage error. */
export function runCi(params: { cwd: string; argv: string[] }): CommandResult {
	const [verb, ...flags] = params.argv
	const dryRun = verb === 'sync' && flags.length === 1 && flags[0] === DRY_RUN_FLAG
	if ((verb !== 'sync' && verb !== 'check') || (flags.length > 0 && !dryRun))
		return { exitCode: 2, output: textOf([CI_USAGE]) }
	const read = readCiFacts(params.cwd)
	if ('refusal' in read)
		return { exitCode: 2, output: textOf([CI_LINES.refused.replace('{reason}', read.refusal)]) }
	const template = readCiTemplate()
	const plan = planCiSync({
		root: params.cwd,
		wanted: renderCiFiles({ facts: read.facts, template }),
		managed: [...template.keys(), ...RETIRED_PATHS],
	})
	if (verb === 'check') return checkResult({ plan, contract: read.contract })
	if (!dryRun) applyChanges({ root: params.cwd, changes: plan.changes })
	return syncResult({ plan, contract: read.contract, dryRun })
}

/** sync's answer: each change (an update with its diff), then the own files and the contract. */
function syncResult(params: {
	plan: CiPlan
	contract: TestContract
	dryRun: boolean
}): CommandResult {
	const { plan, contract } = params
	const changes = plan.changes.length === 0 ? [CI_LINES.inStep] : plan.changes.flatMap(syncLinesOf)
	return {
		exitCode: contract.findings.length > 0 ? 1 : 0,
		output: textOf([...changes, ...tailLines(params), ...(params.dryRun ? [CI_LINES.dryRun] : [])]),
	}
}

/** check's answer: each drifted path (an update with its diff) and the fix, then the own files and the contract. */
function checkResult(params: { plan: CiPlan; contract: TestContract }): CommandResult {
	const { plan, contract } = params
	const drift =
		plan.changes.length === 0
			? [CI_LINES.inStep]
			: [...plan.changes.flatMap(driftLinesOf), CI_LINES.fix]
	return {
		exitCode: plan.changes.length > 0 || contract.findings.length > 0 ? 1 : 0,
		output: textOf([...drift, ...tailLines(params)]),
	}
}

function syncLinesOf(change: CiChange): string[] {
	if (change.kind === 'create') return [CI_LINES.created.replace('{path}', change.path)]
	if (change.kind === 'delete') return [CI_LINES.deleted.replace('{path}', change.path)]
	return [CI_LINES.updated.replace('{path}', change.path), ...unifiedDiff(change)]
}

function driftLinesOf(change: CiChange): string[] {
	if (change.kind === 'create') return [CI_LINES.missing.replace('{path}', change.path)]
	if (change.kind === 'delete') return [CI_LINES.extra.replace('{path}', change.path)]
	return [CI_LINES.differs.replace('{path}', change.path), ...unifiedDiff(change)]
}

/** The own workflow files, then each finding of the own test workflow's contract. */
function tailLines(params: { plan: CiPlan; contract: TestContract }): string[] {
	return [
		...(params.plan.own.length > 0
			? [CI_LINES.own.replace('{paths}', params.plan.own.join(', '))]
			: []),
		...params.contract.findings.map((finding) =>
			CI_LINES.contract.replace('{path}', OWN_TEST_PATH).replace('{finding}', finding),
		),
	]
}

/** Writes each created or updated file and deletes each deleted one. */
function applyChanges(params: { root: string; changes: readonly CiChange[] }): void {
	for (const change of params.changes) {
		const file = join(params.root, change.path)
		if (change.kind === 'delete') {
			rmSync(file)
			continue
		}
		mkdirSync(dirname(file), { recursive: true })
		writeFileSync(file, change.after)
	}
}

/**
 * The publish guard on the push to main, the commit the push started from fetched (BEFORE): the decision gets the
 * package's files, git and npm run in the package, GITHUB_OUTPUT; each printed line keeps its stream; anything that
 * throws exits 1 with its reason on stderr.
 */
export function runCiPublishDecision(params: {
	cwd: string
	environment: Readonly<Record<string, string | undefined>>
}): DecisionResult {
	const lines: PrintedLine[] = []
	function readFile(path: string): string {
		return readFileSync(join(params.cwd, path), 'utf8')
	}
	function run(command: { command: string; args: readonly string[] }): ProcessResult {
		return runIn({ cwd: params.cwd, ...command })
	}
	function appendOutput(output: { file: string; text: string }): void {
		appendFileSync(output.file, output.text)
	}
	function print(printed: PrintedLine): void {
		lines.push(printed)
	}
	try {
		const exitCode = runPublishDecision({
			environment: params.environment,
			readFile,
			run,
			appendOutput,
			print,
		})
		return { exitCode, lines }
	} catch (error) {
		return {
			exitCode: 1,
			lines: [
				...lines,
				{ stream: 'stderr', line: error instanceof Error ? error.message : String(error) },
			],
		}
	}
}

/** A command's exit code and both streams, run in the package; a command that cannot start exits 1 with its error. */
function runIn(params: { cwd: string; command: string; args: readonly string[] }): ProcessResult {
	const result = spawnSync(params.command, params.args, { cwd: params.cwd, encoding: 'utf8' })
	if (result.error !== undefined) return { exitCode: 1, stdout: '', stderr: result.error.message }
	return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
}
