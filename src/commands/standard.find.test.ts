import { unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import { ABOUT_NEEDS_DIALECTE, SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	entriesOf,
	sampleStandardText,
	sampleValueSentence,
	standardCacheFolder,
	trimmedLinesOf,
} from '../../test/standard-workspace.ts'
import { buildSyntheticStandard, citationOf } from '../../test/synthetic-standard.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardFindJson, StandardWorkspace } from '../../test/standard-workspace.types.ts'

const SAMPLE = sampleStandardText({ word: SAMPLE_WORD })

/**
 * Two standards of the same shape, two identical files each: frequency weights are per standard, so the word
 * weighs the same in both and every slice scores the same, ties going by file id.
 */
const STANDARDS = {
	alpha: { 'one.md': SAMPLE, 'two.md': SAMPLE },
	beta: { 'one.md': SAMPLE, 'two.md': SAMPLE },
}

/** The first heading's text refers to the second heading: a find on its word answers the second as a linked slice. */
const LINKED_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{
			kind: 'raw',
			lines: [`The quillon rule is given in ${citationOf({ word: 'clause', number: '2' })}.`],
		},
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Values' },
		{ kind: 'raw', lines: ['Other text here.'] },
	],
})

/** A file whose first clause names the test dialecte's AA_1 element. */
const TAG_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: ['The AA_1 element holds the values.'] },
	],
})

async function found(params: {
	workspace: StandardWorkspace
	argv: string[]
	exitCode?: 0 | 1 | 2
}) {
	return answeredWith({
		run: runStandard({
			argv: ['find', ...params.argv],
			cwd: params.workspace.cwd,
			environment: params.workspace.environment,
		}),
		exitCode: params.exitCode ?? 0,
	})
}

function slicesOf(output: string): StandardFindJson['slices'] {
	return (JSON.parse(output) as StandardFindJson).slices
}

