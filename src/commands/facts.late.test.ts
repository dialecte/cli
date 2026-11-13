/** Late fixes after the independent review of the `facts` command: a stale fact's stored reason (R4-1) and a damaged standard root (R4-7). */
import { join } from 'node:path'

import { wholeFactOf } from '../../test/fact-check-fixtures.ts'
import { factDraft } from '../../test/fact-fixtures.ts'
import { createFactsWorkspace, outputLinesOf, recordInto } from '../../test/facts-workspace.ts'
import {
	answeredWith,
	createStandardWorkspace,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { factCheckOf } from '../lib/knowledge/facts/command-check.ts'
import { runFacts } from './facts.ts'

import { describe, expect, it } from 'vitest'

import type { CheckOutcome } from '../lib/knowledge/facts/facts.types.ts'

const STALE_REASON =
	'the files of standard example-0000 changed since the fact was recorded: ask the question again'

function staleWithReason(): CheckOutcome {
	return { state: 'stale', reason: STALE_REASON }
}

describe('facts: a stale fact says why on every later read (R4-1)', () => {
	it('list, then list again with no check → the second line holds the reason', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		const { cwd, environment } = workspace
		await answeredWith({
			run: runFacts({ argv: ['list'], cwd, environment, check: staleWithReason }),
			exitCode: 0,
		})

		const { output } = await answeredWith({
			run: runFacts({ argv: ['list'], cwd, environment, check: () => ({ state: 'valid' }) }),
			exitCode: 0,
		})

		const line = outputLinesOf(output).find((candidate) => candidate.startsWith('F-0001')) ?? ''
		expect([line.includes('stale'), line.includes(STALE_REASON)]).toEqual([true, true])
	})

	it('list, then show with no check → show prints the reason', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		const { cwd, environment } = workspace
		await answeredWith({
			run: runFacts({ argv: ['list'], cwd, environment, check: staleWithReason }),
			exitCode: 0,
		})

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['show', 'F-0001'],
				cwd,
				environment,
				check: () => ({ state: 'valid' }),
			}),
			exitCode: 0,
		})

		expect(output).toContain(STALE_REASON)
	})

	it('list, then show --json → the reason is a member of the answer', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		const { cwd, environment } = workspace
		await answeredWith({
			run: runFacts({ argv: ['list'], cwd, environment, check: staleWithReason }),
			exitCode: 0,
		})

		const { output } = await answeredWith({
			run: runFacts({ argv: ['show', 'F-0001', '--json'], cwd, environment }),
			exitCode: 0,
		})

		expect(JSON.parse(output)).toMatchObject({ state: 'stale', reason: STALE_REASON })
	})
})

describe('factCheckOf: a damaged standard root names K1 own refusal (R4-7)', () => {
	it('DIALECTE_STANDARD names a root holding .md files directly → the reason is the root refusal, not the generic fix', async () => {
		const workspace = createStandardWorkspace()
		writeTextFile({ path: join(workspace.root, 'stray.md'), text: 'A stray file.\n' })
		const check = await factCheckOf({
			environment: workspace.environment,
			cwd: workspace.cwd,
			loadDialectes: null,
		})
		const fact = wholeFactOf({
			draft: factDraft({
				sources: [{ kind: 'standard', standard: 'example-0000', files: 'sha256:aa' }],
			}),
		})

		const outcome = check({ fact })

		expect(outcome).toMatchObject({
			state: 'unverifiable',
			reason: expect.stringContaining(`the root ${workspace.root} holds .md files directly`),
		})
		expect(outcome.reason).not.toContain('set DIALECTE_STANDARD to the root folder holding')
	})
})
