/**
 * `lot close` and a package's lot file (CK-cli design 3.2.2, tests 31 and 32): a landed lot's
 * `packages/ui/.dialecte/lot.json` is archived by the one archive rule under `lots/packages/ui/` in the folder the
 * root `.dialecte/lot` link resolves to, before the worktree goes; one nothing can archive keeps the worktree.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { OWN_DECLARATION } from '../../test/landing-lot.constants.ts'
import {
	addOwnDeclaration,
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	registerCommittedHandover,
	registerLotEntry,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { commitIn, landingHostOf } from '../../test/landing-repository.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The package lot file's declaration: other bytes than the root's. */
const PACKAGE_DECLARATION = '{ "tdd": "exempt: the ui package" }\n'

/** A package archive written before the close, other bytes than the package lot file. */
const FIRST_DECLARATION = '{ "tdd": "exempt: the first ui archive" }\n'

/** Another landed package archive, other bytes than both. */
const OTHER_LANDED_DECLARATION = '{ "tdd": "exempt: another ui landed archive" }\n'

/** The package archives' folder below the lot folder. */
const PACKAGE_ARCHIVES = join('lots', 'packages', 'ui')

/** A landed lot to close, and the name the close takes: the lot's, or its committed hand-over's. */
type Closable = { lot: LandingLot; name: string }

/**
 * A landed lot whose worktree tracks the package `packages/ui` (committed on the lot's branch) and holds the root's
 * declaration with its lot link, and the package's non-empty lot file; its landed fact at the new tip in its lot
 * folder. Registered as a lot entry, or (`handover`) as a hand-over committed in a folder of its own, so the folder
 * the root link resolves to is not the entry's.
 */
function landedLotWithPackageLotFile(params: { handover?: boolean } = {}): Closable {
	const lot = landingLotOf()
	addOwnDeclaration(lot)
	const tip = commitIn({
		root: lot.worktree,
		files: { 'packages/ui/package.json': '{ "name": "ui" }\n' },
		message: 'feat(ui): the ui package',
	})
	mkdirSync(join(lot.worktree, 'packages', 'ui', '.dialecte'), { recursive: true })
	writeFileSync(join(lot.worktree, 'packages', 'ui', '.dialecte', 'lot.json'), PACKAGE_DECLARATION)
	const name = params.handover ? registerCommittedHandover(lot) : lot.name
	if (!params.handover) registerLotEntry({ lot })
	writeLandedFact({ lot, tip })
	return { lot, name }
}

/**
 * A landed lot whose base holds the package `packages/ui` (committed on main) and whose own commit deletes its
 * `package.json`, its non-empty lot file left in the worktree with the root's declaration and lot link; registered,
 * its landed fact at its tip.
 */
function landedLotDeletingPackage(): Closable {
	const first = landingLotOf()
	const root = first.workspace.repository
	const base = commitIn({
		root,
		files: { 'packages/ui/package.json': '{ "name": "ui" }\n' },
		message: 'feat(ui): the ui package',
	})
	const name = '0002-repo-drop-ui'
	const branch = 'feat/drop-ui'
	const path = join(first.workspace.workspace, '.worktrees', name)
	git({ root, args: ['worktree', 'add', '-q', '-b', branch, path, base] })
	const worktree = realpathSync(path)
	git({ root: worktree, args: ['rm', '-q', 'packages/ui/package.json'] })
	git({ root: worktree, args: ['commit', '-qm', 'refactor(ui): drop the ui package'] })
	const tip = git({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace: first.workspace,
			name,
			scope: ['packages/ui/package.json'],
			branch,
			worktree,
			repository: root,
			base: { ref: 'main', commit: base },
		}),
	)
	const lot: LandingLot = {
		...first,
		name,
		lotFolder,
		branch,
		worktree,
		tip,
		repository: { ...first.repository, worktree, branch, cut: base, tip },
	}
	mkdirSync(join(worktree, '.dialecte'), { recursive: true })
	writeFileSync(join(worktree, '.dialecte', 'lot.json'), OWN_DECLARATION)
	symlinkSync(lotFolder, join(worktree, '.dialecte', 'lot'))
	mkdirSync(join(worktree, 'packages', 'ui', '.dialecte'), { recursive: true })
	writeFileSync(join(worktree, 'packages', 'ui', '.dialecte', 'lot.json'), PACKAGE_DECLARATION)
	registerLotEntry({ lot })
	writeLandedFact({ lot, tip })
	return { lot, name }
}

