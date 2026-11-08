import { join } from 'node:path'

import { GADGET_PACKAGE, WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import {
	SAMPLE_WORD,
	TAGS_FILE_BOTH_PACKAGES,
	TAGS_FILE_PATTERN,
	TAGS_FILE_VERSION_ONE,
} from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	filesUnder,
	manifestHashOf,
	sampleStandardText,
	sampleValueSentence,
	standardCacheFolder,
	trimmedLinesOf,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { buildSyntheticStandard } from '../../test/synthetic-standard.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardFindJson, StandardWorkspace } from '../../test/standard-workspace.types.ts'

const SAMPLE = sampleStandardText({ word: SAMPLE_WORD })
const WIDGET_VERSIONED = `${WIDGET_PACKAGE}@1.0.0`
const GADGET_VERSIONED = `${GADGET_PACKAGE}@1.0.0`
const NO_DIALECTE_LINE = 'vocabulary none (no dialecte installed)'
const SCORING_VERBS = ['index', 'find', 'eval'] as const

/** A file whose second clause holds a table with one cell equal to `x`, a value of the test dialecte. */
const VALUE_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: ['The base case is described here.'] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Listings' },
		{ kind: 'table', columns: ['Name', 'Value'], rows: [['x', '1']] },
	],
})

type Verb = (typeof SCORING_VERBS)[number]

type Installed = 'none' | 'widget' | 'both'

function workspaceWith(params: { installed: Installed; files?: Record<string, string> }): {
	workspace: StandardWorkspace
	gold: string
} {
	const workspace = createStandardWorkspace({
		standards: { alpha: params.files ?? { 'one.md': SAMPLE } },
	})
	if (params.installed !== 'none') installTestDialecte({ cwd: workspace.cwd })
	if (params.installed === 'both')
		installTestDialecte({ cwd: workspace.cwd, packageName: GADGET_PACKAGE })
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({
		path: gold,
		text: `${JSON.stringify({
			question: SAMPLE_WORD,
			expected: [{ file: 'alpha/one', quote: sampleValueSentence(SAMPLE_WORD).toLowerCase() }],
		})}\n`,
	})
	return { workspace, gold }
}

function argvOf(params: { verb: Verb; gold: string; extra: string[] }): string[] {
	if (params.verb === 'index') return ['index', ...params.extra]
	if (params.verb === 'find') return ['find', SAMPLE_WORD, ...params.extra]
	return ['eval', params.gold, ...params.extra]
}

async function ran(params: {
	verb: Verb
	installed: Installed
	extra?: string[]
	exitCode?: 0 | 1 | 2
}) {
	const { workspace, gold } = workspaceWith({ installed: params.installed })
	const answer = await answeredWith({
		run: runStandard({
			argv: argvOf({ verb: params.verb, gold, extra: params.extra ?? [] }),
			cwd: workspace.cwd,
			environment: workspace.environment,
		}),
		exitCode: params.exitCode ?? 0,
	})
	return { workspace, answer }
}

function vocabularyLinesOf(output: string): string[] {
	return trimmedLinesOf(output).filter((line) => line.startsWith('vocabulary '))
}

function vocabularyOf(output: string): unknown {
	return (JSON.parse(output) as { vocabulary?: unknown }).vocabulary
}

