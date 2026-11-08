import { join } from 'node:path'

import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import { SAMPLE_WORD, STANDARD_VERBS } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	entriesOf,
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

import type { StandardEvalJson, StandardWorkspace } from '../../test/standard-workspace.types.ts'

const SAMPLE = sampleStandardText({ word: SAMPLE_WORD })
const FOUND_QUOTE = sampleValueSentence(SAMPLE_WORD).toLowerCase()
const ABSENT_QUOTE = 'This sentence is nowhere in the file.'

const FOUND_ITEM = {
	question: SAMPLE_WORD,
	expected: [{ file: 'alpha/one', quote: FOUND_QUOTE }],
}
const MISSED_ITEM = {
	question: `${SAMPLE_WORD} sample`,
	expected: [{ file: 'alpha/one', quote: ABSENT_QUOTE }],
}
/** A file whose first clause names the test dialecte's AA_1 element. */
const TAG_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: ['The AA_1 element holds the values.'] },
	],
})
const TAG_QUOTE = 'the aa_1 element holds the values.'
/** A question none of whose words the tag file holds: only an `about` can make find answer. */
const TAG_ITEM = {
	question: 'nothingmatchesthis',
	expected: [{ file: 'alpha/tag', quote: TAG_QUOTE }],
}

/** The tag file indexed with the test dialecte installed, and `eval --json` run over a gold file of one item. */
async function evaluatedWithTag(params: { item: object }) {
	const workspace = createStandardWorkspace({ standards: { alpha: { 'tag.md': TAG_FILE } } })
	installTestDialecte({ cwd: workspace.cwd })
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({ path: gold, text: jsonLines([params.item]) })
	return evaluatedIn({ workspace, gold, exitCode: 0, extra: ['--json'] })
}

/** What `eval --json` carries of the vocabulary in a folder with no dialecte installed. */
const NO_VOCABULARY = { packages: [] }

const NOT_IN_TEXT_ITEM = { question: 'something the files never say', expected: [] }

function workspaceWithGold(params: { gold: string }): {
	workspace: StandardWorkspace
	gold: string
} {
	const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({ path: gold, text: params.gold })
	return { workspace, gold }
}

function jsonLines(items: object[]): string {
	return `${items.map((item) => JSON.stringify(item)).join('\n\n')}\n`
}

/** `standard eval <gold file>` in a workspace, the exit code pinned. */
async function evaluatedIn(params: {
	workspace: StandardWorkspace
	gold: string
	exitCode: 0 | 1 | 2
	extra?: string[]
}) {
	return answeredWith({
		run: runStandard({
			argv: ['eval', params.gold, ...(params.extra ?? [])],
			cwd: params.workspace.cwd,
			environment: params.workspace.environment,
		}),
		exitCode: params.exitCode,
	})
}

async function evaluated(params: { gold: string; exitCode: 0 | 1 | 2; extra?: string[] }) {
	const { workspace, gold } = workspaceWithGold({ gold: params.gold })
	return evaluatedIn({ workspace, gold, exitCode: params.exitCode, extra: params.extra })
}

