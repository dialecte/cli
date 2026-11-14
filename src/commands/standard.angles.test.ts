import { join } from 'node:path'

import { SLICE_SENTENCE, TAG_FILE } from '../../test/ask-command-workspace.constants.ts'
import { createAskCommandWorkspace, namesIn } from '../../test/ask-command-workspace.ts'
import {
	CROWDED_FILES,
	CROWDED_ITEM,
	FAMILY_FILE_TEXT,
	FIFTH_FILE,
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

/** Found by its own words: the first gold item. */
const DIRECT_ITEM = {
	question: SAMPLE_WORD,
	expected: [{ file: 'alpha/one', quote: sampleValueSentence(SAMPLE_WORD).toLowerCase() }],
}

/**
 * Found only through an angle family: the question names `AAA_1` and none of the file's words; the parents of
 * `AAA_1` hold `AA_1`, which the second file names.
 */
const ANGLE_ITEM = {
	question: 'Where may AAA_1 appear?',
	expected: [{ file: 'alpha/tag', quote: SLICE_SENTENCE.toLowerCase() }],
}

/** A workspace whose root holds the sample file and the tag file in one folder, and a gold file of both items. */
function goldWorkspace(): { workspace: AskCommandWorkspace; gold: string } {
	const workspace = createAskCommandWorkspace({
		standards: {
			alpha: { 'one.md': sampleStandardText({ word: SAMPLE_WORD }), 'tag.md': TAG_FILE },
		},
	})
	const gold = join(workspace.base, 'gold.jsonl')
	writeTextFile({
		path: gold,
		text: `${[DIRECT_ITEM, ANGLE_ITEM].map((item) => JSON.stringify(item)).join('\n')}\n`,
	})
	return { workspace, gold }
}

describe('standard eval --angles: the gold run through the ask ladder', () => {
	it(
		'a file found only through an angle family -> --json counts both items found, recall 1, no miss',
		async () => {
			const { workspace, gold } = goldWorkspace()

			const answer = await answeredWith({
				run: runStandard({
					argv: ['eval', gold, '--angles', '--json'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect(JSON.parse(answer.output) as StandardEvalJson).toMatchObject({
				items: 2,
				notInText: 0,
				recallAt5: 1,
				recallAt10: 1,
				added: 1,
				misses: [],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a question find lists five slices for, the quote at the fifth -> --angles keeps recall@5 and @10 at plain eval or above',
		async () => {
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
			const gold = join(workspace.base, 'crowded.jsonl')
			writeTextFile({ path: gold, text: `${JSON.stringify(CROWDED_ITEM)}\n` })
			const found = await answeredWith({
				run: runStandard({
					argv: ['find', CROWDED_ITEM.question, '--json'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			const plain = await answeredWith({
				run: runStandard({
					argv: ['eval', gold, '--json'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			const angled = await answeredWith({
				run: runStandard({
					argv: ['eval', gold, '--angles', '--json'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			const plainJson = JSON.parse(plain.output) as StandardEvalJson
			const angledJson = JSON.parse(angled.output) as StandardEvalJson

			const foundJson = JSON.parse(found.output) as { slices: { file: string }[] }

			expect({
				fifthSliceOfFind: foundJson.slices[4]?.file,
				plainAtFive: plainJson.recallAt5,
				atFiveNotBelow: angledJson.recallAt5 >= plainJson.recallAt5,
				atTenNotBelow: angledJson.recallAt10 >= plainJson.recallAt10,
				added: angledJson.added,
			}).toEqual({
				fifthSliceOfFind: FIFTH_FILE,
				plainAtFive: 1,
				atFiveNotBelow: true,
				atTenNotBelow: true,
				added: 0,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the same run as text -> the recall line eval prints, no miss line',
		async () => {
			const { workspace, gold } = goldWorkspace()

			const answer = await answeredWith({
				run: runStandard({
					argv: ['eval', gold, '--angles'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect(
				trimmedLinesOf(answer.output).filter((line) => !line.startsWith('vocabulary')),
			).toEqual(['recall@5 1.00  recall@10 1.00  items 2  not in text 0', 'added +1'])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the run writes nothing under the state folder (asks, events) nor the data folder (facts)',
		async () => {
			const { workspace, gold } = goldWorkspace()

			await answeredWith({
				run: runStandard({
					argv: ['eval', gold, '--angles', '--json'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})

			expect({
				state: namesIn(workspace.state),
				data: namesIn(workspace.data),
				decoys: namesIn(workspace.base).filter((name) =>
					['decoy-state', 'decoy-data'].includes(name),
				),
				decoyContents: ['decoy-state', 'decoy-data'].flatMap((name) =>
					namesIn(join(workspace.base, name)),
				),
			}).toEqual({ state: [], data: [], decoys: [], decoyContents: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
