/**
 * `gate --hook`'s design step (DESIGN-GATE section 3): first in a lot's own worktree, whatever `dialecte.gate.hook`
 * declares; a commit holding a production path fails while the design is missing, no declared step runs; a commit of
 * tests only passes; a merge commit skips it; outside a lot it gives no line.
 */
import {
	PRODUCTION_FILE,
	STORE_GLOB,
	STORE_NEED,
	TEST_FILE,
} from '../../test/design-workspace.constants.ts'
import { approvedDesign, gatedLot } from '../../test/design-workspace.ts'
import { runHookIn } from '../../test/gate-hook.ts'
import { countRuns } from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Stages `files` in `root`. */
function stage(params: { root: string; files: Record<string, string> }): void {
	writeFiles(params)
	git({ root: params.root, args: ['add', ...Object.keys(params.files)] })
}

describe('gate --hook - the design step', { timeout: 240_000 }, () => {
	it('a production commit of a lot whose design is missing -> FAIL design, no declared step', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB], hook: true })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toEqual({
			exitCode: 1,
			output: [
				`FAIL  design  missing (shared ${STORE_GLOB})`,
				'gate --hook: failed at design',
				'--- last lines of design ---',
				`dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>`,
			].join('\n'),
		})
		expect(countRuns(lot.counter)).toBe(0)
	})

	it('no dialecte.gate.hook declared -> the design step still runs first and fails', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/^FAIL {2}design {2}missing/),
		})
	})

	it('a commit of a test file only -> ok design, the declared step runs', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		stage({ root: lot.root, files: { [TEST_FILE]: 'export {}\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/^ok {4}design {2}no production path in the commit\n/),
		})
	})

	it('a production commit of a lot whose design is approved -> ok design approved by orchestrator', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/^ok {4}design {2}approved by orchestrator\n/),
		})
	})

	it('a merge commit -> skip design', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		git({ root: lot.root, args: ['checkout', '-q', '-b', 'side'] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })
		git({ root: lot.root, args: ['commit', '-qm', 'feat: side'] })
		git({ root: lot.root, args: ['checkout', '-q', '-'] })
		git({ root: lot.root, args: ['merge', '-q', '--no-ff', '--no-commit', 'side'] })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			output: expect.stringMatching(/^skip {2}design {2}a merge commit/),
		})
	})

	it('a package outside every lot -> no design line', async () => {
		const root = createVitestPackage({ dialecte: { risk: { high: [STORE_GLOB] } } })
		stage({ root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: root })).resolves.toMatchObject({
			output: expect.not.stringMatching(/design/),
		})
	})
})
