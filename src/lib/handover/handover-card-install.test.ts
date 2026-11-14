/**
 * The card's `install` line: read from the hand-over folder's `install.json` only (never from the packages on
 * disk). The record counts while its `working` hash is the worktree lock's now (its `lock` is the index lock the
 * check read, shown in the passed line): passed when `node_modules` matched, failed (and a card still to run
 * BLOCKED) when they did not, absent when no record can be read or the worktree's lock moved since.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { headOf, hooksRepository, writeGreenRecords } from '../../../test/mutation-hooks.ts'
import { noRepositoryCli } from '../../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { shellQuote } from '../shell-quote.ts'
import { buildHandoverCard } from './handover-card.ts'
import { HANDOVER_FILES } from './handover.constants.ts'
import { readInstallLine } from './install-guard.ts'

import { describe, expect, it } from 'vitest'

import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type { HandoverCard } from './handover.types.ts'

const CHECKED_AT = '2026-11-13T09:00:00.000Z'
const WORKTREE_PLACEHOLDER = '<worktree>'
const LOCK_TEXT = `${JSON.stringify({
	lockfileVersion: 3,
	packages: { '': {}, 'node_modules/left': { version: '2.0.0' } },
})}\n`
const OTHER_LOCK_HASH = 'f'.repeat(64)

/** The sha256 of `text`, as the record's `lock`. */
function hashOf(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

const LOCK_HASH = hashOf(LOCK_TEXT)

/** Writes the lock into `root` and a `node_modules` whose `left` is at another version than the lock's. */
function writeMismatchedInstall(root: string): void {
	writeFileSync(join(root, 'package-lock.json'), LOCK_TEXT)
	mkdirSync(join(root, 'node_modules', 'left'), { recursive: true })
	writeFileSync(
		join(root, 'node_modules', 'left', 'package.json'),
		JSON.stringify({ name: 'left', version: '1.0.0' }),
	)
}

/** A hand-over folder holding `install.json` with `content` (none when undefined). */
function folderWithRecord(content: string | undefined): string {
	const folder = temporaryFolder('dialecte-install-card-')
	if (content !== undefined) writeFileSync(join(folder, HANDOVER_FILES.install), content)
	return folder
}

/** The record text the guard writes for the lock of `LOCK_TEXT` (also the worktree's), with `overrides` replacing fields. */
function recordText(overrides: Record<string, unknown>): string {
	return JSON.stringify({
		at: CHECKED_AT,
		lock: LOCK_HASH,
		working: LOCK_HASH,
		ok: true,
		mismatched: 0,
		...overrides,
	})
}

/**
 * The parameters of a card over a repository holding the lock and a `node_modules` that mismatches it, every gate
 * recorded green on that tree, its hand-over folder holding `install.json` with `content` (none when undefined).
 */
function cardParamsOf(params: {
	content: string | undefined
	done?: boolean
}): Parameters<typeof buildHandoverCard>[0] {
	const root = hooksRepository({ declared: false })
	writeMismatchedInstall(root)
	writeGreenRecords(root)
	return {
		root,
		folder: folderWithRecord(params.content),
		branch: 'main',
		head: headOf(root),
		notes: undefined,
		lots: [],
		commits: [],
		probe: noRepositoryCli,
		...(params.done && { done: true }),
	}
}

/**
 * What a card says about the install guard: verdict, failed gates, the install lines (the card's worktree,
 * shell-quoted, shown as a placeholder) and the gate names from `review` to `install`.
 */
function installSummaryOf(card: HandoverCard): {
	verdict: string
	failedGates: string[]
	installLines: unknown[]
	fromReview: string[]
} {
	const names = card.gates.map((gate) => gate.name)
	return {
		verdict: card.verdict,
		failedGates: card.failedGates,
		installLines: card.gates
			.filter((gate) => gate.name === 'install')
			.map((gate) => ({
				name: gate.name,
				status: gate.status,
				detail: gate.detail.replace(shellQuote(card.worktree), WORKTREE_PLACEHOLDER),
			})),
		fromReview: names.slice(names.indexOf('review'), names.indexOf('install') + 1),
	}
}

/** The line with the shell-quoted `worktree` in its detail shown as a placeholder (none stays none). */
function shownLine(params: { line: CardGateLine | undefined; worktree: string }): unknown {
	const { line } = params
	return (
		line && {
			name: line.name,
			status: line.status,
			detail: line.detail.replace(shellQuote(params.worktree), WORKTREE_PLACEHOLDER),
		}
	)
}

/** A summary's verdict and install lines: what a DONE card is judged on. */
function pickedOf(summary: ReturnType<typeof installSummaryOf>): {
	verdict: string
	installLines: unknown[]
} {
	return { verdict: summary.verdict, installLines: summary.installLines }
}

const PASSED_LINE = {
	name: 'install',
	status: 'passed',
	detail: `node_modules match package-lock.json (${LOCK_HASH.slice(0, 12)})`,
}

describe('the install line of the card', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('install.json ok for the lock held, node_modules mismatching it on disk → the passed line, the card READY (only the record is read)', () => {
		const params = cardParamsOf({ content: recordText({}) })

		expect(installSummaryOf(buildHandoverCard(params))).toEqual({
			verdict: 'READY',
			failedGates: [],
			installLines: [PASSED_LINE],
			fromReview: ['review', 'effort', 'install'],
		})
	})

	it('install.json ok false for 3 packages on a card that is otherwise READY → BLOCKED with install in failedGates and the failed line', () => {
		const params = cardParamsOf({ content: recordText({ ok: false, mismatched: 3 }) })

		expect(installSummaryOf(buildHandoverCard(params))).toEqual({
			verdict: 'BLOCKED',
			failedGates: ['install'],
			installLines: [
				{
					name: 'install',
					status: 'failed',
					detail: `node_modules do not match package-lock.json (3 package(s)): run npm ci in ${WORKTREE_PLACEHOLDER}`,
				},
			],
			fromReview: ['review', 'effort', 'install'],
		})
	})

	it('a later-lot failed record (laterLock) of an index lock other than the worktree lock, which has not moved since → BLOCKED with the later-lot line (a refused code-then-bump hand-over)', () => {
		const params = cardParamsOf({
			content: recordText({ lock: OTHER_LOCK_HASH, ok: false, mismatched: 1, laterLock: true }),
		})

		expect(installSummaryOf(buildHandoverCard(params))).toEqual({
			verdict: 'BLOCKED',
			failedGates: ['install'],
			installLines: [
				{
					name: 'install',
					status: 'failed',
					detail:
						'node_modules do not match the package-lock.json the next lot commits (1 package(s)): a later lot changes it: run npm ci with that lock, or commit the lock change first',
				},
			],
			fromReview: ['review', 'effort', 'install'],
		})
	})

	it('a DONE card with a failed record → the failed line shows, the verdict stays DONE', () => {
		const params = cardParamsOf({
			content: recordText({ ok: false, mismatched: 3 }),
			done: true,
		})

		expect(pickedOf(installSummaryOf(buildHandoverCard(params)))).toEqual({
			verdict: 'DONE',
			installLines: [
				{
					name: 'install',
					status: 'failed',
					detail: `node_modules do not match package-lock.json (3 package(s)): run npm ci in ${WORKTREE_PLACEHOLDER}`,
				},
			],
		})
	})

	it('no install.json on an otherwise READY card → READY, no install line', () => {
		const params = cardParamsOf({ content: undefined })

		expect(installSummaryOf(buildHandoverCard(params))).toEqual({
			verdict: 'READY',
			failedGates: [],
			installLines: [],
			fromReview: [],
		})
	})
})