/** `lot close <name> --json` from the main checkout, a host that knows no pull request. */
function close(closable: Closable) {
	return runLotClose(
		closeArgumentsOf({
			lot: closable.lot,
			names: [closable.name],
			host: landingHostOf({}).host,
		}),
	)
}

/** The text of `path` below the lot folder; undefined when absent. */
function archiveIn(params: { lot: LandingLot; path: string }): string | undefined {
	const file = join(params.lot.lotFolder, params.path)
	return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

describe('lot close: a package’s lot file', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a landed lot committed through a hand-over whose package lot file is non-empty → archived as lots/packages/ui/lot.json in the folder the root link resolves to, beside the root’s, then the worktree goes', () => {
		const closable = landedLotWithPackageLotFile({ handover: true })
		const { lot } = closable

		const result = close(closable)

		expect({
			closed: closeOutcomesOf(result).map((outcome) => outcome.closed),
			root: archiveIn({ lot, path: 'lot.json' }),
			package: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.json') }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			closed: [true],
			root: OWN_DECLARATION,
			package: PACKAGE_DECLARATION,
			worktreeLeft: false,
		})
	})

	it('the package’s lot.json archive already holding other bytes → lot.landed.json written beside it, the first byte-identical, the worktree goes', () => {
		const closable = landedLotWithPackageLotFile()
		const { lot } = closable
		mkdirSync(join(lot.lotFolder, PACKAGE_ARCHIVES), { recursive: true })
		writeFileSync(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.json'), FIRST_DECLARATION)

		const result = close(closable)

		expect({
			closed: closeOutcomesOf(result).map((outcome) => outcome.closed),
			first: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.json') }),
			landed: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.landed.json') }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			closed: [true],
			first: FIRST_DECLARATION,
			landed: PACKAGE_DECLARATION,
			worktreeLeft: false,
		})
	})

	it('both archives of the package holding other bytes → kept, both package archives named, nothing written', () => {
		const closable = landedLotWithPackageLotFile()
		const { lot } = closable
		mkdirSync(join(lot.lotFolder, PACKAGE_ARCHIVES), { recursive: true })
		writeFileSync(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.json'), FIRST_DECLARATION)
		writeFileSync(
			join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.landed.json'),
			OTHER_LANDED_DECLARATION,
		)

		const result = close(closable)

		const [outcome] = closeOutcomesOf(result)
		expect({
			closed: outcome.closed,
			namesFirst: outcome.kept?.includes(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.json')),
			namesLanded: outcome.kept?.includes(join(lot.lotFolder, PACKAGE_ARCHIVES, 'lot.landed.json')),
			worktreeLeft: existsSync(lot.worktree),
			first: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.json') }),
			landed: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.landed.json') }),
			root: archiveIn({ lot, path: 'lot.json' }),
		}).toEqual({
			closed: false,
			namesFirst: true,
			namesLanded: true,
			worktreeLeft: true,
			first: FIRST_DECLARATION,
			landed: OTHER_LANDED_DECLARATION,
			root: undefined,
		})
	})

	it('a landed lot that deleted the package, its lot file left → found through the lot base, archived as lots/packages/ui/lot.json, the worktree goes', () => {
		const closable = landedLotDeletingPackage()
		const { lot } = closable

		const result = close(closable)

		expect({
			closed: closeOutcomesOf(result).map((outcome) => outcome.closed),
			package: archiveIn({ lot, path: join(PACKAGE_ARCHIVES, 'lot.json') }),
			worktreeLeft: existsSync(lot.worktree),
		}).toEqual({
			closed: [true],
			package: PACKAGE_DECLARATION,
			worktreeLeft: false,
		})
	})
})
