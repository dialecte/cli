/**
 * `dialecte rules` and the base-aware rules: the base they judge against (the lot base, `--base`, never the gate
 * base), the record they leave, the lines they print, and the runs that never judge (a clone outside any lot, no lot
 * base, contrib).
 */
import { join } from 'node:path'

import { createQualityLot } from '../../test/quality-workspace.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { GATE_SCOPE_VARIABLES } from '../lib/gate/selection.constants.ts'
import { readQualityRecord } from '../lib/quality/quality-record.ts'
import { checkRules } from '../lib/rules/check-rules.ts'
import { RULES_BASE_WITH_FILES } from './rules.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

import type { SharedExportChange } from '../lib/quality/quality.types.ts'
import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'

const SIZE_FILE = 'src/core/size.ts'
const TOTAL_FILE = 'src/use/total.ts'

const SIZE = [
	'export function sizeOf(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')

const SIZE_RESIGNED = [
	'export function sizeOf(items: readonly string[], empty = false): number {',
	"\treturn empty ? items.length : items.filter((item) => item !== '').length",
	'}',
	'',
].join('\n')

const TOTAL = [
	"import { sizeOf } from '../core/size.ts'",
	'',
	'export function total(items: readonly string[]): number {',
	'\treturn sizeOf(items) + 1',
	'}',
	'',
].join('\n')

const TOTAL_WITH_OPT_OUT = [
	"import { sizeOf } from '../core/size.ts' // dialecte-allow shared-export-changed: the importer moves with it in the next lot",
	'',
	'export function total(items: readonly string[]): number {',
	'\treturn sizeOf(items) + 1',
	'}',
	'',
].join('\n')

const BASE = { [SIZE_FILE]: SIZE, [TOTAL_FILE]: TOTAL }

const MUTATING_FILE = 'src/lib/fill.ts'
const GONE_FILE = 'src/lib/gone.ts'

const MUTATING = [
	'export function fill(target: string[]): void {',
	"\ttarget.push('a')",
	'}',
	'',
].join('\n')

const MUTATING_MORE = [
	MUTATING,
	'export function drain(other: string[]): void {',
	'\tother.length = 0',
	'}',
	'',
].join('\n')

const RESIGNED: SharedExportChange = {
	file: SIZE_FILE,
	line: 1,
	name: 'sizeOf',
	folder: 'src/core',
	importers: ['src/use'],
	changes: ['signature', 'behaviour'],
}

/** A machine with no forbidden words list of its own. */
function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

/** The scoped gate step's variables on `root`: its changed list `files`, the gate base `base`. */
function gateStepOf(params: {
	root: string
	files: string[]
	base: string
}): Record<string, string> {
	const changed = join(temporaryFolder('dialecte-changed-'), 'changed')
	writeFiles({
		root: '/',
		files: { [changed.slice(1)]: params.files.map((file) => `${file}\0`).join('') },
	})
	return {
		...machineOf(),
		[GATE_SCOPE_VARIABLES.changed]: changed,
		[GATE_SCOPE_VARIABLES.tree]: 'b'.repeat(40),
		[GATE_SCOPE_VARIABLES.selection]: join(
			temporaryFolder('dialecte-selection-'),
			'selection.json',
		),
		[GATE_SCOPE_VARIABLES.base]: params.base,
	}
}

/** The `--json` run's quality part and findings. */
function jsonRunOf(params: { root: string; argv: string[]; environment: Record<string, string> }): {
	exitCode: number
	quality?: { base: unknown; sharedExports: SharedExportChange[] }
	findings: RuleFinding[]
} {
	const result = runRules({
		cwd: params.root,
		argv: [...params.argv, '--json'],
		environment: params.environment,
	})
	const parsed = JSON.parse(result.output) as {
		quality?: { base: unknown; sharedExports: SharedExportChange[] }
		findings: RuleFinding[]
	}
	return { exitCode: result.exitCode, ...parsed }
}

/** The lines of `output` starting with `prefix`. */
function linesStarting(params: { output: string; prefix: string }): string[] {
	return params.output.split('\n').filter((line) => line.startsWith(params.prefix))
}

