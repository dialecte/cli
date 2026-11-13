/**
 * The card's `late fixes` line (33L1 6b, D19; cases 46-49): no line when nothing is late, a warning (never a failed
 * line: the verdict stays) for a late fix nobody verified or a snapshot with no state, a passed line for a verified
 * one. Each case plays a story on a scratch store lot and asserts the whole line.
 */
import { join } from 'node:path'

import {
	FIRST_EDITED_FILE,
	FIRST_VERIFIER,
	FIRST_VERSION,
	SECOND_EDITED_FILE,
	SECOND_VERSION,
	THIRD_VERSION,
} from '../../../test/late-fixes-workspace.constants.ts'
import { lotWithStory, playStory } from '../../../test/late-fixes-workspace.ts'
import {
	createScratchRepository,
	isolateGitConfig,
	temporaryFolder,
} from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { buildLateFixesLine } from './card-gates.ts'
import { computeStateHash } from './state-hash.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LateFixesStep } from '../../../test/late-fixes-workspace.types.ts'
import type { CardGateLine } from './gate-records.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type Case = {
	title: string
	steps: LateFixesStep[]
	/** The card's line, a function of the folder's name (the `<id>` of the command); undefined: no line. */
	expected: (id: string) => CardGateLine | undefined
}

const FIX: LateFixesStep = { edit: { [FIRST_EDITED_FILE]: SECOND_VERSION } }
/** The command the unverified line gives, for the folder named `id`. */
function verifyCommand(id: string): string {
	return `dialecte lot verify ${id} --by <who> --note <text>`
}

const CASES: Case[] = [
	{
		title: 'no snapshot -> no line',
		steps: [FIX],
		expected: () => undefined,
	},
	{
		title: 'a snapshot, the tree as it was -> no line',
		steps: [{ snapshot: 1 }],
		expected: () => undefined,
	},
	{
		title:
			'case 46: a one-line fix after round 3 -> ! late fixes unverified since round 3 (1 file), with the command to verify it',
		steps: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, FIX],
		expected: (id) => ({
			name: 'late fixes',
			status: 'warning',
			detail: `unverified since round 3 (1 file): ${verifyCommand(id)}`,
		}),
	},
	{
		title: 'two files changed -> (2 files)',
		steps: [
			{ snapshot: 1 },
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION, [SECOND_EDITED_FILE]: FIRST_VERSION } },
		],
		expected: (id) => ({
			name: 'late fixes',
			status: 'warning',
			detail: `unverified since round 1 (2 files): ${verifyCommand(id)}`,
		}),
	},
	{
		title: 'a verified fix -> ✓ late fixes verified by the person: the note',
		steps: [{ snapshot: 1 }, FIX, { verifyHere: { by: FIRST_VERIFIER, note: 'one-line fix' } }],
		expected: () => ({
			name: 'late fixes',
			status: 'passed',
			detail: 'verified by person-a: one-line fix',
		}),
	},
	{
		title: 'case 47: a verify, then another edit -> unverified again',
		steps: [
			{ snapshot: 1 },
			FIX,
			{ verifyHere: { by: FIRST_VERIFIER, note: 'one-line fix' } },
			{ edit: { [FIRST_EDITED_FILE]: THIRD_VERSION } },
		],
		expected: (id) => ({
			name: 'late fixes',
			status: 'warning',
			detail: `unverified since round 1 (1 file): ${verifyCommand(id)}`,
		}),
	},
	{
		title: 'case 48: an edit reverted to the snapshot state -> no line',
		steps: [
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
			{ snapshot: 1 },
			FIX,
			{ edit: { [FIRST_EDITED_FILE]: FIRST_VERSION } },
		],
		expected: () => undefined,
	},
	{
		title: 'case 49: a snapshot with no .state -> ! late fixes not checked (round 2 has no state)',
		steps: [{ snapshot: 1 }, { snapshot: 2, withoutState: true }, FIX],
		expected: () => ({
			name: 'late fixes',
			status: 'warning',
			detail: 'not checked (round 2 has no state)',
		}),
	},
]

describe('buildLateFixesLine', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const { title, steps, expected } of CASES)
		it(title, () => {
			const lot = lotWithStory(steps)

			expect(
				buildLateFixesLine({
					folder: lot.lotFolder,
					root: lot.cwd,
					stateHash: computeStateHash(lot.cwd),
				}),
			).toEqual(expected(lot.name))
		})

	it('a plain hand-over folder not named handover -> the id is its basename', () => {
		isolateGitConfig()
		const root = createScratchRepository()
		const folder = join(temporaryFolder('dialecte-plain-handover-'), 'notes-folder')
		playStory({ lot: { cwd: root, lotFolder: folder }, steps: [{ snapshot: 1 }, FIX] })

		expect(buildLateFixesLine({ folder, root, stateHash: computeStateHash(root) })).toEqual({
			name: 'late fixes',
			status: 'warning',
			detail: `unverified since round 1 (1 file): ${verifyCommand('notes-folder')}`,
		})
	})
})
