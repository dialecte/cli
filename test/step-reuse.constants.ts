/** What the step-reuse tests share: a tree, an install, steps, bases and the hashes a record holds. */

import type { CheckKey } from '../src/lib/gate-records/gate-records.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'

export const SHA256_HEX = /^[0-9a-f]{64}$/

export const TREE = 'a'.repeat(40)
export const OTHER_TREE = '1'.repeat(40)

/** What the install of the asker is, and the key of a record made on it. */
export const INSTALLED = { lockHash: 'b'.repeat(64), linked: 'd'.repeat(64) }
export const KEY: CheckKey = { tree: TREE, ...INSTALLED, commandHash: 'c'.repeat(64) }

/** The gate bases of a run, as full shas. */
export const BASE_A = '2'.repeat(40)
export const BASE_B = '3'.repeat(40)

/** The hash a record's step holds in the cases that do not compute it. */
export const STEP_HASH = '4'.repeat(64)
export const OTHER_STEP_HASH = '5'.repeat(64)

export const HEAD = 'e'.repeat(40)
export const FIRST_AT = '2026-01-01T00:00:00.000Z'
export const SECOND_AT = '2026-01-02T00:00:00.000Z'

export const TESTS_STEP: GateStep = { name: 'tests', run: 'npm run test:run', counts: 'tests' }
export const SCOPED_TESTS_STEP: GateStep = { ...TESTS_STEP, scoped: true }
export const CHANGED_ONLY_STEP: GateStep = { ...TESTS_STEP, changedOnly: true }
export const RULES_STEP: GateStep = { name: 'rules', run: 'dialecte rules' }

/** A consumer name a contributor's machine lists. */
export const MACHINE_NAME = 'person-a'
