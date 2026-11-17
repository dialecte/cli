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
import { printOut, textOf } from '../lib/print/print.ts'
import { runPublishDecision } from '../lib/release/publish-decision.ts'
import { CI_LINES, CI_USAGE, CI_VERBS, DRY_RUN_FLAG } from './ci.constants.ts'

import type { CiChange, CiPlan, TestContract } from '../lib/ci/ci-template.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { CommandResult as ProcessResult } from '../lib/release/publish-decision.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runCi({ cwd: process.cwd(), argv, environment: process.env })
	printOut({ stream: result.exitCode === 0 ? 'stdout' : 'stderr', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runCi(params: {
	cwd: string
	argv: string[]
	environment?: Readonly<Record<string, string | undefined>>
}): CommandResult {
	const [verb, ...flags] = params.argv
	const dryRun = verb === 'sync' && flags.length === 1 && flags[0] === DRY_RUN_FLAG
	if (
		!(CI_VERBS as readonly (string | undefined)[]).includes(verb) ||
		(flags.length > 0 && !dryRun)
	)
		return { exitCode: 2, output: textOf([CI_USAGE]) }
	if (verb === 'publish-decision')
		return runDecision({ cwd: params.cwd, environment: params.environment ?? {} })
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
 * package's files, git and npm run in the package, GITHUB_OUTPUT; anything that throws exits 1 with its reason.
 */
function runDecision(params: {
	cwd: string
	environment: Readonly<Record<string, string | undefined>>
}): CommandResult {
	const lines: string[] = []
	try {
		const exitCode = runPublishDecision({
			environment: params.environment,
			readFile: (path) => readFileSync(join(params.cwd, path), 'utf8'),
			run: (command) => runIn({ cwd: params.cwd, ...command }),
			appendOutput: (output) => appendFileSync(output.file, output.text),
			print: (printed) => lines.push(printed.line),
		})
		return { exitCode, output: textOf(lines) }
	} catch (error) {
		return {
			exitCode: 1,
			output: textOf([...lines, error instanceof Error ? error.message : String(error)]),
		}
	}
}

/** A command's exit code and both streams, run in the package; a command that cannot start exits 1 with its error. */
function runIn(params: { cwd: string; command: string; args: readonly string[] }): ProcessResult {
	const result = spawnSync(params.command, params.args, { cwd: params.cwd, encoding: 'utf8' })
	if (result.error !== undefined) return { exitCode: 1, stdout: '', stderr: result.error.message }
	return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
}
