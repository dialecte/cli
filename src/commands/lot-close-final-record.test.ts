/**
 * `dialecte lot close` keeps the lot's final record before it moves a worktree (33L0 sections 2 and 8, D6; cases 30
 * (the close half), 32, 33, 36): the catch-up `card` line of a hand-over an older cli committed (recomputed, no probe,
 * its head from the hook record, else from the lot's commit), read back, then the `removing` line, then the move,
 * then the `removed` line. Every write failing, and a commit not known, keep the worktree with its reason, nothing
 * moved. Real git; the hand-overs are written and committed by the store's own writers.
 */
import { existsSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { LOT_USAGE } from '../../test/handover-usage.constants.ts'
import { recordStations } from '../../test/handover-usage.ts'
import {
	COMMIT_NOT_KNOWN,
	FINAL_RECORD_NOT_KEPT,
	FULL_SHA_PATTERN,
	HOOK_RECORD_AT,
	LOOK_HINT,
	RECORDS_GONE_HINT,
	REMOVAL_ID_PATTERN,
	REMOVE_BY_HAND_HINT,
	FINAL_RECORD_NOW,
} from '../../test/lot-close-final-record.constants.ts'
import {
	appendRunCardLine,
	closing,
	linkLogToNull,
	createClosableHandover,
	logLinesOf,
	logPathOf,
	logTextOf,
	makeLogReadOnly,
	putFileAtTrash,
	putFolderAtLog,
	trapProbe,
	writeAskText,
	writeHookRecord,
} from '../../test/lot-close-final-record.ts'
import { addLotWorktree } from '../../test/lot-keep-workspace.ts'
import { ASK_SENTINEL } from '../../test/lot-report-workspace.constants.ts'
import { git } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { trashedNamesOf } from '../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { ClosableHandover } from '../../test/lot-close-final-record.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The folder the worktrees, the pool and the trash of the workspace live in (real path). */
function worktreesFolderOf(workspace: BriefWorkspace): string {
	return join(realpathSync(workspace.workspace), '.worktrees')
}

/** The path the lot's worktree went to in the trash; undefined when it is not there. */
function trashedPathOf(lot: ClosableHandover): string | undefined {
	const folder = worktreesFolderOf(lot.workspace)
	const [name] = trashedNamesOf(folder).filter((entry) => entry.startsWith(`${lot.lotName}-`))
	return name === undefined ? undefined : join(folder, '_trash', name)
}

/** Root writes through a read-only file: the permission cases mean nothing there. */
const RUNS_AS_ROOT = process.getuid?.() === 0

/** The lot folder of a hand-over made in the store; a case that asks for it of another one is wrong. */
function lotFolderOf(lot: ClosableHandover): string {
	if (lot.lotFolder === undefined)
		throw new Error(`${lot.lotName} has no lot folder (outside the store)`)
	return lot.lotFolder
}

/** The log's text, whether the worktree stands and whether a trash folder exists: what a kept close leaves as it was. */
function nothingWrittenOrMoved(lot: ClosableHandover): {
	log: string
	worktreeStays: boolean
	trash: boolean
} {
	return {
		log: logTextOf(lot.workspace),
		worktreeStays: existsSync(lot.worktree),
		trash: existsSync(join(worktreesFolderOf(lot.workspace), '_trash')),
	}
}

describe('lot close: the final record before the move', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it("case 32: a committed hand-over no card line was written for (an older cli committed it) → a catch-up card (recomputed, by lot-close, head the lot's last located commit though the hook record names another, its hook time frozen), then removing, then removed (trashed, the trashed path); no probe started", () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		// the hook let the base through: another commit than the lot's own; the located lot commit names the head
		writeHookRecord({ worktree: lot.worktree, head: lot.base })
		// the fake npx only catches a probe started by name: the proof that none ran is `card.done: true` below
		const marker = trapProbe()

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		const trashed = trashedPathOf(lot)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toMatchObject({
			schema: 1,
			kind: 'card',
			lot: lot.lotName,
			name: lot.handover,
			state: 'committed',
			// R4-4: the main checkout's real path, not the worktree that is about to go
			repository: realpathSync(lot.workspace.repository),
			branch: lot.branch,
			head: lot.tip,
			by: 'lot-close',
			recomputed: true,
			card: { verdict: 'DONE', done: true, name: lot.handover },
			usage: null,
			records: { 'gate-hook': HOOK_RECORD_AT, 'gate-fast': null, tdd: [] },
		})
		expect(new Date(lines[0].at).toISOString()).toBe(lines[0].at)
		expect(trashed).toEqual(expect.stringContaining(lot.lotName))
		expect(lines[2]).toMatchObject({
			kind: 'removed',
			id: lines[1].id,
			outcome: 'trashed',
			trashed,
		})
		expect(existsSync(marker)).toBe(false)
	})

	it('a committed hand-over whose run wrote its card line (the same key) → no second card line: removing and removed only', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		const written = appendRunCardLine({ lot, head: lot.tip })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toEqual(written)
		expect(lines[2]).toMatchObject({ id: lines[1].id, outcome: 'trashed' })
	})

	it('the run wrote its card line at another head than the hook record names (a lot has one final record) → no second card line, the first line unchanged', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		const written = appendRunCardLine({ lot, head: lot.base })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toEqual(written)
	})

	it("the card line carries the lot's usage when its station events exist (the one the card's usage row reads) → the catch-up card's usage and card.usage are it", () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		recordStations({ lotName: lot.lotName, eventsFile: join(lotFolderOf(lot), 'events.jsonl') })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
		})

		const [card] = logLinesOf(lot.workspace)
		expect(card).toMatchObject({ kind: 'card', usage: LOT_USAGE, card: { usage: LOT_USAGE } })
	})

	it("the hook record missing → the head is the last commit the lot's commits were found at, and the card says no hook time", () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
		})

		const [card] = logLinesOf(lot.workspace)
		expect(card).toMatchObject({
			kind: 'card',
			head: lot.tip,
			recomputed: true,
			by: 'lot-close',
			records: { 'gate-hook': null },
		})
	})

	it('neither the hook record nor the lot\'s commit known (a foreign commit stands in its place) → kept, "the lot\'s commit is not known", nothing written, nothing moved', () => {
		const lot = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'store',
			commit: 'foreign',
		})
		const before = nothingWrittenOrMoved(lot)

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover: lot.handover, kept: expect.stringContaining(COMMIT_NOT_KNOWN) }],
			calls: [],
		})

		expect(nothingWrittenOrMoved(lot)).toEqual(before)
		expect(before).toEqual({ log: '', worktreeStays: true, trash: false })
	})

	it('case 33: cards.log cannot be written (a folder stands at its path) → kept, "final record not kept: <reason>", nothing moved, no background removal', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		putFolderAtLog(lot.workspace)

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [
				{
					handover: lot.handover,
					kept: expect.stringMatching(new RegExp(`${FINAL_RECORD_NOT_KEPT} .+`)),
				},
			],
			calls: [],
		})

		expect({
			worktreeStays: existsSync(lot.worktree),
			trash: existsSync(join(worktreesFolderOf(lot.workspace), '_trash')),
			stillAFolder: statSync(logPathOf(lot.workspace)).isDirectory(),
		}).toEqual({ worktreeStays: true, trash: false, stillAFolder: true })
	})

	it('case 33: the log is a link to /dev/null (every write succeeds, nothing reads back) → kept, "final record not kept: <reason>", nothing moved', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		linkLogToNull(lot.workspace)

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [
				{
					handover: lot.handover,
					kept: expect.stringMatching(new RegExp(`${FINAL_RECORD_NOT_KEPT} .+`)),
				},
			],
			calls: [],
		})

		expect({
			worktreeStays: existsSync(lot.worktree),
			trash: existsSync(join(worktreesFolderOf(lot.workspace), '_trash')),
		}).toEqual({ worktreeStays: true, trash: false })
	})

	it.skipIf(RUNS_AS_ROOT)(
		'case 33: the card is kept but the removing line cannot be written (the log turned read-only after the hand-over\'s own card line) → kept, "final record not kept", nothing moved, the log as it was',
		() => {
			const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
			writeHookRecord({ worktree: lot.worktree, head: lot.tip })
			appendRunCardLine({ lot, head: lot.tip })
			makeLogReadOnly(lot.workspace)
			const before = nothingWrittenOrMoved(lot)

			expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
				exitCode: 1,
				outcomes: [
					{ handover: lot.handover, kept: expect.stringContaining(FINAL_RECORD_NOT_KEPT) },
				],
				calls: [],
			})

			expect(nothingWrittenOrMoved(lot)).toEqual(before)
			expect(before.log.split('\n').filter(Boolean)).toHaveLength(1)
		},
	)

	it("an abandoned hand-over of a canceled lot with no card of its own → a card line state canceled, card null, head the worktree's HEAD, then removing and removed", () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: '0001-repo-stopped', state: 'canceled' })
		const handover = registerHandover({
			root: lot.worktree,
			folder: lot.lotFolder,
			branch: lot.branch,
			now: FINAL_RECORD_NOW,
		})
		recordHandoverState({
			store: handoverStoreOf(workspace.repository),
			folder: lot.lotFolder,
			state: 'abandoned',
		})
		const head = git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim()

		expect(closing({ workspace, names: [handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover, closed: true }],
		})

		const lines = logLinesOf(workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toMatchObject({
			kind: 'card',
			state: 'canceled',
			lot: lot.name,
			name: handover,
			card: null,
			head,
			by: 'lot-close',
			repository: realpathSync(workspace.repository),
		})
		expect(lines[1]).toMatchObject({ lot: lot.name, tip: head })
	})

	it("a canceled lot whose folder holds a written hand-over, a hook record naming another commit → the canceled line's card is rebuilt (done), its head the worktree's HEAD, not the hook record's", () => {
		const lot = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'store',
			state: 'abandoned',
		})
		writeHookRecord({ worktree: lot.worktree, head: lot.base })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toMatchObject({
			kind: 'card',
			state: 'canceled',
			lot: lot.lotName,
			name: lot.handover,
			head: lot.tip,
			by: 'lot-close',
			// R4-7: a canceled lot's card is not a done hand-over
			card: { done: false, name: lot.handover },
		})
	})

	it("an abandoned hand-over whose folder is outside the store → its card line is state canceled, lot null, head the worktree's HEAD", () => {
		const lot = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'outside',
			state: 'abandoned',
		})

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toMatchObject({
			kind: 'card',
			state: 'canceled',
			lot: null,
			name: lot.handover,
			head: lot.tip,
		})
	})

	it('case 36: a committed hand-over whose folder is outside the store → its card line has lot null (and still its registry name, state committed)', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toMatchObject({
			kind: 'card',
			lot: null,
			name: lot.handover,
			state: 'committed',
			head: lot.tip,
			by: 'lot-close',
		})
		expect(lines[1]).toMatchObject({ lot: null })
	})

	it("the removing line → item worktree, the worktree's real path, its branch, the full sha of its HEAD, the records frozen (the hook time), the lot, by lot-close, an id the removed line carries", () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
		})

		const [, removing, removed] = logLinesOf(lot.workspace)
		expect(removing).toMatchObject({
			schema: 1,
			kind: 'removing',
			item: 'worktree',
			path: lot.worktree,
			branch: lot.branch,
			tip: lot.tip,
			lot: lot.lotName,
			by: 'lot-close',
			records: {
				'gate-hook': HOOK_RECORD_AT,
				'gate-fast': null,
				'gate-full': null,
				'gate-release': null,
				contrib: null,
				tdd: [],
			},
		})
		expect(removing.id).toEqual(expect.stringMatching(REMOVAL_ID_PATTERN))
		expect(removing.tip).toEqual(expect.stringMatching(FULL_SHA_PATTERN))
		expect(new Date(removing.at).toISOString()).toBe(removing.at)
		expect(removed).toMatchObject({ kind: 'removed', id: removing.id })
	})

	it('the move failing after the removing line (a file stands where the trash folder goes) → a removed line outcome kept with the reason, the worktree stays, the card and the intent stay in the log', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		putFileAtTrash(lot.workspace)

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover: lot.handover, kept: expect.any(String) }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(existsSync(lot.worktree)).toBe(true)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[2]).toMatchObject({
			kind: 'removed',
			id: lines[1].id,
			outcome: 'kept',
			reason: expect.stringMatching(/\S/),
		})
		expect(lines[2]).not.toHaveProperty('trashed')
	})

	it('a worktree kept by an existing keep rule (dirty) → no card line, no removing line, no log at all', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		// an untracked file: the worktree is dirty
		writeFileSync(join(lot.worktree, 'scratch.txt'), 'not committed\n')

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover: lot.handover, kept: expect.stringContaining('dirty') }],
			calls: [],
		})

		expect({
			log: logTextOf(lot.workspace),
			logExists: existsSync(logPathOf(lot.workspace)),
		}).toEqual({
			log: '',
			logExists: false,
		})
	})

	it('case 30 (the close half): asks/ of the lot holds ZZ-ASK-SENTINEL → the lines written hold nothing of it', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		writeAskText({ lotFolder: lotFolderOf(lot), text: ASK_SENTINEL })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
		})

		expect(logLinesOf(lot.workspace)).toHaveLength(3)
		expect(logTextOf(lot.workspace)).not.toContain(ASK_SENTINEL)
	})

	it('two worktrees closed in one call, the first with no known commit → only the second leaves lines and moves; the first stays with its reason, nothing written for it', () => {
		const first = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'store',
			commit: 'foreign',
		})
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'store',
			workspace: first.workspace,
		})
		writeHookRecord({ worktree: second.worktree, head: second.tip })

		expect(
			closing({ workspace: first.workspace, names: [first.handover, second.handover] }),
		).toMatchObject({
			exitCode: 1,
			outcomes: [
				{ handover: first.handover, kept: expect.stringContaining(COMMIT_NOT_KNOWN) },
				{ handover: second.handover, closed: true },
			],
		})

		const lines = logLinesOf(first.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines.filter((line) => line.lot === first.lotName)).toEqual([])
		expect({
			firstStays: existsSync(first.worktree),
			secondGone: !existsSync(second.worktree),
		}).toEqual({
			firstStays: true,
			secondGone: true,
		})
	})

	it("a foreign commit stands in the lot place (its commits are not all located), a hook record names a commit → the catch-up head is the hook record's", () => {
		const lot = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'store',
			commit: 'foreign',
		})
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		expect(logLinesOf(lot.workspace)[0]).toMatchObject({ kind: 'card', head: lot.tip })
	})

	it('two committed hand-overs of one worktree, closed together → a card line for each, read back before the move, one removing and one removed', () => {
		const first = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			sharing: first,
		})

		expect(
			closing({ workspace: first.workspace, names: [first.handover, second.handover] }),
		).toMatchObject({
			exitCode: 0,
			outcomes: [
				{ handover: first.handover, closed: true },
				{ handover: second.handover, closed: true },
			],
		})

		const lines = logLinesOf(first.workspace)
		expect({
			cardNames: lines
				.filter((line) => line.kind === 'card')
				.map((line) => line.name)
				.sort(),
			removing: lines.filter((line) => line.kind === 'removing').length,
			removed: lines.filter((line) => line.kind === 'removed').length,
			worktreeGone: !existsSync(first.worktree),
		}).toEqual({
			cardNames: [first.handover, second.handover].sort(),
			removing: 1,
			removed: 1,
			worktreeGone: true,
		})
	})

	it("R4-1 (was: kept): two committed hand-overs of one worktree, the second with no known commit → both close, the second's card line has head null, one removing, one removed", () => {
		const first = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			commit: 'foreign',
			sharing: first,
		})

		expect(
			closing({ workspace: first.workspace, names: [first.handover, second.handover] }),
		).toMatchObject({
			exitCode: 0,
			outcomes: [
				{ handover: first.handover, closed: true },
				{ handover: second.handover, closed: true },
			],
		})

		const lines = logLinesOf(first.workspace)
		expect({
			worktreeGone: !existsSync(first.worktree),
			heads: lines
				.filter((line) => line.kind === 'card')
				.map((line) => [line.name, line.head])
				.sort(),
			removing: lines.filter((line) => line.kind === 'removing').length,
			removed: lines.filter((line) => line.kind === 'removed').length,
		}).toEqual({
			worktreeGone: true,
			heads: [
				[first.handover, first.tip],
				[second.handover, null],
			].sort(),
			removing: 1,
			removed: 1,
		})
	})

	it('two committed hand-overs of one worktree, close naming only the first → a card line for each, the unnamed one too, before the move', () => {
		const first = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			sharing: first,
		})

		expect(closing({ workspace: first.workspace, names: [first.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: first.handover, closed: true }],
		})

		expect(
			logLinesOf(first.workspace)
				.filter((line) => line.kind === 'card')
				.map((line) => line.name)
				.sort(),
		).toEqual([first.handover, second.handover].sort())
	})

	it('R4-1 (was: kept): two committed hand-overs of one worktree, close naming only the first, the unnamed one with no card line, no located commit and no hook record → the worktree closes, the unnamed one has a card line with head null', () => {
		const first = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			commit: 'foreign',
			sharing: first,
		})

		expect(closing({ workspace: first.workspace, names: [first.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: first.handover, closed: true }],
		})

		const lines = logLinesOf(first.workspace)
		expect({
			worktreeGone: !existsSync(first.worktree),
			removing: lines.filter((line) => line.kind === 'removing').length,
			siblingHeads: lines
				.filter((line) => line.kind === 'card' && line.name === second.handover)
				.map((line) => line.head),
		}).toEqual({ worktreeGone: true, removing: 1, siblingHeads: [null] })
	})

	it("R4-1 (was: kept): the sibling's lots not all located while the hook record names the owner's commit → the worktree closes, the sibling's card line has head null (never the hook record's head)", () => {
		const first = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			commit: 'foreign',
			sharing: first,
		})
		writeHookRecord({ worktree: first.worktree, head: first.tip })

		expect(closing({ workspace: first.workspace, names: [first.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: first.handover, closed: true }],
		})

		const lines = logLinesOf(first.workspace)
		expect({
			worktreeGone: !existsSync(first.worktree),
			removing: lines.filter((line) => line.kind === 'removing').length,
			siblingHeads: lines
				.filter((line) => line.kind === 'card' && line.name === second.handover)
				.map((line) => line.head),
		}).toEqual({ worktreeGone: true, removing: 1, siblingHeads: [null] })
	})

	it('R4-1: a hand-over committed on feat/a by an older cli (no card line), the worktree then switched to feat/b where hand-over B is committed → lot close <B> closes: A gets a catch-up card with head null, B its own, then removing and the move, exit 0', () => {
		const first = createClosableHandover({ index: '0001', tail: 'a', place: 'outside' })
		const second = createClosableHandover({
			index: '0002',
			tail: 'b',
			place: 'outside',
			sharing: first,
			branch: 'feat/b',
		})
		// A was merged into main meanwhile: the worktree's HEAD reflog reaches no commit a branch of the base lacks
		git({ root: first.workspace.repository, args: ['merge', '-q', '--ff-only', first.branch] })

		expect(closing({ workspace: first.workspace, names: [second.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: second.handover, closed: true }],
		})

		const lines = logLinesOf(first.workspace)
		expect({
			kinds: lines.map((line) => line.kind),
			cards: lines
				.filter((line) => line.kind === 'card')
				.map((line) => [line.name, line.head, line.by])
				.sort(),
			worktreeGone: !existsSync(first.worktree),
			trashed: trashedPathOf(first) !== undefined,
		}).toEqual({
			kinds: ['card', 'card', 'removing', 'removed'],
			cards: [
				[first.handover, null, 'lot-close'],
				[second.handover, second.tip, 'lot-close'],
			].sort(),
			worktreeGone: true,
			trashed: true,
		})
	})

	it.skipIf(RUNS_AS_ROOT)(
		'R4-1: a sibling whose line cannot be written (cards.log read-only after the owner\'s own card line) → still kept, the sibling named with "final record not kept", nothing moved',
		() => {
			const first = createClosableHandover({ index: '0001', tail: 'x', place: 'outside' })
			const second = createClosableHandover({
				index: '0002',
				tail: 'y',
				place: 'outside',
				commit: 'foreign',
				sharing: first,
			})
			appendRunCardLine({ lot: first, head: first.tip })
			makeLogReadOnly(first.workspace)
			const before = nothingWrittenOrMoved(first)

			expect(closing({ workspace: first.workspace, names: [first.handover] })).toMatchObject({
				exitCode: 1,
				outcomes: [
					{
						handover: first.handover,
						kept: expect.stringContaining(`${second.handover}: ${FINAL_RECORD_NOT_KEPT}`),
					},
				],
				calls: [],
			})

			expect(nothingWrittenOrMoved(first)).toEqual(before)
		},
	)

	it("R3-1: the owner's lots not located, the hook record naming a commit, another committed hand-over of the worktree committed later → kept \"the lot's commit is not known\" (the hook head is no longer the owner's), nothing written, nothing moved", () => {
		const first = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'outside',
			commit: 'foreign',
		})
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			sharing: first,
		})
		writeHookRecord({ worktree: first.worktree, head: second.tip })
		const before = nothingWrittenOrMoved(first)

		expect(closing({ workspace: first.workspace, names: [first.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover: first.handover, kept: expect.stringContaining(COMMIT_NOT_KNOWN) }],
			calls: [],
		})

		expect(nothingWrittenOrMoved(first)).toEqual(before)
	})

	it("R5-1: a committed store lot whose run wrote its card line, its lot folder removed since, no hook record → closes: no second card line, removing and removed, the removing line's lot the lot's full name", () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		const written = appendRunCardLine({ lot, head: lot.tip })
		rmSync(lotFolderOf(lot), { recursive: true, force: true })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toEqual(written)
		expect(lines[1]).toMatchObject({ kind: 'removing', lot: lot.lotName })
	})

	it("R5-1: a committed store lot with no card line, its lot folder removed since, a hook record at its commit → the catch-up card and the removing line carry the lot's full name, not null", () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })
		rmSync(lotFolderOf(lot), { recursive: true, force: true })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		const lines = logLinesOf(lot.workspace)
		expect(lines.map((line) => line.kind)).toEqual(['card', 'removing', 'removed'])
		expect(lines[0]).toMatchObject({
			kind: 'card',
			lot: lot.lotName,
			name: lot.handover,
			head: lot.tip,
			by: 'lot-close',
		})
		expect(lines[1]).toMatchObject({ kind: 'removing', lot: lot.lotName })
	})

	it('R5-2: the owner\'s lots not located, the hook record naming a commit, an abandoned hand-over of the worktree committed later → kept "the lot\'s commit is not known" (no hook fallback), nothing written, nothing moved', () => {
		const first = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'outside',
			commit: 'foreign',
		})
		const second = createClosableHandover({
			index: '0002',
			tail: 'y',
			place: 'outside',
			sharing: first,
			state: 'abandoned',
		})
		writeHookRecord({ worktree: first.worktree, head: second.tip })
		const before = nothingWrittenOrMoved(first)

		expect(closing({ workspace: first.workspace, names: [first.handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover: first.handover, kept: expect.stringContaining(COMMIT_NOT_KNOWN) }],
			calls: [],
		})

		expect(nothingWrittenOrMoved(first)).toEqual(before)
	})

	it('R4-2: the kept "commit is not known" ends with the way out → where to look, the removal by hand with the worktree\'s path, and what is lost', () => {
		const lot = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'store',
			commit: 'foreign',
		})
		const [outcome] = closing({ workspace: lot.workspace, names: [lot.handover] }).outcomes as {
			kept: string
		}[]

		expect([
			outcome.kept.startsWith(COMMIT_NOT_KNOWN),
			outcome.kept.includes(LOOK_HINT.replace('{worktree}', lot.worktree)),
			outcome.kept.includes(REMOVE_BY_HAND_HINT.replace('{worktree}', lot.worktree)),
			outcome.kept.includes(RECORDS_GONE_HINT),
		]).toEqual([true, true, true, true])
	})

	it("a canceled lot closed again at another HEAD than its first canceled line's → a second canceled line at the new HEAD", () => {
		const lot = createClosableHandover({
			index: '0001',
			tail: 'x',
			place: 'store',
			state: 'abandoned',
		})
		appendRunCardLine({ lot, head: lot.base, state: 'canceled' })

		expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
			exitCode: 0,
			outcomes: [{ handover: lot.handover, closed: true }],
		})

		expect(
			logLinesOf(lot.workspace)
				.filter((line) => line.kind === 'card')
				.map((line) => ({ state: line.state, head: line.head })),
		).toEqual([
			{ state: 'canceled', head: lot.base },
			{ state: 'canceled', head: lot.tip },
		])
	})

	it('the same worktree named twice in one call → closed once: one card line, one removing, one removed', () => {
		const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
		writeHookRecord({ worktree: lot.worktree, head: lot.tip })

		expect(
			closing({ workspace: lot.workspace, names: [lot.handover, lot.handover] }),
		).toMatchObject({
			exitCode: 0,
		})

		expect(logLinesOf(lot.workspace).map((line) => line.kind)).toEqual([
			'card',
			'removing',
			'removed',
		])
	})
})