describe('standard eval: recall over a gold file', () => {
	it(
		'one quote found at rank 1, one not in the text, one item with no expected quote → --json counts, recall 0.5, the miss with its reason',
		async () => {
			const answer = await evaluated({
				gold: jsonLines([FOUND_ITEM, MISSED_ITEM, NOT_IN_TEXT_ITEM]),
				exitCode: 0,
				extra: ['--json'],
			})

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: NO_VOCABULARY,
				items: 2,
				notInText: 1,
				recallAt5: 0.5,
				recallAt10: 0.5,
				misses: [
					{
						question: MISSED_ITEM.question,
						file: 'alpha/one',
						quote: ABSENT_QUOTE,
						why: 'not in the text',
					},
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a gold file id written with capitals → found like the lowercase id',
		async () => {
			const answer = await evaluated({
				gold: jsonLines([{ ...FOUND_ITEM, expected: [{ file: 'Alpha/One', quote: FOUND_QUOTE }] }]),
				exitCode: 0,
				extra: ['--json'],
			})

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: NO_VOCABULARY,
				items: 1,
				notInText: 0,
				recallAt5: 1,
				recallAt10: 1,
				misses: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an item with two expected quotes, the first not in the text and the second found → found, recall 1, no miss',
		async () => {
			const item = {
				question: SAMPLE_WORD,
				expected: [
					{ file: 'alpha/one', quote: ABSENT_QUOTE },
					{ file: 'alpha/one', quote: FOUND_QUOTE },
				],
			}

			const answer = await evaluated({ gold: jsonLines([item]), exitCode: 0, extra: ['--json'] })

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: NO_VOCABULARY,
				items: 1,
				notInText: 0,
				recallAt5: 1,
				recallAt10: 1,
				misses: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a gold file of the shape { question, kind, answer, expected, status } with an unknown field and no about → evaluated, an item with no expected quote counted apart',
		async () => {
			const fact = {
				question: SAMPLE_WORD,
				kind: 'fact',
				answer: 'a short answer',
				expected: [{ file: 'alpha/one', quote: FOUND_QUOTE }],
				status: 'checked',
				source: 'an unknown field',
			}
			const absent = {
				question: 'something the files never say',
				kind: 'not-in-text',
				answer: 'none',
				expected: [],
				status: 'checked',
			}

			const answer = await evaluated({
				gold: jsonLines([fact, absent]),
				exitCode: 0,
				extra: ['--json'],
			})

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: NO_VOCABULARY,
				items: 1,
				notInText: 1,
				recallAt5: 1,
				recallAt10: 1,
				misses: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'every quote found → recall 1 at 5 and at 10, no miss',
		async () => {
			const answer = await evaluated({
				gold: jsonLines([FOUND_ITEM]),
				exitCode: 0,
				extra: ['--json'],
			})

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: NO_VOCABULARY,
				items: 1,
				notInText: 0,
				recallAt5: 1,
				recallAt10: 1,
				misses: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a quote expected in a file the standards do not hold → a miss with the reason unknown file',
		async () => {
			const item = {
				question: SAMPLE_WORD,
				expected: [{ file: 'alpha/missing', quote: FOUND_QUOTE }],
			}

			const answer = await evaluated({ gold: jsonLines([item]), exitCode: 0, extra: ['--json'] })

			expect((JSON.parse(answer.output) as StandardEvalJson).misses).toEqual([
				{
					question: SAMPLE_WORD,
					file: 'alpha/missing',
					quote: FOUND_QUOTE,
					why: 'unknown file alpha/missing',
				},
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the text answer → the recall at 5 and at 10, the number of items, and each miss with its question and reason',
		async () => {
			const answer = await evaluated({
				gold: jsonLines([FOUND_ITEM, MISSED_ITEM]),
				exitCode: 0,
			})

			expect(trimmedLinesOf(answer.output)).toEqual([
				'vocabulary none (no dialecte installed)',
				'recall@5 0.50  recall@10 0.50  items 2  not in text 0',
				`miss  alpha/one  not in the text  ${MISSED_ITEM.question}`,
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no index built yet → eval builds it first: one index folder for the standard',
		async () => {
			const { workspace, gold } = workspaceWithGold({ gold: jsonLines([FOUND_ITEM]) })

			await evaluatedIn({ workspace, gold, exitCode: 0 })

			expect(entriesOf(standardCacheFolder({ workspace, standardId: 'alpha' }))).toHaveLength(1)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a quote found only at rank 12 of the wider find → a miss "ranked 12", recall 0',
		async () => {
			const files = Object.fromEntries(
				Array.from({ length: 12 }, (_unused, index) => [
					`f${String(index + 1).padStart(2, '0')}.md`,
					SAMPLE,
				]),
			)
			const workspace = createStandardWorkspace({ standards: { alpha: files } })
			const gold = join(workspace.base, 'gold.jsonl')
			const item = { question: SAMPLE_WORD, expected: [{ file: 'alpha/f12', quote: FOUND_QUOTE }] }
			writeTextFile({ path: gold, text: jsonLines([item]) })

			const answer = await evaluatedIn({ workspace, gold, exitCode: 0, extra: ['--json'] })

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: NO_VOCABULARY,
				items: 1,
				notInText: 0,
				recallAt5: 0,
				recallAt10: 0,
				misses: [
					{ question: SAMPLE_WORD, file: 'alpha/f12', quote: FOUND_QUOTE, why: 'ranked 12' },
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a quote that is in the file but in no slice find answers → a miss "not found by find"',
		async () => {
			const item = {
				question: SAMPLE_WORD,
				expected: [{ file: 'alpha/one', quote: 'the base case is described here.' }],
			}

			const answer = await evaluated({
				gold: jsonLines([item]),
				exitCode: 0,
				extra: ['--json'],
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).misses).toEqual([
				{
					question: SAMPLE_WORD,
					file: 'alpha/one',
					quote: 'the base case is described here.',
					why: 'not found by find',
				},
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--standard → find runs over that standard only: a file of the other one is an unknown file, the standard itself found',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'one.md': SAMPLE }, beta: { 'one.md': SAMPLE } },
			})
			const gold = join(workspace.base, 'gold.jsonl')
			const item = { question: SAMPLE_WORD, expected: [{ file: 'beta/one', quote: FOUND_QUOTE }] }
			writeTextFile({ path: gold, text: jsonLines([item]) })

			const onAlpha = await evaluatedIn({
				workspace,
				gold,
				exitCode: 0,
				extra: ['--standard', 'alpha', '--json'],
			})
			const onBeta = await evaluatedIn({
				workspace,
				gold,
				exitCode: 0,
				extra: ['--standard', 'beta', '--json'],
			})

			expect({
				alpha: (JSON.parse(onAlpha.output) as StandardEvalJson).misses.map((miss) => miss.why),
				beta: (JSON.parse(onBeta.output) as StandardEvalJson).recallAt5,
			}).toEqual({ alpha: ['unknown file beta/one'], beta: 1 })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an item whose question no word of the file holds, with an about → find runs with that tag and finds the clause naming it',
		async () => {
			const item = { ...TAG_ITEM, about: 'AA_1' }

			const answer = await evaluatedWithTag({ item })

			expect(JSON.parse(answer.output) as StandardEvalJson).toEqual({
				vocabulary: { packages: ['@acme/widget@1.0.0'] },
				items: 1,
				notInText: 0,
				recallAt5: 1,
				recallAt10: 1,
				misses: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same item without an about → nothing found: a miss "not found by find"',
		async () => {
			const answer = await evaluatedWithTag({ item: TAG_ITEM })

			expect((JSON.parse(answer.output) as StandardEvalJson).misses).toEqual([
				{
					question: TAG_ITEM.question,
					file: 'alpha/tag',
					quote: TAG_QUOTE,
					why: 'not found by find',
				},
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard eval: nothing to evaluate → exit 1', () => {
	const testCases: Record<string, string> = {
		'only items with no expected quote': jsonLines([NOT_IN_TEXT_ITEM, NOT_IN_TEXT_ITEM]),
		'an empty gold file': '',
		'a gold file of blank lines': '\n\n\n',
	}

	for (const [title, gold] of Object.entries(testCases))
		it(
			`${title} → exit 1`,
			async () => {
				const answer = await evaluated({ gold, exitCode: 1 })

				expect(answer.exitCode).toBe(1)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})

describe('standard eval: a gold file that cannot be read → exit 2, the message starting with "standard eval:"', () => {
	it(
		'a malformed line → the message names its line number',
		async () => {
			const gold = `${JSON.stringify(FOUND_ITEM)}\n\n{ not json\n${JSON.stringify(FOUND_ITEM)}\n`

			const answer = await evaluated({ gold, exitCode: 2 })

			expect(answer.output.startsWith('standard eval:')).toBe(true)
			expect(answer.output).toContain('line 3')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a line with no expected list → the message names its line number',
		async () => {
			const gold = `${JSON.stringify(FOUND_ITEM)}\n${JSON.stringify({ question: SAMPLE_WORD })}\n`

			const answer = await evaluated({ gold, exitCode: 2 })

			expect(answer.output.startsWith('standard eval:')).toBe(true)
			expect(answer.output).toContain('line 2')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a gold file that does not exist → exit 2',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })

			const answer = await answeredWith({
				run: runStandard({
					argv: ['eval', join(workspace.base, 'missing.jsonl')],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 2,
			})

			expect(answer.output.startsWith('standard eval:')).toBe(true)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no gold file given → exit 2',
		async () => {
			const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })

			const answer = await answeredWith({
				run: runStandard({
					argv: ['eval'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 2,
			})

			expect(answer.output.startsWith('standard eval:')).toBe(true)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard: the verb', () => {
	const testCases: Record<string, string[]> = {
		'an unknown verb': ['frobnicate'],
		'no verb': [],
	}

	for (const [title, argv] of Object.entries(testCases))
		it(
			`${title} → exit 2 naming the usage`,
			async () => {
				const workspace = createStandardWorkspace({ standards: { alpha: { 'one.md': SAMPLE } } })

				const answer = await answeredWith({
					run: runStandard({ argv, cwd: workspace.cwd, environment: workspace.environment }),
					exitCode: 2,
				})

				expect(answer.output.startsWith('standard')).toBe(true)
				for (const verb of STANDARD_VERBS) expect(answer.output).toContain(verb)
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})
