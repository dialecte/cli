/**
 * `dialecte rules` and the base-aware rules: the base they judge against (the lot base, `--base`, never the gate
 * base), the record they leave, the lines they print, and the runs that never judge (a clone outside any lot, no lot
 * base, contrib).
 */
import { join } from 'node:path'

import { createQualityLot } from '../../test/quality-workspace.ts'
import { createStackedLotWorktree } from '../../test/rules-lot-worktree.ts'
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

/** The folder of the escaping case: a bidi override in its name. */
const ODD_FOLDER = 'co\u202ere'
const ODD_SIZE_FILE = `src/${ODD_FOLDER}/size.ts`

/** An app installing a dialecte that ships a built definition: a file importing it is a Dialecte change. */
const APP_PACKAGE_JSON = `${JSON.stringify({ name: 'demo-app' })}\n`
const APP_DIALECTE_FILES = {
	'node_modules/@dialecte/demo/package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
	'node_modules/@dialecte/demo/dist/v1/generated/definition.generated.js': 'export {}\n',
}
const APP_SIZE_FILE = 'src/model/size.ts'
const APP_PLAIN_FILE = 'src/plain/count.ts'
const APP_GONE_FILE = 'src/model/gone.ts'
const APP_USER_FILE = 'src/view/panel.ts'

/** A file importing the dialecte, exporting `name` that counts its items, `plus` added. */
function dialecteModule(params: { name: string; plus?: string }): string {
	return [
		"import { definition } from '@dialecte/demo/dist/v1/generated/definition.generated.js'",
		'',
		`export function ${params.name}(items: readonly string[]${params.plus === undefined ? '' : ', extra = 0'}): number {`,
		`\treturn items.length + Object.keys(definition).length${params.plus ?? ''}`,
		'}',
		'',
	].join('\n')
}

const APP_SIZE = dialecteModule({ name: 'sizeOf' })
const APP_SIZE_RESIGNED = dialecteModule({ name: 'sizeOf', plus: ' + extra' })
const APP_GONE = dialecteModule({ name: 'goneOf' })
const APP_PLAIN =
	'export function countOf(items: readonly string[]): number {\n\treturn items.length\n}\n'
const APP_PLAIN_RESIGNED =
	'export function countOf(items: readonly string[], extra = 0): number {\n\treturn items.length + extra\n}\n'
const APP_USER = [
	"import { countOf } from '../plain/count.ts'",
	"import { goneOf } from '../model/gone.ts'",
	"import { sizeOf } from '../model/size.ts'",
	'',
	'export function panel(items: readonly string[]): number {',
	'\treturn sizeOf(items) + countOf(items) + goneOf(items)',
	'}',
	'',
].join('\n')

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

/** A contributor's library with a runtime API: its `exports` map, its own skill index. */
const LIBRARY_PACKAGE_JSON = `${JSON.stringify({
	name: '@x/runtime',
	version: '1.0.0',
	exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
	dialecte: { profile: 'contributor' },
})}\n`
const INDEX_FILE = 'skills/runtime/references/api.json'
const EXPORT_SOURCE = 'src/index.ts'
const DOC_PAGE = 'doc/api/core.md'
const NEW_DOC_PAGE = 'doc/api/count.md'
const COUNT_FILE = 'src/core/count.ts'

/** The library's index holding `methods` (route, signature, where declared). */
function indexOf(methods: { path: string; signature: string; declaredAt: string }[]): string {
	return `${JSON.stringify({
		package: '@x/runtime',
		methods: methods.map((method) => ({
			...method,
			root: 'q',
			otherRoutes: [],
			summary: 'A method.',
			intents: [],
			example: null,
		})),
	})}\n`
}