describe(
	'dialecte rules: the base-aware rules on a lot',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('a bare run on a lot whose change is all committed → the shared export listed, a warning on its line, recorded against the lot base, the quality line naming it', () => {
			const lot = createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] })
			const environment = machineOf()

			const text = runRules({ cwd: lot.root, argv: [], environment })
			const json = jsonRunOf({ root: lot.root, argv: [], environment })

			expect({
				exitCode: text.exitCode,
				quality: json.quality,
				qualityLines: linesStarting({ output: text.output, prefix: 'quality: ' }),
				warnings: linesStarting({
					output: text.output,
					prefix: `${SIZE_FILE}:1:1  warning  shared-export-changed  `,
				}).length,
				recordBase: readQualityRecord(lot.root)?.base,
			}).toEqual({
				exitCode: 0,
				quality: expect.objectContaining({
					base: { commit: lot.cut, source: 'lot' },
					sharedExports: [RESIGNED],
				}),
				qualityLines: [`quality: since ${lot.shortCut} (lot)`],
				warnings: 1,
				recordBase: { commit: lot.cut, source: 'lot' },
			})
		})

		it('the scoped gate step in a lot, its gate base the empty tree → judged and recorded on the lot base, never the gate base', () => {
			const lot = createQualityLot({ base: BASE, uncommitted: { [SIZE_FILE]: SIZE_RESIGNED } })
			const emptyTree = git({
				root: lot.root,
				args: ['hash-object', '-t', 'tree', '/dev/null'],
			}).trim()

			const result = runRules({
				cwd: lot.root,
				argv: [],
				environment: gateStepOf({ root: lot.root, files: [SIZE_FILE], base: emptyTree }),
			})

			expect({
				qualityLines: linesStarting({ output: result.output, prefix: 'quality: ' }),
				record: readQualityRecord(lot.root)?.sharedExports,
				recordBase: readQualityRecord(lot.root)?.base,
			}).toEqual({
				qualityLines: [`quality: since ${lot.shortCut} (lot)`],
				record: [RESIGNED],
				recordBase: { commit: lot.cut, source: 'lot' },
			})
		})

		it('the scoped gate step in a clone outside any lot → quality: not run (no lot), nothing recorded', () => {
			const lot = createQualityLot({
				base: BASE,
				uncommitted: { [SIZE_FILE]: SIZE_RESIGNED },
				link: false,
			})

			const result = runRules({
				cwd: lot.root,
				argv: [],
				environment: gateStepOf({ root: lot.root, files: [SIZE_FILE], base: lot.cut }),
			})

			expect({
				qualityLines: linesStarting({ output: result.output, prefix: 'quality: ' }),
				record: readQualityRecord(lot.root),
			}).toEqual({ qualityLines: ['quality: not run (no lot)'], record: undefined })
		})

		it('a bare run outside any lot, no base branch, no release tag → the no-base line, no quality part, nothing recorded, a base-aware opt-out never judged unused', () => {
			const lot = createQualityLot({
				base: BASE,
				uncommitted: { [SIZE_FILE]: SIZE_RESIGNED, [TOTAL_FILE]: TOTAL_WITH_OPT_OUT },
				link: false,
				baseBranch: 'absent',
			})
			const environment = machineOf()

			const text = runRules({ cwd: lot.root, argv: [], environment })
			const json = jsonRunOf({ root: lot.root, argv: [], environment })

			expect({
				qualityLines: linesStarting({ output: text.output, prefix: 'quality: ' }),
				quality: json.quality,
				unused: json.findings.filter((finding) => finding.rule === 'unused-allow'),
				record: readQualityRecord(lot.root),
			}).toEqual({
				qualityLines: ['quality: no base (rules --base <ref>, or in a lot)'],
				quality: undefined,
				unused: [],
				record: undefined,
			})
		})

		it('rules --base naming no commit → exit 2 with the refusal, nothing recorded', () => {
			const lot = createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] })

			const result = runRules({ cwd: lot.root, argv: ['--base', 'nope'], environment: machineOf() })

			expect({
				exitCode: result.exitCode,
				names: result.output.includes('nope'),
				record: readQualityRecord(lot.root),
			}).toEqual({ exitCode: 2, names: true, record: undefined })
		})

		it('rules --base with files given → exit 2, the run judges the change since the base and takes no files', () => {
			const lot = createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] })

			const result = runRules({
				cwd: lot.root,
				argv: ['--base', lot.cut, SIZE_FILE],
				environment: machineOf(),
			})

			expect({
				exitCode: result.exitCode,
				refusal: result.output.trim(),
				record: readQualityRecord(lot.root),
			}).toEqual({ exitCode: 2, refusal: RULES_BASE_WITH_FILES, record: undefined })
		})

		it('a CI checkout (clean, outside any lot): rules --base <branch> → the files changed from the merge-base to HEAD judged, an error on a line the base holds a warning, a deleted file left out', () => {
			const lot = createQualityLot({
				base: { [MUTATING_FILE]: MUTATING, [GONE_FILE]: MUTATING },
				commits: [{ [MUTATING_FILE]: MUTATING_MORE }],
				committedDeletions: [GONE_FILE],
				link: false,
			})

			const json = jsonRunOf({ root: lot.root, argv: ['--base', 'main'], environment: machineOf() })

			expect({
				exitCode: json.exitCode,
				mutations: json.findings
					.filter((finding) => finding.rule === 'argument-mutation')
					.map((finding) => ({
						file: finding.file,
						line: finding.line,
						severity: finding.severity,
					})),
			}).toEqual({
				exitCode: 1,
				mutations: [
					{ file: MUTATING_FILE, line: 2, severity: 'warning' },
					{ file: MUTATING_FILE, line: 6, severity: 'error' },
				],
			})
		})

		it('a change that only deletes the file of a shared export its importer still imports → removed on the import line, recorded', () => {
			const lot = createQualityLot({ base: BASE, deleted: [SIZE_FILE] })

			const json = jsonRunOf({ root: lot.root, argv: [], environment: machineOf() })

			expect({
				removed: json.quality?.sharedExports,
				recorded: readQualityRecord(lot.root) !== undefined,
			}).toEqual({
				removed: [{ ...RESIGNED, file: TOTAL_FILE, changes: ['removed'] }],
				recorded: true,
			})
		})

		it('the same with an opt-out on the unchanged import line → silenced, counted', () => {
			const lot = createQualityLot({
				base: { [SIZE_FILE]: SIZE, [TOTAL_FILE]: TOTAL_WITH_OPT_OUT },
				deleted: [SIZE_FILE],
			})

			const json = jsonRunOf({ root: lot.root, argv: [], environment: machineOf() })

			expect({
				findings: json.findings.filter((finding) => finding.rule === 'shared-export-changed'),
				allowed: readQualityRecord(lot.root)?.allowed,
			}).toEqual({ findings: [], allowed: { 'shared-export-changed': 1 } })
		})

		it("contrib's rules run on the same lot → no base-aware finding", () => {
			const lot = createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] })

			const check = checkRules({
				root: lot.root,
				givenFiles: [],
				base: lot.cut,
				environment: machineOf(),
			})

			expect(check.findings.filter((finding) => finding.rule === 'shared-export-changed')).toEqual(
				[],
			)
		})
	},
)
