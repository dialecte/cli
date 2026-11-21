/**
 * `gate --hook`'s design step (DESIGN-GATE section 3): first in a lot's own worktree, whatever `dialecte.gate.hook`
 * declares; a commit holding a production path fails while the design is missing, no declared step runs; a commit of
 * tests only passes; a merge commit skips it; outside a lot it gives no line.
 */
import { join } from 'node:path'

import {
	PRODUCTION_FILE,
	STORE_GLOB,
	STORE_NEED,
	TEST_FILE,
} from '../../test/design-workspace.constants.ts'
import { approvedDesign, gatedLot } from '../../test/design-workspace.ts'
import { runHookIn } from '../../test/gate-hook.ts'
import { countRuns } from '../../test/scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { eventsOfStep, partsOf } from '../../test/step-events-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runGate } from './gate.ts'

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
	it('a production commit of a lot whose design is missing -> ok scope, then FAIL design, no declared step', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB], hook: true })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toEqual({
			exitCode: 1,
			output: [
				'ok    scope  1 path(s) inside the scope',
				`FAIL  design  missing (shared ${STORE_GLOB})`,
				'gate --hook: failed at design',
				'--- last lines of design ---',
				`dialecte lot design ${lot.name} --from <DESIGN.md>, then approve it from the main checkout: dialecte lot design ${lot.name} --approve --by <who>`,
			].join('\n'),
		})
		expect(countRuns(lot.counter)).toBe(0)
	})

	it('no dialecte.gate.hook declared -> the scope step passes, then the design step runs and fails', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(
				/^ok {4}scope {2}1 path\(s\) inside the scope\nFAIL {2}design {2}missing/,
			),
		})
	})

	it('a commit of a test file only -> ok scope, then ok design, the declared step runs', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		stage({ root: lot.root, files: { [TEST_FILE]: 'export {}\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(
				/^ok {4}scope {2}1 path\(s\) inside the scope\nok {4}design {2}no production path in the commit\n/,
			),
		})
	})

	it('a production commit of a lot whose design is approved -> ok scope, then ok design approved by orchestrator', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(
				/^ok {4}scope {2}1 path\(s\) inside the scope\nok {4}design {2}approved by orchestrator\n/,
			),
		})
	})

	it('a merge commit -> skip scope, then skip design', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		git({ root: lot.root, args: ['checkout', '-q', '-b', 'side'] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })
		git({ root: lot.root, args: ['commit', '-qm', 'feat: side'] })
		git({ root: lot.root, args: ['checkout', '-q', '-'] })
		git({ root: lot.root, args: ['merge', '-q', '--no-ff', '--no-commit', 'side'] })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			output: expect.stringMatching(/^skip {2}scope {2}\S.*\nskip {2}design {2}a merge commit/),
		})
	})

	it('a package outside every lot -> no design line', async () => {
		const root = createVitestPackage({ dialecte: { risk: { high: [STORE_GLOB] } } })
		stage({ root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: root })).resolves.toMatchObject({
			output: expect.not.stringMatching(/design/),
		})
	})

	it('a first commit of the lot branch -> skip scope, then skip design', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		git({ root: lot.root, args: ['update-ref', '-d', 'HEAD'] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			output: expect.stringMatching(/^skip {2}scope {2}\S.*\nskip {2}design {2}a first commit/),
		})
	})

	it('a review throwaway, on its own branch <lot branch>-round-<n> -> skip scope, then skip design', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		const throwaway = join(temporaryFolder('design-throwaway-'), `${lot.name}-round-1`)
		git({ root: lot.root, args: ['worktree', 'add', '-q', '-b', 'main-round-1', throwaway] })
		stage({ root: throwaway, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: throwaway })).resolves.toMatchObject({
			output: expect.stringMatching(/^skip {2}scope {2}\S.*\nskip {2}design {2}a review throwaway/),
		})
	})

	it('a design approved before the need rose -> FAIL design not approved, naming the new reasons', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: [] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: lot.root })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining(`FAIL  design  not approved (shared ${STORE_GLOB})\n`),
		})
	})

	it("the lot's branch committed from another worktree -> ok scope, then FAIL design all the same", async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		git({ root: lot.root, args: ['checkout', '-q', '-b', 'parking'] })
		const other = join(temporaryFolder('design-other-'), 'other')
		git({ root: lot.root, args: ['worktree', 'add', '-q', other, 'main'] })
		stage({ root: other, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })

		await expect(runHookIn({ cwd: other })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(
				/^ok {4}scope {2}1 path\(s\) inside the scope\nFAIL {2}design {2}missing/,
			),
		})
	})

	it("a refused design -> the lot's events hold a gate-hook start and end with the scope part passed, the design part failed", async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		stage({ root: lot.root, files: { [PRODUCTION_FILE]: 'export const one = 1\n' } })
		await runHookIn({ cwd: lot.root })
		const events = eventsOfStep({
			lot: { eventsFile: join(lot.lotFolder, STORE_FILES.events) },
			step: 'gate-hook',
		})

		expect({
			kinds: events.map(function kindOf(event) {
				return event.kind
			}),
			parts: partsOf(events[1]).map(function nameAndStatus(part) {
				return [part.name, part.status]
			}),
		}).toEqual({
			kinds: ['step.start', 'step.end'],
			parts: [
				['scope', 'passed'],
				['design', 'failed'],
			],
		})
	})

	it('a green --full then a hook of the same tree -> reuse whole: the scope and design parts run, never counted for reuse', async () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })
		await runGate({ cwd: lot.root, argv: ['--full'] })
		await runHookIn({ cwd: lot.root })
		const end = eventsOfStep({
			lot: { eventsFile: join(lot.lotFolder, STORE_FILES.events) },
			step: 'gate-hook',
		}).at(-1)

		expect({
			reuse: end?.reuse,
			parts: partsOf(end).map(function nameAndDuration(part) {
				return [part.name, typeof part.durationMs]
			}),
		}).toEqual({
			reuse: 'whole',
			parts: [
				['scope', 'number'],
				['design', 'number'],
				['check', 'number'],
			],
		})
	})
})
