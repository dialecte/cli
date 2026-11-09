/**
 * `runGateSteps` on a step that is no vitest run: a failed scoped step that counts tests is rerun serially whatever
 * runs it, and a failed step records the files its whole output (and its selection) names as failing.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readRecordFile } from '../../../test/gate-records.ts'
import {
	FAIL_LINE_ONLY_OUTPUT,
	FAILING_STEP_SCRIPT,
	NOISE_LINES,
	PRINTED_PASSED,
	SCOPE_SCRIPT,
	SCRIPT_ERROR_OUTPUT,
	UNHANDLED_OUTPUT,
} from '../../../test/run-gate-failing.constants.ts'
import {
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { recordGate } from '../gate-records/gate-records.ts'
import { computeStateTree } from '../gate-records/state-hash.ts'
import { REAL_FAILURE_PREFIX } from './gate-config.constants.ts'
import { runGateSteps } from './run-gate.ts'
import { INVALID_SELECTION_REASON, INVALID_SELECTION_WHY } from './selection.constants.ts'

import { afterAll, describe, expect, it } from 'vitest'

import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'
import type { StepResult } from './gate.types.ts'

const THROUGH_NPM: GateStep = {
	name: 'scoped',
	run: 'npm run test:scope',
	counts: 'tests',
	scoped: true,
}
const DIRECT: GateStep = {
	name: 'scoped',
	run: 'sh ./step.sh scoped',
	counts: 'tests',
	scoped: true,
}
const PACKAGE_JSON: PackageJson = { scripts: { 'test:scope': SCOPE_SCRIPT } }
const FIRST_FAILING = ['src/a.test.ts', 'src/z.test.ts']
const REAL_FAILURE = `${REAL_FAILURE_PREFIX}exit 1`
const INVALID_FAILING_REASON = INVALID_SELECTION_REASON.replace(
	'{why}',
	INVALID_SELECTION_WHY.failing,
)
/** A scoped step whose command names vitest (the scoped script hands it the arguments). */
const NAMING_VITEST: GateStep = {
	name: 'scoped',
	run: 'sh ./step.sh vitest',
	counts: 'tests',
	scoped: true,
}
/** A selection that fails its validation: a declared failing entry that is empty. */
const INVALID_SELECTION = { failing: [''] }
/** The one repository the rows of the validation table share (made by the first row). */
let validationRepository: ReturnType<typeof packageFolder> | undefined
let validationFolder: string | undefined

/** What a failed run prints: its failing lines first, then `NOISE_LINES` lines, then the counts. */
function failedOutput(files: string[]): string {
	return [
		...files.map((file) => ` FAIL  |node| ${file} > group > one`),
		...Array.from(
			{ length: NOISE_LINES },
			(_, index) => `stdout | src/noise-${index}.test.ts > noise`,
		),
		' Test Files  2 failed (2)',
		'      Tests  2 failed | 1 passed (3)',
		'',
	].join('\n')
}

/** A package folder (a repository) holding the script, a valid selection and the exit codes of a first run that fails. */
function packageFolder(
	params: { selection?: Record<string, unknown>; firstFiles?: string[]; root?: string } = {},
) {
	const root = params.root
		? initializeRepository({ root: params.root, files: { 'a.txt': 'a\n' } })
		: createScratchRepository({ 'a.txt': 'a\n' })
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	const tree = computeStateTree(root)
	writeFiles({
		root,
		files: {
			'package.json': JSON.stringify(PACKAGE_JSON),
			'step.sh': FAILING_STEP_SCRIPT,
			'selection.json': selectionFile({ base, tree, overrides: params.selection }),
			'output.txt': failedOutput(params.firstFiles ?? FIRST_FAILING),
			'exit.txt': '1',
			'output-serial.txt': PRINTED_PASSED,
			'exit-serial.txt': '0',
		},
	})
	return { root, scope: { base, tree } }
}

/** The text of a valid selection file of the run's base and tree, `overrides` replacing its fields. */
function selectionFile(params: {
	base: string
	tree: string
	overrides?: Record<string, unknown>
}): string {
	return JSON.stringify({
		schema: 1,
		base: params.base,
		tree: params.tree,
		changed: 0,
		selected: [{ id: 'T0', reasons: ['always'] }],
		skipped: [],
		...params.overrides,
	})
}

