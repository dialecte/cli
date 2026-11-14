/**
 * `dialecte lot verify <id|folder> --by <who> --note <text>` (33L1 6b, D3, D8, D19; cases 46-51): appends
 * `{ schema, at, by, note, state }` to the lot folder's `verify.jsonl` in one write, run inside the lot's worktree;
 * exit 2 for a usage fault, a forbidden word, or a lot with no snapshot, nothing written. Each case runs on a scratch
 * store lot.
 */
import { readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { FIRST_WORD } from '../../test/forbidden-words-workspace.constants.ts'
import { configureMachine } from '../../test/forbidden-words-workspace.ts'
import {
	FIRST_EDITED_FILE,
	FIRST_VERIFIER,
	SECOND_EDITED_FILE,
	SECOND_VERIFIER,
	SECOND_VERSION,
	SNAPSHOT_TIME,
	THIRD_VERSION,
} from '../../test/late-fixes-workspace.constants.ts'
import {
	lotWithStory,
	playStory,
	verifyLineOf,
	verifyTextOf,
} from '../../test/late-fixes-workspace.ts'
import { createScratchRepository, git, temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { EVENT_LINE_LIMIT } from '../lib/events/events.constants.ts'
import { overLimitMessage } from '../lib/events/write-event.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LateFixesStep } from '../../test/late-fixes-workspace.types.ts'
import type { StationLot } from '../../test/lot-station-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The one usage line of `lot verify`, for every usage fault. */
const USAGE = 'lot verify: expected <id|folder> --by <who> --note <text>'

/** A fix after the first snapshot. */
const SNAPSHOT_THEN_FIX: LateFixesStep[] = [
	{ snapshot: 1 },
	{ edit: { [FIRST_EDITED_FILE]: SECOND_VERSION } },
]

/** The call of `lot verify <folder word> <extra...>` from the lot's repository, at the snapshot time. */
function verifyCall(params: { lot: StationLot; word?: string; extra: string[] }) {
	return {
		cwd: params.lot.cwd,
		argv: ['verify', params.word ?? params.lot.lotFolder, ...params.extra],
		now: SNAPSHOT_TIME,
	}
}

/** The names the lot folder holds, sorted. */
function listing(lot: StationLot): string[] {
	return readdirSync(lot.lotFolder).sort()
}

/** The line the success prints: the state's first 12 characters, the person, the file. */
function successLine(params: { lot: StationLot; by: string; state: string }): string {
	return `lot verify: ${params.state.slice(0, 12)} by ${params.by} - ${join(params.lot.lotFolder, STORE_FILES.verify)}`
}

describe('lot verify - recording', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a fix after round 1 -> exit 0, the line prints the state and the file, verify.jsonl holds the one line', () => {
		const lot = lotWithStory(SNAPSHOT_THEN_FIX)
		const state = computeStateHash(lot.cwd)

		expect(
			runLot(verifyCall({ lot, extra: ['--by', FIRST_VERIFIER, '--note', 'one-line fix'] })),
		).toEqual({
			exitCode: 0,
			output: successLine({ lot, by: FIRST_VERIFIER, state }),
		})
		expect(verifyTextOf(lot)).toBe(
			verifyLineOf({ by: FIRST_VERIFIER, note: 'one-line fix', state }),
		)
	})

	it('the lot named by its full name instead of its folder -> the same line in the same file', () => {
		const lot = lotWithStory(SNAPSHOT_THEN_FIX)
		const state = computeStateHash(lot.cwd)

		expect(
			runLot(
				verifyCall({
					lot,
					word: lot.name,
					extra: ['--by', FIRST_VERIFIER, '--note', 'one-line fix'],
				}),
			),
		).toEqual({
			exitCode: 0,
			output: successLine({ lot, by: FIRST_VERIFIER, state }),
		})
		expect(verifyTextOf(lot)).toBe(
			verifyLineOf({ by: FIRST_VERIFIER, note: 'one-line fix', state }),
		)
	})

	it('two verifies of two trees -> two lines in file order, each with the state of its time', () => {
		const lot = lotWithStory(SNAPSHOT_THEN_FIX)
		const first = computeStateHash(lot.cwd)
		expect(
			runLot(verifyCall({ lot, extra: ['--by', FIRST_VERIFIER, '--note', 'first fix'] })).exitCode,
		).toBe(0)
		playStory({ lot, steps: [{ edit: { [SECOND_EDITED_FILE]: THIRD_VERSION } }] })
		const second = computeStateHash(lot.cwd)

		expect(
			runLot(verifyCall({ lot, extra: ['--by', SECOND_VERIFIER, '--note', 'second fix'] }))
				.exitCode,
		).toBe(0)

		expect(second).not.toBe(first)
		expect(verifyTextOf(lot)).toBe(
			`${verifyLineOf({ by: FIRST_VERIFIER, note: 'first fix', state: first })}${verifyLineOf({ by: SECOND_VERIFIER, note: 'second fix', state: second })}`,
		)
	})

	it('a --by of two words and a note holding quotes and a dash -> both kept as given in the line', () => {
		const lot = lotWithStory(SNAPSHOT_THEN_FIX)
		const state = computeStateHash(lot.cwd)

		expect(
			runLot(
				verifyCall({
					lot,
					extra: ['--by', 'person a', '--note', 'the "empty" case - fixed'],
				}),
			),
		).toEqual({
			exitCode: 0,
			output: successLine({ lot, by: 'person a', state }),
		})
		expect(verifyTextOf(lot)).toBe(
			verifyLineOf({ by: 'person a', note: 'the "empty" case - fixed', state }),
		)
	})
})

