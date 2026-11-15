/**
 * The `lot` guard's two writers (33L1 6b, cases 39-42, D1): `checkStoreLot` (the run guard's verdict) and
 * `recordNotALotGoAhead` (the go-ahead row), over a plain folder, a healthy store lot, a simulated one and a
 * damaged one.
 */
import { basename, join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { startRealLot, startSimulatedLot } from '../../../test/lot-handover-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import {
	GO_AHEAD_DAY,
	GO_AHEAD_NOW,
	GO_AHEAD_LINE,
	OTHER_LOT_NAME,
	REFUSING_LINE,
} from '../../../test/store-lot-guard-workspace.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { appendDecision, readDecisions } from '../review-rounds/decisions-file.ts'
import { DECISIONS_FILE } from '../review-rounds/review-rounds.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../store/store.constants.ts'
import { checkStoreLot, readStoreLotLine, recordNotALotGoAhead } from './store-lot-guard.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GuardVerdict } from './handover.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type FolderKind = 'plain' | 'store' | 'simulated' | 'unreadable' | 'otherName'

/** A folder of the kind; the name a lot of the store is known by (the folder's own name for the others). */
function folderOf(kind: FolderKind): string {
	if (kind === 'plain') return temporaryFolder('dialecte-plain-handover-')
	if (kind === 'simulated') return startSimulatedLot().lotFolder
	const lot = startRealLot()
	if (kind === 'unreadable')
		replaceRecord({ folder: lot.lotFolder, name: 'identity.json', text: 'not json' })
	if (kind === 'otherName')
		replaceRecord({
			folder: lot.lotFolder,
			name: 'identity.json',
			text: JSON.stringify({ name: OTHER_LOT_NAME }),
		})
	return lot.lotFolder
}

/** Writes a decision row of `decision` by `by` into the folder's decisions file. */
function writeRow(params: { folder: string; decision: string; by?: string }): void {
	appendDecision({
		path: join(params.folder, DECISIONS_FILE),
		title: basename(params.folder),
		decision: params.decision,
		by: params.by ?? 'reviewer',
		when: GO_AHEAD_DAY,
	})
}

function rowsOf(folder: string): unknown[] {
	return readDecisions(join(folder, DECISIONS_FILE))
}

const GO_AHEAD_ROW = { decision: 'not a store lot: r', by: 'reviewer', when: GO_AHEAD_DAY }

function refusalOf(folder: string): string {
	return `${folder} is not a lot of the store: start lots with dialecte lot start (LOT-RULES)`
}

function simulatedRefusalOf(folder: string): GuardVerdict {
	return {
		ok: false,
		exitCode: 2,
		detail: `${basename(folder)} is a simulated lot: a simulated lot never commits`,
	}
}

