/**
 * `worktree prune` and a landed lot's package lot file: only `lot close` (and `lot prune` through it) archives a lot's
 * own lot files, so a worktree `worktree prune` reaches with a non-empty package lot file nothing archived is kept,
 * whatever the lot's records say.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	addOwnDeclaration,
	landingLotOf,
	registerLotEntry,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { commitIn } from '../../test/landing-repository.ts'
import { worktreeFatesOf } from '../../test/lot-keep-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

/** The package lot file's declaration. */
const PACKAGE_DECLARATION = '{ "tdd": "exempt: the ui package" }\n'

describe('worktree prune: a landed lot’s package lot file', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a landed, merged lot whose identity no longer reads and whose package lot file nothing archived → its worktree kept, naming the package lot file', async () => {
		const lot = landingLotOf()
		addOwnDeclaration(lot)
		const tip = commitIn({
			root: lot.worktree,
			files: { 'packages/ui/package.json': '{ "name": "ui" }\n' },
			message: 'feat(ui): the ui package',
		})
		mkdirSync(join(lot.worktree, 'packages', 'ui', '.dialecte'), { recursive: true })
		writeFileSync(
			join(lot.worktree, 'packages', 'ui', '.dialecte', 'lot.json'),
			PACKAGE_DECLARATION,
		)
		registerLotEntry({ lot })
		writeLandedFact({ lot, tip })
		git({ root: lot.repository.root, args: ['merge', '-q', '--ff-only', lot.branch] })
		chmodSync(join(lot.lotFolder, 'identity.json'), 0o644)
		writeFileSync(join(lot.lotFolder, 'identity.json'), '{ broken')

		const fates = await worktreeFatesOf(lot.workspace)

		expect(fates[lot.name]).toEqual(expect.stringContaining('packages/ui/.dialecte/lot.json'))
	})
})