describe('lot verify - refused, nothing written', { timeout: STORE_CASE_TIMEOUT }, () => {
	type Refusal = { title: string; extra: string[] }

	const USAGE_CASES: Refusal[] = [
		{ title: 'no --by and no --note', extra: [] },
		{ title: 'no --by', extra: ['--note', 'one-line fix'] },
		{ title: 'no --note', extra: ['--by', FIRST_VERIFIER] },
		{ title: 'a blank --by', extra: ['--by', '  ', '--note', 'one-line fix'] },
		{ title: 'a blank --note', extra: ['--by', FIRST_VERIFIER, '--note', ''] },
		{ title: 'a line break in --by', extra: ['--by', 'person\na', '--note', 'one-line fix'] },
		{ title: 'a line break in --note', extra: ['--by', FIRST_VERIFIER, '--note', 'one\nline'] },
		{
			title: 'a carriage return in --note',
			extra: ['--by', FIRST_VERIFIER, '--note', 'one\rline'],
		},
		{ title: '--by given last without its value', extra: ['--note', 'one-line fix', '--by'] },
	]

	for (const { title, extra } of USAGE_CASES)
		it(`${title} -> exit 2 and one usage line, nothing written`, () => {
			const lot = lotWithStory(SNAPSHOT_THEN_FIX)
			const before = listing(lot)

			expect(runLot(verifyCall({ lot, extra }))).toEqual({
				exitCode: 2,
				output: USAGE,
			})
			expect(listing(lot)).toEqual(before)
		})

	it('no folder word -> exit 2 and one usage line', () => {
		const lot = lotWithStory(SNAPSHOT_THEN_FIX)

		expect(
			runLot({
				cwd: lot.cwd,
				argv: ['verify', '--by', FIRST_VERIFIER, '--note', 'one-line fix'],
			}),
		).toEqual({ exitCode: 2, output: USAGE })
	})

	it('case 50: no round-<n>/ snapshot yet -> exit 2, nothing is late before the first snapshot, nothing written', () => {
		const lot = lotWithStory([{ edit: { [FIRST_EDITED_FILE]: SECOND_VERSION } }])
		const before = listing(lot)

		expect(
			runLot(verifyCall({ lot, extra: ['--by', FIRST_VERIFIER, '--note', 'one-line fix'] })),
		).toEqual({
			exitCode: 2,
			output: 'lot verify: nothing is late before the first snapshot',
		})
		expect(listing(lot)).toEqual(before)
		expect(verifyTextOf(lot)).toBeUndefined()
	})

	it('run outside any git work tree, the lot named by its folder -> exit 1 naming the work tree, nothing written', () => {
		const lot = lotWithStory(SNAPSHOT_THEN_FIX)
		const before = listing(lot)
		const cwd = temporaryFolder('dialecte-no-work-tree-')

		expect(
			runLot({
				cwd,
				argv: ['verify', lot.lotFolder, '--by', FIRST_VERIFIER, '--note', 'one-line fix'],
			}),
		).toEqual({
			exitCode: 1,
			output: `lot verify: ${cwd} is in no git work tree: run lot verify inside the lot's worktree`,
		})
		expect(listing(lot)).toEqual(before)
	})
})

