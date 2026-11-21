/**
 * `gate --hook`'s scope step (SAFE 3.3, 5.3): first, before the design step, on a commit of a lot's branch; it holds
 * the lot's whole work up to the commit (the lot base against the index tree) to the lot's effective scope. A path
 * outside fails the commit naming it and the add to run, no other step runs; a throwaway, a terminal or simulated lot
 * and a merge in progress skip it; a damaged lot or a base that cannot be read fail it; the main checkout and a
 * rehearsal clone give no scope line.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { runHookIn } from '../../test/gate-hook.ts'
import { addRoundOf, addStackedLot, cancelLot } from '../../test/landing-lot.ts'
import {
	addToScope,
	commitSideBranch,
	damageBrief,
	manifestOf,
	rehearsalCloneOf,
	scopeGuardLotOf,
	stageIn,
} from '../../test/scope-guard-lot.ts'
import { countRuns } from '../../test/scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { eventsOfStep, partsOf } from '../../test/step-events-lot.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScopeGuardLot } from '../../test/scope-guard-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * A hook run read for its scope step: its exit, its first line, its scope lines, the adds it names, its design lines
 * and the line naming the step it failed at.
 */
function scopeViewOf(result: CommandResult): {
	exitCode: number
	first: string
	scope: string[]
	adds: string[]
	design: string[]
	failedAt: string[]
} {
	const lines = result.output.split('\n')
	return {
		exitCode: result.exitCode,
		first: lines[0] ?? '',
		scope: lines.filter((line) => /^(ok|skip|FAIL) +scope /.test(line)),
		adds: lines.filter((line) => line.includes('dialecte lot scope')),
		design: lines.filter((line) => /^(ok|skip|FAIL) +design /.test(line)),
		failedAt: lines.filter((line) => line.startsWith('gate --hook: failed at')),
	}
}

/** `gate --hook` in `cwd`, read for its scope step. */
function hookScopeIn(cwd: string): Promise<ReturnType<typeof scopeViewOf>> {
	return runHookIn({ cwd }).then(scopeViewOf)
}

/**
 * The refusal of `paths` outside the lot's scope, as the hook prints it: its scope line first, its add, no design line
 * (no other step runs), the run failed at scope.
 */
function refusedView(params: { lot: ScopeGuardLot; paths: string[] }) {
	const { lot, paths } = params
	const adds = paths.map((path) => `--add '${path}'`).join(' ')
	return {
		exitCode: 1,
		first: `FAIL  scope  ${paths.length} path(s) outside lot ${lot.name}'s scope: ${paths.join(', ')}`,
		scope: [
			`FAIL  scope  ${paths.length} path(s) outside lot ${lot.name}'s scope: ${paths.join(', ')}`,
		],
		adds: [
			expect.stringContaining(
				`dialecte lot scope ${lot.name} ${adds} --by lot-session --reason "<why>"`,
			),
		],
		design: [],
		failedAt: ['gate --hook: failed at scope'],
	}
}