describe('checkStoreLot', { timeout: STORE_CASE_TIMEOUT }, () => {
	type Case = {
		title: string
		kind: FolderKind
		/** Rows already in the folder's decisions file, in order. */
		rows?: string[]
		release?: boolean
		rehearsal?: boolean
		expected: (folder: string) => GuardVerdict | undefined
	}

	const CASES: Case[] = [
		{
			title: 'case 39: a plain folder, real run -> refused, exit 2',
			kind: 'plain',
			expected: (folder) => ({ ok: false, exitCode: 2, detail: refusalOf(folder) }),
		},
		{
			title: 'a plain folder, rehearsal -> the refusal text as a warning',
			kind: 'plain',
			rehearsal: true,
			expected: (folder) => ({ ok: true, warning: true, detail: refusalOf(folder) }),
		},
		{
			title: 'a plain folder holding the go-ahead row, real run -> a warning naming who and why',
			kind: 'plain',
			rows: ['not a store lot: r'],
			expected: () => ({ ok: true, warning: true, detail: 'not a store lot (by reviewer: r)' }),
		},
		{
			title: 'a plain folder holding the go-ahead row, rehearsal -> the same warning',
			kind: 'plain',
			rows: ['not a store lot: r'],
			rehearsal: true,
			expected: () => ({ ok: true, warning: true, detail: 'not a store lot (by reviewer: r)' }),
		},
		{
			title: 'a plain folder holding another decision only -> refused',
			kind: 'plain',
			rows: ['use the default placement'],
			expected: (folder) => ({ ok: false, exitCode: 2, detail: refusalOf(folder) }),
		},
		{
			title: 'a plain folder holding a row that only ends like the go-ahead -> refused',
			kind: 'plain',
			rows: ['was not a store lot: once'],
			expected: (folder) => ({ ok: false, exitCode: 2, detail: refusalOf(folder) }),
		},
		{
			title: 'a plain folder holding a row of the prefix without its colon -> refused',
			kind: 'plain',
			rows: ['not a store lot'],
			expected: (folder) => ({ ok: false, exitCode: 2, detail: refusalOf(folder) }),
		},
		{
			title: 'a simulated lot, rehearsal -> the refusal text as a warning, the rehearsal goes on',
			kind: 'simulated',
			rehearsal: true,
			expected: (folder) => ({
				ok: true,
				warning: true,
				detail: simulatedRefusalOf(folder).detail,
			}),
		},
		{
			title: 'a lot whose identity does not read, rehearsal -> the damage as a warning',
			kind: 'unreadable',
			rehearsal: true,
			expected: (folder) => ({
				ok: true,
				warning: true,
				detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityUnreadable}`,
			}),
		},
		{
			title: 'case 42: a release in a plain folder -> no verdict',
			kind: 'plain',
			release: true,
			expected: () => undefined,
		},
		{
			title: 'a release in a store lot -> no verdict',
			kind: 'store',
			release: true,
			expected: () => undefined,
		},
		{
			title: 'a healthy store lot -> passed, the lot name',
			kind: 'store',
			expected: (folder) => ({ ok: true, detail: basename(folder) }),
		},
		{
			title: 'case 40: a simulated lot -> refused',
			kind: 'simulated',
			expected: simulatedRefusalOf,
		},
		{
			title: 'a simulated lot holding the go-ahead row -> still refused',
			kind: 'simulated',
			rows: ['not a store lot: r'],
			expected: simulatedRefusalOf,
		},
		{
			title: 'case 41: a lot whose identity does not read -> refused naming the damage',
			kind: 'unreadable',
			expected: (folder) => ({
				ok: false,
				exitCode: 2,
				detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityUnreadable}`,
			}),
		},
		{
			title:
				'case 41: a lot whose identity names another folder, holding the go-ahead row -> refused naming the damage',
			kind: 'otherName',
			rows: ['not a store lot: r'],
			expected: (folder) => ({
				ok: false,
				exitCode: 2,
				detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityName}`,
			}),
		},
	]

	for (const { title, kind, rows, release, rehearsal, expected } of CASES)
		it(title, () => {
			const folder = folderOf(kind)
			for (const decision of rows ?? []) writeRow({ folder, decision })

			expect(
				checkStoreLot({ folder, release: release ?? false, rehearsal: rehearsal ?? false }),
			).toEqual(expected(folder))
		})

	it('a go-ahead given for a plain folder -> the row written, the verdict a warning', () => {
		const folder = folderOf('plain')

		expect({
			verdict: checkStoreLot({
				folder,
				release: false,
				rehearsal: false,
				goAhead: { by: 'reviewer', reason: 'r' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({
			verdict: { ok: true, warning: true, detail: 'not a store lot (by reviewer: r)' },
			rows: [GO_AHEAD_ROW],
		})
	})

	it('a go-ahead given for a plain folder, rehearsal -> the refusal text as a warning, nothing written', () => {
		const folder = folderOf('plain')

		expect({
			verdict: checkStoreLot({
				folder,
				release: false,
				rehearsal: true,
				goAhead: { by: 'reviewer', reason: 'r' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({
			verdict: { ok: true, warning: true, detail: refusalOf(folder) },
			rows: [],
		})
	})

	it('a go-ahead given for a healthy store lot -> ignored: passed with the lot name, nothing written', () => {
		const folder = folderOf('store')

		expect({
			verdict: checkStoreLot({
				folder,
				release: false,
				rehearsal: false,
				goAhead: { by: 'reviewer', reason: 'r' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({ verdict: { ok: true, detail: basename(folder) }, rows: [] })
	})

	it('a go-ahead with another reason while the row exists -> the verdict names the existing row, no second row', () => {
		const folder = folderOf('plain')
		writeRow({ folder, decision: 'not a store lot: written ahead', by: 'person-a' })

		expect({
			verdict: checkStoreLot({
				folder,
				release: false,
				rehearsal: false,
				goAhead: { by: 'reviewer', reason: 'another reason' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({
			verdict: { ok: true, warning: true, detail: 'not a store lot (by person-a: written ahead)' },
			rows: [{ decision: 'not a store lot: written ahead', by: 'person-a', when: GO_AHEAD_DAY }],
		})
	})

	it('a go-ahead given for a simulated lot -> refused, nothing written', () => {
		const folder = folderOf('simulated')

		expect({
			verdict: checkStoreLot({
				folder,
				release: false,
				rehearsal: false,
				goAhead: { by: 'reviewer', reason: 'r' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({ verdict: simulatedRefusalOf(folder), rows: [] })
	})

	it('a go-ahead given for a damaged lot -> refused, nothing written', () => {
		const folder = folderOf('unreadable')

		expect({
			verdict: checkStoreLot({
				folder,
				release: false,
				rehearsal: false,
				goAhead: { by: 'reviewer', reason: 'r' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({
			verdict: {
				ok: false,
				exitCode: 2,
				detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityUnreadable}`,
			},
			rows: [],
		})
	})

	it('a go-ahead given for a release -> no verdict, nothing written', () => {
		const folder = folderOf('plain')

		expect({
			verdict: checkStoreLot({
				folder,
				release: true,
				rehearsal: false,
				goAhead: { by: 'reviewer', reason: 'r' },
				now: GO_AHEAD_NOW,
			}),
			rows: rowsOf(folder),
		}).toEqual({ verdict: undefined, rows: [] })
	})
})

