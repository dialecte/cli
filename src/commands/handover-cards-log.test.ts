/**
 * The `card` line `handover run` appends to `cards.log` once every lot is committed (33L0 section 8, D5; cases 30
 * (the log's half), 32 (this cli writes the line), 36 (a hand-over outside the store)): the key, the card with its
 * usage, the lot's feature, the record times frozen from the commit root's git folder, `by: handover-run`; no line
 * for a rehearsal nor for a run that commits nothing; a log that cannot be written warns once and changes nothing
 * else. A real run is minutes of hook and commit, so the committed lot's facts are one case of several
 * expectations; every case builds what it reads and passes alone (round 1, R1-6: no state shared between cases).
 * The 40-line cut of the card's tdd list is case 35, in cards-log.test.ts through `writeCard`; case 32's other half
 * (an older installed cli writes no line) is out of reach here; the catch-up card is step 5.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { readRecordFile } from '../../test/gate-records.ts'
import {
	commitStoreHandover,
	createBranchRepository,
	createLinkedWorktree,
	headOf as headOfRepository,
	readEntry,
	storeOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { LOT_USAGE } from '../../test/handover-usage.constants.ts'
import {
	cardsLogLines,
	cardsLogOf,
	cardsLogText,
	recordStations,
	registeredNameIn,
	runArguments,
	showArguments,
	usageLineOf,
	writeAsk,
} from '../../test/handover-usage.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { FAILING_HOOK_LINES } from '../../test/hook-output-lines.constants.ts'
import { ASK_SENTINEL } from '../../test/lot-report-workspace.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { headOf, readFolder } from '../../test/scratch-checks.ts'
import {
	capturedStandardErrorLines,
	resetCapturedStandardError,
} from '../../test/standard-error-capture.ts'
import { HOOK_RECORD_FILE } from '../../test/step-events-handover.constants.ts'
import { createHandoverLot, printLines } from '../../test/step-events-handover.ts'
import { finalCardOf, readCardsLog } from '../lib/events/cards-log.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runHandoverRun, runHandoverShow } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandoverLot } from '../../test/step-events-handover.types.ts'

vi.mock('node:fs', async (importOriginal) => {
	const { withCapturedStandardError } = await import('../../test/standard-error-capture.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return withCapturedStandardError(actual)
})

/** The records a card line freezes, in the order the spec lists them. */
const RECORD_FIELDS = ['gate-fast', 'gate-full', 'gate-release', 'contrib', 'gate-hook', 'tdd']

afterEach(function restoreMocks() {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

/** The lines `handover run` printed, hook logs removed when the test ends. */
function printedLines(): string[] {
	const lines: string[] = []
	removeHookLogs({ lines })
	return lines
}

/** The feature the lot's identity holds. */
function featureOf(lot: HandoverLot): string {
	return JSON.parse(readFileSync(join(lot.lotFolder, STORE_FILES.identity), 'utf8')).feature
}

describe('handover run: the card line', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a run that commits the lot of the store, its asks holding the sentinel → one card line (lot, registry name, committed, last lot commit, lots file head, feature, card with its usage, by handover-run), its frozen records, found again by its key, and nothing of asks', async () => {
		const lot = createHandoverLot()
		recordStations(lot)
		writeAsk({ lot, text: ASK_SENTINEL })
		const name = registeredNameIn(lot)
		const base = readFolder(lot.folder).lotsFile.head
		const feature = featureOf(lot)
		resetCapturedStandardError()

		await expect(runHandoverRun(runArguments({ lot, lines: printedLines() }))).resolves.toBe(0)

		const head = headOf(lot.root)
		const lines = cardsLogLines(lot)
		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({
			schema: 1,
			kind: 'card',
			lot: lot.lotName,
			name,
			state: 'committed',
			feature,
			repository: lot.root,
			branch: 'main',
			head,
			base,
			by: 'handover-run',
			card: { verdict: 'DONE', done: true, name, usage: LOT_USAGE },
			usage: LOT_USAGE,
		})
		const hookAt = readRecordFile<{ at: string }>({ root: lot.root, name: HOOK_RECORD_FILE })?.at
		expect({
			feature: typeof feature,
			atIsIso: new Date(lines[0]?.at).toISOString() === lines[0]?.at,
			recomputed: 'recomputed' in (lines[0] ?? {}),
			hookRecorded: typeof hookAt,
			records: Object.keys(lines[0]?.records ?? {}).sort(),
			hook: lines[0]?.records?.['gate-hook'],
			release: lines[0]?.records?.['gate-release'],
			contrib: lines[0]?.records?.contrib,
			tdd: Array.isArray(lines[0]?.records?.tdd),
		}).toEqual({
			feature: 'string',
			atIsIso: true,
			recomputed: false,
			hookRecorded: 'string',
			records: [...RECORD_FIELDS].sort(),
			hook: hookAt,
			release: null,
			contrib: null,
			tdd: true,
		})
		const read = readCardsLog({ file: cardsLogOf(lot) })
		expect({
			damaged: read.damaged,
			byKey: read.cards.find(
				(card) =>
					card.name === name &&
					card.lot === lot.lotName &&
					card.state === 'committed' &&
					card.head === head,
			)?.by,
			final: finalCardOf({ cards: read.cards, lot: lot.lotName })?.head,
			logHoldsSentinel: cardsLogText(lot).includes(ASK_SENTINEL),
			rowShown: runHandoverShow(showArguments({ lot })).output.includes(
				usageLineOf({ lotName: lot.lotName }),
			),
			rowHoldsSentinel: runHandoverShow(showArguments({ lot })).output.includes(ASK_SENTINEL),
		}).toEqual({
			damaged: 0,
			byKey: 'handover-run',
			final: head,
			logHoldsSentinel: false,
			rowShown: true,
			rowHoldsSentinel: false,
		})
	})

	it('a lot whose folder holds no station event → the line has no usage and its card has no usage key, the feature of the lot', async () => {
		const lot = createHandoverLot()
		const feature = featureOf(lot)

		await expect(runHandoverRun(runArguments({ lot, lines: printedLines() }))).resolves.toBe(0)

		const [line] = cardsLogLines(lot)
		expect({
			lot: line?.lot,
			feature: line?.feature,
			usage: line?.usage,
			cardKeys: Object.keys(line?.card ?? {}),
		}).toEqual({
			lot: lot.lotName,
			feature,
			usage: null,
			cardKeys: expect.not.arrayContaining(['usage']),
		})
	})

	it('a hand-over outside the store → a line with lot null, feature null, the registry name, committed, no usage even when the lot of the store holds station events, not recomputed', async () => {
		const lot = createHandoverLot({ outside: true })
		recordStations(lot)
		const name = registeredNameIn(lot)

		await expect(runHandoverRun(runArguments({ lot, lines: printedLines() }))).resolves.toBe(0)

		const lines = cardsLogLines(lot)
		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({
			kind: 'card',
			lot: null,
			feature: null,
			name,
			state: 'committed',
			head: headOf(lot.root),
			by: 'handover-run',
			usage: null,
		})
		expect('recomputed' in (lines[0] ?? {})).toBe(false)
	})
})

