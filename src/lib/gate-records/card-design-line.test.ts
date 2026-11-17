/**
 * The card's `design` line (DESIGN-GATE sections 3-4): `passed` for a design approved, waived or not needed, `failed`
 * otherwise, so `handover run` refuses through the card's failed gates (DG2); the approver or waiver by kind; no line
 * for a lot that needs no design and recorded none.
 */
import { join } from 'node:path'

import { DECLARED_GLOB, APPROVER } from '../../../test/design-workspace.constants.ts'
import { design, designLot } from '../../../test/design-workspace.ts'
import { storeLotFolder } from '../../../test/handover-store-scenario.ts'
import { headOf, hooksRepository, writeGreenRecords } from '../../../test/mutation-hooks.ts'
import { noRepositoryCli } from '../../../test/repository-cli-probe.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { appendDesignLine } from '../design/design-records.ts'
import { buildHandoverCard } from '../handover/handover-card.ts'
import { buildDesignLine } from './card-gates.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandoverCard } from '../handover/handover.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe("the card's design line", { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot that needs a design and recorded none -> failed, naming why and what to run', () => {
		const lot = designLot({ declared: true })

		expect(buildDesignLine({ folder: lot.lotFolder })).toEqual({
			name: 'design',
			status: 'failed',
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

	it('a lot whose design is recorded and not approved -> the design line fails and the card is BLOCKED', () => {
		const params = storeLotCardParams()
		appendDesignLine({
			lotFolder: params.folder,
			line: {
				schema: 1,
				kind: 'recorded',
				at: '2026-11-17T12:00:00.000Z',
				file: join(params.root, 'DESIGN.md'),
				hash: 'a'.repeat(64),
				from: 'file',
			},
		})

		expect(verdictOf(buildHandoverCard(params))).toEqual({
			verdict: 'BLOCKED',
			failedGates: expect.arrayContaining(['design']),
			design: { name: 'design', status: 'failed', detail: expect.stringMatching(/^not approved/) },
		})
	})
})

/** A card's verdict, its failed gates and its design line. */
function verdictOf(card: HandoverCard) {
	return {
		verdict: card.verdict,
		failedGates: card.failedGates,
		design: card.gates.find(function isDesignLine(line) {
			return line.name === 'design'
		}),
	}
}

/** The card parameters of a store lot whose worktree is a hooks repository with green records. */
function storeLotCardParams(): Parameters<typeof buildHandoverCard>[0] {
	const root = hooksRepository({ declared: false })
	writeGreenRecords(root)
	return {
		root,
		folder: storeLotFolder({ root, name: 'design' }),
		branch: 'main',
		head: headOf(root),
		notes: undefined,
		lots: [],
		commits: [],
		probe: noRepositoryCli,
	}
}
