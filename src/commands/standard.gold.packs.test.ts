import { join } from 'node:path'

import { SLICE_SENTENCE, TAG_FILE } from '../../test/ask-command-workspace.constants.ts'
import { createAskCommandWorkspace, namesIn } from '../../test/ask-command-workspace.ts'
import {
	CROWDED_FILES,
	CROWDED_QUESTION,
	FAMILY_FILE_TEXT,
} from '../../test/standard-angles.constants.ts'
import { SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	sampleStandardText,
	sampleValueSentence,
	trimmedLinesOf,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { AskCommandWorkspace } from '../../test/ask-command-workspace.types.ts'
import type { StandardEvalJson } from '../../test/standard-workspace.types.ts'

/**
 * Held by the tag file, which the question's own tag finds first: reader A's first slice, and reader B's.
 */
const FIRST_ITEM = {
	question: CROWDED_QUESTION,
	expected: [{ file: 'alpha/tag', quote: SLICE_SENTENCE.toLowerCase() }],
}

/**
 * Held by the family file only: the parents of `AA_1` name it, so reader A, in the order of the ask's list, comes to
 * it seventh (after the five files that hold the sample word), while reader B, taking one slice per angle family in
 * turn, comes to it second.
 */
const FAMILY_ITEM = {
	question: CROWDED_QUESTION,
	expected: [
		{
			file: 'alpha/family',
			quote: 'the a element holds d and dd_1 with the attributes a, b and c.',
		},
	],
}

/** The same item again: it counts twice, so the recall of A (one of the two) differs from the union's (both). */
const FAMILY_AGAIN_ITEM = {
	question: CROWDED_QUESTION,
	expected: [
		{
			file: 'alpha/family',
			quote: 'the a element holds d and dd_1 with the attributes a, b and c.',
		},
	],
}

/**
 * Held by the file `one`: A's fourth slice, B's fifth. In the A and B slices together it is fifth only when the
 * slices both readers hold (the tag file, `five`, `four`) are kept once: kept twice it falls to seventh.
 */
const ONE_ITEM = {
	question: CROWDED_QUESTION,
	expected: [{ file: 'alpha/one', quote: sampleValueSentence(SAMPLE_WORD).toLowerCase() }],
}

/**
 * Held by the file `three`: A's fifth slice, B's sixth, sixth of the A and B slices together: A holds it within 5,
 * B and the union do not (so the union is neither A alone nor the best of A and B per item).
 */
const THREE_ITEM = {
	question: CROWDED_QUESTION,
	expected: [{ file: 'alpha/three', quote: sampleValueSentence(SAMPLE_WORD).toLowerCase() }],
}

const ITEMS = [FIRST_ITEM, FAMILY_ITEM, FAMILY_AGAIN_ITEM, ONE_ITEM, THREE_ITEM]

/**
 * What the recall of each pack is over the five items. At 5, A holds the tag file, `one` and `three` (0.6); the
 * union holds the tag file, the family file twice and `one` (0.8); kept-twice it would hold three (0.6), the best of
 * A and B per item all five. At 10 both hold all five.
 */
const PACKS = {
	readerA: { recallAt5: 0.6, recallAt10: 1 },
	union: { recallAt5: 0.8, recallAt10: 1 },
}

/** Seven files in one folder, a gold file of both items, and the state, data and cache folders of the test. */
function packsWorkspace(): { workspace: AskCommandWorkspace; gold: string } {
	const workspace = createAskCommandWorkspace({
		standards: {
			alpha: {
				...Object.fromEntries(
					CROWDED_FILES.map((name) => [name, sampleStandardText({ word: SAMPLE_WORD })]),
				),
				'tag.md': TAG_FILE,
				'family.md': FAMILY_FILE_TEXT,
			},
		},
	})
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({
		path: gold,
		text: `${ITEMS.map((item) => JSON.stringify(item)).join('\n')}\n`,
	})
	return { workspace, gold }
}

/** `standard eval <gold> <extra>` in the workspace, the exit code pinned. */
async function evaluatedWith(params: {
	workspace: AskCommandWorkspace
	gold: string
	extra: string[]
	exitCode: 0 | 2
}) {
	return answeredWith({
		run: runStandard({
			argv: ['eval', params.gold, ...params.extra],
			cwd: params.workspace.cwd,
			environment: params.workspace.environment,
		}),
		exitCode: params.exitCode,
	})
}

describe('standard eval --packs: the recall of the readers packs over the gold set', () => {
	it(
		'five items, A holding three of them at 5 and the A and B slices together four (one only when the shared slices count once) → --json packs: A 0.6 and 1, the union 0.8 and 1',
		async () => {
			const { workspace, gold } = packsWorkspace()

			const answer = await evaluatedWith({
				workspace,
				gold,
				extra: ['--packs', '--json'],
				exitCode: 0,
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).packs).toEqual(PACKS)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--effort high → the same packs: the A and B slices are the ones that are scored',
		async () => {
			const { workspace, gold } = packsWorkspace()

			const answer = await evaluatedWith({
				workspace,
				gold,
				extra: ['--packs', '--effort', 'high', '--json'],
				exitCode: 0,
			})

			expect((JSON.parse(answer.output) as StandardEvalJson).packs).toEqual(PACKS)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json → the keys of the plain run and packs, no reports',
		async () => {
			const { workspace, gold } = packsWorkspace()

			const answer = await evaluatedWith({
				workspace,
				gold,
				extra: ['--packs', '--json'],
				exitCode: 0,
			})

			expect(Object.keys(JSON.parse(answer.output) as StandardEvalJson).sort()).toEqual([
				'items',
				'misses',
				'notInText',
				'packs',
				'recallAt10',
				'recallAt5',
				'schema',
				'vocabulary',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an --effort that is not low, medium or high → exit 2 naming the value',
		async () => {
			const { workspace, gold } = packsWorkspace()

			const answer = await evaluatedWith({
				workspace,
				gold,
				extra: ['--packs', '--effort', 'extreme'],
				exitCode: 2,
			})

			expect(answer.output).toContain('extreme')
			expect(answer.output).toContain('low')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same run as text → one packs line with the recall of reader A and of the union',
		async () => {
			const { workspace, gold } = packsWorkspace()

			const answer = await evaluatedWith({ workspace, gold, extra: ['--packs'], exitCode: 0 })

			expect(trimmedLinesOf(answer.output).filter((line) => line.startsWith('packs'))).toEqual([
				'packs  reader A recall@5 0.60  recall@10 1.00  union recall@5 0.80  recall@10 1.00',
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the run writes nothing under the state folder (asks, events) nor the data folder (facts)',
		async () => {
			const { workspace, gold } = packsWorkspace()

			await evaluatedWith({ workspace, gold, extra: ['--packs', '--json'], exitCode: 0 })

			expect({
				state: namesIn(workspace.state),
				data: namesIn(workspace.data),
				decoys: namesIn(workspace.base).filter((name) =>
					['decoy-state', 'decoy-data'].includes(name),
				),
			}).toEqual({ state: [], data: [], decoys: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard eval --packs: outside a package → exit 2 naming the fix', () => {
	it(
		'the folder the command runs in holds no package.json → exit 2, asking for a package that has a dialecte installed',
		async () => {
			const { workspace, gold } = packsWorkspace()

			const answer = await evaluatedWith({
				workspace: { ...workspace, cwd: workspace.base },
				gold,
				extra: ['--packs'],
				exitCode: 2,
			})

			expect(answer.output.startsWith('standard eval:')).toBe(true)
			expect(answer.output).toContain('a package that has a dialecte installed')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