describe('standard find: the slices', () => {
	it(
		'a word held by files of two standards → one ranking over both, ties by file id, each slice naming its file',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })

			const answer = await found({ workspace, argv: [SAMPLE_WORD, '--json'] })

			expect(
				slicesOf(answer.output).map(({ file, from, to, clause, title, terms, linked }) => ({
					file,
					from,
					to,
					clause,
					title,
					terms,
					linked,
				})),
			).toEqual(
				['alpha/one', 'alpha/two', 'beta/one', 'beta/two'].map((file) => ({
					file,
					from: 5,
					to: 5,
					clause: '2',
					title: 'Values',
					terms: [SAMPLE_WORD],
					linked: false,
				})),
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json → the query as typed and a positive score on each slice',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })

			const answer = await found({ workspace, argv: [SAMPLE_WORD, '--json'] })

			expect({
				query: (JSON.parse(answer.output) as StandardFindJson).query,
				positiveScores: slicesOf(answer.output).map((slice) => slice.score > 0),
			}).toEqual({ query: SAMPLE_WORD, positiveScores: [true, true, true, true] })
			expect(new Set(slicesOf(answer.output).map((slice) => slice.score)).size).toBe(1)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no index built yet → find builds each standard first: one index folder each',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })

			await found({ workspace, argv: [SAMPLE_WORD] })

			expect(
				['alpha', 'beta'].map(
					(standardId) => entriesOf(standardCacheFolder({ workspace, standardId })).length,
				),
			).toEqual([1, 1])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--standard beta → only the slices of beta',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })

			const answer = await found({
				workspace,
				argv: [SAMPLE_WORD, '--standard', 'beta', '--json'],
			})

			expect(slicesOf(answer.output).map((slice) => slice.file)).toEqual(['beta/one', 'beta/two'])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--limit 2 → the two best slices only',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })

			const answer = await found({ workspace, argv: [SAMPLE_WORD, '--limit', '2', '--json'] })

			expect(slicesOf(answer.output).map((slice) => slice.file)).toEqual(['alpha/one', 'alpha/two'])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the text answer → per slice a header with file, range, clause, title and score, then the text of its lines',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })

			const answer = await found({ workspace, argv: [SAMPLE_WORD] })

			const lines = trimmedLinesOf(answer.output)
			expect(
				lines.filter((line) => /^alpha\/one:5-5 {2}2 Values {2}score \d+(\.\d+)?$/u.test(line)),
			).toHaveLength(1)
			expect(lines).toContain(sampleValueSentence(SAMPLE_WORD))
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a hit naming another clause → the text answer gives that clause after it, its header ending in [linked]',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': LINKED_FILE } } })

			const answer = await found({ workspace, argv: ['quillon'] })

			const headers = trimmedLinesOf(answer.output).filter((line) => /^alpha\/one:\d/u.test(line))
			expect(headers.map((line) => line.replace(/score \S+/u, 'score N'))).toEqual([
				'alpha/one:2-2  1 Overview  score N',
				'alpha/one:4-5  2 Values  score N  [linked]',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a query nothing matches → exit 1',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })

			await found({ workspace, argv: ['nothingmatchesthis'], exitCode: 1 })

			expect(entriesOf(standardCacheFolder({ workspace, standardId: 'alpha' })).length).toBe(1)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard find --about', () => {
	it(
		'a tag the installed dialecte declares → the slice found, the tag in the answer and last of its terms',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'tag.md': TAG_FILE } } })
			installTestDialecte({ cwd: workspace.cwd })

			const answer = await found({ workspace, argv: ['values', '--about', 'AA_1', '--json'] })

			expect({
				about: (JSON.parse(answer.output) as StandardFindJson).about,
				slices: slicesOf(answer.output).map((slice) => ({ file: slice.file, terms: slice.terms })),
			}).toEqual({ about: 'AA_1', slices: [{ file: 'alpha/tag', terms: ['values', 'AA_1'] }] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a tag no installed dialecte declares → exit 2 with the closest tag names',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'tag.md': TAG_FILE } } })
			installTestDialecte({ cwd: workspace.cwd })

			const answer = await found({
				workspace,
				argv: ['values', '--about', 'AA_9'],
				exitCode: 2,
			})

			expect(answer.output).toContain('AA_1')
			expect(answer.output).not.toContain('AA_11')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no dialecte installed → exit 2 saying --about needs one',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'tag.md': TAG_FILE } } })

			const answer = await found({
				workspace,
				argv: ['values', '--about', 'AA_1'],
				exitCode: 2,
			})

			expect(answer.output).toContain('--about')
			expect(answer.output).toContain(ABOUT_NEEDS_DIALECTE)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard find: a working folder with no package.json', () => {
	it(
		'a word held by a file → found, the vocabulary empty',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })
			unlinkSync(join(workspace.cwd, 'package.json'))

			const answer = await found({ workspace, argv: [SAMPLE_WORD, '--json'] })

			expect(slicesOf(answer.output).map((slice) => slice.file)).toEqual([
				'alpha/one',
				'alpha/two',
				'beta/one',
				'beta/two',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--about → exit 2 saying --about needs an installed dialecte',
		async () => {
			const workspace = createStandardWorkspace({ standards: STANDARDS })
			unlinkSync(join(workspace.cwd, 'package.json'))

			const answer = await found({
				workspace,
				argv: [SAMPLE_WORD, '--about', 'AA_1'],
				exitCode: 2,
			})

			expect(answer.output).toContain('--about')
			expect(answer.output).toContain(ABOUT_NEEDS_DIALECTE)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard find: usage errors', () => {
	const testCases: Record<string, string[]> = {
		'no terms': [],
		'--limit not a number': [SAMPLE_WORD, '--limit', 'many'],
	}

	for (const [title, argv] of Object.entries(testCases))
		it(
			`${title} → exit 2, the message starting with "standard find:"`,
			async () => {
				const workspace = createStandardWorkspace({ standards: STANDARDS })

				const answer = await found({ workspace, argv, exitCode: 2 })

				expect(answer.output.startsWith('standard find:')).toBe(true)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})