/**
 * A hand-over written in a linked worktree of a scratch repository and run there: the worktree's HEAD before the run,
 * the main checkout and the log's card lines.
 */
async function runInLinkedWorktree(): Promise<{
	main: string
	before: string
	lines: Record<string, any>[]
}> {
	const main = createBranchRepository()
	const worktree = createLinkedWorktree({ root: main, branch: 'feat/linked' })
	const before = headOfRepository(worktree)
	const written = writeStoreHandover({
		root: worktree,
		name: 'linked',
		changes: { 'src/linked.ts': 'export {}\n' },
	})
	await commitStoreHandover({ root: worktree, folder: written.folder })
	const lines = readFileSync(join(storeOf(main), 'cards.log'), 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((text) => JSON.parse(text))
	return { main, before, lines }
}

describe(
	'handover run: the card line of a hand-over run in a linked worktree',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("R4-4: the line's repository is the main checkout's real path, not the worktree that is removed later", async () => {
			const { main, lines } = await runInLinkedWorktree()

			expect(lines.map((line) => line.repository)).toEqual([realpathSync(main)])
		})

		it("R4-6: the line's base is the full sha of the commit the lots started from, not the lots file's short one", async () => {
			const { before, lines } = await runInLinkedWorktree()

			expect(lines.map((line) => line.base)).toEqual([before])
		})
	},
)

describe('handover run: no card line', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a rehearsal → no line, no cards.log; the real run after it → the only line', async () => {
		const lot = createHandoverLot()

		await expect(
			runHandoverRun(runArguments({ lot, argv: ['--rehearse'], lines: printedLines() })),
		).resolves.toBe(0)
		expect(existsSync(cardsLogOf(lot))).toBe(false)
		await expect(runHandoverRun(runArguments({ lot, lines: printedLines() }))).resolves.toBe(0)

		expect(cardsLogLines(lot).map((line) => line.by)).toEqual(['handover-run'])
	})

	it('a run whose hook refuses the commit → exit 1, no line, no cards.log', async () => {
		const refused = createHandoverLot({ hookScript: `${printLines(FAILING_HOOK_LINES)}; exit 1` })

		await expect(
			runHandoverRun(runArguments({ lot: refused, lines: printedLines() })),
		).resolves.toBe(1)

		expect(existsSync(cardsLogOf(refused))).toBe(false)
	})
})

describe(
	'handover run: a log that cannot be written',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a folder stands at cards.log → the lot is committed and its entry committed, exit 0, one line on the standard error names cards.log, the folder stays', async () => {
			const blocked = createHandoverLot()
			recordStations(blocked)
			const name = registeredNameIn(blocked)
			const headBefore = headOf(blocked.root)
			mkdirSync(cardsLogOf(blocked))
			resetCapturedStandardError()

			await expect(
				runHandoverRun(runArguments({ lot: blocked, lines: printedLines() })),
			).resolves.toBe(0)

			const lines = capturedStandardErrorLines()
			expect({
				committed: headOf(blocked.root) !== headBefore,
				entry: readEntry({ root: blocked.root, name: name ?? '' })?.state,
				namingTheLog: lines.filter((line) => line.includes('cards.log')).length,
				stillAFolder: statSync(cardsLogOf(blocked)).isDirectory(),
			}).toEqual({
				committed: true,
				entry: 'committed',
				namingTheLog: 1,
				stillAFolder: true,
			})
		})
	},
)
