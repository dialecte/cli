/**
 * Runs the gate's steps in order, each through the shell from the package root with its output
 * unfiltered, and decides on the exit code AND the counts it printed: a step exiting non-zero fails
 * whatever it says, a test step that counts no test fails, a failed test in the counts fails. The first
 * failure stops the gate. A step that runs only the tests a change affects passes, with a note, when
 * its runner finds none (a doc-only change). Generated docs a step rewrites are restored byte for byte, whatever its result.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import {
	FAILED_OUTPUT_TAIL_LINES,
	NO_AFFECTED_TEST_NOTE,
	NO_AFFECTED_TEST_PATTERN,
	NPM_RUN_PATTERN,
} from './gate-config.constants.ts'
import { readStepCounts } from './step-counts.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepCounts, StepResult } from './gate.types.ts'

export function runGateSteps(params: {
	root: string
	steps: readonly GateStep[]
	packageJson: PackageJson
}): StepResult[] {
	const { root, packageJson } = params
	const results: StepResult[] = []
	for (const step of params.steps) {
		if (results.some((result) => result.status === 'failed')) {
			results.push({ step, status: 'not-run', counts: {}, restored: [] })
			continue
		}
		const script = NPM_RUN_PATTERN.exec(step.run)?.[1]
		if (script && !packageJson.scripts?.[script]) {
			results.push({
				step,
				status: 'skipped',
				counts: {},
				restored: [],
				reason: `no npm script "${script}"`,
			})
			continue
		}
		results.push(runStep({ root, step, generatedDocs: packageJson.dialecte?.generatedDocs ?? [] }))
	}
	return results
}

function runStep(params: { root: string; step: GateStep; generatedDocs: string[] }): StepResult {
	const { root, step } = params
	const snapshot = step.restoresGeneratedDocs
		? snapshotFiles({ root, files: params.generatedDocs })
		: new Map<string, Buffer | undefined>()
	const execution = spawnSync('sh', ['-c', step.run], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 1e9,
		env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
	})
	const restored = restoreFiles({ root, snapshot })
	const output = `${execution.stdout ?? ''}${execution.stderr ?? ''}`
	const counts = readStepCounts(output)
	const exitCode = execution.status ?? 1
	if (exitCode === 0 && !counts.tests && step.changedOnly && NO_AFFECTED_TEST_PATTERN.test(output))
		return { step, status: 'passed', exitCode, counts, restored, note: NO_AFFECTED_TEST_NOTE }
	const reason = failureOf({ step, exitCode, counts })
	return {
		step,
		status: reason ? 'failed' : 'passed',
		exitCode,
		counts,
		restored,
		...(reason && { reason, tail: tailOf(output) }),
	}
}

/** Why the step failed, or undefined when it passed. */
function failureOf(params: {
	step: GateStep
	exitCode: number
	counts: StepCounts
}): string | undefined {
	const { step, exitCode, counts } = params
	if (exitCode !== 0) return `exit ${exitCode}`
	if (counts.tests?.failed) return `${counts.tests.failed} test(s) failed`
	if (counts.errors) return `${counts.errors} error(s)`
	if (step.counts === 'tests' && !counts.tests?.passed) return 'no test ran'
	return undefined
}

function snapshotFiles(params: { root: string; files: string[] }): Map<string, Buffer | undefined> {
	return new Map(
		params.files.map((file) => {
			const path = join(params.root, file)
			return [file, existsSync(path) ? readFileSync(path) : undefined]
		}),
	)
}

/** Writes back every file whose bytes changed (removes one that did not exist); answers which. */
function restoreFiles(params: {
	root: string
	snapshot: Map<string, Buffer | undefined>
}): string[] {
	const restored: string[] = []
	for (const [file, before] of params.snapshot) {
		const path = join(params.root, file)
		const after = existsSync(path) ? readFileSync(path) : undefined
		if (before === undefined && after === undefined) continue
		if (before && after && before.equals(after)) continue
		if (before) writeFileSync(path, before)
		else rmSync(path, { force: true, recursive: true })
		restored.push(file)
	}
	return restored
}

function tailOf(output: string): string {
	return stripVTControlCharacters(output)
		.trimEnd()
		.split('\n')
		.slice(-FAILED_OUTPUT_TAIL_LINES)
		.join('\n')
}
