/** `runGate`: an option no usage line of `gate` names is refused before any step. */
import { createSharedScratchRepository } from '../../test/scratch-repository.ts'
import { linesOf } from '../lib/print/print.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

const CASES: Array<{ title: string; argv: string[]; first: string }> = [
	{
		title: 'gate --dry-run → exit 2, the unknown option first',
		argv: ['--dry-run'],
		first: 'gate: unknown option --dry-run',
	},
	{
		title: 'gate --full --rehearse → exit 2, the unknown option first',
		argv: ['--full', '--rehearse'],
		first: 'gate: unknown option --rehearse',
	},
	{
		title: 'gate --base without its value → exit 2, it needs a value',
		argv: ['--base'],
		first: 'gate: --base needs a value',
	},
]

/** A repository without package.json: the gate refuses it at once, so a run that reads no option ends there. */
const scratchRepository = createSharedScratchRepository()

describe('runGate: unknown options', () => {
	for (const testCase of CASES)
		it(testCase.title, async () => {
			const result = await runGate({
				cwd: scratchRepository(),
				argv: testCase.argv,
			})

			expect({ exitCode: result.exitCode, first: linesOf(result.output)[0] }).toEqual({
				exitCode: 2,
				first: testCase.first,
			})
		})
})