describe(
	'lot verify - the work tree and the line limit (R1-8, R1-12)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('R1-8: run inside another git work tree than the lot worktree -> exit 2 naming both, nothing written', () => {
			const lot = lotWithStory(SNAPSHOT_THEN_FIX)
			const other = createScratchRepository()
			const before = listing(lot)

			const result = runLot({
				cwd: other,
				argv: ['verify', lot.lotFolder, '--by', FIRST_VERIFIER, '--note', 'one-line fix'],
				now: SNAPSHOT_TIME,
			})

			expect(result.exitCode).toBe(2)
			expect(result.output).toContain(realpathSync(other))
			expect(result.output).toContain(realpathSync(lot.worktree))
			expect(listing(lot)).toEqual(before)
			expect(verifyTextOf(lot)).toBeUndefined()
		})

		it('R1-12: a --note over the event line limit -> exit 1 with the over-limit message, nothing written', () => {
			const lot = lotWithStory(SNAPSHOT_THEN_FIX)
			const before = listing(lot)
			const note = 'n'.repeat(EVENT_LINE_LIMIT)
			const bytes = Buffer.byteLength(
				verifyLineOf({ by: FIRST_VERIFIER, note, state: computeStateHash(lot.cwd) }),
			)

			expect(runLot(verifyCall({ lot, extra: ['--by', FIRST_VERIFIER, '--note', note] }))).toEqual({
				exitCode: 1,
				output: `lot verify: ${overLimitMessage({ bytes, limit: EVENT_LINE_LIMIT })}`,
			})
			expect(listing(lot)).toEqual(before)
			expect(verifyTextOf(lot)).toBeUndefined()
		})
	},
)

describe('lot verify - the forbidden words (D3, case 51)', { timeout: STORE_CASE_TIMEOUT }, () => {
	type WordCase = {
		title: string
		source: 'git config' | 'user file'
		extra: string[]
		/** The option holding the word. */
		option: '--by' | '--note'
	}

	const WORD_CASES: WordCase[] = [
		{
			title: '--by holding a word of the git config list',
			source: 'git config',
			option: '--by',
			extra: ['--by', FIRST_WORD, '--note', 'one-line fix'],
		},
		{
			title: '--note holding a word of the git config list',
			source: 'git config',
			option: '--note',
			extra: ['--by', FIRST_VERIFIER, '--note', `needs ${FIRST_WORD} here`],
		},
		{
			title: '--by holding a word of the user file list',
			source: 'user file',
			option: '--by',
			extra: ['--by', FIRST_WORD, '--note', 'one-line fix'],
		},
		{
			title: '--note holding a word of the user file list, in capitals',
			source: 'user file',
			option: '--note',
			extra: ['--by', FIRST_VERIFIER, '--note', FIRST_WORD.toUpperCase()],
		},
	]

	for (const { title, source, option, extra } of WORD_CASES)
		it(`${title} -> exit 2, nothing written`, () => {
			const lot = lotWithStory(SNAPSHOT_THEN_FIX)
			configureMachine({ userFileLines: source === 'user file' ? [FIRST_WORD] : undefined })
			if (source === 'git config')
				git({ root: lot.cwd, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
			const before = listing(lot)

			expect(runLot(verifyCall({ lot, extra }))).toEqual({
				exitCode: 2,
				output: `lot verify: ${option} holds a forbidden word: nothing written`,
			})
			expect(listing(lot)).toEqual(before)
			expect(verifyTextOf(lot)).toBeUndefined()
		})
})

describe('lot verify - the order of the refusals (D26.6)', { timeout: STORE_CASE_TIMEOUT }, () => {
	type CombinedCase = {
		title: string
		/** The lot already holds a snapshot. */
		snapshot: boolean
		extra: string[]
		expected: { exitCode: 2; output: string }
	}

	const COMBINED_CASES: CombinedCase[] = [
		{
			title: '--by holding a forbidden word and no --note -> the usage line',
			snapshot: true,
			extra: ['--by', FIRST_WORD],
			expected: { exitCode: 2, output: USAGE },
		},
		{
			title: '--by holding a forbidden word on a lot with no snapshot -> the forbidden-word line',
			snapshot: false,
			extra: ['--by', FIRST_WORD, '--note', 'one-line fix'],
			expected: {
				exitCode: 2,
				output: 'lot verify: --by holds a forbidden word: nothing written',
			},
		},
		{
			title: 'no --note on a lot with no snapshot -> the usage line',
			snapshot: false,
			extra: ['--by', FIRST_VERIFIER],
			expected: { exitCode: 2, output: USAGE },
		},
	]

	for (const { title, snapshot, extra, expected } of COMBINED_CASES)
		it(`${title}, nothing written`, () => {
			const lot = lotWithStory(snapshot ? SNAPSHOT_THEN_FIX : [])
			configureMachine()
			git({ root: lot.cwd, args: ['config', 'dialecte.forbiddenWords', FIRST_WORD] })
			const before = listing(lot)

			expect(runLot(verifyCall({ lot, extra }))).toEqual(expected)
			expect(listing(lot)).toEqual(before)
		})
})
