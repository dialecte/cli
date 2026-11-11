/**
 * The step recorder's own lines (33L0 section 4, case 8, D14): parts are compacted (a key whose value is null, false or
 * an empty list is left out), and a line over 40 parts or 4,096 bytes is cut so that no failing part is hidden by a
 * passing one, with `cut`, `partsTotal` and `partsFailedTotal` saying what was left out.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { addWorktreeFolder, linkLot } from '../../../test/lot-stores.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createStepLot,
	partsOf,
	recordEndWith as endWith,
	stepEventsOf,
	warningCollector,
} from '../../../test/step-events-lot.ts'
import { CUT_STRING_LIMIT, EVENT_LINE_LIMIT } from './events.constants.ts'
import { startStep } from './record-step.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StepLot } from '../../../test/step-events-lot.types.ts'
import type { LotEvent } from './event.types.ts'
import type { StepPart } from './record-step.types.ts'

/** A list of long entries that alone passes the line limit even after the list cut (a failing list, a selection of ids). */
const OVERSIZED_LIST = Array.from({ length: 40 }, (_, index) => `${index}`.padEnd(150, 'x'))

/** The length of the folder name that takes a worktree path over the string cut. */
const LONG_PATH_LENGTH = 220

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A part holding the default of every field (what a plain passed step is). */
function plainPart(index: number): StepPart {
	return {
		name: `p${index}`,
		status: 'passed',
		counts: {},
		durationMs: 3,
		reused: false,
		rerun: false,
		heavy: false,
		selection: null,
		failing: null,
	}
}

/** A failed part naming one failing file. */
function failedPart(index: number): StepPart {
	return { ...plainPart(index), status: 'failed', failing: [`src/f${index}.test.ts`] }
}

/** The byte length of the longest line of the lot's file. */
function longestLine(lot: StepLot): number {
	return Math.max(
		...readFileSync(lot.eventsFile, 'utf8')
			.split('\n')
			.map((line) => Buffer.byteLength(line, 'utf8')),
	)
}

const PART_FIELDS = [
	'counts',
	'durationMs',
	'failing',
	'heavy',
	'name',
	'rerun',
	'reused',
	'selection',
	'status',
]

describe('compact parts', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a part holding null, false and an empty list → those keys are left out', () => {
		const lot = createStepLot()

		expect(
			partsOf(endWith({ lot, parts: [{ ...plainPart(1), failing: [] }] })).map((part) =>
				Object.keys(part).filter((key) =>
					['reused', 'rerun', 'heavy', 'selection', 'failing'].includes(key),
				),
			),
		).toEqual([[]])
	})

	it('a part with every field set to a value → every field kept', () => {
		const lot = createStepLot()
		const full: StepPart = {
			name: 'full',
			status: 'failed',
			counts: { tests: { passed: 1, failed: 1, skipped: 0, total: 2 } },
			durationMs: 5,
			reused: true,
			rerun: true,
			heavy: true,
			selection: { base: 'main', ids: ['a'], changed: 1 },
			failing: ['src/a.test.ts'],
		}

		expect(
			partsOf(endWith({ lot, parts: [full], exit: 1 })).map((part) => Object.keys(part).sort()),
		).toEqual([PART_FIELDS])
	})
})

describe(
	'a line that fits after compaction (case 8, a)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('40 parts holding every field at its default → all 40 written, no cut, the line under 4,096 bytes', () => {
			const lot = createStepLot()

			expect(
				((end) => ({
					parts: partsOf(end).length,
					cut: end?.cut,
					longest: longestLine(lot) < EVENT_LINE_LIMIT,
				}))(endWith({ lot, parts: Array.from({ length: 40 }, (_, index) => plainPart(index)) })),
			).toEqual({ parts: 40, cut: undefined, longest: true })
		})
	},
)