/** The serial run fails too, naming `files`. */
function serialFails(params: { root: string; files: string[] }): void {
	writeFiles({
		root: params.root,
		files: { 'output-serial.txt': failedOutput(params.files), 'exit-serial.txt': '1' },
	})
}

async function runOne(params: {
	given: ReturnType<typeof packageFolder>
	step: GateStep
	packageJson?: PackageJson
}): Promise<StepResult> {
	const [result] = await runGateSteps({
		root: params.given.root,
		steps: [params.step],
		packageJson: params.packageJson ?? PACKAGE_JSON,
		scope: params.given.scope,
	})
	if (!result) throw new Error('the gate ran no step')
	return result
}

/** One entry per run of the step: the arguments it got. */
function runsOf(root: string): string[] {
	return readFileSync(join(root, 'args.log'), 'utf8').trim().split('\n')
}

/** What the gate records of the results: its first step as recorded. */
function recordedStepOf(params: { root: string; result: StepResult }) {
	recordGate({ root: params.root, mode: 'full', results: [params.result] })
	return readRecordFile<GateRecord>({ root: params.root, name: FULL_RECORD_FILE })?.steps[0]
}

describe(
	'runGateSteps: a failed scoped step that counts tests is rerun serially, whatever runs it',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			{ how: 'through npm run, a script that names no vitest', step: THROUGH_NPM },
			{ how: 'as a command that names no vitest', step: DIRECT },
		])(
			'$how → rerun with its failing files then --no-file-parallelism, flaky → passed with the note',
			async ({ step }) => {
				const given = packageFolder()

				const result = await runOne({ given, step })

				expect(runsOf(given.root)).toEqual([
					'scoped',
					'scoped src/a.test.ts src/z.test.ts --no-file-parallelism',
				])
				expect(result).toMatchObject({ status: 'passed', note: 'flaky in parallel' })
			},
		)

		it('the rerun gets the first run’s base, tree and changed file and a selection path of its own', async () => {
			const given = packageFolder()

			await runOne({ given, step: THROUGH_NPM })

			const [first, second] = readFileSync(join(given.root, 'env.log'), 'utf8')
				.trim()
				.split('\n')
				.map((line) => line.split(' '))
			expect(second?.slice(0, 3)).toEqual(first?.slice(0, 3))
			expect(second?.[3]).toMatch(/^\//)
			expect(second?.[3]).not.toBe(first?.[3])
		})

		it('failing again serially → a real failure, and the step ran twice at most', async () => {
			const given = packageFolder()
			serialFails({ root: given.root, files: FIRST_FAILING })

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(result).toMatchObject({ status: 'failed', reason: REAL_FAILURE })
			expect(result.note).toBeUndefined()
			expect(runsOf(given.root)).toHaveLength(2)
		})

		it('a scoped step that counts no tests, an unscoped step that counts tests and runs no vitest, a step already serial → run once, never rerun, and still record their failing files', async () => {
			const scopedNoCount = packageFolder()
			const unscoped = packageFolder()
			const alreadySerial = packageFolder()
			serialFails({ root: alreadySerial.root, files: FIRST_FAILING })

			const noCount = await runOne({
				given: scopedNoCount,
				step: { name: 'scoped', run: 'sh ./step.sh scoped', scoped: true },
			})
			const plain = await runOne({
				given: unscoped,
				step: { name: 'tests', run: 'npm run test:scope', counts: 'tests' },
			})
			const serial = await runOne({
				given: alreadySerial,
				step: { ...DIRECT, run: 'sh ./step.sh scoped --no-file-parallelism' },
			})

			expect([
				runsOf(scopedNoCount.root),
				runsOf(unscoped.root),
				runsOf(alreadySerial.root),
			]).toEqual([['scoped'], ['scoped'], ['scoped --no-file-parallelism']])
			expect([noCount.status, plain.status, serial.status]).toEqual(['failed', 'failed', 'failed'])
			expect([noCount.rerun, plain.rerun, serial.rerun]).toEqual([undefined, undefined, undefined])
			expect([noCount.failing, plain.failing, serial.failing]).toEqual([
				FIRST_FAILING,
				FIRST_FAILING,
				FIRST_FAILING,
			])
		})
	},
)

