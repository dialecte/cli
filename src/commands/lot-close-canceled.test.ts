/**
 * `lot close` on lot-shaped targets (DESIGN 3.6): a lot id closes the lot's worktree from its own landing, settled
 * once, with no registry entry needed and none created; a canceled lot closes; an open one is kept with its state; an
 * unknown argument no longer stops the others; a second close of a lot whose worktree went answers by its records.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { LANDING_NOW } from '../../test/landing-lot.constants.ts'
import {
	addLandingLot,
	cancelLot,
	cardsLogOf,
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	lotBranchTipOf,
	lotEntryStateOf,
	registerLotEntry,
} from '../../test/landing-lot.ts'
import { commitDetached, landingHostOf, mergeOnOrigin } from '../../test/landing-repository.ts'
import { writeHookRecordAtHead } from '../../test/lot-close-final-record.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writeRemoved, writeRemoving } from '../lib/events/cards-log.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot close <names> --json` from the main checkout, a host that knows no pull request. */
function close(params: { lot: LandingLot; names: string[] }) {
	return runLotClose(
		closeArgumentsOf({ lot: params.lot, names: params.names, host: landingHostOf({}).host }),
	)
}

/** The `card` lines of the lot's `cards.log`, as written. */
function cardLinesOf(lot: LandingLot): Record<string, unknown>[] {
	const file = cardsLogOf(lot)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((line) => line.kind === 'card')
}