describe('recordNotALotGoAhead', () => {
	type Case = {
		title: string
		/** Rows already in the folder, in order. */
		before: { decision: string; by: string }[]
		expected: unknown[]
	}

	const CASES: Case[] = [
		{
			title: 'no decisions file -> one row, dated by `now`',
			before: [],
			expected: [GO_AHEAD_ROW],
		},
		{
			title: 'other decisions -> the row is added after them',
			before: [{ decision: 'use the default placement', by: 'person-a' }],
			expected: [
				{ decision: 'use the default placement', by: 'person-a', when: GO_AHEAD_DAY },
				GO_AHEAD_ROW,
			],
		},
		{
			title: 'the go-ahead row exists -> no second row',
			before: [{ decision: 'not a store lot: r', by: 'reviewer' }],
			expected: [GO_AHEAD_ROW],
		},
		{
			title: 'a row of lot choice with another reason exists -> no second row',
			before: [{ decision: 'not a store lot: written ahead', by: 'person-a' }],
			expected: [
				{ decision: 'not a store lot: written ahead', by: 'person-a', when: GO_AHEAD_DAY },
			],
		},
	]

	for (const { title, before, expected } of CASES)
		it(title, () => {
			const folder = folderOf('plain')
			for (const row of before) writeRow({ folder, ...row })

			expect(
				(function record() {
					recordNotALotGoAhead({ folder, by: 'reviewer', reason: 'r', now: GO_AHEAD_NOW })
					return rowsOf(folder)
				})(),
			).toEqual(expected)
		})

	it('a reason holding a pipe -> read back whole', () => {
		const folder = folderOf('plain')

		expect(
			(function record() {
				recordNotALotGoAhead({ folder, by: 'reviewer', reason: 'a | b', now: GO_AHEAD_NOW })
				return rowsOf(folder)
			})(),
		).toEqual([{ decision: 'not a store lot: a | b', by: 'reviewer', when: GO_AHEAD_DAY }])
	})
})

