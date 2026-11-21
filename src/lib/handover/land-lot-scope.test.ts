/**
 * `lot land` and the lot's scope (SAFE 3.4, 5.4): the lot's committed work (its base..HEAD) is held to its effective
 * scope before anything is written: a path outside refuses (exit 1) with no entry registered, no rebase, nothing pushed
 * and no pull request; the scope line comes before the design hold; work in progress is not held.
 */
import { changeRequestUrlOf, parentChangeRequest, recordingHost } from '../../../test/land-lot.ts'
import { addStackedLot, lotEntryStateOf } from '../../../test/landing-lot.ts'
import { commitIn, headOf } from '../../../test/landing-repository.ts'
import { addToScope, scopeGuardLotOf } from '../../../test/scope-guard-lot.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { landLot } from './land-lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecordingHost } from '../../../test/land-lot.types.ts'
import type { LandingLot } from '../../../test/landing-lot.types.ts'
import type { TddBase } from '../tdd/tdd.types.ts'

/** Whether the lot base reads as HEAD itself (no base branch found, none configured) for the next landing. */
const headBase = { on: false }

vi.mock('../tdd/tdd-base.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../tdd/tdd-base.ts')>()
	return {
		...actual,
		resolveTddBase: vi.fn(function baseOf(
			params: Parameters<typeof actual.resolveTddBase>[0],
		): TddBase | { failure: string } {
			const base = actual.resolveTddBase(params)
			if (!headBase.on || 'failure' in base) return base
			return { commit: headOf(params.root), kind: 'head', source: 'HEAD' }
		}),
	}
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
	headBase.on = false
})

const NOW = new Date('2026-11-21T12:00:00.000Z')

/** `lot land` of the lot through `host`. */
function land(params: { lot: LandingLot; host: RecordingHost }) {
	const { lot } = params
	return landLot({
		lot: lot.name,
		worktree: lot.worktree,
		branch: lot.branch,
		base: 'main',
		lotFolder: lot.lotFolder,
		host: params.host.host,
		now: NOW,
	})
}

/** Whether origin holds the lot's branch. */
function pushed(lot: LandingLot): boolean {
	return git({
		root: lot.repository.root,
		args: ['ls-remote', '--heads', lot.repository.origin],
	}).includes(`refs/heads/${lot.branch}`)
}

/** The lot's committed work leaves its scope: `src/out.ts` committed on its branch. */
function commitOutside(lot: LandingLot): void {
	commitIn({
		root: lot.worktree,
		files: { 'src/out.ts': 'export const out = 1\n' },
		message: 'feat: out',
	})
}

describe('lot land - the scope hold', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it('committed work holding a path outside the scope -> refused, exit 1: no entry, no rebase, nothing pushed, no pull request', () => {
		const lot = scopeGuardLotOf()
		commitOutside(lot)
		const head = headOf(lot.worktree)
		const host = recordingHost()

		expect(land({ lot, host })).toEqual({
			exitCode: 1,
			lines: expect.arrayContaining([
				expect.stringContaining(`1 path(s) outside lot ${lot.name}'s scope: src/out.ts`),
				expect.stringContaining(
					`dialecte lot scope ${lot.name} --add 'src/out.ts' --by lot-session --reason "<why>"`,
				),
			]),
		})
		expect({
			entry: lotEntryStateOf(lot),
			head: headOf(lot.worktree),
			pushed: pushed(lot),
			opened: host.calls.filter((call) => call.startsWith('open ')),
		}).toEqual({ entry: undefined, head, pushed: false, opened: [] })
	})

	it('a lot base that reads as HEAD itself (no base branch) -> refused, exit 1: no base to check the scope against, nothing pushed', () => {
		const lot = scopeGuardLotOf()
		commitOutside(lot)
		headBase.on = true
		const host = recordingHost()

		expect(land({ lot, host })).toEqual({
			exitCode: 1,
			lines: expect.arrayContaining([
				expect.stringContaining('no base to check the scope against'),
			]),
		})
		expect(pushed(lot)).toBe(false)
	})

	it('outside its scope and with a design missing -> the scope line comes first', () => {
		const lot = scopeGuardLotOf({ dialecte: { risk: { high: ['src/**'] } } })
		commitOutside(lot)

		expect(
			[land({ lot, host: recordingHost() })].map(function firstLine(result) {
				return { exitCode: result.exitCode, first: result.lines[0] }
			})[0],
		).toEqual({
			exitCode: 1,
			first: expect.stringContaining(`1 path(s) outside lot ${lot.name}'s scope: src/out.ts`),
		})
	})
})

describe(
	'lot land - what the scope hold lets land (kept as today)',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('the path added with lot scope --add -> lands', () => {
			const lot = scopeGuardLotOf()
			commitOutside(lot)
			addToScope({ lot, path: 'src/out.ts' })

			expect(land({ lot, host: recordingHost() }).exitCode).toBe(0)
			expect(pushed(lot)).toBe(true)
		})

		it('an uncommitted file outside the scope -> no refusal, lands', () => {
			const lot = scopeGuardLotOf()
			writeFiles({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } })

			expect(land({ lot, host: recordingHost() }).exitCode).toBe(0)
			expect(pushed(lot)).toBe(true)
		})

		it("a lot stacked on an open parent -> lands without the parent's paths", () => {
			const parent = scopeGuardLotOf()
			const child = addStackedLot({ lot: parent, name: '0002-repo-child', branch: 'feat/child' })
			const parentLanded = land({ lot: parent, host: recordingHost() })
			if (parentLanded.exitCode !== 0) throw new Error(parentLanded.lines.join('\n'))
			// the parent's pull request as the host holds it: the number its landing recorded, open
			const host = recordingHost({
				stacks: true,
				parent: { ...parentChangeRequest(), number: 7, url: changeRequestUrlOf(7) },
				parentBranch: parent.branch,
			})

			expect(land({ lot: child, host })).toMatchObject({ exitCode: 0 })
			expect(pushed(child)).toBe(true)
		})
	},
)
