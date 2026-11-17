/**
 * `tdd red` in a lot's own worktree refuses while the lot's required design is missing, unapproved or stale (DESIGN-GATE
 * section 3): nothing runs, the next command is named. An approved or waived design, a lot that needs none, and a run
 * outside a lot go on.
 */
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	EDITED_DESIGN_TEXT,
	STORE_GLOB,
	STORE_NEED,
} from '../../test/design-workspace.constants.ts'
import { approvedDesign, gatedLot } from '../../test/design-workspace.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GatedLot } from '../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A design refusal of `tdd red`, as its first line starts. */
const REFUSED = /^tdd red: lot \S+ design /

function red(root: string) {
	return runTdd({ cwd: root, argv: ['red'], now: () => new Date('2026-11-17T12:00:00.000Z') })
}

/** The refusal of `tdd red` for the lot's design in `words`, `next` the command it names. */
function refusalOf(params: { lot: GatedLot; words: string; next: string }): string {
	return `tdd red: lot ${params.lot.name} design ${params.words}: ${params.next}; nothing run`
}

describe('tdd red - the design gate', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a design missing -> exit 2, refused naming the recording, nothing run', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })

		await expect(red(lot.root)).resolves.toEqual({
			exitCode: 2,
			output: refusalOf({
				lot,
				words: `missing (shared ${STORE_GLOB})`,
				next: `dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>`,
			}),
		})
	})

	it('a design approved, then its file edited -> exit 2, refused as stale', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })
		writeFileSync(lot.designFile, EDITED_DESIGN_TEXT)

		await expect(red(lot.root)).resolves.toEqual({
			exitCode: 2,
			output: refusalOf({
				lot,
				words: `stale since its approval by orchestrator (shared ${STORE_GLOB})`,
				next: `the design changed since its approval: dialecte lot design ${lot.name} --from ${lot.designFile}, then approve it again`,
			}),
		})
	})

	it('a design approved before the need rose -> exit 2, refused naming the new reasons', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: [] })

		await expect(red(lot.root)).resolves.toEqual({
			exitCode: 2,
			output: refusalOf({
				lot,
				words: `not approved (shared ${STORE_GLOB})`,
				next: `the need rose (shared ${STORE_GLOB}) since its approval: from the main checkout: dialecte lot design ${lot.name} --approve --by <who> [--reason <text>]`,
			}),
		})
	})

	it('a design approved for the need -> tdd red runs', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })

		await expect(red(lot.root)).resolves.toMatchObject({
			output: expect.not.stringMatching(REFUSED),
		})
	})

	it('a waived design -> tdd red runs', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		appendFileSync(
			join(lot.lotFolder, STORE_FILES.design),
			`${JSON.stringify({ schema: 1, kind: 'waived', at: '2026-11-17T12:00:00.000Z', by: 'person-a', reason: 'started before the gate', need: STORE_NEED })}\n`,
		)

		await expect(red(lot.root)).resolves.toMatchObject({
			output: expect.not.stringMatching(REFUSED),
		})
	})

	it('a lot that needs no design, and a package outside every lot -> tdd red runs', async () => {
		const lot = gatedLot({ declared: [] })
		const outside = createVitestPackage({ dialecte: { risk: { high: [STORE_GLOB] } } })

		await expect(Promise.all([red(lot.root), red(outside)])).resolves.toEqual([
			expect.objectContaining({ output: expect.not.stringMatching(REFUSED) }),
			expect.objectContaining({ output: expect.not.stringMatching(REFUSED) }),
		])
	})
})