describe('gate --hook - the scope step on a lot branch', { timeout: 240_000 }, () => {
	/** A change on the lot's branch that leaves its scope, and the paths the refusal names. */
	type RefusedRow = {
		title: string
		lot: () => ScopeGuardLot
		change: (lot: ScopeGuardLot) => void
		paths: string[]
	}

	const REFUSED: RefusedRow[] = [
		{
			title:
				'a .dialecte/ folder that is no package root, staged -> FAIL scope naming it: only the root and package records are left out',
			lot: () => scopeGuardLotOf(),
			change: (lot) =>
				stageIn({
					root: lot.worktree,
					files: { 'lib/.dialecte/payload.ts': 'export const payload = 1\n' },
				}),
			paths: ['lib/.dialecte/payload.ts'],
		},
		{
			title:
				'a file outside the scope staged -> FAIL scope naming it and its add, no other step runs',
			lot: () => scopeGuardLotOf(),
			change: (lot) =>
				stageIn({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } }),
			paths: ['src/out.ts'],
		},
		{
			title: 'a staged deletion of a file outside the scope -> FAIL scope naming it',
			lot: () => scopeGuardLotOf(),
			change: (lot) => git({ root: lot.worktree, args: ['rm', '-q', 'src/legacy.ts'] }),
			paths: ['src/legacy.ts'],
		},
		{
			title: 'git mv of an inside file to an outside path -> FAIL scope naming the new path',
			lot: () => scopeGuardLotOf(),
			change: (lot) => git({ root: lot.worktree, args: ['mv', 'src/in.ts', 'src/out.ts'] }),
			paths: ['src/out.ts'],
		},
		{
			title: 'git mv of an outside file to an inside path -> FAIL scope naming the old side',
			lot: () => scopeGuardLotOf(),
			change: function moveInside(lot) {
				mkdirSync(join(lot.worktree, 'src', 'in'))
				git({ root: lot.worktree, args: ['mv', 'src/legacy.ts', 'src/in/legacy.ts'] })
			},
			paths: ['src/legacy.ts'],
		},
		{
			title:
				'a file committed earlier outside the scope with the hook skipped -> the next commit, inside the scope, fails naming it',
			lot: () => scopeGuardLotOf(),
			change: function commitOutsideThenInside(lot) {
				writeFiles({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } })
				git({ root: lot.worktree, args: ['add', 'src/out.ts'] })
				git({ root: lot.worktree, args: ['commit', '-q', '--no-verify', '-m', 'feat: out'] })
				stageIn({ root: lot.worktree, files: { 'src/in/a.ts': 'export const a = 1\n' } })
			},
			paths: ['src/out.ts'],
		},
		{
			title:
				"a merge of a sibling branch (not the base) -> the next commit names that branch's paths",
			lot: () => scopeGuardLotOf(),
			change: function mergeSibling(lot) {
				commitSideBranch({
					lot,
					branch: 'feat/side',
					files: { 'lib/side.ts': 'export const s = 1\n' },
				})
				git({
					root: lot.worktree,
					args: ['merge', '-q', '--no-ff', '--no-verify', '-m', 'merge side', 'feat/side'],
				})
				stageIn({ root: lot.worktree, files: { 'src/in/a.ts': 'export const a = 1\n' } })
			},
			paths: ['lib/side.ts'],
		},
		{
			title: 'a release lot deleting a fragment its brief does not list -> FAIL scope naming it',
			lot: releaseLotOf,
			change: (lot) =>
				git({ root: lot.worktree, args: ['rm', '-q', 'changes/a.md', 'changes/b.md'] }),
			paths: ['changes/b.md'],
		},
		{
			title: 'a regenerated command page the brief does not list -> FAIL scope with its add',
			lot: () => scopeGuardLotOf(),
			change: (lot) => stageIn({ root: lot.worktree, files: { 'doc/commands/lot.md': '# lot\n' } }),
			paths: ['doc/commands/lot.md'],
		},
	]

	for (const row of REFUSED)
		it(row.title, async () => {
			const lot = row.lot()
			row.change(lot)

			await expect(
				hookScopeIn(lot.worktree).then(function withRuns(view) {
					return { ...view, runs: countRuns(lot.counter) }
				}),
			).resolves.toEqual({ ...refusedView({ lot, paths: row.paths }), runs: 0 })
		})

	it('a commit inside the scope -> ok scope first, then the design step', async () => {
		const lot = scopeGuardLotOf()
		stageIn({ root: lot.worktree, files: { 'src/in/a.ts': 'export const a = 1\n' } })

		await expect(
			runHookIn({ cwd: lot.worktree }).then(function firstTwoLines(result) {
				return { exitCode: result.exitCode, lines: result.output.split('\n').slice(0, 2) }
			}),
		).resolves.toEqual({
			exitCode: 0,
			lines: [
				'ok    scope  2 path(s) inside the scope',
				expect.stringMatching(/^ok {4}design {2}/),
			],
		})
	})

	it("a refused scope -> the lot's events hold a gate-hook start and end with the scope part failed", async () => {
		const lot = scopeGuardLotOf()
		stageIn({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(
			runHookIn({ cwd: lot.worktree }).then(function scopeParts() {
				const events = eventsOfStep({
					lot: { eventsFile: join(lot.lotFolder, STORE_FILES.events) },
					step: 'gate-hook',
				})
				return {
					kinds: events.map((event) => event.kind),
					parts: partsOf(events[1]).map((part) => [part.name, part.status]),
				}
			}),
		).resolves.toEqual({ kinds: ['step.start', 'step.end'], parts: [['scope', 'failed']] })
	})

	it("a lot stacked on an open parent -> held to its own commits: the parent's files are not named", async () => {
		const parent = scopeGuardLotOf()
		const child = addStackedLot({ lot: parent, name: '0002-repo-child', branch: 'feat/child' })
		stageIn({ root: child.worktree, files: { 'src/0002-repo-child.ts': 'export const c = 2\n' } })

		await expect(hookScopeIn(child.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: 'ok    scope  1 path(s) inside the scope',
		})
	})

	it("a .dialecte/ record staged beside a change to the lot's own file -> ok scope, counting the held path only", async () => {
		const lot = scopeGuardLotOf()
		stageIn({
			root: lot.worktree,
			files: {
				'.dialecte/mutation-records.json': '{}\n',
				'src/in.ts': 'export const inside = 2\n',
			},
		})

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: 'ok    scope  1 path(s) inside the scope',
		})
	})

	it('the named path added with lot scope --add -> the same commit passes', async () => {
		const lot = scopeGuardLotOf()
		stageIn({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } })
		addToScope({ lot, path: 'src/out.ts' })

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: 'ok    scope  2 path(s) inside the scope',
		})
	})

	it('a merge of the base while MERGE_HEAD is set -> skip scope; the next plain commit passes', async () => {
		const lot = scopeGuardLotOf()
		git({ root: lot.worktree, args: ['merge', '-q', '--no-ff', '--no-commit', 'main'] })
		const merging = await runHookIn({ cwd: lot.worktree })
		git({ root: lot.worktree, args: ['commit', '-q', '--no-verify', '--no-edit'] })
		stageIn({ root: lot.worktree, files: { 'src/in/a.ts': 'export const a = 1\n' } })

		await expect(
			runHookIn({ cwd: lot.worktree }).then(function bothRuns(after) {
				return { merging: scopeViewOf(merging).scope, after: scopeViewOf(after).scope }
			}),
		).resolves.toEqual({
			merging: [expect.stringMatching(/^skip {2}scope {2}\S/)],
			after: ['ok    scope  2 path(s) inside the scope'],
		})
	})

	it('a review throwaway on <lot branch>-round-<n> -> skip scope', async () => {
		const lot = scopeGuardLotOf()
		const throwaway = addRoundOf({ lot, round: 1 })
		stageIn({ root: throwaway, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(hookScopeIn(throwaway)).resolves.toMatchObject({
			first: expect.stringMatching(/^skip {2}scope {2}\S/),
		})
	})

	it("a canceled lot's kept worktree -> skip scope, a terminal lot", async () => {
		const lot = scopeGuardLotOf()
		cancelLot(lot)
		stageIn({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: expect.stringMatching(/^skip {2}scope {2}.*\b(canceled|terminal)\b/),
		})
	})

	it("a simulated lot's branch -> skip scope", async () => {
		const lot = scopeGuardLotOf()
		writeStoreLot({
			workspace: lot.workspace,
			name: '0002-repo-simulated',
			scope: ['src/in.ts'],
			branch: 'feat/simulated',
			simulated: true,
		})
		const worktree = join(temporaryFolder('dialecte-simulated-branch-'), 'simulated')
		git({
			root: lot.root,
			args: ['worktree', 'add', '-q', '-b', 'feat/simulated', worktree, 'main'],
		})
		stageIn({ root: worktree, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(hookScopeIn(worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: expect.stringMatching(/^skip {2}scope {2}\S/),
		})
	})

	it('a damaged lot (its brief does not parse) -> FAIL scope with the repair line, no add', async () => {
		const lot = scopeGuardLotOf()
		damageBrief({ lot, text: '{ "scope": [\n' })
		stageIn({ root: lot.worktree, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(hookScopeIn(lot.worktree)).resolves.toEqual({
			exitCode: 1,
			first: expect.stringMatching(
				new RegExp(
					`^FAIL {2}scope {2}${lot.name} is damaged \\(.+\\): repair its records by hand; nothing to add$`,
				),
			),
			scope: [expect.stringMatching(/^FAIL {2}scope {2}/)],
			adds: [],
			design: [],
			failedAt: ['gate --hook: failed at scope'],
		})
	})

	it('dialecte.baseBranch naming no branch -> FAIL scope with the base failure, even for a docs-only commit', async () => {
		const lot = scopeGuardLotOf()
		writeFiles({
			root: lot.worktree,
			files: {
				'package.json': manifestOf({ counter: lot.counter, dialecte: { baseBranch: 'trunk' } }),
			},
		})
		stageIn({ root: lot.worktree, files: { 'docs/a.md': '# a\n' } })

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 1,
			first: expect.stringMatching(/^FAIL {2}scope {2}.*\btrunk\b/),
		})
	})

	it('no base branch at all -> ok scope on a staged inside file, held against HEAD', async () => {
		const lot = scopeGuardLotOf()
		git({ root: lot.root, args: ['branch', '-q', '-m', 'main', 'mainline'] })
		git({ root: lot.root, args: ['remote', 'remove', 'origin'] })
		stageIn({ root: lot.worktree, files: { 'src/in/a.ts': 'export const a = 1\n' } })

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: expect.stringMatching(/^ok {4}scope {2}.*held against HEAD: no base branch/),
		})
	})

	it('a release lot listing its files -> the bump and the deleted fragment pass', async () => {
		const lot = releaseLotOf()
		writeFiles({
			root: lot.worktree,
			files: {
				'package.json': manifestOf({ counter: lot.counter, version: '1.1.0' }),
				'CHANGELOG.md': '# Changelog\n\n## 1.1.0\n\n- a\n',
			},
		})
		git({ root: lot.worktree, args: ['rm', '-q', 'changes/a.md'] })
		git({ root: lot.worktree, args: ['add', 'package.json', 'CHANGELOG.md'] })

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: 'ok    scope  3 path(s) inside the scope',
		})
	})

	it('a regenerated command page the brief lists -> ok scope', async () => {
		const lot = scopeGuardLotOf({ scope: ['src/in.ts', 'doc/commands/lot.md'] })
		stageIn({ root: lot.worktree, files: { 'doc/commands/lot.md': '# lot\n' } })

		await expect(hookScopeIn(lot.worktree)).resolves.toMatchObject({
			exitCode: 0,
			first: 'ok    scope  2 path(s) inside the scope',
		})
	})
})