const SIZE_METHOD = {
	path: 'doc.core.sizeOf',
	signature: '(items: string[]): number',
	declaredAt: `${SIZE_FILE}:1`,
}
const SIZE_METHOD_RESIGNED = {
	...SIZE_METHOD,
	signature: '(items: string[], empty?: boolean): number',
}
const COUNT_METHOD = {
	path: 'doc.core.countOf',
	signature: '(items: string[]): number',
	declaredAt: `${COUNT_FILE}:1`,
}
const PAGE = '# Core\n\n`core.sizeOf(items)` tells how many items a list holds.\n'
const COUNT =
	'export function countOf(items: readonly string[]): number {\n\treturn items.length\n}\n'
const SIZE_RESIGNED_OPTED_OUT = `// dialecte-allow docs-not-updated: the page is rewritten with the next release notes\n${SIZE_RESIGNED}`

/** The library at its base: the size export, its index entry and the page naming it. */
const LIBRARY_BASE = {
	[EXPORT_SOURCE]: "export { sizeOf } from './core/size.ts'\n",
	[SIZE_FILE]: SIZE,
	[INDEX_FILE]: indexOf([SIZE_METHOD]),
	[DOC_PAGE]: PAGE,
}

const UNCOMMITTED_FILE = 'src/lib/fresh.ts'
const UNCHANGED_FILE = 'src/lib/kept.ts'
/** An existing function named by two nouns, `widget` and `label`. */
const LABEL =
	'/** The label of a widget. */\nexport function widgetLabel(name: string): string {\n\treturn name\n}\n'
/** An added function whose name holds both nouns: a find duplicate. */
const OWNER_LABEL =
	'/** The label of the owner of a widget. */\nexport function ownerWidgetLabel(name: string): string {\n\treturn name.trim()\n}\n'
/** An added function whose name shares one noun only (`label`): no duplicate. */
const ONE_WORD =
	'/** The total of a label. */\nexport function labelTotal(name: string): number {\n\treturn name.length\n}\n'
/** A reader of the element `Widget` named `name`, reading the attributes of the named set `NAMING`. */
function ownerReaderOf(params: { name: string; summary: string }): string {
	return [
		"import { NAMING } from './naming.constants.ts'",
		'',
		`/** ${params.summary} */`,
		`export function ${params.name}(record: TrackedRecord<'Widget'>): string[] {`,
		'\treturn NAMING.map((name) => readAttribute({ record, name }))',
		'}',
		'',
	].join('\n')
}

const UNUSED_OPT_OUT = `// dialecte-allow duplicate-read: kept for the next lot, which reads it differently\n${COUNT}`

/** What one rules run shows, in text and `--json`, and what it leaves recorded. */
type Observed = {
	exitCode: number
	output: string
	qualityLines: string[]
	notes: string[]
	files: string[]
	qualityBase: unknown
	sharedExports: { name: string; changes: string[] }[]
	duplicates: string[]
	findingsByRule: Record<string, number>
	recordBase: unknown
	recordAllowed: unknown
	rawBidi: boolean
	escapedBidi: boolean
	mutations: { file: string; line: number; severity: string }[]
}

/** A worktree a case runs in: its root, and its base commit and short id. */
type CaseLot = { root: string; cut: string; shortCut: string }

/** The worktree of a stacked lot started on an open parent: its base is the parent's tip. */
function stackedLot(): CaseLot {
	const lot = createStackedLotWorktree({ parent: 'open' })
	return { root: lot.root, cut: lot.baseCommit, shortCut: lot.shortSha }
}

/** The base branch's merge-base with HEAD in `root`: a scoped gate step's base outside any stack. */
function mergeBaseOf(root: string): string {
	return git({ root, args: ['merge-base', 'HEAD', 'main'] }).trim()
}

