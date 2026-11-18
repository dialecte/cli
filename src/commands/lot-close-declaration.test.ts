/**
 * `lot close` and the lot's own declaration (`.dialecte/lot.json`, DESIGN 3.6 and rev 5.1): a canceled or landed lot's
 * declaration is archived into its lot folder by the one archive rule (`archiveDecision`: `lot.json`, then
 * `lot.landed.json` beside one holding other bytes, never over an archive) before its worktree goes; its landed fact
 * is read from the folder its `.dialecte/lot` link resolves to; a declaration nothing can archive, or one of another
 * lot, keeps the worktree.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { OWN_DECLARATION } from '../../test/landing-lot.constants.ts'
import {
	addLandingLot,
	addOwnDeclaration,
	cancelLot,
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	registerCommittedHandover,
	registerLotEntry,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { landingHostOf } from '../../test/landing-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A declaration the hand-over archived first, before the lot was edited again. */
const FIRST_DECLARATION = '{ "tdd": "exempt: the first archive" }\n'

/** A declaration another close archived as the landed one, other bytes than the worktree's. */
const OTHER_LANDED_DECLARATION = '{ "tdd": "exempt: another landed archive" }\n'

/** `lot close <names> --json` from the main checkout, a host that knows no pull request. */
function close(params: { lot: LandingLot; names: string[] }) {
	return runLotClose(
		closeArgumentsOf({ lot: params.lot, names: params.names, host: landingHostOf({}).host }),
	)
}

/** The landed line a landed lot's outcome carries; none for a canceled lot (nothing of it lands). */
function landedLine(lot: LandingLot): { landed?: unknown } {
	return existsSync(join(lot.lotFolder, 'landed.json'))
		? { landed: expect.stringContaining('landed on main') }
		: {}
}

/** The text of `name` in the lot folder; undefined when absent. */
function archiveIn(params: { lot: LandingLot; name: string }): string | undefined {
	const path = join(params.lot.lotFolder, params.name)
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

describe('lot close: the lot’s own declaration', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a canceled lot with a non-empty declaration → archived into the lot folder as lot.json, then the worktree goes', () => {
		const lot = landingLotOf()
		addOwnDeclaration(lot)
		cancelLot(lot)

		const result = close({ lot, names: [lot.name] })

		expect({
			outcomes: closeOutcomesOf(result),
			archived: archiveIn({ lot, name: 'lot.json' }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			outcomes: [{ closed: true, ...landedLine(lot) }],
			archived: OWN_DECLARATION,
			worktreeLeft: false,
		})
	})

	it('a lot committed through a hand-over whose folder holds no landed fact, its lot folder holding one → read through its lot link, archived there, the worktree closes', () => {
		const lot = landingLotOf()
		addOwnDeclaration(lot)
		const handover = registerCommittedHandover(lot)
		writeLandedFact({ lot, tip: lot.tip })

		const result = close({ lot, names: [handover] })

		expect({
			outcomes: closeOutcomesOf(result),
			archived: archiveIn({ lot, name: 'lot.json' }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			outcomes: [{ closed: true, ...landedLine(lot) }],
			archived: OWN_DECLARATION,
			worktreeLeft: false,
		})
	})

	it('a declaration rewritten after the hand-over archived it → archived as lot.landed.json beside the first, the first byte-identical, the worktree closes', () => {
		const lot = landingLotOf()
		addOwnDeclaration(lot)
		registerLotEntry({ lot })
		writeLandedFact({ lot, tip: lot.tip })
		writeFileSync(join(lot.lotFolder, 'lot.json'), FIRST_DECLARATION)

		const result = close({ lot, names: [lot.name] })

		expect({
			outcomes: closeOutcomesOf(result),
			first: archiveIn({ lot, name: 'lot.json' }),
			landed: archiveIn({ lot, name: 'lot.landed.json' }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			outcomes: [{ closed: true, ...landedLine(lot) }],
			first: FIRST_DECLARATION,
			landed: OWN_DECLARATION,
			worktreeLeft: false,
		})
	})

	it('both archives already holding other bytes → kept, both archives named, nothing moved', () => {
		const lot = landingLotOf()
		addOwnDeclaration(lot)
		registerLotEntry({ lot })
		writeLandedFact({ lot, tip: lot.tip })
		writeFileSync(join(lot.lotFolder, 'lot.json'), FIRST_DECLARATION)
		writeFileSync(join(lot.lotFolder, 'lot.landed.json'), OTHER_LANDED_DECLARATION)

		const result = close({ lot, names: [lot.name] })

		const [outcome] = closeOutcomesOf(result)
		expect({
			closed: outcome.closed,
			namesFirst: outcome.kept?.includes(join(lot.lotFolder, 'lot.json')),
			namesLanded: outcome.kept?.includes(join(lot.lotFolder, 'lot.landed.json')),
			worktreeLeft: existsSync(lot.worktree),
			first: archiveIn({ lot, name: 'lot.json' }),
			landed: archiveIn({ lot, name: 'lot.landed.json' }),
		}).toEqual({
			closed: false,
			namesFirst: true,
			namesLanded: true,
			worktreeLeft: true,
			first: FIRST_DECLARATION,
			landed: OTHER_LANDED_DECLARATION,
		})
	})

	it('a lot link naming another lot (new work started in the worktree) → kept for .dialecte/lot.json, nothing archived', () => {
		const lot = landingLotOf()
		const other = addLandingLot({ lot, name: '0002-repo-y', branch: 'feat/y' })
		mkdirSync(join(lot.worktree, '.dialecte'), { recursive: true })
		writeFileSync(join(lot.worktree, '.dialecte', 'lot.json'), OWN_DECLARATION)
		rmSync(join(lot.worktree, '.dialecte', 'lot'), { force: true })
		symlinkSync(other.lotFolder, join(lot.worktree, '.dialecte', 'lot'))
		registerLotEntry({ lot })
		writeLandedFact({ lot, tip: lot.tip })

		const result = close({ lot, names: [lot.name] })

		expect({
			outcomes: closeOutcomesOf(result),
			worktreeLeft: existsSync(lot.worktree),
			archived: archiveIn({ lot, name: 'lot.json' }),
		}).toEqual({
			outcomes: [
				{ closed: false, kept: expect.stringContaining('.dialecte/lot.json'), ...landedLine(lot) },
			],
			worktreeLeft: true,
			archived: undefined,
		})
	})
})
