/** Review round 2 of the `facts` command: the dialectes load lazily (R2-3) and a long forget reason says it was cut (R2-4). */
import { join } from 'node:path'

import { factDraft, readHistoryFile } from '../../test/fact-fixtures.ts'
import { REASON_LIMIT } from '../../test/facts-workspace.constants.ts'
import { createFactsWorkspace, recordInto } from '../../test/facts-workspace.ts'
import { answeredWith } from '../../test/standard-workspace.ts'
import { runFacts } from './facts.ts'

import { describe, expect, it } from 'vitest'

import type { LoadedDialectes } from '../lib/schema/schema.types.ts'

const NO_DIALECTES: LoadedDialectes = { dialectes: [], skipped: [] }

const WIDGET_SCHEMA_SOURCE = {
	kind: 'schema',
	package: '@acme/widget',
	version: '1.0.0',
	definitionHash: 'sha256:aa',
}

describe('facts: the installed dialectes are loaded only when a fact read has a schema source (R2-3)', () => {
	/** The number of loader calls of one `list` over a ledger holding the draft. */
	async function loadsOfList(params: { draft: ReturnType<typeof factDraft> }): Promise<number> {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: params.draft })
		let calls = 0

		await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: join(workspace.base, 'project'),
				environment: workspace.environment,
				loadDialectes: async () => {
					calls += 1
					return NO_DIALECTES
				},
			}),
			exitCode: 0,
		})
		return calls
	}

	it('list over a ledger with no schema source, then over one with a schema source → the loader is called 0 times, then once', async () => {
		const withoutSchema = await loadsOfList({ draft: factDraft() })
		const withSchema = await loadsOfList({
			draft: factDraft({ source: 'schema', sources: [WIDGET_SCHEMA_SOURCE] }),
		})

		expect([withoutSchema, withSchema]).toEqual([0, 1])
	})
})

describe('facts forget: a reason over 200 code points is cut by the fitted line, which says cut: true (R2-4)', () => {
	it('a reason of 300 characters → the forgotten line holds 200 of them and cut: true', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })

		await answeredWith({
			run: runFacts({
				argv: ['forget', 'F-0001', '--reason', 'x'.repeat(300)],
				cwd: workspace.cwd,
				environment: workspace.environment,
				check: () => ({ state: 'valid' }),
			}),
			exitCode: 0,
		})

		const line = readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).at(-1)
		expect({ event: line?.event, reason: line?.reason, cut: line?.cut }).toEqual({
			event: 'forgotten',
			reason: 'x'.repeat(REASON_LIMIT),
			cut: true,
		})
	})
})
