/**
 * The cli's own shared areas (DESIGN-GATE section 1, DG2): its `package.json` declares the concepts its commands share,
 * and the `risk` key says the list means a design too.
 */
import { join } from 'node:path'

import { CONFIG_KEYS } from '../config/config-keys.constants.ts'
import { readDeclaredHigh } from '../risk/declared-high.ts'
import { designNeedOf } from './design-need.ts'

import { describe, expect, it } from 'vitest'

const CLI_ROOT = join(import.meta.dirname, '..', '..', '..')

describe("the cli's shared areas", () => {
	it("a scope in the landing model's folder -> design required at lot start", () => {
		expect(
			designNeedOf({
				entryKind: undefined,
				declaredHigh: readDeclaredHigh({ root: CLI_ROOT }),
				paths: ['src/lib/landing'],
			}),
		).toEqual({
			required: true,
			reasons: [{ kind: 'shared', glob: 'src/lib/landing/**', path: 'src/lib/landing' }],
		})
	})

	it("the risk key's description -> names the shared concepts that need a design", () => {
		expect(
			CONFIG_KEYS.find(function isRisk(key) {
				return key.key === 'risk'
			})?.description,
		).toBe(
			'Lot risk settings (high: globs of the shared concepts: a change there makes a lot high risk and needs an approved design).',
		)
	})
})