describe('readStoreLotLine', { timeout: STORE_CASE_TIMEOUT }, () => {
	type Case = {
		title: string
		kind: FolderKind
		rows?: { decision: string; by?: string }[]
		release?: boolean
		done?: boolean
		expected: (folder: string) => unknown
	}

	const CASES: Case[] = [
		{
			title:
				'a plain folder without the row -> a failed line saying the run will refuse and how to go ahead',
			kind: 'plain',
			expected: () => REFUSING_LINE,
		},
		{
			title: 'a plain folder with another decision only -> the failed line',
			kind: 'plain',
			rows: [{ decision: 'use the default placement' }],
			expected: () => REFUSING_LINE,
		},
		{
			title: 'a plain folder with the row -> a warning naming who and why',
			kind: 'plain',
			rows: [{ decision: 'not a store lot: r' }],
			expected: () => GO_AHEAD_LINE,
		},
		{
			title: 'a plain folder, done, without the row -> no line (D28)',
			kind: 'plain',
			done: true,
			expected: () => undefined,
		},
		{
			title: 'a plain folder, done, with the row -> the warning',
			kind: 'plain',
			rows: [{ decision: 'not a store lot: r' }],
			done: true,
			expected: () => GO_AHEAD_LINE,
		},
		{ title: 'a healthy store lot -> no line', kind: 'store', expected: () => undefined },
		{
			title: 'a simulated store lot -> a failed line holding the guard refusal (D20)',
			kind: 'simulated',
			expected: (folder) => ({
				name: 'lot',
				status: 'failed',
				detail: simulatedRefusalOf(folder).detail,
			}),
		},
		{
			title: 'a store lot whose identity does not read -> a failed line naming the damage (D20)',
			kind: 'unreadable',
			expected: (folder) => ({
				name: 'lot',
				status: 'failed',
				detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityUnreadable}`,
			}),
		},
		{
			title: 'a row that only ends like the go-ahead -> the failed line',
			kind: 'plain',
			rows: [{ decision: 'was not a store lot: once' }],
			expected: () => REFUSING_LINE,
		},
		{
			title: 'a row of the prefix without its colon -> the failed line',
			kind: 'plain',
			rows: [{ decision: 'not a store lot' }],
			expected: () => REFUSING_LINE,
		},
		{
			title: 'two go-ahead rows -> the warning of the first one',
			kind: 'plain',
			rows: [
				{ decision: 'not a store lot: r' },
				{ decision: 'not a store lot: later', by: 'person-a' },
			],
			expected: () => GO_AHEAD_LINE,
		},
		{
			title: 'a healthy store lot holding a go-ahead row -> no line',
			kind: 'store',
			rows: [{ decision: 'not a store lot: r' }],
			expected: () => undefined,
		},
		{
			title: 'a store lot whose identity names another folder -> a failed line naming the damage',
			kind: 'otherName',
			expected: (folder) => ({
				name: 'lot',
				status: 'failed',
				detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityName}`,
			}),
		},
		{
			title: 'a release in a plain folder -> no line',
			kind: 'plain',
			release: true,
			expected: () => undefined,
		},
	]

	for (const { title, kind, rows, release, done, expected } of CASES)
		it(title, () => {
			const folder = folderOf(kind)
			for (const row of rows ?? []) writeRow({ folder, ...row })

			expect(readStoreLotLine({ folder, release: release ?? false, done: done ?? false })).toEqual(
				expected(folder),
			)
		})
})
