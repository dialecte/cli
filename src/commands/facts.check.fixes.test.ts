/** Review round 1 of the command's check: it never fails on the cwd (R1-2) and every stale or unverifiable outcome says why (R1-8). */
import { wholeFactOf } from '../../test/fact-check-fixtures.ts'
import { factDraft } from '../../test/fact-fixtures.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { createStandardWorkspace } from '../../test/standard-workspace.ts'
import { factCheckOf } from '../lib/knowledge/facts/command-check.ts'

import { describe, expect, it } from 'vitest'

import type { Fact } from '../lib/knowledge/facts/facts.types.ts'

const STANDARD_ID = 'example-0000'
const SCHEMA_PACKAGE = '@acme/absent'

/** A valid standard fact recording a files key the standard folder does not hold. */
function standardFact(): Fact {
	return wholeFactOf({ draft: factDraft() })
}

/** A valid schema fact of a package, holding a definition hash. */
function schemaFact(): Fact {
	return wholeFactOf({
		draft: factDraft({
			source: 'schema',
			sources: [
				{ kind: 'schema', package: SCHEMA_PACKAGE, version: '1.0.0', definitionHash: 'sha256:aa' },
			],
		}),
	})
}

describe('factCheckOf: every stale and unverifiable outcome carries a reason (R1-8)', () => {
	it('a standard whose files changed → stale, the reason naming the standard and that its files changed', async () => {
		const workspace = createStandardWorkspace({
			standards: { [STANDARD_ID]: { 'one.md': 'The first file.\n' } },
		})
		const check = await factCheckOf({ environment: workspace.environment, cwd: workspace.cwd })

		expect(check({ fact: standardFact() })).toEqual({
			state: 'stale',
			reason: expect.stringMatching(/example-0000.*changed|changed.*example-0000/i),
		})
	})

	it('DIALECTE_STANDARD not set → unverifiable, the reason naming DIALECTE_STANDARD', async () => {
		const workspace = createStandardWorkspace({
			standards: { [STANDARD_ID]: { 'one.md': 'The first file.\n' } },
		})
		const { DIALECTE_STANDARD: _unset, ...environment } = workspace.environment
		const check = await factCheckOf({ environment, cwd: workspace.cwd })

		expect(check({ fact: standardFact() })).toEqual({
			state: 'unverifiable',
			reason: expect.stringContaining('DIALECTE_STANDARD'),
		})
	})

	it('a schema package that is not installed → unverifiable, the reason naming the package', async () => {
		const workspace = createStandardWorkspace()
		const check = await factCheckOf({ environment: workspace.environment, cwd: workspace.cwd })

		expect(check({ fact: schemaFact() })).toEqual({
			state: 'unverifiable',
			reason: expect.stringContaining(SCHEMA_PACKAGE),
		})
	})
})

describe('factCheckOf: it never fails on the cwd (R1-2)', () => {
	it('a cwd with no package.json → it resolves; a schema source is unverifiable with a reason, a standard source is still compared', async () => {
		const workspace = createStandardWorkspace({
			standards: { [STANDARD_ID]: { 'one.md': 'The first file.\n' } },
		})

		const made = factCheckOf({
			environment: workspace.environment,
			cwd: temporaryFolder('facts-check-no-package-'),
		})
		await expect(made).resolves.toBeTypeOf('function')
		const check = await made

		expect([check({ fact: schemaFact() }), check({ fact: standardFact() }).state]).toEqual([
			{ state: 'unverifiable', reason: expect.any(String) },
			'stale',
		])
	})
})
