/**
 * The late-fix state of a lot (33L1 6b, D19; cases 46-49): the last snapshot's `.state` against the worktree's
 * state hash, then the last `verify.jsonl` line that covers it, then the files that differ from `round-<n>/`. Each
 * case plays a story on a scratch store lot: real snapshots, edits of its repository, verify lines written by hand.
 */
import {
	FIRST_EDITED_FILE,
	FIRST_VERIFIER,
	FIRST_VERSION,
	SECOND_EDITED_FILE,
	SECOND_VERIFIER,
	SECOND_VERSION,
	THIRD_VERSION,
	TORN_LINE,
} from '../../../test/late-fixes-workspace.constants.ts'
import { lotWithStory } from '../../../test/late-fixes-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { computeStateHash } from '../gate-records/state-hash.ts'
import { readLateFixes } from './late-fixes.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LateFixesStep } from '../../../test/late-fixes-workspace.types.ts'
import type { LateFixes } from './review-rounds.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type Case = {
	title: string
	steps: LateFixesStep[]
	expected: LateFixes
}

const FIX: LateFixesStep = { edit: { [FIRST_EDITED_FILE]: SECOND_VERSION } }
const ONE_LINE_FIX = { by: FIRST_VERIFIER, note: 'one-line fix' }

const CASES: Case[] = [
	{
		title: 'no snapshot yet, the tree edited -> none: nothing is late before the first snapshot',
		steps: [{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } }],
		expected: { kind: 'none' },
	},
	{
		title: 'a snapshot, the tree as it was -> none',
		steps: [{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } }, { snapshot: 1 }],
		expected: { kind: 'none' },
	},
	{
		title:
			'case 46: rounds 1-3, a one-line fix after round 3 -> unverified since round 3, one file',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			{ snapshot: 2 },
			{ snapshot: 3 },
			FIX,
		],
		expected: { kind: 'unverified', round: 3, files: 1 },
	},
	{
		title: 'two files changed after the snapshot -> unverified, two files',
		steps: [
			{ snapshot: 1 },
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION, [SECOND_EDITED_FILE]: FIRST_VERSION } },
		],
		expected: { kind: 'unverified', round: 1, files: 2 },
	},
	{
		title:
			'a file the snapshot holds edited again and a new file -> unverified, two files (the files that differ from round-1/)',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			{ edit: { [FIRST_EDITED_FILE]: SECOND_VERSION, [SECOND_EDITED_FILE]: FIRST_VERSION } },
		],
		expected: { kind: 'unverified', round: 1, files: 2 },
	},
	{
		title: 'a file the snapshot holds edited twice since -> unverified, one file',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			{ edit: { [FIRST_EDITED_FILE]: SECOND_VERSION } },
			{ edit: { [FIRST_EDITED_FILE]: THIRD_VERSION } },
		],
		expected: { kind: 'unverified', round: 1, files: 1 },
	},
	{
		title: 'a file of round-1/ deleted -> unverified, one file',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			{ remove: [FIRST_EDITED_FILE] },
		],
		expected: { kind: 'unverified', round: 1, files: 1 },
	},
	{
		title: 'case 48: an edit reverted to the snapshot state -> none',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			FIX,
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
		],
		expected: { kind: 'none' },
	},
	{
		title: 'a fix, then lot verify of that tree -> verified by the person, with the note',
		steps: [{ snapshot: 1 }, FIX, { verifyHere: ONE_LINE_FIX }],
		expected: { kind: 'verified', by: FIRST_VERIFIER, note: 'one-line fix' },
	},
	{
		title: 'case 47: a verify, then another edit -> unverified again',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			FIX,
			{ verifyHere: ONE_LINE_FIX },
			{ edit: { [FIRST_EDITED_FILE]: THIRD_VERSION } },
		],
		expected: { kind: 'unverified', round: 1, files: 1 },
	},
	{
		title: 'a verify of the tree, then the edit reverted to the verified tree -> verified again',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ verifyHere: ONE_LINE_FIX },
			{ edit: { [FIRST_EDITED_FILE]: THIRD_VERSION } },
			FIX,
		],
		expected: { kind: 'verified', by: FIRST_VERIFIER, note: 'one-line fix' },
	},
	{
		title: 'two verify lines of the current tree -> the later one wins',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ verifyHere: { by: FIRST_VERIFIER, note: 'first look' } },
			{ verifyHere: { by: SECOND_VERIFIER, note: 'second look' } },
		],
		expected: { kind: 'verified', by: SECOND_VERIFIER, note: 'second look' },
	},
	{
		title:
			'a verify of the current tree, then a verify of another tree -> the line that covers the current tree wins, not the last line',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ verifyHere: { by: FIRST_VERIFIER, note: 'first look' } },
			{ verifyOther: { by: SECOND_VERIFIER, note: 'of another tree' } },
		],
		expected: { kind: 'verified', by: FIRST_VERIFIER, note: 'first look' },
	},
	{
		title: 'a verify line of another tree only -> unverified',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ verifyOther: { by: SECOND_VERIFIER, note: 'of another tree' } },
		],
		expected: { kind: 'unverified', round: 1, files: 1 },
	},
	{
		title: 'a torn last line after a verify of the current tree -> the torn line is skipped',
		steps: [{ snapshot: 1 }, FIX, { verifyHere: ONE_LINE_FIX }, { raw: TORN_LINE }],
		expected: { kind: 'verified', by: FIRST_VERIFIER, note: 'one-line fix' },
	},
	{
		title: 'a torn line, then a later verify of the current tree -> the later line is read',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ raw: `${TORN_LINE}\n` },
			{ verifyHere: { by: SECOND_VERIFIER, note: 'after the crash' } },
		],
		expected: { kind: 'verified', by: SECOND_VERIFIER, note: 'after the crash' },
	},
	{
		title: 'a line that is no JSON between two verify lines -> skipped',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ verifyHere: { by: FIRST_VERIFIER, note: 'first look' } },
			{ raw: 'not json at all\n' },
			{ verifyHere: { by: SECOND_VERIFIER, note: 'second look' } },
		],
		expected: { kind: 'verified', by: SECOND_VERIFIER, note: 'second look' },
	},
	{
		title:
			'case 49: the last snapshot has no .state (an older cli) -> not checked, naming the round',
		steps: [{ snapshot: 1 }, { snapshot: 2, withoutState: true }, FIX],
		expected: { kind: 'not-checked', round: 2 },
	},
	{
		title: 'a snapshot with no .state and a verify of the current tree -> still not checked',
		steps: [{ snapshot: 1, withoutState: true }, FIX, { verifyHere: ONE_LINE_FIX }],
		expected: { kind: 'not-checked', round: 1 },
	},
	{
		title: 'the first snapshot has no .state, the last has one and the tree is its own -> none',
		steps: [{ snapshot: 1, withoutState: true }, { snapshot: 2 }],
		expected: { kind: 'none' },
	},
]

describe('readLateFixes', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const { title, steps, expected } of CASES)
		it(title, () => {
			const lot = lotWithStory(steps)

			expect(
				readLateFixes({
					folder: lot.lotFolder,
					root: lot.cwd,
					stateHash: computeStateHash(lot.cwd),
				}),
			).toEqual(expected)
		})
})
