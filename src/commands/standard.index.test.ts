import { SHORT_HASH_LENGTH, SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	lineCountOf,
	manifestHashOf,
	sampleStandardText,
	trimmedLinesOf,
} from '../../test/standard-workspace.ts'
import { buildSyntheticStandard, evenGaps } from '../../test/synthetic-standard.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardIndexJson } from '../../test/standard-workspace.types.ts'
import type { SyntheticBlock } from '../../test/synthetic-standard.types.ts'

const SAMPLE = sampleStandardText({ word: SAMPLE_WORD })
const OTHER = sampleStandardText({ word: 'quillon' })

/** A file with a terms clause holding one definition, and a clause holding a captioned table. */
const RICH = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Terms and definitions' },
		{ kind: 'definition', number: '1.1', term: 'widget', layout: 'inline' },
		{ kind: 'raw', lines: ['A widget is a thing.'] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Listings' },
		{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
		{ kind: 'table', columns: ['Name', 'Value'], rows: [['a', '1']] },
	],
})

const LONG_NOTICE =
	'This text is shared under invented terms of use, and every copy keeps this notice.'
const REPEATED_GAP = 25
const REPEATED_OCCURRENCES = 20
const NOTICE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']

function noticeOf(letter: string): string {
	return `Notice ${letter} of the shared terms applies to every copy of this file.`
}

function repeatedBlock(line: string): SyntheticBlock {
	return {
		kind: 'repeated',
		line,
		gaps: evenGaps({ occurrences: REPEATED_OCCURRENCES, gap: REPEATED_GAP }),
	}
}

/** The index of the first line starting with the prefix, -1 when none does. */
function positionOf(params: { lines: string[]; prefix: string }): number {
	return params.lines.findIndex((line) => line.startsWith(params.prefix))
}

/** How many trimmed lines of the output match the pattern. */
function matching(params: { output: string; pattern: RegExp }): number {
	return trimmedLinesOf(params.output).filter((line) => params.pattern.test(line)).length
}

function fileLinePattern(params: {
	id: string
	lines: number
	headings: string
	tables: number
	definitions: number
}): RegExp {
	return new RegExp(
		`^${params.id} {2}${params.lines} lines {2}good {2}noise \\S+ {2}headings ${params.headings} {2}tables ${params.tables} {2}definitions ${params.definitions}$`,
		'u',
	)
}

function standardLinePattern(params: {
	id: string
	files: number
	state: string
	manifest: string
}): RegExp {
	return new RegExp(
		`^${params.id} {2}${params.files} files {2}${params.state} in .+ {2}manifest ${params.manifest.slice(0, SHORT_HASH_LENGTH)}$`,
		'u',
	)
}

async function indexOutput(params: {
	standards: Record<string, Record<string, string>>
	argv?: string[]
}) {
	const workspace = createStandardWorkspace({ standards: params.standards })
	return answeredWith({
		run: runStandard({
			argv: ['index', ...(params.argv ?? [])],
			cwd: workspace.cwd,
			environment: workspace.environment,
		}),
		exitCode: 0,
	})
}

