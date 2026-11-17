/**
 * The card's `design` line (DESIGN-GATE section 4, DG1): informational only, `passed` or `warning`, never `failed`, so
 * it changes no card verdict; the approver or waiver by kind; no line for a lot that needs no design and recorded none.
 */
import { DECLARED_GLOB, APPROVER } from '../../../test/design-workspace.constants.ts'
import { design, designLot } from '../../../test/design-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { buildDesignLine } from './card-gates.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe("the card's design line", { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot that needs a design and recorded none -> a warning naming why and what to run', () => {
		const lot = designLot({ declared: true })

		expect(buildDesignLine({ folder: lot.lotFolder })).toEqual({
			name: 'design',
			status: 'warning',
			detail: `missing (shared ${DECLARED_GLOB}): dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>`,
		})
	})

	it('a design approved by a person -> passed, approved by person, never the name', () => {
		const lot = designLot({ declared: true })
		design({ lot, words: ['--from', lot.designFile] })
		design({ lot, words: ['--approve', '--by', APPROVER] })

		expect(buildDesignLine({ folder: lot.lotFolder })).toEqual({
			name: 'design',
			status: 'passed',
			detail: 'approved by person',
		})
	})

	it('a lot that needs no design and recorded none -> no line', () => {
		const lot = designLot()

		expect(buildDesignLine({ folder: lot.lotFolder })).toBeUndefined()
	})
})
