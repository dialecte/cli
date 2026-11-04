/** The card's `standard` line: whether a standard is configured (`DIALECTE_STANDARD`) and what the station recorded. */

// the suite setup clears the person's DIALECTE_STANDARD; the cases below set their own
import '../../../test/git-environment.setup.ts'
import {
	STANDARD_NOT_CONFIGURED,
	STANDARD_NOT_CONSULTED_END,
	STANDARD_NOT_CONSULTED_START,
} from '../../../test/handover-profile.constants.ts'
import { cardOf, editedPackage, recordGateAndContrib } from '../../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { gateLinesOf, runGateIn } from '../../../test/scratch-checks.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../standard/standard.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { JsonCard, JsonCardLine } from '../../../test/handover-profile.types.ts'

/** The `standard` line of the card's gates. */
function standardLine(data: JsonCard): JsonCardLine | undefined {
	return data.gates.find((line) => line.name === 'standard')
}

/** A consumer package with a green gate. */
async function gatedConsumer(): Promise<string> {
	const root = editedPackage({ profile: null })
	await runGateIn({ cwd: root, argv: [] })
	return root
}

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('the card’s standard line', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('DIALECTE_STANDARD unset and nothing recorded → ! none configured, verdict READY', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
		const root = await gatedConsumer()

		const { data, text } = cardOf({ root })

		expect(gateLinesOf(text)).toContain(`! standard ${STANDARD_NOT_CONFIGURED}`)
		expect(standardLine(data)).toMatchObject({ status: 'warning', detail: STANDARD_NOT_CONFIGURED })
		expect(data.verdict).toBe('READY')
	})

	it('DIALECTE_STANDARD naming an existing folder and nothing recorded → ✗ standard, verdict BLOCKED', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))
		const root = await gatedConsumer()

		const { data } = cardOf({ root })

		expect(standardLine(data)).toMatchObject({
			status: 'failed',
			detail: expect.stringMatching(
				new RegExp(`^${STANDARD_NOT_CONSULTED_START}.*${STANDARD_NOT_CONSULTED_END}$`),
			),
		})
		expect(data.verdict).toBe('BLOCKED')
		expect(data.failedGates).toContain('standard')
	})

	it('DIALECTE_STANDARD naming a missing path → counts as not configured: ! none configured', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, '/nowhere/dialecte-standard-that-is-not-there')
		const root = await gatedConsumer()

		const { data } = cardOf({ root })

		expect(standardLine(data)).toMatchObject({ status: 'warning', detail: STANDARD_NOT_CONFIGURED })
		expect(data.verdict).toBe('READY')
	})

	it('configured, consulted recorded → ✓ standard consulted · <note>, verdict READY', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))
		const root = await gatedConsumer()

		const { data, text } = cardOf({
			root,
			standard: { state: 'consulted', note: 'read the section on units' },
		})

		expect(gateLinesOf(text)).toContain('✓ standard consulted · read the section on units')
		expect(data.verdict).toBe('READY')
	})

	it('configured, not-consulted recorded → ✗ standard, verdict BLOCKED', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))
		const root = await gatedConsumer()

		const { data } = cardOf({ root, standard: { state: 'not-consulted', note: 'no time today' } })

		expect(standardLine(data)).toMatchObject({ status: 'failed' })
		expect(data.verdict).toBe('BLOCKED')
	})

	it('not configured, not-consulted <reason> recorded → ! with the reason, verdict READY', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
		const root = await gatedConsumer()

		const { data } = cardOf({
			root,
			standard: { state: 'not-consulted', note: 'the change touches no standard' },
		})

		expect(standardLine(data)).toMatchObject({
			status: 'warning',
			detail: expect.stringContaining('the change touches no standard'),
		})
		expect(data.verdict).toBe('READY')
	})

	it('package.json dialecte.standard naming an existing folder, DIALECTE_STANDARD unset → ! none configured, verdict READY (the environment only)', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
		const root = editedPackage({
			profile: null,
			standard: temporaryFolder('dialecte-standard-'),
		})
		await runGateIn({ cwd: root, argv: [] })

		const { data } = cardOf({ root })

		expect(standardLine(data)).toMatchObject({
			name: 'standard',
			status: 'warning',
			detail: STANDARD_NOT_CONFIGURED,
		})
		expect(data.verdict).toBe('READY')
	})

	it('a contributor reads the same line: configured and consulted → ✓ standard', async () => {
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))
		const root = editedPackage({ steps: [] })
		await recordGateAndContrib(root)

		const { data } = cardOf({ root, standard: { state: 'consulted', note: 'read it' } })

		expect(standardLine(data)).toMatchObject({ status: 'passed', detail: 'consulted · read it' })
	})
})
