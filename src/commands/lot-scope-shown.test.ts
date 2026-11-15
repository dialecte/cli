/**
 * A lot's scope changes shown (FIX-lot-scope D7, D8): `lot status --json` gains `scope: { brief, effective, changes }`
 * and its text a `scope:` line when the lot changed its scope; the hand-over card a `scope` line naming the changes.
 * No change: no line, the effective scope the brief's.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { startRealLot, writeInto } from '../../test/lot-handover-workspace.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotStatusLines } from './lot-status.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'
import type { LotStatusJson } from './lot-status.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const AT = '2026-11-14T10:00:00.000Z'
/** The real lot's brief scope, normalised. */
const BRIEF = ['src/dataflow', 'src/dataflow/**/*.test.ts']
const DROP = { schema: 1, at: AT, op: 'drop', paths: ['src/dataflow/**/*.test.ts'] }
const ADD = { schema: 1, at: AT, op: 'add', paths: ['docs/n.md'], by: 'person-a', reason: 'ok' }
/** A drop short enough for the card's line to hold whole. */
const SHORT_DROP = { schema: 1, at: AT, op: 'drop', paths: ['x.md'] }

/** A real started lot whose folder holds `changes` as its `scope-changes.jsonl` (none when empty). */
function lotWithChanges(changes: unknown[]): LotHandoverWorkspace {
	const lot = startRealLot()
	if (changes.length > 0)
		writeFileSync(
			join(lot.lotFolder, 'scope-changes.jsonl'),
			changes.map((change) => `${JSON.stringify(change)}\n`).join(''),
		)
	return lot
}

/** `lot status <lot>` from the main checkout, text or JSON. */
function statusOf(params: { lot: LotHandoverWorkspace; json: boolean }) {
	return runLot({
		cwd: params.lot.start.cwd,
		argv: ['status', params.lot.lotName, ...(params.json ? ['--json'] : [])],
	})
}

describe('lot status - the scope', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a drop and an add -> --json scope { brief, effective, changes }', () => {
		const lot = lotWithChanges([DROP, ADD])

		expect(withJson(statusOf({ lot, json: true })).json).toMatchObject({
			scope: { brief: BRIEF, effective: ['src/dataflow', 'docs/n.md'], changes: [DROP, ADD] },
		})
	})

	it('a drop and an add -> the text holds the scope line, within five lines', () => {
		const lot = lotWithChanges([DROP, ADD])
		const lines = statusOf({ lot, json: false }).output.split('\n')

		expect({
			scope: lines.filter((line) => line.startsWith('scope:')),
			fits: lines.length <= 5,
		}).toEqual({
			scope: ['scope: dropped src/dataflow/**/*.test.ts; added docs/n.md (by person-a)'],
			fits: true,
		})
	})

	it('five lines already needed (an open question, next and also) -> no scope line, still five lines at most', () => {
		const lot = lotWithChanges([DROP, ADD])
		const status = withJson(statusOf({ lot, json: true })).json as LotStatusJson
		const full: LotStatusJson = {
			...status,
			questions: [
				{
					id: 'q1',
					audience: 'caller',
					station: 'implementer',
					text: 'keep or replace?',
					asked: AT,
				},
			],
			next: status.next ?? 'dialecte lot wait x',
			also: ['dialecte lot status x'],
		}

		const lines = lotStatusLines(full)

		expect({
			scope: lines.filter((line) => line.startsWith('scope:')),
			questions: lines.filter((line) => line.startsWith('questions:')).length,
			fits: lines.length <= 5,
		}).toEqual({ scope: [], questions: 1, fits: true })
	})

	it('one line free (state, station, next, also) -> the scope line kept, the position line given up', () => {
		const lot = lotWithChanges([DROP, ADD])
		const status = withJson(statusOf({ lot, json: true })).json as LotStatusJson
		const oneFree: LotStatusJson = {
			...status,
			position: { step: 1, of: 2, station: null, round: null },
			questions: [],
			next: status.next ?? 'dialecte lot wait x',
			also: ['dialecte lot status x'],
		}

		const lines = lotStatusLines(oneFree)

		expect({
			position: lines.filter((line) => line.startsWith('step 1 of 2')).length,
			scope: lines.filter((line) => line.startsWith('scope:')).length,
			fits: lines.length <= 5,
		}).toEqual({ position: 0, scope: 1, fits: true })
	})

	it('a scope-changes line that does not read -> --json effective null with the count; the text says the guard reads every path', () => {
		const lot = startRealLot()
		writeFileSync(join(lot.lotFolder, 'scope-changes.jsonl'), `${JSON.stringify(ADD)}\nnot json\n`)

		expect({
			json: (withJson(statusOf({ lot, json: true })).json as { scope: unknown }).scope,
			text: statusOf({ lot, json: false })
				.output.split('\n')
				.filter((line) => line.startsWith('scope:')),
		}).toEqual({
			json: { brief: BRIEF, effective: null, changes: [ADD], unreadable: 1 },
			text: [
				'scope: 1 line(s) of scope-changes.jsonl do not read: the overlap guard reads every path',
			],
		})
	})

	it('no change -> --json scope with the effective scope the brief, no change; no scope line', () => {
		const lot = lotWithChanges([])

		expect({
			json: (withJson(statusOf({ lot, json: true })).json as { scope: unknown }).scope,
			text: statusOf({ lot, json: false })
				.output.split('\n')
				.filter((line) => line.startsWith('scope:')),
		}).toEqual({ json: { brief: BRIEF, effective: BRIEF, changes: [] }, text: [] })
	})
})

describe('the hand-over card - the scope line', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a drop and an add -> one passed scope line naming both, the add with who and why', () => {
		const lot = lotWithChanges([SHORT_DROP, ADD])

		expect(
			writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }).stdout,
		).toMatch(/✓ scope\s+dropped x\.md; added docs\/n\.md \(by person-a: ok\)\s+│/)
	})

	it('a scope-changes line that does not read -> a warning scope line saying the guard reads every path', () => {
		const lot = startRealLot()
		writeFileSync(join(lot.lotFolder, 'scope-changes.jsonl'), 'not json\n')

		expect(
			writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }).stdout,
		).toMatch(/! scope\s+1 line\(s\) of scope-changes\.jsonl do not read/)
	})

	it('no change -> no scope line', () => {
		const lot = lotWithChanges([])

		expect(
			writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }).stdout,
		).not.toMatch(/[✓✗!] scope\s/)
	})
})