/** The run of `argv` in `lot` with `environment`, as one observation. */
function observe(params: {
	lot: CaseLot
	argv: string[]
	environment: Record<string, string>
}): Observed {
	const { lot } = params
	const text = runRules({ cwd: lot.root, argv: params.argv, environment: params.environment })
	const json = runRules({
		cwd: lot.root,
		argv: [...params.argv, '--json'],
		environment: params.environment,
	})
	const parsed = (() => {
		try {
			return JSON.parse(json.output) as {
				files?: string[]
				findings?: RuleFinding[]
				quality?: {
					base: unknown
					sharedExports: SharedExportChange[]
					duplicates: { name: string; signal: string; existing: { name: string } }[]
				}
			}
		} catch {
			return {}
		}
	})()
	const findings = parsed.findings ?? []
	const record = readQualityRecord(lot.root)
	const lines = text.output.split('\n')
	return {
		exitCode: text.exitCode,
		output: text.output,
		qualityLines: lines.filter((line) => line.startsWith('quality: ')),
		notes: lines.filter(
			(line) =>
				line.startsWith('public API') ||
				line.startsWith('! public API') ||
				line.startsWith('aliases changed'),
		),
		files: parsed.files ?? [],
		qualityBase: parsed.quality?.base,
		sharedExports: (parsed.quality?.sharedExports ?? []).map((shared) => ({
			name: shared.name,
			changes: shared.changes,
		})),
		duplicates: (parsed.quality?.duplicates ?? [])
			.map((found) => `${found.name} ${found.signal} ${found.existing.name}`)
			.sort(),
		findingsByRule: findings.reduce<Record<string, number>>(
			(counts, finding) => ({ ...counts, [finding.rule]: (counts[finding.rule] ?? 0) + 1 }),
			{},
		),
		recordBase: record?.base,
		recordAllowed: record?.allowed,
		rawBidi: text.output.includes('‮'),
		escapedBidi: text.output.includes('\\u{202e}'),
		mutations: findings
			.filter((finding) => finding.rule === 'argument-mutation')
			.map((finding) => ({ file: finding.file, line: finding.line, severity: finding.severity })),
	}
}

