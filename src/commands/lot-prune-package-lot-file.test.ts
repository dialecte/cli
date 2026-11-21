/**
 * `lot prune --yes` and a package's lot file (CK-cli design 3.2.2, through `lot close`'s own rules): a landed lot's
 * `packages/ui/.dialecte/lot.json` is archived under `lots/packages/ui/` in its lot folder and the worktree removed;
 * one nothing can archive keeps the worktree, naming both package archives.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { addOwnDeclaration, landingLotOf, writeLandedFact } from '../../test/landing-lot.ts'
import { commitIn, mergeOnOrigin } from '../../test/landing-repository.ts'
import { lotPruneArgumentsOf, prunedItemsOf } from '../../test/lot-prune-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotPrune } from './lot-prune.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The package lot file's declaration. */
const PACKAGE_DECLARATION = '{ "tdd": "exempt: the ui package" }\n'

/** A package archive written before the prune, other bytes than the package lot file. */
const FIRST_DECLARATION = '{ "tdd": "exempt: the first ui archive" }\n'

/** Another landed package archive, other bytes than both. */
const OTHER_LANDED_DECLARATION = '{ "tdd": "exempt: another ui landed archive" }\n'

/** The package archives' folder below the lot folder. */
const PACKAGE_ARCHIVES = join('lots', 'packages', 'ui')

/**
 * A lot merged on origin (fast-forward) whose worktree tracks the package `packages/ui` and holds the root's
 * declaration with its lot link and the package's non-empty lot file; its landed fact at the merged tip.
 */
function mergedLotWithPackageLotFile(): LandingLot {
	const lot = landingLotOf()
	addOwnDeclaration(lot)
	const tip = commitIn({
		root: lot.worktree,
		files: { 'packages/ui/package.json': '{ "name": "ui" }\n' },
		message: 'feat(ui): the ui package',
	})
	mkdirSync(join(lot.worktree, 'packages', 'ui', '.dialecte'), { recursive: true })
	writeFileSync(join(lot.worktree, 'packages', 'ui', '.dialecte', 'lot.json'), PACKAGE_DECLARATION)
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip })
	return lot
}

/** The text of `path` below the lot folder; undefined when absent. */
function archiveIn(params: { lot: LandingLot; path: string }): string | undefined {
	const file = join(params.lot.lotFolder, params.path)
	return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

describe('lot prune --yes: a package’s lot file', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a landed lot whose package lot file is non-empty → archived as lots/packages/ui/lot.json, the worktree removed', () => {
		const lot = mergedLotWithPackageLotFile()

		const result = runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))

		expect({
			worktree: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
			package: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.json') }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			worktree: {
				decision: { go: true },
				outcome: { removed: expect.stringMatching(/\/\.worktrees\/_trash\//) },
			},
			package: PACKAGE_DECLARATION,
			worktreeLeft: false,
		})
	})

	it('both archives of the package holding other bytes → the worktree kept, both package archives named', () => {
		const lot = mergedLotWithPackageLotFile()
		mkdirSync(join(lot.lotFolder, PACKAGE_ARCHIVES), { recursive: true })
		writeFileSync(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.json'), FIRST_DECLARATION)
		writeFileSync(
			join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.landed.json'),
			OTHER_LANDED_DECLARATION,
		)

		const result = runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))

		const kept = JSON.stringify(
			prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
		)
		expect({
			namesFirst: kept.includes(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.json')),
			namesLanded: kept.includes(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.landed.json')),
			worktreeLeft: existsSync(lot.worktree),
			first: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.json') }),
			landed: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.landed.json') }),
		}).toEqual({
			namesFirst: true,
			namesLanded: true,
			worktreeLeft: true,
			first: FIRST_DECLARATION,
			landed: OTHER_LANDED_DECLARATION,
		})
	})

	it('lot prune without --yes on the same lot → the worktree planned to go, no package archive written', () => {
		const lot = mergedLotWithPackageLotFile()

		const result = runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name] }))

		expect({
			worktree: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
			packageArchives: existsSync(join(lot.lotFolder, PACKAGE_ARCHIVES)),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			worktree: { decision: { go: true } },
			packageArchives: false,
			worktreeLeft: true,
		})
	})
})
