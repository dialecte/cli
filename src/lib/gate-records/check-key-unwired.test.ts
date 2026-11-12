/**
 * The reuse key of a gate list with an unwired or an opted-out step: such a list never hashes as the same list
 * wired, so a record written before the step was judged is not reused; a list with neither hashes byte for byte as
 * it did before.
 */
import { hashGateCommand } from './check-key.ts'

import { describe, expect, it } from 'vitest'

import type { GateStep } from '../gate/gate-config.types.ts'

/** The hashes of these two lists as the cli computed them before steps could be unwired or opted out (75461eb). */
const LEGACY_HASH_OF_PLAIN_LIST = '98541e713bae315b545fdc905c16a91a32db0164dc28812786eb604419a8a72d'
const LEGACY_HASH_OF_SCOPED_LIST =
	'6e7a6bf10bbc941c459f3c455ef379680a65176a444a0f8b0a0c85c8704d9f3f'

const CHECK_STEP: GateStep = { name: 'check', run: 'npm run check' }
const SKILLS_STEP: GateStep = { name: 'skills', run: 'npm run skills:check' }
const SCOPED_TESTS_STEP: GateStep = { name: 'tests', run: 'npx vitest run', scoped: true }
const GATE_BASE = 'b'.repeat(40)

describe('hashGateCommand and the steps that do not run as listed', () => {
	it('a list without an unwired or opted-out step → the hash it had before, byte for byte', () => {
		const marked: GateStep = { ...SKILLS_STEP, isDefault: true }

		expect({
			plain: hashGateCommand({ steps: [CHECK_STEP, SKILLS_STEP] }),
			markedDefault: hashGateCommand({ steps: [CHECK_STEP, marked] }),
			unwiredIsNot:
				hashGateCommand({ steps: [CHECK_STEP, { ...marked, unwired: true }] }) !==
				LEGACY_HASH_OF_PLAIN_LIST,
		}).toEqual({
			plain: LEGACY_HASH_OF_PLAIN_LIST,
			markedDefault: LEGACY_HASH_OF_PLAIN_LIST,
			unwiredIsNot: true,
		})
	})

	it('a list with a scoped step and no unwired or opted-out one → the hash it had before, byte for byte', () => {
		expect({
			wired: hashGateCommand({
				steps: [CHECK_STEP, SKILLS_STEP, SCOPED_TESTS_STEP],
				gateBase: GATE_BASE,
			}),
			optedOutIsNot:
				hashGateCommand({
					steps: [CHECK_STEP, { ...SKILLS_STEP, optedOut: 'no skills folder' }, SCOPED_TESTS_STEP],
					gateBase: GATE_BASE,
				}) !== LEGACY_HASH_OF_SCOPED_LIST,
		}).toEqual({ wired: LEGACY_HASH_OF_SCOPED_LIST, optedOutIsNot: true })
	})

	it('the same list with one step unwired, or opted out → three hashes, each different from the others', () => {
		const wired = hashGateCommand({ steps: [CHECK_STEP, SKILLS_STEP] })
		const unwired = hashGateCommand({ steps: [CHECK_STEP, { ...SKILLS_STEP, unwired: true }] })
		const optedOut = hashGateCommand({
			steps: [CHECK_STEP, { ...SKILLS_STEP, optedOut: 'no skills folder' }],
		})

		expect(new Set([wired, unwired, optedOut]).size).toBe(3)
		expect(wired).toBe(LEGACY_HASH_OF_PLAIN_LIST)
	})

	it('the reason of an opt-out is no part of the hash: two reasons, one hash, which is not the wired list’s', () => {
		const first = hashGateCommand({
			steps: [CHECK_STEP, { ...SKILLS_STEP, optedOut: 'no skills folder' }],
		})
		const second = hashGateCommand({
			steps: [CHECK_STEP, { ...SKILLS_STEP, optedOut: 'not for this package' }],
		})

		expect({ same: first === second, wired: first === LEGACY_HASH_OF_PLAIN_LIST }).toEqual({
			same: true,
			wired: false,
		})
	})

	it('a scoped step in the list too → still three different hashes, the wired one the hash it had before', () => {
		const steps = [CHECK_STEP, SKILLS_STEP, SCOPED_TESTS_STEP]
		const wired = hashGateCommand({ steps, gateBase: GATE_BASE })
		const unwired = hashGateCommand({
			steps: [CHECK_STEP, { ...SKILLS_STEP, unwired: true }, SCOPED_TESTS_STEP],
			gateBase: GATE_BASE,
		})
		const optedOut = hashGateCommand({
			steps: [CHECK_STEP, { ...SKILLS_STEP, optedOut: 'no skills folder' }, SCOPED_TESTS_STEP],
			gateBase: GATE_BASE,
		})

		expect(new Set([wired, unwired, optedOut]).size).toBe(3)
		expect(wired).toBe(LEGACY_HASH_OF_SCOPED_LIST)
	})
})