describe(
	'a line that needs a cut (case 8, b and c)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('100 parts, three failing → every failing part kept, then the first passing ones by position, cut true, the totals', () => {
			const lot = createStepLot()
			const parts = Array.from({ length: 100 }, (_, index) =>
				[70, 80, 90].includes(index) ? failedPart(index) : plainPart(index),
			)

			expect(
				((end) => {
					const names = partsOf(end).map((part) => String(part.name))
					return {
						cut: end?.cut,
						shown: names.length <= 40,
						failing: names.filter((name) => ['p70', 'p80', 'p90'].includes(name)),
						firstPassing: names.slice(0, 3),
						inPosition:
							[...names]
								.sort((first, second) => Number(first.slice(1)) - Number(second.slice(1)))
								.join() === names.join(),
						partsTotal: end?.partsTotal,
						partsFailedTotal: end?.partsFailedTotal,
						longest: longestLine(lot) < EVENT_LINE_LIMIT,
					}
				})(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				cut: true,
				shown: true,
				failing: ['p70', 'p80', 'p90'],
				firstPassing: ['p0', 'p1', 'p2'],
				inPosition: true,
				partsTotal: 100,
				partsFailedTotal: 3,
				longest: true,
			})
		})

		it('60 passing parts → the first 40 by position, cut true, partsTotal 60, no failed part', () => {
			const lot = createStepLot()

			expect(
				((end) => ({
					names: partsOf(end).length,
					first: partsOf(end)[0]?.name,
					last: partsOf(end).at(-1)?.name,
					cut: end?.cut,
					partsTotal: end?.partsTotal,
					partsFailedTotal: end?.partsFailedTotal ?? 0,
				}))(endWith({ lot, parts: Array.from({ length: 60 }, (_, index) => plainPart(index)) })),
			).toEqual({
				names: 40,
				first: 'p0',
				last: 'p39',
				cut: true,
				partsTotal: 60,
				partsFailedTotal: 0,
			})
		})

		it('150 failing parts, too many for one line → the cut is among them, partsFailedTotal above the failing parts shown, the line under 4,096 bytes', () => {
			const lot = createStepLot()
			const parts = Array.from({ length: 150 }, (_, index) => failedPart(index))

			expect(
				((end) => ({
					allFailing: partsOf(end).every((part) => part.status === 'failed'),
					shown: partsOf(end).length,
					cut: end?.cut,
					partsTotal: end?.partsTotal,
					partsFailedTotal: end?.partsFailedTotal,
					longest: longestLine(lot) < EVENT_LINE_LIMIT,
				}))(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				allFailing: true,
				shown: expect.any(Number),
				cut: true,
				partsTotal: 150,
				partsFailedTotal: 150,
				longest: true,
			})
		})

		it('150 failing parts → fewer shown than failed', () => {
			const lot = createStepLot()

			expect(
				((end) => partsOf(end).length < 150)(
					endWith({
						lot,
						parts: Array.from({ length: 150 }, (_, index) => failedPart(index)),
						exit: 1,
					}),
				),
			).toBe(true)
		})

		it('30 parts with names of 150 characters, over 4,096 bytes → cut to fit, cut true, partsTotal 30', () => {
			const lot = createStepLot()
			const parts = Array.from({ length: 30 }, (_, index) => ({
				...plainPart(index),
				name: `${index}`.padEnd(150, 'n'),
			}))

			expect(
				((end) => ({
					cut: end?.cut,
					fewer: partsOf(end).length < 30,
					partsTotal: end?.partsTotal,
					longest: longestLine(lot) < EVENT_LINE_LIMIT,
				}))(endWith({ lot, parts })),
			).toEqual({ cut: true, fewer: true, partsTotal: 30, longest: true })
		})
	},
)

