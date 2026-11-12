/** Review round 1 of the `facts` command: the cwd (R1-2), the home (R1-6), the reason cut (R1-7) and the reasons printed (R1-8). */
import { join } from 'node:path'

import { factDraft, readHistoryFile } from '../../test/fact-fixtures.ts'
import { FACTS_NOW, REASON_LIMIT } from '../../test/facts-workspace.constants.ts'
import {
	createFactsWorkspace,
	leadingIdsOf,
	outputLinesOf,
	recordInto,
} from '../../test/facts-workspace.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { answeredWith, createStandardWorkspace } from '../../test/standard-workspace.ts'
import { recordFact } from '../lib/knowledge/facts/record-fact.ts'
import { runFacts } from './facts.ts'

import { describe, expect, it } from 'vitest'

import type { FactsWorkspace } from '../../test/facts-workspace.types.ts'
import type { FactCheck } from '../lib/knowledge/facts/facts.types.ts'

function VALID(): ReturnType<FactCheck> {
	return { state: 'valid' }
}

const WIDGET_SCHEMA_SOURCE = {
	kind: 'schema',
	package: '@acme/widget',
	version: '1.0.0',
	definitionHash: 'sha256:aa',
}

/** The line of a fact in a command's output. */
function lineOfFact(params: { output: string; id: string }): string | undefined {
	return outputLinesOf(params.output).find((line) => line.startsWith(params.id))
}

describe('facts: a stale or unverifiable fact says why and the fix on its line (R1-8)', () => {
	it('an unverifiable standard fact (no standard configured) → its line names DIALECTE_STANDARD, under list and show', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		const { cwd } = createStandardWorkspace()
		const { environment } = workspace

		const listed = await answeredWith({
			run: runFacts({ argv: ['list'], cwd, environment }),
			exitCode: 0,
		})
		const shown = await answeredWith({
			run: runFacts({ argv: ['show', 'F-0001'], cwd, environment }),
			exitCode: 0,
		})

		expect([lineOfFact({ output: listed.output, id: 'F-0001' }), shown.output]).toEqual([
			expect.stringContaining('DIALECTE_STANDARD'),
			expect.stringContaining('DIALECTE_STANDARD'),
		])
	})

	it('a stale standard fact → its line names the standard folder and that its files changed', async () => {
		const standards = createStandardWorkspace({
			standards: { 'example-0000': { 'one.md': 'The first file.\n' } },
		})
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: standards.cwd,
				environment: { ...workspace.environment, DIALECTE_STANDARD: standards.root },
			}),
			exitCode: 0,
		})

		const line = lineOfFact({ output, id: 'F-0001' }) ?? ''
		expect([line.includes('example-0000'), /changed/i.test(line)]).toEqual([true, true])
	})

	it('an unverifiable schema fact (package not installed) → its line names the package', async () => {
		const workspace = createFactsWorkspace()
		recordInto({
			workspace,
			draft: factDraft({ source: 'schema', sources: [WIDGET_SCHEMA_SOURCE] }),
		})

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: createStandardWorkspace().cwd,
				environment: workspace.environment,
			}),
			exitCode: 0,
		})

		expect(lineOfFact({ output, id: 'F-0001' })).toContain('@acme/widget')
	})
})

describe('facts: run outside a package root never fails on the cwd (R1-2)', () => {
	/** A ledger holding a schema fact F-0001 and a standard fact F-0002. */
	function ledgerWithSchemaAndStandard(): FactsWorkspace {
		const workspace = createFactsWorkspace()
		recordInto({
			workspace,
			draft: factDraft({ source: 'schema', sources: [WIDGET_SCHEMA_SOURCE] }),
		})
		recordInto({ workspace, draft: factDraft({ question: 'Is DD_1 required in D?' }) })
		return workspace
	}

	it('list from a folder with no package.json → exit 0, the schema fact unverifiable', async () => {
		const workspace = ledgerWithSchemaAndStandard()

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: temporaryFolder('facts-no-package-'),
				environment: workspace.environment,
			}),
			exitCode: 0,
		})

		expect(lineOfFact({ output, id: 'F-0001' })).toContain('unverifiable')
	})

	it('show of the schema fact from a folder with no package.json → exit 0, its state unverifiable', async () => {
		const workspace = ledgerWithSchemaAndStandard()

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['show', 'F-0001'],
				cwd: temporaryFolder('facts-no-package-'),
				environment: workspace.environment,
			}),
			exitCode: 0,
		})

		expect(output).toContain('unverifiable')
	})
})

describe('facts: the data folder follows environment.HOME when XDG_DATA_HOME is unset (R1-6)', () => {
	/** The environment of a home holding a ledger at `<home>/.local/share/dialecte/facts`. */
	function environmentOfHomeWithLedger(): NodeJS.ProcessEnv {
		const home = temporaryFolder('facts-home-')
		recordFact({
			folder: join(home, '.local', 'share', 'dialecte', 'facts'),
			draft: factDraft(),
			now: () => FACTS_NOW,
		})
		return { HOME: home }
	}

	it('list finds the fact placed there', async () => {
		const { output } = await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: temporaryFolder('facts-cwd-'),
				environment: environmentOfHomeWithLedger(),
				check: VALID,
			}),
			exitCode: 0,
		})

		expect(leadingIdsOf(outputLinesOf(output))).toEqual(['F-0001'])
	})

	it('show reads the fact placed there', async () => {
		const { output } = await answeredWith({
			run: runFacts({
				argv: ['show', 'F-0001'],
				cwd: temporaryFolder('facts-cwd-'),
				environment: environmentOfHomeWithLedger(),
				check: VALID,
			}),
			exitCode: 0,
		})

		expect(output).toContain('Is D required in A?')
	})
})

describe('facts forget: the reason is cut at 200 code points, never inside a surrogate pair (R1-7)', () => {
	it('a reason of 199 characters, a surrogate pair, then more → the pair kept whole, the line holds no lone surrogate', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		const reason = `${'x'.repeat(REASON_LIMIT - 1)}\u{1F600}tail`

		await answeredWith({
			run: runFacts({
				argv: ['forget', 'F-0001', '--reason', reason],
				cwd: workspace.cwd,
				environment: workspace.environment,
				check: VALID,
			}),
			exitCode: 0,
		})

		expect(readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).at(-1)?.reason).toBe(
			`${'x'.repeat(REASON_LIMIT - 1)}\u{1F600}`,
		)
	})
})
