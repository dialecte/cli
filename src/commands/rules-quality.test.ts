import { join } from 'node:path'

import { readRecordFile } from '../../test/gate-records.ts'
import { rulesOutcomeOf } from '../../test/rules-outcome.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'

const PACKAGE_JSON = `${JSON.stringify({ name: 'demo', dialecte: { profile: 'contributor' } })}\n`
const SOURCE = 'src/lib/add-item.ts'
const CHANGED_VARIABLE = 'DIALECTE_GATE_CHANGED'
const BASE_VARIABLE = 'DIALECTE_GATE_BASE'
const TREE_VARIABLE = 'DIALECTE_GATE_TREE'
const SELECTION_VARIABLE = 'DIALECTE_GATE_SELECTION'
const TREE = 'b'.repeat(40)

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

const SILENCED = moduleOf([
	'// dialecte-allow argument-mutation: the caller hands a scratch list',
	'export function addItem(params: Params) {',
	'\tparams.items.push(1)',
	'}',
])

const MUTATING = moduleOf([
	'export function addItem(params: Params) {',
	'\tparams.items.push(1)',
	'\treturn 1',
	'}',
])

const MUTATING_EDITED = moduleOf([
	'export function addItem(params: Params) {',
	'\tparams.items.push(1)',
	'\treturn 2',
	'}',
])

const CLEAN = moduleOf(['export function addItem(params: Params) {', '\treturn 1', '}'])

const MUTATION_ADDED = moduleOf([
	'export function addItem(params: Params) {',
	'\tparams.items.push(1)',
	'\treturn 1',
	'}',
])

/** The environment a contributor run reads: no machine word list, so nothing of the machine decides the run. */
function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

function changedFileOf(paths: readonly string[]): string {
	const folder = temporaryFolder('dialecte-changed-')
	writeFiles({ root: folder, files: { changed: paths.map((path) => `${path}\0`).join('') } })
	return join(folder, 'changed')
}

function packageHolding(files: Record<string, string>): string {
	return createScratchRepository({ 'package.json': PACKAGE_JSON, ...files })
}

function jsonOf(output: string): { errors: number; findings: RuleFinding[]; allowed?: unknown } {
	return JSON.parse(output) as { errors: number; findings: RuleFinding[]; allowed?: unknown }
}

function shapeOf(finding: RuleFinding): {
	rule: string
	line: number
	severity: string
	message: string
} {
	return {
		rule: finding.rule,
		line: finding.line,
		severity: finding.severity,
		message: finding.message,
	}
}

describe('dialecte rules: opt-outs', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a finding silenced by an opt-out → --json holds no finding, the count of the rule, exit 0', () => {
		const root = packageHolding({})
		writeFiles({ root, files: { [SOURCE]: SILENCED } })

		const result = runRules({ cwd: root, argv: [SOURCE, '--json'], environment: machineOf() })

		expect({ exitCode: result.exitCode, json: jsonOf(result.output) }).toMatchObject({
			exitCode: 0,
			json: { errors: 0, findings: [], allowed: { 'argument-mutation': 1 } },
		})
	})

	it('no file given → the record dialecte-rules.json holds the opt-out counts', () => {
		const root = packageHolding({})
		writeFiles({ root, files: { [SOURCE]: SILENCED } })

		runRules({ cwd: root, argv: [], environment: machineOf() })

		expect(
			readRecordFile<{ allowed?: unknown }>({ root, name: 'dialecte-rules.json' }),
		).toMatchObject({
			allowed: { 'argument-mutation': 1 },
		})
	})
})