describe(
	'dialecte rules: the base-aware rules on a lot',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		const testCases: Record<
			string,
			{
				make: () => CaseLot
				argv?: (lot: CaseLot) => string[]
				environment?: (lot: CaseLot) => Record<string, string>
				expected: (lot: CaseLot) => Partial<Observed>
			}
		> = {
			'a bare run on a lot whose change is all committed → the shared export listed and recorded against the lot base, the quality line naming it':
				{
					make: () => createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] }),
					expected: (lot) => ({
						exitCode: 0,
						qualityLines: [`quality: since ${lot.shortCut} (lot)`],
						sharedExports: [{ name: RESIGNED.name, changes: RESIGNED.changes }],
						findingsByRule: { 'shared-export-changed': 1 },
						recordBase: { commit: lot.cut, source: 'lot' },
					}),
				},
			'the scoped gate step in a lot, its gate base the empty tree → judged and recorded on the lot base, never the gate base':
				{
					make: () => createQualityLot({ base: BASE, uncommitted: { [SIZE_FILE]: SIZE_RESIGNED } }),
					environment: (lot) =>
						gateStepOf({
							root: lot.root,
							files: [SIZE_FILE],
							base: git({
								root: lot.root,
								args: ['hash-object', '-t', 'tree', '/dev/null'],
							}).trim(),
						}),
					expected: (lot) => ({
						qualityLines: [`quality: since ${lot.shortCut} (lot)`],
						recordBase: { commit: lot.cut, source: 'lot' },
					}),
				},
			"the scoped gate step of a stacked lot, its gate base the base branch's merge-base → judged and recorded on the parent's tip":
				{
					make: stackedLot,
					environment: (lot) =>
						gateStepOf({
							root: lot.root,
							files: ['src/widget/add-widget.test.ts'],
							base: mergeBaseOf(lot.root),
						}),
					expected: (lot) => ({
						qualityLines: [`quality: since ${lot.shortCut} (lot)`],
						recordBase: { commit: lot.cut, source: 'lot' },
					}),
				},
			'the scoped gate step in a clone outside any lot → quality: not run (no lot), nothing recorded':
				{
					make: () =>
						createQualityLot({
							base: BASE,
							uncommitted: { [SIZE_FILE]: SIZE_RESIGNED },
							link: false,
						}),
					environment: (lot) => gateStepOf({ root: lot.root, files: [SIZE_FILE], base: lot.cut }),
					expected: () => ({ qualityLines: ['quality: not run (no lot)'], recordBase: undefined }),
				},
			'a bare run outside any lot, no base branch, no release tag → no quality line, nothing recorded, a base-aware opt-out never judged unused':
				{
					make: () =>
						createQualityLot({
							base: BASE,
							uncommitted: { [SIZE_FILE]: SIZE_RESIGNED, [TOTAL_FILE]: TOTAL_WITH_OPT_OUT },
							link: false,
							baseBranch: 'absent',
						}),
					expected: () => ({
						qualityLines: [],
						recordBase: undefined,
						findingsByRule: expect.not.objectContaining({ 'unused-allow': expect.anything() }),
					}),
				},
			'a repository without package.json, rules --base main → no base-aware part, no quality line, nothing recorded':
				{
					make: () =>
						createQualityLot({
							base: BASE,
							commits: [{ [SIZE_FILE]: SIZE_RESIGNED }],
							link: false,
							packageJson: false,
						}),
					argv: () => ['--base', 'main'],
					expected: () => ({ qualityLines: [], sharedExports: [], recordBase: undefined }),
				},
			'rules --base naming no commit → exit 2, nothing recorded': {
				make: () => createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] }),
				argv: () => ['--base', 'nope'],
				expected: () => ({
					exitCode: 2,
					output: expect.stringContaining('--base nope: no such commit'),
					recordBase: undefined,
				}),
			},
			'rules --base with files given → exit 2, nothing recorded': {
				make: () => createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] }),
				argv: (lot) => ['--base', lot.cut, SIZE_FILE],
				expected: () => ({
					exitCode: 2,
					output: expect.stringContaining(RULES_BASE_WITH_FILES),
					recordBase: undefined,
				}),
			},
			'a CI checkout outside any lot: rules --base main → the files changed since the merge-base and the uncommitted ones judged, an unchanged one not, a deleted one left out; the flag the quality base':
				{
					make: () =>
						createQualityLot({
							base: {
								[MUTATING_FILE]: MUTATING,
								[GONE_FILE]: MUTATING,
								[UNCHANGED_FILE]: MUTATING,
							},
							commits: [{ [MUTATING_FILE]: MUTATING_MORE }],
							committedDeletions: [GONE_FILE],
							uncommitted: { [UNCOMMITTED_FILE]: COUNT },
							link: false,
						}),
					argv: () => ['--base', 'main'],
					expected: (lot) => ({
						exitCode: 1,
						files: [MUTATING_FILE, UNCOMMITTED_FILE],
						qualityBase: { commit: lot.cut, source: 'flag' },
						mutations: [
							{ file: MUTATING_FILE, line: 2, severity: 'warning' },
							{ file: MUTATING_FILE, line: 6, severity: 'error' },
						],
					}),
				},
			'a given file in a lot → its findings, nothing recorded': {
				make: () => createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] }),
				argv: () => [SIZE_FILE],
				expected: () => ({
					sharedExports: [{ name: RESIGNED.name, changes: RESIGNED.changes }],
					recordBase: undefined,
				}),
			},
			'a given folder in a lot → the findings of its files, nothing recorded': {
				make: () => createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] }),
				argv: () => ['src/core'],
				expected: () => ({
					findingsByRule: expect.objectContaining({ 'shared-export-changed': 1 }),
					recordBase: undefined,
				}),
			},
			'a change that only deletes the file of a shared export its importer still imports → removed, recorded':
				{
					make: () => createQualityLot({ base: BASE, deleted: [SIZE_FILE] }),
					expected: (lot) => ({
						sharedExports: [{ name: 'sizeOf', changes: ['removed'] }],
						recordBase: { commit: lot.cut, source: 'lot' },
					}),
				},
			'the same with an opt-out on the unchanged import line → silenced, counted': {
				make: () =>
					createQualityLot({
						base: { [SIZE_FILE]: SIZE, [TOTAL_FILE]: TOTAL_WITH_OPT_OUT },
						deleted: [SIZE_FILE],
					}),
				expected: () => ({ findingsByRule: {}, recordAllowed: { 'shared-export-changed': 1 } }),
			},
			'a base-aware opt-out over nothing in a file the change touches → unused-allow': {
				make: () => createQualityLot({ base: BASE, commits: [{ [COUNT_FILE]: UNUSED_OPT_OUT }] }),
				expected: () => ({ findingsByRule: { 'unused-allow': 1 } }),
			},
			'an added function reading what an existing one reads, and one named like an existing one → a reads and a find duplicate':
				{
					make: () =>
						createQualityLot({
							base: {
								'src/read/naming.constants.ts':
									'export const NAMING: readonly string[] = namesOfTheStandard()\n',
								'src/read/owner.ts': ownerReaderOf({
									name: 'readOwner',
									summary: 'Reads the owner of a widget.',
								}),
								'src/find/label.ts': LABEL,
							},
							commits: [
								{
									'src/read/keys.ts': ownerReaderOf({
										name: 'keysOfRecord',
										summary: 'Lists the keys of a record.',
									}),
									'src/find/owner.ts': OWNER_LABEL,
								},
							],
						}),
					expected: () => ({
						duplicates: ['keysOfRecord reads readOwner', 'ownerWidgetLabel find widgetLabel'],
					}),
				},
			'an added function sharing one word of its name with an existing one → no duplicate': {
				make: () =>
					createQualityLot({
						base: { 'src/find/label.ts': LABEL },
						commits: [{ 'src/size/total.ts': ONE_WORD }],
					}),
				expected: () => ({ duplicates: [] }),
			},
			'a contributor library re-signing an export its page names, the page untouched → docs-not-updated':
				{
					make: () =>
						createQualityLot({
							packageJson: LIBRARY_PACKAGE_JSON,
							base: LIBRARY_BASE,
							commits: [
								{ [SIZE_FILE]: SIZE_RESIGNED, [INDEX_FILE]: indexOf([SIZE_METHOD_RESIGNED]) },
							],
						}),
					expected: () => ({ findingsByRule: expect.objectContaining({ 'docs-not-updated': 1 }) }),
				},
			'the same with an opt-out at the export → silenced, counted': {
				make: () =>
					createQualityLot({
						packageJson: LIBRARY_PACKAGE_JSON,
						base: LIBRARY_BASE,
						commits: [
							{
								[SIZE_FILE]: SIZE_RESIGNED_OPTED_OUT,
								[INDEX_FILE]: indexOf([{ ...SIZE_METHOD_RESIGNED, declaredAt: `${SIZE_FILE}:2` }]),
							},
						],
					}),
				expected: () => ({
					findingsByRule: expect.not.objectContaining({ 'docs-not-updated': expect.anything() }),
					recordAllowed: expect.objectContaining({ 'docs-not-updated': 1 }),
				}),
			},
			'a public entry removed while its page still names it → the public API removed line naming the page':
				{
					make: () =>
						createQualityLot({
							packageJson: LIBRARY_PACKAGE_JSON,
							base: LIBRARY_BASE,
							commits: [{ [INDEX_FILE]: indexOf([]) }],
						}),
					expected: () => ({
						notes: [`public API: doc.core.sizeOf removed: still named by ${DOC_PAGE}`],
					}),
				},
			'an export source changed while the index did not → the public API unknown line, no docs finding':
				{
					make: () =>
						createQualityLot({
							packageJson: LIBRARY_PACKAGE_JSON,
							base: LIBRARY_BASE,
							commits: [
								{
									[EXPORT_SOURCE]:
										"export { sizeOf } from './core/size.ts'\nexport const VERSION = 2\n",
								},
							],
						}),
					expected: () => ({
						notes: [
							'! public API unknown (an export source changed while every api.json did not: run dialecte skills generate)',
						],
						findingsByRule: expect.not.objectContaining({ 'docs-not-updated': expect.anything() }),
					}),
				},
			'an added public entry its new page names, the page not yet in git → no docs finding': {
				make: () =>
					createQualityLot({
						packageJson: LIBRARY_PACKAGE_JSON,
						base: LIBRARY_BASE,
						commits: [{ [COUNT_FILE]: COUNT, [INDEX_FILE]: indexOf([SIZE_METHOD, COUNT_METHOD]) }],
						uncommitted: { [NEW_DOC_PAGE]: '# Count\n\n`core.countOf(items)` counts them.\n' },
					}),
				expected: () => ({
					findingsByRule: expect.not.objectContaining({ 'docs-not-updated': expect.anything() }),
				}),
			},
			'a change to a tsconfig paths alias → the aliases changed note': {
				make: () =>
					createQualityLot({
						base: {
							...BASE,
							'tsconfig.json':
								'{ "compilerOptions": { "paths": { "@core/*": ["src/core/*"] } } }\n',
						},
						commits: [
							{
								'tsconfig.json':
									'{ "compilerOptions": { "paths": { "@core/*": ["src/lib/core/*"] } } }\n',
							},
						],
					}),
				expected: () => ({ notes: ["aliases changed: base edges read with the tree's"] }),
			},
			'an app: findings on its Dialecte-change files only, a deleted one among them; a plain file left out':
				{
					make: () =>
						createQualityLot({
							packageJson: APP_PACKAGE_JSON,
							base: {
								...APP_DIALECTE_FILES,
								[APP_SIZE_FILE]: APP_SIZE,
								[APP_PLAIN_FILE]: APP_PLAIN,
								[APP_GONE_FILE]: APP_GONE,
								[APP_USER_FILE]: APP_USER,
							},
							commits: [
								{ [APP_SIZE_FILE]: APP_SIZE_RESIGNED, [APP_PLAIN_FILE]: APP_PLAIN_RESIGNED },
							],
							deleted: [APP_GONE_FILE],
						}),
					expected: () => ({
						sharedExports: [
							{ name: 'sizeOf', changes: ['signature', 'behaviour'] },
							{ name: 'goneOf', changes: ['removed'] },
						],
					}),
				},
			'a finding naming a folder that holds a bidi override → printed escaped, never raw': {
				make: () =>
					createQualityLot({
						base: {
							[ODD_SIZE_FILE]: SIZE,
							[TOTAL_FILE]: TOTAL.replace('../core/size.ts', `../${ODD_FOLDER}/size.ts`),
						},
						commits: [{ [ODD_SIZE_FILE]: SIZE_RESIGNED }],
					}),
				expected: () => ({ escapedBidi: true, rawBidi: false }),
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const lot = testCase.make()
				const argv = testCase.argv?.(lot) ?? []
				const environment = testCase.environment?.(lot) ?? machineOf()

				expect(observe({ lot, argv, environment })).toEqual(
					expect.objectContaining(testCase.expected(lot)),
				)
			})
	},
)

describe("dialecte contrib's rules run", { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('on the same lot → no base-aware finding', () => {
		const lot = createQualityLot({ base: BASE, commits: [{ [SIZE_FILE]: SIZE_RESIGNED }] })

		const check = checkRules({
			root: lot.root,
			givenFiles: [],
			base: lot.cut,
			environment: machineOf(),
		})

		expect(check.findings.filter((finding) => finding.rule === 'shared-export-changed')).toEqual([])
	})
})