describe('readInstallLine', () => {
	const CASES: {
		name: string
		content: string | undefined
		expected: unknown
	}[] = [
		{
			name: 'ok → passed with the first 12 of the lock hash',
			content: recordText({}),
			expected: PASSED_LINE,
		},
		{
			name: 'ok false, 1 mismatched → failed, the worktree shell-quoted',
			content: recordText({ ok: false, mismatched: 1 }),
			expected: {
				name: 'install',
				status: 'failed',
				detail: `node_modules do not match package-lock.json (1 package(s)): run npm ci in ${WORKTREE_PLACEHOLDER}`,
			},
		},
		{
			name: 'ok false, 0 mismatched (a lock that could not be read) → failed, never a 0 package(s) mismatch',
			content: recordText({ ok: false, mismatched: 0 }),
			expected: {
				name: 'install',
				status: 'failed',
				detail: 'package-lock.json could not be read: handover run refuses until it reads',
			},
		},
		{
			name: 'ok false, laterLock true → the later-lot line, the count kept',
			content: recordText({ ok: false, mismatched: 1, laterLock: true }),
			expected: {
				name: 'install',
				status: 'failed',
				detail:
					'node_modules do not match the package-lock.json the next lot commits (1 package(s)): a later lot changes it: run npm ci with that lock, or commit the lock change first',
			},
		},
		{
			name: 'laterLock as the string "yes" → no line',
			content: recordText({ ok: false, mismatched: 1, laterLock: 'yes' }),
			expected: undefined,
		},
		{ name: 'no install.json → no line', content: undefined, expected: undefined },
		{
			name: 'an install.json that does not parse → no line',
			content: '{ "ok": tru',
			expected: undefined,
		},
		{ name: 'an empty install.json → no line', content: '', expected: undefined },
		{
			name: 'a record without ok → no line',
			content: JSON.stringify({ at: CHECKED_AT, lock: LOCK_HASH, mismatched: 0 }),
			expected: undefined,
		},
		{
			name: 'a record without lock → no line',
			content: JSON.stringify({ at: CHECKED_AT, ok: true, mismatched: 0 }),
			expected: undefined,
		},
		{
			name: 'a failed record without mismatched → no line',
			content: JSON.stringify({ at: CHECKED_AT, lock: LOCK_HASH, ok: false }),
			expected: undefined,
		},
		{
			name: 'an ok record without mismatched → no line',
			content: JSON.stringify({ at: CHECKED_AT, lock: LOCK_HASH, ok: true }),
			expected: undefined,
		},
		{
			name: 'a record without at → no line',
			content: JSON.stringify({ lock: LOCK_HASH, ok: true, mismatched: 0 }),
			expected: undefined,
		},
		{
			name: 'ok as the string "false" → no line',
			content: recordText({ ok: 'false' }),
			expected: undefined,
		},
		{ name: 'lock as a number → no line', content: recordText({ lock: 42 }), expected: undefined },
		{
			name: 'mismatched as the string "3" → no line',
			content: recordText({ ok: false, mismatched: '3' }),
			expected: undefined,
		},
		{
			name: 'a record of another working lock than the worktree holds now → no line',
			content: recordText({ working: OTHER_LOCK_HASH }),
			expected: undefined,
		},
		{
			name: 'the index lock checked is not the worktree lock, the worktree lock unchanged since → the line, with the index lock hash',
			content: recordText({ lock: OTHER_LOCK_HASH }),
			expected: {
				...PASSED_LINE,
				detail: `node_modules match package-lock.json (${OTHER_LOCK_HASH.slice(0, 12)})`,
			},
		},
		{
			name: 'a record without working → no line',
			content: JSON.stringify({ at: CHECKED_AT, lock: LOCK_HASH, ok: true, mismatched: 0 }),
			expected: undefined,
		},
		{
			name: 'working as a number → no line',
			content: recordText({ working: 42 }),
			expected: undefined,
		},
	]

	it.each(CASES)('$name', ({ content, expected }) => {
		const folder = folderWithRecord(content)
		const worktree = temporaryFolder('dialecte-install-card-worktree-')
		writeFileSync(join(worktree, 'package-lock.json'), LOCK_TEXT)

		expect(shownLine({ line: readInstallLine({ folder, worktree }), worktree })).toEqual(expected)
	})

	it('a record while the worktree holds no lock file → no line', () => {
		const folder = folderWithRecord(recordText({}))
		const worktree = temporaryFolder('dialecte-install-card-worktree-')

		expect(shownLine({ line: readInstallLine({ folder, worktree }), worktree })).toBeUndefined()
	})
})
