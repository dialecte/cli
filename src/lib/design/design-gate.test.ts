/**
 * `designGateOf` (DESIGN-GATE section 3, DG2 plan section 6): the gate reads the shared areas of the base its run
 * resolved, through git, never the base recorded at the lot's start; the paths it holds the lot to are the caller's
 * and every path the change touches since the base; a refusing path without a worktree refuses.
 */
import { realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { OUTSIDE_GLOB, STORE_GLOB, STORE_NEED } from '../../../test/design-workspace.constants.ts'
import { approvedDesign, gatedLot } from '../../../test/design-workspace.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { designGateOf, ownLotFolderOf } from './design-gate.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GatedLot } from '../../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The package's `package.json` with its gate config and the given shared areas. */
function manifestOf(declared: readonly string[]): string {
	return `${JSON.stringify({ name: 'demo', type: 'module', dialecte: { risk: { high: declared } } })}\n`
}

/** Commits a `package.json` declaring `declared` in the lot's worktree; the commit. */
function commitDeclaring(params: { lot: GatedLot; declared: readonly string[] }): string {
	writeFileSync(join(params.lot.root, 'package.json'), manifestOf(params.declared))
	git({ root: params.lot.root, args: ['commit', '-qam', 'chore: declare'] })
	return git({ root: params.lot.root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The refusal `tdd red` prints for a missing design. */
function missingRefusal(params: { lot: GatedLot; reasons: string }): string {
	return `tdd red: lot ${params.lot.name} design missing (${params.reasons}): dialecte lot design ${params.lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${params.lot.name} --approve --by <who>; nothing run`
}

describe('designGateOf - the base and the paths', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a base the run resolved declaring an area after the lot started, its worktree file dropping it -> refused naming the area', () => {
		const lot = gatedLot({ declared: [] })
		const base = commitDeclaring({ lot, declared: [STORE_GLOB] })
		writeFileSync(join(lot.root, 'package.json'), manifestOf([]))

		expect(
			designGateOf({ lotFolder: lot.lotFolder, root: lot.root, base, verb: 'tddRed' }).refusal,
		).toBe(missingRefusal({ lot, reasons: `shared ${STORE_GLOB}` }))
	})

	it('a scope outside every shared area plus an edit inside one -> refused naming the area', () => {
		const lot = gatedLot({ declared: [OUTSIDE_GLOB] })
		writeFiles({ root: lot.root, files: { 'lib/core/x.ts': 'export const x = 1\n' } })
		const base = git({ root: lot.root, args: ['rev-parse', 'HEAD'] }).trim()

		expect(
			designGateOf({ lotFolder: lot.lotFolder, root: lot.root, base, verb: 'tddRed' }).refusal,
		).toBe(missingRefusal({ lot, reasons: `shared ${OUTSIDE_GLOB}` }))
	})

	it('a design approved for the need -> no refusal', () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })
		const base = git({ root: lot.root, args: ['rev-parse', 'HEAD'] }).trim()

		expect(
			designGateOf({ lotFolder: lot.lotFolder, root: lot.root, base, verb: 'tddRed' }).refusal,
		).toBeUndefined()
	})

	it('a worktree that is gone -> refused, the worktree named', () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		const base = git({ root: lot.root, args: ['rev-parse', 'HEAD'] }).trim()
		const gone = join(lot.root, 'gone')

		expect(designGateOf({ lotFolder: lot.lotFolder, root: gone, base, verb: 'land' }).refusal).toBe(
			`lot land: lot ${lot.name} has no worktree at ${gone}: the design gate reads its base there; nothing pushed`,
		)
	})
})

describe('ownLotFolderOf', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("in the lot's own worktree -> the lot folder; beside it -> none", () => {
		const lot = gatedLot({ declared: [] })

		expect([
			ownLotFolderOf({ cwd: join(lot.root, 'src') }),
			ownLotFolderOf({ cwd: realpathSync(dirname(lot.root)) }),
		]).toEqual([lot.lotFolder, undefined])
	})
})
