import {
	parsedOutput,
	recordablePackage,
	recordsFileText,
	runMutantsIn,
	storeFileTexts,
} from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'

import { describe, expect, it } from 'vitest'

describe(
	'mutants: a value option given an option word of the verb → usage, exit 2',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			['judge --file --json', ['judge', '--file', '--json']],
			[
				'record --reason --json',
				['record', '--key', 'n1', '--family', 'wording', '--reason', '--json'],
			],
			[
				'record --family --removable',
				['record', '--key', 'n1', '--reason', 'why', '--family', '--removable'],
			],
		])('%s → exit 2, nothing recorded', async (_label, argv) => {
			const root = recordablePackage()
			const before = { records: recordsFileText(root), ...storeFileTexts(root) }

			await expect(runMutantsIn({ root, argv })).resolves.toMatchObject({ exitCode: 2 })
			expect({ records: recordsFileText(root), ...storeFileTexts(root) }).toEqual(before)
		})

		it('record --reason --json → one JSON usage refusal, no record of the reason "--json"', async () => {
			const root = recordablePackage()

			await expect(
				runMutantsIn({
					root,
					argv: ['record', '--key', 'n1', '--family', 'wording', '--reason', '--json'],
				}).then(({ exitCode, output }) => ({ exitCode, json: parsedOutput(output) })),
			).resolves.toMatchObject({
				exitCode: 2,
				json: { verb: 'record', ok: false, reason: expect.any(String) },
			})
			expect(recordsFileText(root)).toBeUndefined()
		})
	},
)