describe('gate --hook - no scope line outside a lot (kept as today)', { timeout: 240_000 }, () => {
	it('the main checkout on the base branch -> no scope line', async () => {
		const lot = scopeGuardLotOf()
		stageIn({ root: lot.root, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(hookScopeIn(lot.root)).resolves.toMatchObject({ scope: [] })
	})

	it("a rehearsal clone of the lot's worktree, on the lot's branch -> no scope line", async () => {
		const lot = scopeGuardLotOf()
		const clone = rehearsalCloneOf({ root: lot.worktree, branch: lot.branch })
		stageIn({ root: clone, files: { 'src/out.ts': 'export const out = 1\n' } })

		await expect(hookScopeIn(clone)).resolves.toMatchObject({ scope: [] })
	})
})

/**
 * A release lot: its brief lists `package.json`, `package-lock.json`, `CHANGELOG.md` and `changes/a.md`; main holds
 * the changelog and the fragments `changes/a.md` and `changes/b.md` at the cut.
 */
function releaseLotOf(): ScopeGuardLot {
	return scopeGuardLotOf({
		scope: ['package.json', 'package-lock.json', 'CHANGELOG.md', 'changes/a.md'],
		baseFiles: {
			'CHANGELOG.md': '# Changelog\n',
			'changes/a.md': '### Fixed\n\n- a\n',
			'changes/b.md': '### Fixed\n\n- b\n',
		},
		lotFiles: { 'CHANGELOG.md': '# Changelog\n\n## Unreleased\n' },
	})
}
