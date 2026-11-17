/** `dialecte handover`: an option no usage line of the verb names is refused before the verb runs. */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { temporaryFolder } from '../../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

type OptionCase = {
	title: string
	argv: string[]
	status: number
	/** The first line the command prints on that stream. */
	stream: 'stdout' | 'stderr'
	first: string
}

const CASES: OptionCase[] = [
	{
		title:
			'handover run --dry-run → exit 2, the unknown option first, before the run reads anything',
		argv: ['handover', 'run', '--dry-run'],
		status: 2,
		stream: 'stderr',
		first: 'handover: unknown option --dry-run',
	},
	{
		title: 'handover show --bogus → exit 2, the unknown option first',
		argv: ['handover', 'show', '--bogus'],
		status: 2,
		stream: 'stderr',
		first: 'handover: unknown option --bogus',
	},
	{
		title: 'handover run --probe → exit 0, the probe answers',
		argv: ['handover', 'run', '--probe'],
		status: 0,
		stream: 'stdout',
		first: 'handover run',
	},
]

describe('dialecte handover: unknown options', { timeout: 30_000 }, () => {
	for (const testCase of CASES)
		it(testCase.title, () => {
			const run = spawnSync(process.execPath, [CLI_SOURCE, ...testCase.argv], {
				cwd: temporaryFolder('dialecte-handover-options-'),
				encoding: 'utf8',
			})

			expect({ status: run.status, first: run[testCase.stream].split('\n')[0] }).toEqual({
				status: testCase.status,
				first: testCase.first,
			})
		})
})