describe(
	'a part that does not fit does not stop the others',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('one failing part too big for the line, then small failing parts → the small ones kept, the big one as its name and status only', () => {
			const lot = createStepLot()
			const oversized = {
				...failedPart(0),
				failing: OVERSIZED_LIST,
			}
			const parts = [oversized, failedPart(1), failedPart(2), plainPart(3)]

			expect(
				((end) => ({
					names: partsOf(end).map((part) => String(part.name)),
					oversized: partsOf(end).find((part) => part.name === 'p0'),
					cut: end?.cut,
					partsTotal: end?.partsTotal,
					partsFailedTotal: end?.partsFailedTotal,
					longest: longestLine(lot) < EVENT_LINE_LIMIT,
				}))(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				names: ['p0', 'p1', 'p2', 'p3'],
				oversized: { name: 'p0', status: 'failed' },
				cut: true,
				partsTotal: 4,
				partsFailedTotal: 3,
				longest: true,
			})
		})

		it('30 failing parts each with a 4-entry long list → every one named within the line, details in run order with the room left, partsFailedTotal 30', () => {
			const lot = createStepLot()
			const parts = Array.from({ length: 30 }, (_, index) => ({
				...failedPart(index),
				failing: Array.from({ length: 4 }, (_, entry) => `${index}-${entry}`.padEnd(50, 'x')),
			}))

			expect(
				((end) => {
					const written = partsOf(end)
					const detailed = written.flatMap((part, position) =>
						part.failing === undefined ? [] : [position],
					)
					return {
						named: written.map((part) => part.name),
						allFailed: written.every((part) => part.status === 'failed'),
						detailsFirst: detailed.every((position, index) => position === index),
						someDetails: detailed.length > 0,
						cut: end?.cut,
						partsTotal: end?.partsTotal,
						partsFailedTotal: end?.partsFailedTotal,
						longest: longestLine(lot) < EVENT_LINE_LIMIT,
					}
				})(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				named: parts.map((part) => part.name),
				allFailed: true,
				detailsFirst: true,
				someDetails: true,
				cut: true,
				partsTotal: 30,
				partsFailedTotal: 30,
				longest: true,
			})
		})

		it('failing parts, one of them too big, then passing parts → every failing part named, the passing ones with room left kept after them', () => {
			const lot = createStepLot()
			const oversized = { ...failedPart(10), failing: OVERSIZED_LIST }
			const parts = [
				...Array.from({ length: 10 }, (_, index) => failedPart(index)),
				oversized,
				failedPart(11),
				...Array.from({ length: 8 }, (_, index) => plainPart(12 + index)),
			]

			expect(
				((end) => {
					const names = partsOf(end).map((part) => String(part.name))
					return {
						failingNamed: Array.from({ length: 12 }, (_, index) => `p${index}`).every((name) =>
							names.includes(name),
						),
						passingKept: names.filter((name) => Number(name.slice(1)) >= 12).length > 0,
						inPosition:
							[...names]
								.sort((first, second) => Number(first.slice(1)) - Number(second.slice(1)))
								.join() === names.join(),
						partsFailedTotal: end?.partsFailedTotal,
						longest: longestLine(lot) < EVENT_LINE_LIMIT,
					}
				})(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				failingNamed: true,
				passingKept: true,
				inPosition: true,
				partsFailedTotal: 12,
				longest: true,
			})
		})

		it('150 failing parts of short names → at most 40 listed, every one a failing part, partsFailedTotal 150', () => {
			const lot = createStepLot()
			const parts = Array.from({ length: 150 }, (_, index) => failedPart(index))

			expect(
				((end) => ({
					listed: partsOf(end).length <= 40,
					allFailing: partsOf(end).every((part) => part.status === 'failed'),
					partsFailedTotal: end?.partsFailedTotal,
				}))(endWith({ lot, parts, exit: 1 })),
			).toEqual({ listed: true, allFailing: true, partsFailedTotal: 150 })
		})

		it('passing parts with long lists positioned before failing parts, the room short → the details go to the failing parts first', () => {
			const lot = createStepLot()
			const longList = Array.from({ length: 4 }, (_, entry) => `${entry}`.padEnd(50, 'x'))
			const parts = [
				...Array.from({ length: 6 }, (_, index) => ({
					...plainPart(index),
					selection: { base: 'main', ids: longList, changed: 1 },
				})),
				...Array.from({ length: 10 }, (_, index) => ({
					...failedPart(6 + index),
					failing: longList,
				})),
			]

			expect(
				((end) => {
					const failing = partsOf(end).filter((part) => part.status === 'failed')
					return {
						failingListed: failing.length,
						failingDetailed: failing.filter((part) => part.failing !== undefined).length,
						longest: longestLine(lot) < EVENT_LINE_LIMIT,
					}
				})(endWith({ lot, parts, exit: 1 })),
			).toEqual({ failingListed: 10, failingDetailed: 10, longest: true })
		})

		it('45 failing parts with room left for details → the details upgrade the first parts listed', () => {
			const lot = createStepLot()
			const parts = Array.from({ length: 45 }, (_, index) => failedPart(index))

			expect(
				((end) => ({
					listed: partsOf(end).length,
					firstDetailed: partsOf(end)[0]?.failing !== undefined,
					cut: end?.cut,
					partsFailedTotal: end?.partsFailedTotal,
				}))(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				listed: expect.any(Number),
				firstDetailed: true,
				cut: true,
				partsFailedTotal: 45,
			})
		})

		it('a passing part too big for the line between small passing parts → the later small ones still considered, every kept part in run order', () => {
			const lot = createStepLot()
			const oversized = {
				...plainPart(2),
				selection: {
					base: 'main',
					ids: OVERSIZED_LIST,
					changed: 1,
				},
			}
			const parts = [failedPart(0), plainPart(1), oversized, plainPart(3), plainPart(4)]

			expect(
				((end) => {
					const names = partsOf(end).map((part) => String(part.name))
					return {
						names,
						failedKept: names.includes('p0'),
						laterKept: names.includes('p4'),
						inPosition:
							[...names]
								.sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)))
								.join() === names.join(),
						partsFailedTotal: end?.partsFailedTotal,
						longest: longestLine(lot) < EVENT_LINE_LIMIT,
					}
				})(endWith({ lot, parts, exit: 1 })),
			).toEqual({
				names: expect.any(Array),
				failedKept: true,
				laterKept: true,
				inPosition: true,
				partsFailedTotal: 1,
				longest: true,
			})
		})
	},
)

