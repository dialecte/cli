import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import { SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	entriesOf,
	lineCountOf,
	sampleStandardText,
	standardCacheFolder,
	trimmedLinesOf,
} from '../../test/standard-workspace.ts'
import { buildSyntheticStandard, oneCharacterLines } from '../../test/synthetic-standard.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardShowJson, StandardWorkspace } from '../../test/standard-workspace.types.ts'

const NOISE_RUN_LENGTH = 25

/**
 * 34 lines: a two-line paragraph (2-3), a heading (5) and its sentence (6), a dropped run of one-character lines
 * (8-32) and a closing sentence (34).
 */
const SHOWN = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: ['First line of the paragraph.', 'second line of the paragraph.'] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Values' },
		{ kind: 'raw', lines: ['The zorbit value applies.'] },
		{ kind: 'blank' },
		{ kind: 'raw', lines: oneCharacterLines(NOISE_RUN_LENGTH) },
		{ kind: 'blank' },
		{ kind: 'raw', lines: ['Closing sentence here.'] },
	],
})
const LAST_LINE = lineCountOf(SHOWN)

const PARAGRAPH_LINE = '2-3  First line of the paragraph. second line of the paragraph.'

/** The workspace with the standard indexed, then `show <argument>` run over it. */
async function shown(params: {
	argument: string
	exitCode: 0 | 1 | 2
	extra?: string[]
	workspace?: StandardWorkspace
	/** Whether `index` runs first (the default); without it the cache is empty when show runs. */
	indexFirst?: boolean
}) {
	const workspace =
		params.workspace ??
		createStandardWorkspace({
			standards: {
				alpha: { 'one.md': SHOWN },
				beta: { 'one.md': sampleStandardText({ word: SAMPLE_WORD }) },
			},
		})
	if (params.indexFirst !== false)
		await answeredWith({
			run: runStandard({ argv: ['index'], cwd: workspace.cwd, environment: workspace.environment }),
			exitCode: 0,
		})
	return answeredWith({
		run: runStandard({
			argv: ['show', params.argument, ...(params.extra ?? [])],
			cwd: workspace.cwd,
			environment: workspace.environment,
		}),
		exitCode: params.exitCode,
	})
}

describe('standard show: the lines of a range', () => {
	const testCases: Record<string, { range: string; expected: string[] }> = {
		'a range covering a joined paragraph → its one logical line, from and to of the whole paragraph':
			{
				range: 'alpha/one:2-3',
				expected: [PARAGRAPH_LINE],
			},
		'a range inside a paragraph → the whole logical line that holds it': {
			range: 'alpha/one:3-3',
			expected: [PARAGRAPH_LINE],
		},
		'a range over a heading, a paragraph and a sentence → one line each, a one-line entry giving its line number alone':
			{
				range: 'alpha/one:1-6',
				expected: ['1  1 Overview', PARAGRAPH_LINE, '5  2 Values', '6  The zorbit value applies.'],
			},
		'a range across the dropped run → the lines around it, none of the run': {
			range: 'alpha/one:6-34',
			expected: ['6  The zorbit value applies.', '34  Closing sentence here.'],
		},
		'a range ending on the last line → accepted': {
			range: `alpha/one:34-${LAST_LINE}`,
			expected: ['34  Closing sentence here.'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(
			title,
			async () => {
				const answer = await shown({ argument: testCase.range, exitCode: 0 })

				expect(trimmedLinesOf(answer.output)).toEqual(testCase.expected)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

	it(
		'--json → the file, the range and each logical line with its original range, kind and text',
		async () => {
			const answer = await shown({ argument: 'alpha/one:5-6', exitCode: 0, extra: ['--json'] })

			expect(JSON.parse(answer.output) as StandardShowJson).toEqual({
				file: 'alpha/one',
				from: 5,
				to: 6,
				lines: [
					{ from: 5, to: 5, kind: 'heading', text: '2 Values' },
					{ from: 6, to: 6, kind: 'prose', text: 'The zorbit value applies.' },
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no index built yet → show builds it first, then answers; one index folder for the standard',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SHOWN } } })

			const answer = await shown({
				argument: 'alpha/one:6-6',
				exitCode: 0,
				workspace,
				indexFirst: false,
			})

			expect(trimmedLinesOf(answer.output)).toEqual(['6  The zorbit value applies.'])
			expect(entriesOf(standardCacheFolder({ workspace, standardId: 'alpha' }))).toHaveLength(1)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a file of the second standard → read from its own standard',
		async () => {
			const answer = await shown({ argument: 'beta/one:5-5', exitCode: 0 })

			expect(trimmedLinesOf(answer.output)).toEqual(['5  The zorbit value applies.'])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard show: a range with nothing to show → exit 1', () => {
	const testCases: Record<string, string> = {
		'only dropped one-character lines': 'alpha/one:10-20',
		'only blank lines': 'alpha/one:4-4',
	}

	for (const [title, range] of Object.entries(testCases))
		it(
			`${title} → exit 1`,
			async () => {
				const answer = await shown({ argument: range, exitCode: 1 })

				expect(trimmedLinesOf(answer.output)).not.toContain('34  Closing sentence here.')
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})

describe('standard show: a request that cannot be answered → exit 2, the message starting with "standard show:"', () => {
	const testCases: Record<string, { argument: string; mentions: string[] }> = {
		'no colon': { argument: 'alpha/one', mentions: [] },
		'no range': { argument: 'alpha/one:5', mentions: [] },
		'a range that is no numbers': { argument: 'alpha/one:a-b', mentions: [] },
		'a range with no start': { argument: 'alpha/one:-3', mentions: [] },
		'no file id': { argument: ':1-2', mentions: [] },
		'a file id the standard has not (its files named)': {
			argument: 'alpha/zzz:1-2',
			mentions: ['alpha/one'],
		},
		'a standard that has no folder (the known standards named)': {
			argument: 'gamma/one:1-2',
			mentions: ['alpha', 'beta'],
		},
		'a start after the end': { argument: 'alpha/one:6-5', mentions: [] },
		'a range ending beyond the last line': {
			argument: `alpha/one:30-${LAST_LINE + 1}`,
			mentions: [],
		},
		'a range starting beyond the last line': {
			argument: `alpha/one:${LAST_LINE + 10}-${LAST_LINE + 11}`,
			mentions: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(
			`${title}`,
			async () => {
				const answer = await shown({ argument: testCase.argument, exitCode: 2 })

				expect(answer.output.startsWith('standard show:')).toBe(true)
				for (const mention of testCase.mentions) expect(answer.output).toContain(mention)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)

	it(
		'no argument → exit 2',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SHOWN } } })

			const answer = await answeredWith({
				run: runStandard({
					argv: ['show'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 2,
			})

			expect(answer.output.startsWith('standard show:')).toBe(true)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard show: the installed dialectes are not read', () => {
	it(
		'show over an existing index → the installed dialecte is not imported, while find imports it',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SHOWN } } })
			const marker = join(workspace.base, 'dialecte-imported.txt')
			await answeredWith({
				run: runStandard({
					argv: ['index'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			installTestDialecte({ cwd: workspace.cwd })
			appendFileSync(
				join(workspace.cwd, 'node_modules', WIDGET_PACKAGE, 'dist/v1/index.js'),
				`\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'imported')\n`,
			)

			await answeredWith({
				run: runStandard({
					argv: ['show', 'alpha/one:5-6'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			expect(existsSync(marker)).toBe(false)

			await answeredWith({
				run: runStandard({
					argv: ['find', SAMPLE_WORD],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			expect(existsSync(marker)).toBe(true)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
