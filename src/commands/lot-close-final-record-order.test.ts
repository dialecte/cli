/**
 * The order `lot close` writes in (33L0 section 8, D6, case 32): the card line and the `removing` line are in the log
 * when the move starts, the `removed` line is not yet, and a write that fails means the move never starts. The move's
 * entry (`trashWorktree`) is wrapped to read the log at the moment it is called; it still does the move.
 */
import { existsSync, readFileSync } from 'node:fs'

import { HOOK_RECORD_AT } from '../../test/lot-close-final-record.constants.ts'
import {
	appendRunCardLine,
	closing,
	createClosableHandover,
	logLinesOf,
	logPathOf,
	makeLogReadOnly,
	writeHookRecord,
} from '../../test/lot-close-final-record.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** What the wrapped move saw: the log's text when it was called; undefined while it was not called. */
const seen = vi.hoisted(() => ({ file: '', text: undefined as string | undefined }))

vi.mock('../lib/worktree/trash.ts', async function wrapTrash(importOriginal) {
	const actual = await importOriginal<typeof import('../lib/worktree/trash.ts')>()
	const { existsSync: fileExists, readFileSync: readText } = await import('node:fs')
	return {
		...actual,
		trashWorktree: function trashAfterReadingLog(
			params: Parameters<typeof actual.trashWorktree>[0],
		) {
			seen.text = fileExists(seen.file) ? readText(seen.file, 'utf8') : ''
			return actual.trashWorktree(params)
		},
	}
})

/** Whether a `removing` line may not be written (the other lines are): a failure between the card and the intent. */
const failing = vi.hoisted(() => ({ removing: false }))

vi.mock('../lib/events/write-event.ts', async function wrapWriteEvent(importOriginal) {
	const actual = await importOriginal<typeof import('../lib/events/write-event.ts')>()
	return {
		...actual,
		writeEvent: function writeUnlessRemoving(params: Parameters<typeof actual.writeEvent>[0]) {
			if (failing.removing && params.event.kind === 'removing') throw new Error('disk full')
			actual.writeEvent(params)
		},
	}
})

/** Root writes through a read-only file: the permission cases mean nothing there. */
const RUNS_AS_ROOT = process.getuid?.() === 0

beforeEach(function forgetWhatWasSeen() {
	seen.file = ''
	seen.text = undefined
	failing.removing = false
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The kinds of the lines of a log text. */
function kindsOf(text: string | undefined): string[] {
	return (text ?? '')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line).kind as string)
}

describe(
	'lot close: what the log holds when the move starts',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('case 32: no card line before → the card and the removing line are in the log when the move starts, the removed line is not; it comes after the move', () => {
			const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
			writeHookRecord({ worktree: lot.worktree, head: lot.tip })
			seen.file = logPathOf(lot.workspace)

			expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
				exitCode: 0,
			})

			expect(kindsOf(seen.text)).toEqual(['card', 'removing'])
			expect(logLinesOf(lot.workspace).map((line) => line.kind)).toEqual([
				'card',
				'removing',
				'removed',
			])
			expect(seen.text).toBe(
				readFileSync(logPathOf(lot.workspace), 'utf8').split('\n').slice(0, 2).join('\n') + '\n',
			)
			expect(logLinesOf(lot.workspace)[0]).toMatchObject({ head: lot.tip, by: 'lot-close' })
		})

		it("the hand-over's own card line already there → only the removing line is added before the move", () => {
			const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
			writeHookRecord({ worktree: lot.worktree, head: lot.tip })
			appendRunCardLine({ lot, head: lot.tip })
			seen.file = logPathOf(lot.workspace)

			expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
				exitCode: 0,
			})

			expect(kindsOf(seen.text)).toEqual(['card', 'removing'])
			expect(logLinesOf(lot.workspace)[0]).toMatchObject({ by: 'handover-run' })
			expect('recomputed' in (logLinesOf(lot.workspace)[0] ?? {})).toBe(false)
		})

		it('a catch-up card written, then the removing write fails → kept, the card line stays (append-only), the move is never started', () => {
			const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
			writeHookRecord({ worktree: lot.worktree, head: lot.tip })
			seen.file = logPathOf(lot.workspace)
			failing.removing = true

			expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
				exitCode: 1,
				outcomes: [
					{ handover: lot.handover, kept: expect.stringContaining('final record not kept') },
				],
				calls: [],
			})

			expect({
				kinds: logLinesOf(lot.workspace).map((line) => line.kind),
				by: logLinesOf(lot.workspace)[0]?.by,
				moveStarted: seen.text !== undefined,
				worktreeStays: existsSync(lot.worktree),
			}).toEqual({
				kinds: ['card'],
				by: 'lot-close',
				moveStarted: false,
				worktreeStays: true,
			})
		})

		it.skipIf(RUNS_AS_ROOT)('a log that cannot be appended to → the move is never started', () => {
			const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
			writeHookRecord({ worktree: lot.worktree, head: lot.tip })
			appendRunCardLine({ lot, head: lot.tip })
			makeLogReadOnly(lot.workspace)
			seen.file = logPathOf(lot.workspace)

			expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
				exitCode: 1,
				outcomes: [
					{ handover: lot.handover, kept: expect.stringContaining('final record not kept') },
				],
			})

			expect({
				moveStarted: seen.text !== undefined,
				worktreeStays: existsSync(lot.worktree),
			}).toEqual({
				moveStarted: false,
				worktreeStays: true,
			})
		})

		it('the removing line carries the hook time of the records frozen before the move', () => {
			const lot = createClosableHandover({ index: '0001', tail: 'x', place: 'store' })
			writeHookRecord({ worktree: lot.worktree, head: lot.tip })
			seen.file = logPathOf(lot.workspace)

			expect(closing({ workspace: lot.workspace, names: [lot.handover] })).toMatchObject({
				exitCode: 0,
			})

			expect(JSON.parse((seen.text ?? '').split('\n').filter(Boolean)[1] ?? '{}')).toMatchObject({
				kind: 'removing',
				records: { 'gate-hook': HOOK_RECORD_AT },
			})
		})
	},
)