describe(
	'a long worktree path on every cli step event',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a step.start whose worktree is over 200 characters → cut to 200, cut true', () => {
			const lot = createStepLot()
			const worktree = join(lot.worktree, 'w'.repeat(LONG_PATH_LENGTH))

			expect(
				((events) => ({
					length: events.map((event) => String(event.worktree).length),
					cut: events.map((event) => event.cut),
				}))(eventsOfKind({ lot, kind: 'step.start', worktree })),
			).toEqual({ length: [CUT_STRING_LIMIT], cut: [true] })
		})

		it('a parts-less step.end whose worktree is over 200 characters → cut to 200, cut true', () => {
			const lot = createStepLot()
			const worktree = join(lot.worktree, 'w'.repeat(LONG_PATH_LENGTH))

			expect(
				((events) => ({
					length: events.map((event) => String(event.worktree).length),
					cut: events.map((event) => event.cut),
				}))(eventsOfKind({ lot, kind: 'step.end', worktree })),
			).toEqual({ length: [CUT_STRING_LIMIT], cut: [true] })
		})

		it('a step.foreign whose worktree is over 200 characters → cut to 200, cut true', () => {
			const lot = createStepLot()
			const copied = addWorktreeFolder({
				workspace: lot.workspace,
				folderName: 'c'.repeat(LONG_PATH_LENGTH),
			})
			linkLot({ worktree: copied, lotFolder: lot.lotFolder })

			expect(
				((events) => ({
					length: events.map((event) => String(event.worktree).length),
					cut: events.map((event) => event.cut),
				}))(eventsOfKind({ lot, kind: 'step.foreign', cwd: copied })),
			).toEqual({ length: [CUT_STRING_LIMIT], cut: [true] })
		})
	},
)

describe(
	'a failure of the heavy marker has its own warning line',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a file stands at the marker folder, the events file writable → exactly one markers: not written line, no events: not recorded line, the events written', () => {
			const lot = createStepLot()
			blockMarkerFolder(lot)

			expect(
				((outcome) => ({
					markersLines: outcome.lines.filter((line) => line.startsWith('markers: not written: '))
						.length,
					total: outcome.lines.length,
					kinds: stepEventsOf(lot).map((event) => event.kind),
				}))(heavyRunOf(lot)),
			).toEqual({ markersLines: 1, total: 1, kinds: ['step.start', 'step.end'] })
		})

		it('a file at the marker folder and a folder at events.jsonl → one line of each, the markers line and the events line', () => {
			const lot = createStepLot()
			blockMarkerFolder(lot)
			mkdirSync(lot.eventsFile)

			expect(
				((outcome) => ({
					markers: outcome.lines.filter((line) => line.startsWith('markers: not written: ')).length,
					events: outcome.lines.filter((line) => line.startsWith('events: not recorded: ')).length,
					total: outcome.lines.length,
				}))(heavyRunOf(lot)),
			).toEqual({ markers: 1, events: 1, total: 2 })
		})
	},
)

/** Puts a file where the marker folder should be, so no marker can be made. */
function blockMarkerFolder(lot: StepLot): void {
	mkdirSync(dirname(lot.markerFolder), { recursive: true })
	writeFileSync(lot.markerFolder, 'a file, not a folder')
}

/** Runs one heavy recorded step in the lot and answers the warning lines it said. */
function heavyRunOf(lot: StepLot): { lines: string[] } {
	const warnings = warningCollector()
	const handle = startStep({
		cwd: lot.worktree,
		step: 'gate-full',
		heavy: true,
		warn: warnings.warn,
	})
	handle.end({ exit: 0, reuse: 'none', stateHash: null })
	return { lines: warnings.lines }
}

/**
 * Runs one recorded step and answers the lot's events of `kind`. With `worktree` the step is placed there explicitly
 * and ended without parts; with `cwd` the lot is found from that folder (a foreign one writes its `step.foreign`).
 */
function eventsOfKind(params: {
	lot: StepLot
	kind: string
	worktree?: string
	cwd?: string
}): LotEvent[] {
	const handle = startStep({
		cwd: params.cwd ?? params.lot.worktree,
		step: 'gate-fast',
		heavy: false,
		warn: () => undefined,
		...(params.worktree !== undefined && {
			place: { lot: params.lot.lotFolder, worktree: params.worktree, throwaway: false },
		}),
	})
	handle.end({ exit: 0, reuse: 'none', stateHash: null })
	return stepEventsOf(params.lot).filter((event) => event.kind === params.kind)
}