describe(
	'dialecte rules: opt-outs over a documented function',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const BEFORE_DOC = moduleOf([
			'// dialecte-allow argument-mutation: the caller hands a scratch list',
			'/** Adds one item. */',
			'export function addItem(params: Params) {',
			'\tparams.items.push(1)',
			'}',
		])
		const IN_DOC = moduleOf([
			'/**',
			' * Adds one item.',
			' * dialecte-allow argument-mutation: the caller hands a scratch list',
			' */',
			'export function addItem(params: Params) {',
			'\tparams.items.push(1)',
			'}',
		])
		const NO_OPT_OUT = moduleOf([
			'/** Adds one item. */',
			'export function addItem(params: Params) {',
			'\tparams.items.push(1)',
			'}',
		])

		const testCases: Record<
			string,
			{ text: string; expected: { errors: number; allowed?: unknown } }
		> = {
			'an opt-out on the line above the doc comment → the finding is silenced and counted': {
				text: BEFORE_DOC,
				expected: { errors: 0, allowed: { 'argument-mutation': 1 } },
			},
			'an opt-out as the last line inside the doc comment → the finding is silenced and counted': {
				text: IN_DOC,
				expected: { errors: 0, allowed: { 'argument-mutation': 1 } },
			},
			'a documented function with no opt-out → the finding stays': {
				text: NO_OPT_OUT,
				expected: { errors: 1 },
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const root = packageHolding({})
				writeFiles({ root, files: { [SOURCE]: testCase.text } })

				const json = jsonOf(
					runRules({ cwd: root, argv: [SOURCE, '--json'], environment: machineOf() }).output,
				)

				expect({ errors: json.errors, allowed: json.allowed }).toEqual({
					errors: testCase.expected.errors,
					allowed: testCase.expected.allowed,
				})
			})
	},
)

describe('dialecte rules: --json findings', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('a function-wide finding → the object holds no functionLine key', () => {
		const root = packageHolding({})
		writeFiles({ root, files: { [SOURCE]: MUTATING } })

		const json = jsonOf(
			runRules({ cwd: root, argv: [SOURCE, '--json'], environment: machineOf() }).output,
		)

		expect(
			json.findings.map((finding) => ({
				rule: finding.rule,
				hasFunctionLine: 'functionLine' in finding,
			})),
		).toEqual([{ rule: 'argument-mutation', hasFunctionLine: false }])
	})
})

describe(
	'dialecte rules: severity against the gate base',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		/**
		 * The scoped run of a package whose file goes from `committed` to `edited`; `base` hands the gate's four
		 * variables with the base the commit names (`commit`) or the empty tree (`empty-tree`), else the same without
		 * the base (`none`).
		 */
		function scopedRunOf(params: {
			committed: string
			edited: string
			base: 'commit' | 'empty-tree' | 'none'
		}): {
			exitCode: number
			findings: ReturnType<typeof shapeOf>[]
		} {
			const root = packageHolding({ [SOURCE]: params.committed })
			const baseIds = {
				commit: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
				'empty-tree': git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim(),
			}
			writeFiles({ root, files: { [SOURCE]: params.edited } })
			const scope = {
				[CHANGED_VARIABLE]: changedFileOf([SOURCE]),
				[TREE_VARIABLE]: TREE,
				[SELECTION_VARIABLE]: join(temporaryFolder('dialecte-selection-'), 'selection.json'),
			}
			const result = runRules({
				cwd: root,
				argv: ['--json'],
				environment: {
					...machineOf(),
					...scope,
					...(params.base !== 'none' && { [BASE_VARIABLE]: baseIds[params.base] }),
				},
			})
			return { exitCode: result.exitCode, findings: jsonOf(result.output).findings.map(shapeOf) }
		}

		it('with the gate base: a mutation the base already held, another line edited → a warning ending as not added, exit 0, a mutation on an added line → an error, exit 1; without a base the held mutation stays an error, exit 1', () => {
			expect({
				held: scopedRunOf({ committed: MUTATING, edited: MUTATING_EDITED, base: 'commit' }),
				noBase: scopedRunOf({ committed: MUTATING, edited: MUTATING_EDITED, base: 'none' }),
				added: scopedRunOf({ committed: CLEAN, edited: MUTATION_ADDED, base: 'commit' }),
			}).toEqual({
				held: {
					exitCode: 0,
					findings: [
						{
							rule: 'argument-mutation',
							line: 2,
							severity: 'warning',
							message: expect.stringMatching(/ \(not added by this change\)$/),
						},
					],
				},
				noBase: {
					exitCode: 1,
					findings: [
						{
							rule: 'argument-mutation',
							line: 2,
							severity: 'error',
							message: expect.not.stringMatching(/not added by this change/),
						},
					],
				},
				added: {
					exitCode: 1,
					findings: [
						{
							rule: 'argument-mutation',
							line: 2,
							severity: 'error',
							message: expect.not.stringMatching(/not added by this change/),
						},
					],
				},
			})
		})

		it('with the empty tree as the gate base (no change known): a mutation the file already held → a warning ending as not added, exit 0', () => {
			expect(
				scopedRunOf({ committed: MUTATING, edited: MUTATING_EDITED, base: 'empty-tree' }),
			).toEqual({
				exitCode: 0,
				findings: [
					{
						rule: 'argument-mutation',
						line: 2,
						severity: 'warning',
						message: expect.stringMatching(/ \(not added by this change\)$/),
					},
				],
			})
		})
	},
)

