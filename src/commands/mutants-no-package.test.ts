import { SMALL_CASE_TIMEOUT } from '../../test/mutation-package.constants.ts'
import { parsedOutput } from '../../test/mutation-package.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { runMutants } from './mutants.ts'

import { describe, expect, it } from 'vitest'

/** `dialecte mutants <argv>` in a folder with no package.json at or above it; Stryker is never called. */
async function outsideAnyPackage(argv: string[]) {
	const { exitCode, output } = await runMutants({
		cwd: temporaryFolder('dialecte-no-package-'),
		argv,
		dependencies: { runStryker: neverCalled },
	})
	return { exitCode, json: parsedOutput(output) }
}

async function neverCalled(): Promise<number> {
	throw new Error('Stryker is never called outside a package')
}

describe('mutants --json outside any package', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it.each(['status', 'schedule', 'abandon', 'migrate', 'judge', 'record', 'drop'])(
		'%s --json → one JSON object { verb, ok: false, reason naming package.json }, exit 1',
		async (verb) => {
			await expect(outsideAnyPackage([verb, '--json'])).resolves.toEqual({
				exitCode: 1,
				json: { verb, ok: false, reason: expect.stringContaining('no package.json') },
			})
		},
	)
})
