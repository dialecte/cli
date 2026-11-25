/**
 * `lot land` and the lot's tests record (D5): a failing test on record, of this tree or of the tree before the last
 * commit, or a record that does not read, refuses before anything is written (exit 1, no entry, nothing pushed, no
 * pull request); a pass of this tree, a pass of another tree and no record land as today.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../../test/land-lot.ts'
import { lotEntryStateOf } from '../../../test/landing-lot.ts'
import { headOf } from '../../../test/landing-repository.ts'
import { scopeGuardLotOf } from '../../../test/scope-guard-lot.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { hashStateTree } from '../gate-records/state-hash.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { landLot } from './land-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecordingHost } from '../../../test/land-lot.types.ts'
import type { LandingLot } from '../../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-24T12:00:00.000Z')
const OLD_TREE = '9'.repeat(64)

/** `lot land` of the lot through `host`. */
function land(params: { lot: LandingLot; host: RecordingHost }) {
	const { lot } = params
	return landLot({
		lot: lot.name,
		worktree: lot.worktree,
		branch: lot.branch,
		base: 'main',
		lotFolder: lot.lotFolder,
		host: params.host.host,
		now: NOW,
	})
}

/** Whether origin holds the lot's branch. */
function pushed(lot: LandingLot): boolean {
	return git({
		root: lot.repository.root,
		args: ['ls-remote', '--heads', lot.repository.origin],
	}).includes(`refs/heads/${lot.branch}`)
}

/** The state hash of the lot's committed HEAD, as a gate run on it records. */
function committedTree(lot: LandingLot): string {
	return hashStateTree(git({ root: lot.worktree, args: ['rev-parse', 'HEAD^{tree}'] }).trim())
}

/** A tree the lot's HEAD is not: the tree before its last commit. */
function olderTree(): string {
	return OLD_TREE
}

/** Writes a passing gate part of the tree `stateOf` gives. */
function passingOn(stateOf: (lot: LandingLot) => string): (lot: LandingLot) => void {
	return function writePassing(lot: LandingLot): void {
		writeGatePart({ lot, stateHash: stateOf(lot), failures: [] })
	}
}

/** The lot's `tests.json`, a gate part of `stateHash` holding `failures`, written whole. */
function writeGatePart(params: { lot: LandingLot; stateHash: string; failures: unknown[] }): void {
	const { lot, stateHash } = params
	const head = headOf(lot.worktree)
	writeFileSync(
		join(lot.lotFolder, STORE_FILES.tests),
		JSON.stringify({
			schema: 1,
			gate: {
				mode: 'fast',
				at: '2026-11-24T10:00:00.000Z',
				head,
				stateHash,
				tests: {
					passed: 3,
					failed: params.failures.length,
					skipped: 0,
					total: 3 + params.failures.length,
				},
				failures: params.failures,
			},
		}),
	)
}

/** An open failure of `src/in.ts` (a file the lot's HEAD holds) seen on `stateHash`. */
function failureOn(params: { lot: LandingLot; stateHash: string }) {
	return {
		key: 'src/in.ts',
		cases: ['src/in.ts > in > adds'],
		mode: 'fast',
		head: headOf(params.lot.worktree),
		stateHash: params.stateHash,
		at: '2026-11-24T10:00:00.000Z',
	}
}

/** What landing left behind: the entry, the HEAD, the branch on origin, the pull requests opened. */
function leftBehind(params: { lot: LandingLot; host: RecordingHost }) {
	const { lot, host } = params
	return {
		entry: lotEntryStateOf(lot),
		head: headOf(lot.worktree),
		pushed: pushed(lot),
		opened: host.calls.filter((call) => call.startsWith('open ')),
	}
}

describe('lot land - a failing test on record', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it.each([
		{ what: 'of its committed tree', stateOf: committedTree, treeWord: 'this tree' },
		{ what: 'of the tree before its last commit', stateOf: olderTree, treeWord: 'another tree' },
	])(
		'a failure $what -> refused, exit 1, the key, case and fix named: no entry, nothing pushed, no pull request',
		({ stateOf, treeWord }) => {
			const lot = scopeGuardLotOf()
			const stateHash = stateOf(lot)
			writeGatePart({
				lot,
				stateHash: committedTree(lot),
				failures: [failureOn({ lot, stateHash })],
			})
			const head = headOf(lot.worktree)
			const host = recordingHost()

			expect(land({ lot, host })).toEqual({
				exitCode: 1,
				lines: [
					expect.stringMatching(
						new RegExp(
							`^lot land: tests\\.json holds failing tests: src/in\\.ts \\(failing 1: src/in\\.ts > in > adds\\) - gate --fast at [0-9a-f]{12}, ${treeWord}: fix them, then run dialecte gate --fast in .*: nothing pushed$`,
						),
					),
				],
			})
			expect(leftBehind({ lot, host })).toEqual({
				entry: undefined,
				head,
				pushed: false,
				opened: [],
			})
		},
	)

	it('a tests.json that does not read -> refused, exit 1, the why and the release fix: nothing pushed', () => {
		const lot = scopeGuardLotOf()
		writeFileSync(join(lot.lotFolder, STORE_FILES.tests), '{"schema":1,"ga')
		const host = recordingHost()

		expect(land({ lot, host })).toEqual({
			exitCode: 1,
			lines: [
				expect.stringMatching(
					/^lot land: tests\.json cannot be read: .*dialecte gate --release.*: nothing pushed$/,
				),
			],
		})
		expect(pushed(lot)).toBe(false)
	})
})

describe(
	'lot land - what the tests record lets land (as today)',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it.each([
			{ what: 'a pass of its committed tree', record: passingOn(committedTree) },
			{ what: 'a pass of another tree', record: passingOn(olderTree) },
			{ what: 'no tests.json', record: function noRecord() {} },
		])('$what -> lands, pushed', ({ record }) => {
			const lot = scopeGuardLotOf()
			record(lot)

			expect(land({ lot, host: recordingHost() }).exitCode).toBe(0)
			expect(pushed(lot)).toBe(true)
		})
	},
)