describe(
	'runGateSteps: the failing files of a failed step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		// the validation table's rows share a repository that outlives one test
		afterAll(() => {
			if (validationFolder) rmSync(validationFolder, { recursive: true, force: true })
		})

		it('a flaky step → the files its first run named, from its whole output (far before its last 30 lines), sorted and unique; the record holds them', async () => {
			// named in the order z, a, z: neither sorted nor unique in the output
			const given = packageFolder({
				firstFiles: ['src/z.test.ts', 'src/a.test.ts', 'src/z.test.ts'],
			})

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(result.failing).toEqual(FIRST_FAILING)
			expect(recordedStepOf({ root: given.root, result })?.failing).toEqual(FIRST_FAILING)
			// the rerun's arguments keep the output's order, each file once
			expect(runsOf(given.root)).toEqual([
				'scoped',
				'scoped src/z.test.ts src/a.test.ts --no-file-parallelism',
			])
		})

		it.each([
			{
				what: 'other files in each run',
				first: ['src/z.test.ts'],
				serial: ['src/a.test.ts'],
				expected: ['src/a.test.ts', 'src/z.test.ts'],
			},
			{
				what: 'none named by the first run',
				first: [],
				serial: ['src/b.test.ts'],
				expected: ['src/b.test.ts'],
			},
		])(
			'a step that fails serially too, $what → the union of both runs’ failing files',
			async ({ first, serial, expected }) => {
				const given = packageFolder({ firstFiles: first })
				serialFails({ root: given.root, files: serial })

				const result = await runOne({ given, step: THROUGH_NPM })

				expect(result.status).toBe('failed')
				expect(result.failing).toEqual(expected)
				expect(recordedStepOf({ root: given.root, result })?.failing).toEqual(expected)
				expect(runsOf(given.root)).toHaveLength(2)
			},
		)

		it('a step that fails serially too → its failing files, sorted and unique, in the record', async () => {
			const given = packageFolder({
				firstFiles: ['src/z.test.ts', 'src/a.test.ts', 'src/z.test.ts'],
			})
			serialFails({ root: given.root, files: ['src/z.test.ts', 'src/a.test.ts'] })

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(result.status).toBe('failed')
			expect(result.failing).toEqual(FIRST_FAILING)
			expect(recordedStepOf({ root: given.root, result })?.failing).toEqual(FIRST_FAILING)
		})

		it('a step that passed → no failing, in the result and in the record', async () => {
			const given = packageFolder()
			writeFiles({
				root: given.root,
				files: { 'output.txt': PRINTED_PASSED, 'exit.txt': '0' },
			})

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(result.status).toBe('passed')
			expect(result.failing).toBeUndefined()
			expect(recordedStepOf({ root: given.root, result })).not.toHaveProperty('failing')
		})

		it('a scoped step that declares failing files → the union of its output’s and its declared files, sorted and unique, and still two runs at most', async () => {
			const given = packageFolder({
				selection: { failing: ['test/x.test.ts', 'src/a.test.ts', 'test/x.test.ts'] },
			})
			serialFails({ root: given.root, files: FIRST_FAILING })

			const result = await runOne({ given, step: THROUGH_NPM })

			const union = ['src/a.test.ts', 'src/z.test.ts', 'test/x.test.ts']
			expect(result.status).toBe('failed')
			expect(result.failing).toEqual(union)
			expect(recordedStepOf({ root: given.root, result })?.failing).toEqual(union)
			// the declared files are never handed to the rerun
			expect(runsOf(given.root)).toEqual([
				'scoped',
				'scoped src/a.test.ts src/z.test.ts --no-file-parallelism',
			])
		})

		it.each([
			{ shape: 'an empty string', failing: [''] },
			{ shape: 'a number', failing: [1] },
			{ shape: 'no list', failing: 'src/a.test.ts' },
			{ shape: 'an absolute path', failing: ['/abs/src/a.test.ts'] },
			{ shape: 'a leading .. segment', failing: ['../a.test.ts'] },
			{ shape: 'a .. segment inside', failing: ['src/../a.test.ts'] },
			{ shape: 'a backslash', failing: ['src\\a.test.ts'] },
		])(
			'a declared failing that holds $shape → the step fails on its selection',
			async ({ failing }) => {
				validationFolder ??= mkdtempSync(join(tmpdir(), 'dialecte-gate-validation-'))
				validationRepository ??= packageFolder({ root: validationFolder })
				const given = validationRepository
				writeFiles({
					root: given.root,
					files: {
						'selection.json': selectionFile({ ...given.scope, overrides: { failing } }),
						'output.txt': PRINTED_PASSED,
						'exit.txt': '0',
					},
				})

				const result = await runOne({ given, step: THROUGH_NPM })

				expect(result).toMatchObject({ status: 'failed', reason: INVALID_FAILING_REASON })
			},
		)

		it('declared failing entries are normalised before the union (a leading ./ removed, repeated / collapsed) → ./src/a.test.ts and src/a.test.ts are one entry', async () => {
			const given = packageFolder({
				selection: { failing: ['./src/a.test.ts', 'src//b.test.ts', 'test/x.test.ts'] },
			})
			serialFails({ root: given.root, files: FIRST_FAILING })

			const result = await runOne({ given, step: THROUGH_NPM })

			const union = ['src/a.test.ts', 'src/b.test.ts', 'src/z.test.ts', 'test/x.test.ts']
			expect(result.status).toBe('failed')
			expect(result.failing).toEqual(union)
			expect(recordedStepOf({ root: given.root, result })?.failing).toEqual(union)
		})
	},
)