describe('standard index, find and eval: the vocabulary line', () => {
	for (const verb of SCORING_VERBS) {
		it(
			`${verb}, one dialecte installed → one line naming it with its version`,
			async () => {
				const { answer } = await ran({ verb, installed: 'widget' })

				expect(vocabularyLinesOf(answer.output)).toEqual([`vocabulary ${WIDGET_VERSIONED}`])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb}, two dialectes installed → one line naming both, sorted, separated by a comma`,
			async () => {
				const { answer } = await ran({ verb, installed: 'both' })

				expect(vocabularyLinesOf(answer.output)).toEqual([
					`vocabulary ${GADGET_VERSIONED}, ${WIDGET_VERSIONED}`,
				])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb}, two dialectes installed, --package of one → the line names that one only`,
			async () => {
				const { answer } = await ran({
					verb,
					installed: 'both',
					extra: ['--package', WIDGET_PACKAGE],
				})

				expect(vocabularyLinesOf(answer.output)).toEqual([`vocabulary ${WIDGET_VERSIONED}`])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb}, no dialecte installed → the line says none`,
			async () => {
				const { answer } = await ran({ verb, installed: 'none' })

				expect(vocabularyLinesOf(answer.output)).toEqual([NO_DIALECTE_LINE])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb} --json, two dialectes installed → vocabulary.packages names both`,
			async () => {
				const { answer } = await ran({ verb, installed: 'both', extra: ['--json'] })

				expect(vocabularyOf(answer.output)).toEqual({
					packages: [GADGET_VERSIONED, WIDGET_VERSIONED],
				})
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb} --json, --package of one → vocabulary.packages names that one`,
			async () => {
				const { answer } = await ran({
					verb,
					installed: 'both',
					extra: ['--package', GADGET_PACKAGE, '--json'],
				})

				expect(vocabularyOf(answer.output)).toEqual({ packages: [GADGET_VERSIONED] })
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb} --json, no dialecte installed → vocabulary.packages is empty`,
			async () => {
				const { answer } = await ran({ verb, installed: 'none', extra: ['--json'] })

				expect(vocabularyOf(answer.output)).toEqual({ packages: [] })
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb} --package of a name that is not installed → exit 2 naming the installed ones, the message starting with "standard ${verb}:"`,
			async () => {
				const { answer } = await ran({
					verb,
					installed: 'both',
					extra: ['--package', '@acme/missing'],
					exitCode: 2,
				})

				expect({
					prefix: answer.output.startsWith(`standard ${verb}:`),
					names: [WIDGET_PACKAGE, GADGET_PACKAGE].map((name) => answer.output.includes(name)),
					typed: answer.output.includes('@acme/missing'),
				}).toEqual({ prefix: true, names: [true, true], typed: true })
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

		it(
			`${verb} --package with no dialecte installed → exit 2`,
			async () => {
				const { answer } = await ran({
					verb,
					installed: 'none',
					extra: ['--package', WIDGET_PACKAGE],
					exitCode: 2,
				})

				expect(answer.output.startsWith(`standard ${verb}:`)).toBe(true)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
	}
})

describe('standard index: the tags file follows the selected packages', () => {
	it(
		'two dialectes installed, no --package → one tags file named by the hash of both',
		async () => {
			const { workspace } = await ran({ verb: 'index', installed: 'both' })

			expect(tagsFilesOf({ workspace })).toEqual([TAGS_FILE_BOTH_PACKAGES])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'two dialectes installed, --package of the widget → one tags file named by the hash of the widget alone',
		async () => {
			const { workspace } = await ran({
				verb: 'index',
				installed: 'both',
				extra: ['--package', WIDGET_PACKAGE],
			})

			expect(tagsFilesOf({ workspace })).toEqual([TAGS_FILE_VERSION_ONE])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

function tagsFilesOf(params: { workspace: StandardWorkspace }): string[] {
	const hash = manifestHashOf({ files: { 'alpha/one': SAMPLE } })
	return filesUnder(
		join(standardCacheFolder({ workspace: params.workspace, standardId: 'alpha' }), hash),
	).filter((file) => TAGS_FILE_PATTERN.test(file))
}

describe('standard find: the enumeration values of the installed definition', () => {
	it(
		'a table cell equal to a value of the installed dialecte, the query that value → the clause found, the value the term',
		async () => {
			const { workspace } = workspaceWith({ installed: 'widget', files: { 'one.md': VALUE_FILE } })

			const answer = await answeredWith({
				run: runStandard({
					argv: ['find', 'x', '--json'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect(
				(JSON.parse(answer.output) as StandardFindJson).slices.map((slice) => ({
					file: slice.file,
					clause: slice.clause,
					terms: slice.terms,
				})),
			).toEqual([{ file: 'alpha/one', clause: '2', terms: ['x'] }])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
