/**
 * The card says a sleep: a gate record holding `sleptMs` gives the gate rows a `! slept <duration> during <run>` row,
 * and a DONE card does the same for the hand-over run record of its folder; no record, or a record without
 * `sleptMs`, says nothing.
 */
import { cardOf, editedPackage } from '../../../test/handover-profile.ts'
import { headOf, hooksRepository, writeGreenRecords } from '../../../test/mutation-hooks.ts'
import { noRepositoryCli } from '../../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { gateLinesOf } from '../../../test/scratch-checks.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { SLEPT_DURATION, SLEPT_MS } from '../../../test/step4-cases.constants.ts'
import { buildHandoverCard, handoverCardSections } from '../handover/handover-card.ts'
import { writeHandoverRunRecord } from '../handover/handover-run-record.ts'
import { buildCardGateLines } from './card-gates.ts'
import { recordGate } from './gate-records.ts'
import { computeStateTree } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { StepResult } from '../gate/gate.types.ts'

const PASSED_STEP: StepResult = {
	step: { name: 'check', run: 'true' },
	status: 'passed',
	counts: {},
	restored: [],
}

/** The slept rows of some card lines. */
function sleptRowsOf<Line extends { name: string }>(lines: readonly Line[] | undefined): Line[] {
	return (lines ?? []).filter((line) => line.name === 'slept')
}

/** A package whose `mode` gate run was recorded with `sleptMs` (none when undefined). */
function gatedPackage(params: { mode: 'fast' | 'full'; sleptMs?: number }): string {
	const root = editedPackage({ profile: null })
	recordGate({
		root,
		mode: params.mode,
		results: [PASSED_STEP],
		...(params.sleptMs !== undefined && { sleptMs: params.sleptMs }),
	})
	return root
}

/** The slept rows of the card lines of the package at `root`. */
function sleptRowsOfGates(root: string) {
	return sleptRowsOf(buildCardGateLines({ root, tree: computeStateTree(root) }))
}

describe(
	'the card: a gate run that spanned a sleep',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a full record with sleptMs → a warning row: slept <duration> during gate --full; a record without it → none', () => {
			const slept = gatedPackage({ mode: 'full', sleptMs: SLEPT_MS })
			const awake = gatedPackage({ mode: 'full' })

			expect({ slept: sleptRowsOfGates(slept), awake: sleptRowsOfGates(awake) }).toEqual({
				slept: [
					{ name: 'slept', status: 'warning', detail: `${SLEPT_DURATION} during gate --full` },
				],
				awake: [],
			})
		})

		it('the card printed → a ! slept line in the gates, and the row in --json', () => {
			const root = gatedPackage({ mode: 'full', sleptMs: SLEPT_MS })

			const { text, data } = cardOf({ root })

			expect(gateLinesOf(text)).toContain(`! slept ${SLEPT_DURATION} during gate --full`)
			expect(sleptRowsOf(data.gates)).toHaveLength(1)
		})
	},
)

describe(
	'the DONE card: a hand-over run that spanned a sleep',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** The card of a hand-over on `main` holding no lot, every lot committed (`done`), its run record in `folder`. */
		function doneCardOf(folder: string) {
			const root = hooksRepository({ declared: false })
			writeGreenRecords(root)
			return buildHandoverCard({
				root,
				folder,
				branch: 'main',
				head: headOf(root),
				notes: undefined,
				lots: [],
				commits: [],
				cliPath: '/opt/dialecte/dist/cli.js',
				done: true,
				probe: noRepositoryCli,
			})
		}

		it('a run record with sleptMs → a warning row: slept <duration> during handover run', () => {
			const folder = temporaryFolder('dialecte-card-folder-')
			expect(writeHandoverRunRecord({ folder, record: { sleptMs: SLEPT_MS } })).toBeUndefined()

			const card = doneCardOf(folder)

			expect(card.verdict).toBe('DONE')
			expect(sleptRowsOf(card.gates)).toEqual([
				{ name: 'slept', status: 'warning', detail: `${SLEPT_DURATION} during handover run` },
			])
		})

		it('the sections of that card → one gates line reading ! slept <duration> during handover run', () => {
			const folder = temporaryFolder('dialecte-card-folder-')
			expect(writeHandoverRunRecord({ folder, record: { sleptMs: SLEPT_MS } })).toBeUndefined()

			const lines = handoverCardSections(doneCardOf(folder)).sections.flatMap((section) =>
				section.lines.map((line) => line.text.replace(/ {2,}/g, ' ')),
			)

			expect(lines).toContain(`! slept ${SLEPT_DURATION} during handover run`)
		})

		it('a run record without sleptMs, and a folder with no run record → no slept row, next to a folder whose record has one', () => {
			const slept = temporaryFolder('dialecte-card-folder-')
			const empty = temporaryFolder('dialecte-card-folder-')
			const none = temporaryFolder('dialecte-card-folder-')
			expect(
				writeHandoverRunRecord({ folder: slept, record: { sleptMs: SLEPT_MS } }),
			).toBeUndefined()
			expect(writeHandoverRunRecord({ folder: empty, record: {} })).toBeUndefined()

			expect({
				slept: sleptRowsOf(doneCardOf(slept).gates).length,
				empty: sleptRowsOf(doneCardOf(empty).gates).length,
				none: sleptRowsOf(doneCardOf(none).gates).length,
			}).toEqual({ slept: 1, empty: 0, none: 0 })
		})
	},
)