describe(
	'runGateSteps: the rerun rule of a failed scoped step that counts tests and names no vitest',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('exit 1 on vitest’s unhandled-error output (no failed test counted, no FAIL line) → the whole step rerun once serially, no file arguments; passed → flaky in parallel', async () => {
			const given = packageFolder()
			writeFiles({ root: given.root, files: { 'output.txt': UNHANDLED_OUTPUT } })

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(runsOf(given.root)).toEqual(['scoped', 'scoped --no-file-parallelism'])
			expect(result).toMatchObject({
				status: 'passed',
				note: 'flaky in parallel',
				rerun: { files: [], failing: [], status: 'passed', exitCode: 0 },
			})
		})

		it('exit 1 on a plain script error (no vitest output) → run once, never rerun, failed on its exit code', async () => {
			const given = packageFolder()
			writeFiles({ root: given.root, files: { 'output.txt': SCRIPT_ERROR_OUTPUT } })

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(runsOf(given.root)).toEqual(['scoped'])
			expect(result).toMatchObject({ status: 'failed', reason: 'exit 1' })
			expect(result.rerun).toBeUndefined()
		})

		it('exit 1 naming a failing file with no failed count → rerun on that file', async () => {
			const given = packageFolder()
			writeFiles({ root: given.root, files: { 'output.txt': FAIL_LINE_ONLY_OUTPUT } })

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(runsOf(given.root)).toEqual(['scoped', 'scoped src/a.test.ts --no-file-parallelism'])
			expect(result).toMatchObject({ status: 'passed', note: 'flaky in parallel' })
		})

		it('exit 0 with a failed test counted → failed on the count, run once, never rerun (a rerun needs a non-zero exit)', async () => {
			const given = packageFolder()
			writeFiles({ root: given.root, files: { 'exit.txt': '0' } })

			const result = await runOne({ given, step: THROUGH_NPM })

			expect(runsOf(given.root)).toEqual(['scoped'])
			expect(result).toMatchObject({ status: 'failed', reason: '2 test(s) failed' })
			expect(result.rerun).toBeUndefined()
		})
	},
)

describe(
	'runGateSteps: a first run with a selection problem is never rerun',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			{ what: 'a scoped step that runs vitest, exit 1', step: NAMING_VITEST },
			{ what: 'a scoped step that names no vitest, a failed test counted, exit 1', step: DIRECT },
		])(
			'$what, an invalid selection → one run only, failed on the exit code, no rerun',
			async ({ step }) => {
				const given = packageFolder({ selection: INVALID_SELECTION })

				const result = await runOne({ given, step })

				expect(runsOf(given.root)).toHaveLength(1)
				expect(result).toMatchObject({ status: 'failed', reason: 'exit 1' })
				expect(result.rerun).toBeUndefined()
			},
		)
	},
)