describe('standard index: the text answer', () => {
	it(
		'two standards → per standard its files, built and manifest prefix; per file its lines, verdict, noise, headings, tables and definitions',
		async () => {
			const answer = await indexOutput({
				standards: { alpha: { 'one.md': SAMPLE, 'two.md': RICH }, beta: { 'one.md': OTHER } },
			})

			const alphaHash = manifestHashOf({ files: { 'alpha/one': SAMPLE, 'alpha/two': RICH } })
			const betaHash = manifestHashOf({ files: { 'beta/one': OTHER } })
			expect(
				[
					standardLinePattern({ id: 'alpha', files: 2, state: 'built', manifest: alphaHash }),
					standardLinePattern({ id: 'beta', files: 1, state: 'built', manifest: betaHash }),
					fileLinePattern({
						id: 'alpha/one',
						lines: lineCountOf(SAMPLE),
						headings: '2/2',
						tables: 0,
						definitions: 0,
					}),
					fileLinePattern({
						id: 'alpha/two',
						lines: lineCountOf(RICH),
						headings: '2/2',
						tables: 1,
						definitions: 1,
					}),
					fileLinePattern({
						id: 'beta/one',
						lines: lineCountOf(OTHER),
						headings: '2/2',
						tables: 0,
						definitions: 0,
					}),
				].map((pattern) => matching({ output: answer.output, pattern })),
			).toEqual([1, 1, 1, 1, 1])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a second run → the standard line says reused',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })
			await answeredWith({
				run: runStandard({
					argv: ['index'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect(
				matching({
					output: answer.output,
					pattern: standardLinePattern({
						id: 'alpha',
						files: 1,
						state: 'reused',
						manifest: manifestHashOf({ files: { 'alpha/one': SAMPLE } }),
					}),
				}),
			).toBe(1)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a line seen 20 times with a 25-line gap → listed under its file: count, median gap, length, text cut at 60 characters',
		async () => {
			const text = buildSyntheticStandard({
				blocks: [{ kind: 'heading', number: '1', title: 'Overview' }, repeatedBlock(LONG_NOTICE)],
			})

			const answer = await indexOutput({ standards: { alpha: { 'one.md': text } } })

			expect(trimmedLinesOf(answer.output)).toContain(
				`20x  gap ${REPEATED_GAP}  ${LONG_NOTICE.length} chars  ${LONG_NOTICE.slice(0, 60)}`,
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'twelve such lines in one file → the first ten listed (same count, by text), the rest not',
		async () => {
			const text = buildSyntheticStandard({
				blocks: [
					{ kind: 'heading', number: '1', title: 'Overview' },
					...NOTICE_LETTERS.map((letter) => repeatedBlock(noticeOf(letter))),
				],
			})

			const answer = await indexOutput({ standards: { alpha: { 'one.md': text } } })

			expect(
				trimmedLinesOf(answer.output)
					.filter((line) => line.startsWith('20x  gap '))
					.map((line) => line.slice(line.indexOf('Notice '))),
			).toEqual(NOTICE_LETTERS.slice(0, 10).map((letter) => noticeOf(letter).slice(0, 60)))
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index --json', () => {
	it(
		'two standards → { standards } in id order, each with its id, sha256-prefixed manifest hash, state and one entry per file',
		async () => {
			const answer = await indexOutput({
				standards: { beta: { 'one.md': OTHER }, alpha: { 'one.md': SAMPLE, 'two.md': RICH } },
				argv: ['--json'],
			})

			expect(
				(JSON.parse(answer.output) as StandardIndexJson).standards.map((standard) => ({
					id: standard.id,
					manifest: standard.manifest,
					state: standard.state,
					files: standard.files.length,
				})),
			).toEqual([
				{
					id: 'alpha',
					manifest: `sha256:${manifestHashOf({ files: { 'alpha/one': SAMPLE, 'alpha/two': RICH } })}`,
					state: 'built',
					files: 2,
				},
				{
					id: 'beta',
					manifest: `sha256:${manifestHashOf({ files: { 'beta/one': OTHER } })}`,
					state: 'built',
					files: 1,
				},
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'each file → its id, lines, verdict, noise ratio, headings kept and candidates, tables, definitions and repeated lines',
		async () => {
			const answer = await indexOutput({
				standards: { alpha: { 'one.md': SAMPLE, 'two.md': RICH } },
				argv: ['--json'],
			})

			expect((JSON.parse(answer.output) as StandardIndexJson).standards[0].files).toEqual([
				{
					id: 'alpha/one',
					lines: lineCountOf(SAMPLE),
					verdict: 'good',
					noiseRatio: 0,
					headings: { kept: 2, candidates: 2 },
					tables: 0,
					definitions: 0,
					repeatedLines: [],
				},
				{
					id: 'alpha/two',
					lines: lineCountOf(RICH),
					verdict: 'good',
					noiseRatio: 0,
					headings: { kept: 2, candidates: 2 },
					tables: 1,
					definitions: 1,
					repeatedLines: [],
				},
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a folder with no .md file → its entry skipped: true with no file, the others skipped: false',
		async () => {
			const answer = await indexOutput({
				standards: { alpha: { 'one.md': SAMPLE }, gamma: { 'notes.txt': SAMPLE } },
				argv: ['--json'],
			})

			expect(
				(JSON.parse(answer.output) as StandardIndexJson).standards.map((standard) => ({
					id: standard.id,
					skipped: standard.skipped,
					files: standard.files,
				})),
			).toEqual([
				{ id: 'alpha', skipped: false, files: expect.any(Array) },
				{ id: 'gamma', skipped: true, files: [] },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: the order of the text answer', () => {
	it(
		'a standard line comes before the lines of its files',
		async () => {
			const answer = await indexOutput({
				standards: { alpha: { 'one.md': SAMPLE, 'two.md': RICH }, beta: { 'one.md': OTHER } },
			})

			const lines = trimmedLinesOf(answer.output)
			expect([
				positionOf({ lines, prefix: 'alpha  ' }) < positionOf({ lines, prefix: 'alpha/one  ' }),
				positionOf({ lines, prefix: 'alpha  ' }) < positionOf({ lines, prefix: 'alpha/two  ' }),
				positionOf({ lines, prefix: 'beta  ' }) < positionOf({ lines, prefix: 'beta/one  ' }),
			]).toEqual([true, true, true])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
