import { join } from 'node:path'

import { createAskCommandWorkspace } from '../../test/ask-command-workspace.ts'
import { GADGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import {
	ABOUT_OF_TWO_DIALECTES,
	ABOUT_UNDECLARED_TAG,
} from '../../test/standard-angles-fix-1.constants.ts'
import { SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	sampleStandardText,
	sampleValueSentence,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it } from 'vitest'

import type { AskCommandWorkspace } from '../../test/ask-command-workspace.types.ts'
import type { StandardEvalJson } from '../../test/standard-workspace.types.ts'

/** A gold item found by plain eval by its own words, whose `about` the ladder cannot take. */
function itemAbout(params: { about: string }): object {
	return {
		question: SAMPLE_WORD,
		about: params.about,
		expected: [{ file: 'alpha/one', quote: sampleValueSentence(SAMPLE_WORD).toLowerCase() }],
	}
}

type RefusedAboutRow = {
	about: string
	/** A second dialecte installed beside the first (a tag both hold is ambiguous without `--package`). */
	secondDialecte: boolean
}

/** `eval <gold> [--angles] --json` in a workspace of one folder of documents and the dialectes of the row. */
async function evaluatedBoth(params: { row: RefusedAboutRow }): Promise<{
	plain: StandardEvalJson
	angled: StandardEvalJson
}> {
	const workspace: AskCommandWorkspace = createAskCommandWorkspace({
		standards: { alpha: { 'one.md': sampleStandardText({ word: SAMPLE_WORD }) } },
	})
	if (params.row.secondDialecte)
		installTestDialecte({ cwd: workspace.cwd, packageName: GADGET_PACKAGE })
	const gold = join(workspace.base, 'refused.jsonl')
	writeTextFile({ path: gold, text: `${JSON.stringify(itemAbout({ about: params.row.about }))}\n` })
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
	return {
		plain: JSON.parse(plain.output) as StandardEvalJson,
		angled: JSON.parse(angled.output) as StandardEvalJson,
	}
}

describe('standard eval --angles: an item the ladder refuses scores find own list and never goes below find', () => {
	const rows: Record<string, RefusedAboutRow> = {
		'an item whose about names a tag the setup does not declare': {
			about: ABOUT_UNDECLARED_TAG,
			secondDialecte: false,
		},
		'an item whose about names a tag two dialectes hold, no --package, the folder none of them': {
			about: ABOUT_OF_TWO_DIALECTES,
			secondDialecte: true,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(
			`${name} -> found by --angles as by plain eval (recall@5 and @10 at 1, no miss)`,
			async () => {
				const { plain, angled } = await evaluatedBoth({ row })

				expect({
					plain: { atFive: plain.recallAt5, atTen: plain.recallAt10 },
					angled: { atFive: angled.recallAt5, atTen: angled.recallAt10, misses: angled.misses },
				}).toEqual({
					plain: { atFive: 1, atTen: 1 },
					angled: { atFive: 1, atTen: 1, misses: [] },
				})
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})