describe('lot close: lot-shaped targets', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot canceled while working, no registry entry → its clean worktree closed, a card line with the lot and no name, no registry entry created', () => {
		const lot = landingLotOf()
		cancelLot(lot)

		const result = close({ lot, names: [lot.name] })

		expect({
			exitCode: result.exitCode,
			outcomes: closeOutcomesOf(result),
			worktreeLeft: existsSync(lot.worktree),
			entry: lotEntryStateOf(lot),
			cards: cardLinesOf(lot).map((card) => ({
				lot: card.lot,
				name: card.name,
				state: card.state,
				head: card.head,
				card: card.card,
				by: card.by,
			})),
		}).toEqual({
			exitCode: 0,
			outcomes: [{ closed: true }],
			worktreeLeft: false,
			entry: undefined,
			cards: [
				{
					lot: lot.name,
					name: null,
					state: 'canceled',
					head: lot.tip,
					card: null,
					by: 'lot-close',
				},
			],
		})
	})

	it('a merged lot with no registry entry → closed as a lot target, no registry entry created', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })

		const result = close({ lot, names: [lot.name] })

		expect({
			outcomes: closeOutcomesOf(result),
			worktreeLeft: existsSync(lot.worktree),
			entry: lotEntryStateOf(lot),
			cards: cardLinesOf(lot).map((card) => ({
				lot: card.lot,
				name: card.name,
				state: card.state,
				head: card.head,
				recomputed: card.recomputed,
			})),
		}).toEqual({
			outcomes: [{ closed: true, landed: expect.stringContaining('landed on main') }],
			worktreeLeft: false,
			entry: undefined,
			cards: [{ lot: lot.name, name: null, state: 'committed', head: lot.tip, recomputed: true }],
		})
	})

	it('a committed, never-pushed hand-over lot closed by its id → its worktree closed, its branch untouched', () => {
		const lot = landingLotOf()
		registerLotEntry({ lot })
		// the hand-over's commit ran the hook: its record names the lot's commit
		writeHookRecordAtHead(lot.worktree)

		const result = close({ lot, names: [lot.name] })

		expect({
			outcomes: closeOutcomesOf(result),
			worktreeLeft: existsSync(lot.worktree),
			branch: lotBranchTipOf(lot),
		}).toEqual({ outcomes: [{ closed: true }], worktreeLeft: false, branch: lot.tip })
	})

	it('an open lot closed by its id → kept, lot <name> working, nothing moved', () => {
		const lot = landingLotOf()

		const result = close({ lot, names: [lot.name] })

		expect({
			exitCode: result.exitCode,
			outcomes: closeOutcomesOf(result),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			exitCode: 1,
			outcomes: [
				{ closed: false, kept: `lot ${lot.name} working: not landed: its work is not in main` },
			],
			worktreeLeft: true,
		})
	})

	it('a known lot, an unknown name and another known lot → both known ones closed, the unknown one listed, exit 2', () => {
		const first = landingLotOf()
		const second = addLandingLot({ lot: first, name: '0002-repo-y', branch: 'feat/y' })
		cancelLot(first)
		cancelLot(second)

		const result = close({ lot: first, names: [first.name, 'no-such-lot', second.name] })

		expect({
			exitCode: result.exitCode,
			outcomes: closeOutcomesOf(result),
			left: [existsSync(first.worktree), existsSync(second.worktree)],
		}).toEqual({
			exitCode: 2,
			outcomes: [
				{ closed: true },
				{ closed: false, kept: expect.stringContaining('no-such-lot') },
				{ closed: true },
			],
			left: [false, false],
		})
	})

	it('a second lot close of a lot whose worktree went → already closed, exit 0', () => {
		const lot = landingLotOf()
		cancelLot(lot)
		expect(close({ lot, names: [lot.name] }).exitCode).toBe(0)

		const again = close({ lot, names: [lot.name] })

		expect({ exitCode: again.exitCode, outcomes: closeOutcomesOf(again) }).toEqual({
			exitCode: 0,
			outcomes: [{ closed: true, already: true }],
		})
	})

	it('a lot whose worktree was removed by hand after a removal recorded kept → nothing to close, exit 1', () => {
		const lot = landingLotOf()
		cancelLot(lot)
		const file = cardsLogOf(lot)
		mkdirSync(dirname(file), { recursive: true })
		writeRemoving({
			file,
			line: {
				id: 'r1',
				at: LANDING_NOW.toISOString(),
				lot: lot.name,
				item: 'worktree',
				path: lot.worktree,
				branch: lot.branch,
				tip: lot.tip,
				records: null,
				by: 'lot-close',
			},
		})
		writeRemoved({
			file,
			line: { id: 'r1', at: LANDING_NOW.toISOString(), outcome: 'kept', reason: 'dirty' },
		})
		git({
			root: lot.workspace.repository,
			args: ['worktree', 'remove', '--force', lot.worktree],
		})

		const result = close({ lot, names: [lot.name] })

		expect({ exitCode: result.exitCode, outcomes: closeOutcomesOf(result) }).toEqual({
			exitCode: 1,
			outcomes: [{ closed: false, kept: expect.stringContaining('nothing to close') }],
		})
	})

	it('a lot whose worktree went by a removal recorded without its lot (a hand-over outside the store), joined by the worktree’s path → already closed, exit 0', () => {
		const lot = landingLotOf()
		cancelLot(lot)
		const file = cardsLogOf(lot)
		mkdirSync(dirname(file), { recursive: true })
		writeRemoving({
			file,
			line: {
				id: 'r2',
				at: LANDING_NOW.toISOString(),
				lot: null,
				item: 'worktree',
				path: lot.worktree,
				branch: lot.branch,
				tip: lot.tip,
				records: null,
				by: 'lot-close',
			},
		})
		writeRemoved({
			file,
			line: { id: 'r2', at: LANDING_NOW.toISOString(), outcome: 'trashed', trashed: lot.worktree },
		})
		git({
			root: lot.workspace.repository,
			args: ['worktree', 'remove', '--force', lot.worktree],
		})

		const result = close({ lot, names: [lot.name] })

		expect({ exitCode: result.exitCode, outcomes: closeOutcomesOf(result) }).toEqual({
			exitCode: 0,
			outcomes: [{ closed: true, already: true }],
		})
	})

	it('a canceled lot whose worktree made a commit on a detached HEAD, then went back to its branch → kept, the commit named and still in the repository', () => {
		const lot = landingLotOf()
		const detached = commitDetached({
			worktree: lot.worktree,
			files: { 'src/detached.ts': 'export const detached = 1\n' },
			reattach: true,
		})
		cancelLot(lot)

		const result = close({ lot, names: [lot.name] })

		expect({
			outcomes: closeOutcomesOf(result),
			worktreeLeft: existsSync(lot.worktree),
			commitHeld: git({
				root: lot.workspace.repository,
				args: ['cat-file', '-t', detached],
			}).trim(),
		}).toEqual({
			outcomes: [{ closed: false, kept: expect.stringContaining(detached.slice(0, 12)) }],
			worktreeLeft: true,
			commitHeld: 'commit',
		})
	})
})