describe(
	'dialecte rules: query-in-loop from the API index',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const LOOP_FILE = 'src/lib/read-all.ts'
		const LOOP = moduleOf([
			'export async function readAll(query: Query, nodes: Node[]) {',
			'\tfor (const node of nodes) await query.getRecord(node)',
			'}',
		])

		function indexOf(path: string): string {
			return JSON.stringify({
				package: '@dialecte/things',
				methods: [
					{
						root: 'q',
						path,
						otherRoutes: [],
						signature: '() => void',
						intents: [],
					},
				],
			})
		}

		function loopRulesOf(root: string): string[] {
			return jsonOf(
				runRules({ cwd: root, argv: [LOOP_FILE, '--json'], environment: machineOf() }).output,
			)
				.findings.filter((finding) => finding.rule === 'query-in-loop')
				.map((finding) => `${finding.line}:${finding.severity}`)
		}

		it('an own index that is not JSON → no throw, no query-in-loop, the other rules reported, one line naming the file and that the rule did not run', () => {
			const BROKEN = 'skills/broken/references/api.json'
			const root = packageHolding({ [BROKEN]: '{not json' })
			writeFiles({ root, files: { [LOOP_FILE]: LOOP, [SOURCE]: MUTATING } })

			const json = rulesOutcomeOf({
				cwd: root,
				argv: [LOOP_FILE, SOURCE, '--json'],
				environment: machineOf(),
			})
			const human = rulesOutcomeOf({
				cwd: root,
				argv: [LOOP_FILE, SOURCE],
				environment: machineOf(),
			})

			expect({
				json:
					json.threw === true
						? json
						: { threw: false, rules: jsonOf(json.output).findings.map((finding) => finding.rule) },
				lines:
					human.threw === true
						? human
						: human.output
								.split('\n')
								.filter((line) => line.includes(BROKEN) && line.includes('not run')).length,
			}).toEqual({ json: { threw: false, rules: ['argument-mutation'] }, lines: 1 })
		})

		it('an index with a read of that name → one query-in-loop error; an index with no read → none', () => {
			const withRead = packageHolding({
				'skills/things/references/api.json': indexOf('doc.query.getRecord'),
			})
			writeFiles({ root: withRead, files: { [LOOP_FILE]: LOOP } })
			const withoutRead = packageHolding({
				'skills/things/references/api.json': JSON.stringify({
					package: '@dialecte/things',
					methods: [],
				}),
			})
			writeFiles({ root: withoutRead, files: { [LOOP_FILE]: LOOP } })

			expect({ withRead: loopRulesOf(withRead), withoutRead: loopRulesOf(withoutRead) }).toEqual({
				withRead: ['2:error'],
				withoutRead: [],
			})
		})
	},
)
