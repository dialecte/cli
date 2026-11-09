/**
 * `gate --hook` on a package with a scoped full step: the hand-over base (rule 2) honoured or ignored with one line
 * saying why (A1, A1b, A1c), the base line it always prints, the key folding the hook base, the reuse of a green
 * `--full` or covering `--release` record (A18), the running line, and the cli reading the hand-down from its
 * given environment.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { HOOK_TREE_LENGTH, REPOSITORY_CLI_PATH } from '../../test/gate-hook.constants.ts'
import {
	createHookPackage,
	indexTreeOf,
	readFullRecord,
	reuseLineOf,
	runningLineOf,
} from '../../test/gate-hook.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import { FEATURE_BRANCH } from '../../test/scoped-gate-package.constants.ts'
import {
	createScopedPackage,
	createScopedStep,
	readScopedRuns,
	recordGitCommands,
} from '../../test/scoped-gate-package.ts'
import {
	createEmptySelectionStep,
	createEnvironmentStep,
	createFailsOnReleaseStep,
	createTwoIdsStep,
	gateOfLayout,
	startLiveHandoverRun,
} from '../../test/scoped-hook-package.ts'
import {
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	countingStep,
	createCounter,
	runGateIn,
	seedFullGate,
} from '../../test/scratch-checks.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { CLI_SURFACE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readReleaseRecord } from '../lib/gate-records/gate-records.ts'
import {
	HANDOVER_BASE_IGNORED_REASONS,
	NO_BASE_BRANCH_NOTE,
} from '../lib/gate/gate-base.constants.ts'
import { resolveGateBase } from '../lib/gate/gate-base.ts'
import { runGate } from './gate.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScopedStep } from '../../test/scoped-gate-package.types.ts'
import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'
import type { HandoverBase } from '../lib/gate/gate-base.types.ts'

vi.mock('../lib/gate/gate-base.ts', async function mockGateBase(importOriginal) {
	const actual = await importOriginal<typeof import('../lib/gate/gate-base.ts')>()
	return { ...actual, resolveGateBase: vi.fn(actual.resolveGateBase) }
})

beforeEach(function clearResolverCalls() {
	vi.mocked(resolveGateBase).mockClear()
})

/** The lines sorted: the order the hook prints its reuse line and its base line in is no part of the contract. */
function sortedLines(output: string): string[] {
	return linesOf(output).sort()
}

function rev(params: { root: string; revision: string }): string {
	return git({ root: params.root, args: ['rev-parse', params.revision] }).trim()
}

function linesOf(output: string): string[] {
	return output.split('\n')
}

/** The line `gate --hook` prints about the base it used, with the selection part as given. */
function baseLineOf(params: { commit: string; source: string; selection: string }): string {
	return `gate --hook: base ${params.commit} (${params.source}), ${params.selection}`
}

/** The line `gate --hook` prints when a green covering `gate --release` of the committed tree answered. */
function releaseReuseLineOf(params: { tree: string; at: string; head: string }): string {
	return `gate --hook: tests reused from gate --release green on tree ${params.tree.slice(0, HOOK_TREE_LENGTH)} at ${params.at} (HEAD ${params.head.slice(0, HOOK_TREE_LENGTH)})`
}

/** The changed paths the scoped step was handed on its last run, sorted. */
function changedPathsOf(scoped: ScopedStep): string[] {
	return readFileSync(`${scoped.log}.changed`, 'utf8').split('\0').filter(Boolean).sort()
}

/** A package on `feat/x` (one commit) whose `--fast` and `--full` gates hold one scoped step. */
function scopedHookPackage() {
	const scoped = createScopedStep()
	const root = createScopedPackage({ gate: { fast: [scoped.step], full: [scoped.step] } })
	return { root, scoped, base: rev({ root, revision: 'main' }) }
}

describe(
	'gate --hook with a scoped step: no hand-down',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('no record → the running line, the scoped step run with the merge-base, the index tree and its changed file; the base line names the full sha, the source and the selection', async () => {
			const { root, scoped, base } = scopedHookPackage()
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			const lines = linesOf(result.output)
			expect(result.exitCode).toBe(0)
			expect(lines).toContain(runningLineOf(tree))
			expect(lines).toContain(
				baseLineOf({ commit: base, source: 'base-branch', selection: 'selected T0' }),
			)
			expect(readScopedRuns(scoped)).toEqual([{ base, tree }])
			expect(changedPathsOf(scoped)).toEqual(['docs/notes.md', 'src/a.ts'])
		})

		it('a step that selects nothing → the base line says nothing selected', async () => {
			const empty = createEmptySelectionStep()
			const root = createScopedPackage({ gate: { fast: [empty.step], full: [empty.step] } })
			const base = rev({ root, revision: 'main' })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(
				baseLineOf({ commit: base, source: 'base-branch', selection: 'nothing selected' }),
			)
		})

		it('R1-9: a scoped test step that failed without a valid selection → the base line says no valid selection, not nothing selected', async () => {
			const noSelection = {
				name: 'scoped',
				run: "printf '      Tests  4 passed (4)\\n'",
				counts: 'tests' as const,
				scoped: true,
			}
			const root = createScopedPackage({ gate: { fast: [noSelection], full: [noSelection] } })
			const base = rev({ root, revision: 'main' })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(1)
			expect(linesOf(result.output)).toContain(
				baseLineOf({ commit: base, source: 'base-branch', selection: 'no valid selection' }),
			)
		})

		it('R1-1: a full list holding a scoped step that counts no tests and an unscoped tests step, after a green gate --full → the hook reuses its record, with no base line', async () => {
			const counter = createCounter()
			const bench = createScopedStep({ name: 'bench' })
			const tests = countingStep({ counter, name: 'tests' })
			const root = createScopedPackage({
				gate: {
					fast: [tests],
					full: [{ name: bench.step.name, run: bench.step.run, scoped: true }, tests],
				},
			})
			await seedFullGate(root)
			const record = readFullRecord(root)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toEqual([reuseLineOf({ tree, record })])
			expect(countRuns(counter)).toBe(1)
		})

		it('a step that selects two ids → the base line joins them with ", " after the full sha and the source', async () => {
			const two = createTwoIdsStep()
			const root = createScopedPackage({ gate: { fast: [two.step], full: [two.step] } })
			const base = rev({ root, revision: 'main' })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(
				baseLineOf({ commit: base, source: 'base-branch', selection: 'selected T0, T4' }),
			)
		})

		it('a package with no base branch → the empty-tree base on the base line, source none', async () => {
			const { root } = scopedHookPackage()
			git({ root, args: ['branch', '-q', '-m', 'main', 'trunk'] })
			const emptyTree = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(linesOf(result.output)).toContain(
				baseLineOf({ commit: emptyTree, source: 'none', selection: 'selected T0' }),
			)
			expect(result.output).toContain(NO_BASE_BRANCH_NOTE.replace('{branch}', 'main'))
		})

		it('a green gate --full of this tree and base → no step runs: the unchanged reuse line, and the base line says reused', async () => {
			const { root, scoped, base } = scopedHookPackage()
			await seedFullGate(root)
			const record = readFullRecord(root)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(sortedLines(result.output)).toEqual(
				[
					reuseLineOf({ tree, record }),
					baseLineOf({ commit: base, source: 'base-branch', selection: 'reused' }),
				].sort(),
			)
			expect(readScopedRuns(scoped)).toHaveLength(1)
		})

		it('a green gate --full of this tree at another base → not reused: the step runs again with the hook base', async () => {
			const { root, scoped, base } = scopedHookPackage()
			const otherBase = rev({ root, revision: 'HEAD' })
			const fullGate = await runGateIn({ cwd: root, argv: ['--full', '--base', otherBase] })
			expect(fullGate.exitCode).toBe(0)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(runningLineOf(tree))
			expect(readScopedRuns(scoped)).toEqual([
				{ base: otherBase, tree },
				{ base, tree },
			])
		})

		it('--no-reuse → the step runs whatever the store holds', async () => {
			const { root, scoped } = scopedHookPackage()
			await seedFullGate(root)

			const result = await runGate({ cwd: root, argv: ['--hook', '--no-reuse'] })

			expect(result.exitCode).toBe(0)
			expect(readScopedRuns(scoped)).toHaveLength(2)
		})

		it('A18: a green covering gate --release of this tree, no full record → the new release line, the base line says reused, no step runs', async () => {
			const { root, scoped, base } = scopedHookPackage()
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)
			const record = readReleaseRecord(root)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(sortedLines(result.output)).toEqual(
				[
					releaseReuseLineOf({ tree, at: record?.at ?? '', head: record?.head ?? '' }),
					baseLineOf({ commit: base, source: 'base-branch', selection: 'reused' }),
				].sort(),
			)
			expect(readScopedRuns(scoped)).toHaveLength(1)
		})
	},
)

describe(
	'gate --hook on a package with no scoped step',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a hand-down given → no base line, no merge-base run, the hook as before', async () => {
			const { root, testCounter } = createHookPackage()
			const spawned = recordGitCommands()
			const tree = indexTreeOf({ root })

			const result = await runGate({
				cwd: root,
				argv: ['--hook'],
				handoverBase: { commit: 'c'.repeat(40), folder: '/nowhere/handover' },
			})

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)[0]).toBe(runningLineOf(tree))
			expect(
				linesOf(result.output).filter((line) => line.startsWith('gate --hook: base ')),
			).toEqual([])
			expect(spawned().filter((line) => /\bmerge-base\b/.test(line))).toEqual([])
			expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
			expect(countRuns(testCounter)).toBe(1)
		})

		it('3: a green gate --release of the tree → the release line alone, no base line, no step runs', async () => {
			const { root, testCounter } = createHookPackage()
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)
			const record = readReleaseRecord(root)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result).toEqual({
				exitCode: 0,
				output: releaseReuseLineOf({ tree, at: record?.at ?? '', head: record?.head ?? '' }),
			})
			expect(countRuns(testCounter)).toBe(1)
		})
	},
)

describe(
	'gate --hook: the scoped step is not in the full list',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			{ layout: 'fast-only' as const, label: 'only in fast' },
			{ layout: 'release-only' as const, label: 'only in release' },
		])(
			'a scoped step $label → no base line, no resolution, the hook runs the full test step as before, even with a hand-down',
			async ({ layout }) => {
				const counter = createCounter()
				const scoped = createScopedStep()
				const root = createScopedPackage({
					gate: gateOfLayout({ layout, scoped: scoped.step, plain: countingStep({ counter }) }),
				})
				const tree = indexTreeOf({ root })
				const folder = startLiveHandoverRun({ root })

				const result = await runGate({
					cwd: root,
					argv: ['--hook'],
					handoverBase: { commit: rev({ root, revision: 'main' }), folder },
				})

				expect(result.exitCode).toBe(0)
				expect(linesOf(result.output)[0]).toBe(runningLineOf(tree))
				expect(
					linesOf(result.output).filter((line) => line.startsWith('gate --hook: base ')),
				).toEqual([])
				expect(countRuns(counter)).toBe(1)
				expect(readScopedRuns(scoped)).toEqual([])
				expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
			},
		)
	},
)

describe(
	'gate --hook: a release record that does not answer (A18b)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green release of a list missing a full step → answers no hook: the tests run', async () => {
			const scoped = createScopedStep()
			const check = { name: 'check', run: 'true' }
			const root = createScopedPackage({
				gate: { fast: [scoped.step], full: [check, scoped.step], release: [scoped.step] },
			})
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(runningLineOf(tree))
			expect(readScopedRuns(scoped)).toHaveLength(2)
		})

		it('a green release whose tests step lacks counts: tests (same name and command, so the same key) → answers no hook: the tests run', async () => {
			const scoped = createScopedStep()
			const { name, run } = scoped.step
			const root = createScopedPackage({
				gate: { fast: [scoped.step], full: [scoped.step], release: [{ name, run, scoped: true }] },
			})
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(0)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(runningLineOf(tree))
			expect(readScopedRuns(scoped)).toHaveLength(2)
		})

		it('a failed release record of the same key → answers no hook: the tests run', async () => {
			const failing = createFailsOnReleaseStep()
			const root = createScopedPackage({ gate: { fast: [failing.step], full: [failing.step] } })
			const releaseGate = await runGateIn({ cwd: root, argv: ['--release'] })
			expect(releaseGate.exitCode).toBe(1)
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'] })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(runningLineOf(tree))
			expect(readScopedRuns(failing)).toHaveLength(2)
		})
	},
)

/**
 * A package on `feat/x` that merged `main` after `main` moved on by one empty commit: HEAD's merge-base with `main`
 * is that commit (`mergeBase`), `older` is `main`'s first commit (an ancestor of HEAD and of `main`), `newer` the
 * feature's own commit (an ancestor of HEAD, not of `main`), `stale` a commit on a branch HEAD does not hold.
 */
function handDownPackage() {
	const { root, scoped } = scopedHookPackage()
	const older = rev({ root, revision: 'main' })
	const newer = rev({ root, revision: 'HEAD' })
	git({ root, args: ['checkout', '-q', 'main'] })
	git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: main moves on'] })
	const mergeBase = rev({ root, revision: 'HEAD' })
	git({ root, args: ['checkout', '-q', '-b', 'stale', older] })
	git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: a commit nobody merged'] })
	const stale = rev({ root, revision: 'HEAD' })
	git({ root, args: ['checkout', '-q', FEATURE_BRANCH] })
	git({ root, args: ['merge', '-q', '--no-ff', '--no-edit', 'main'] })
	return { root, scoped, older, newer, stale, mergeBase }
}

describe(
	'gate --hook: the hand-over base of a live hand-over run (rule 2)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('honoured: a live run of that folder and a base that is an ancestor of HEAD and of the base branch → the step gets it, source handover, resolveGateBase got it, no ignored line', async () => {
			const { root, scoped, older } = handDownPackage()
			const folder = startLiveHandoverRun({ root })
			const handoverBase: HandoverBase = { commit: older, folder }
			const tree = indexTreeOf({ root })

			const result = await runGate({ cwd: root, argv: ['--hook'], handoverBase })

			expect(result.exitCode).toBe(0)
			expect(linesOf(result.output)).toContain(
				baseLineOf({ commit: older, source: 'handover', selection: 'selected T0' }),
			)
			expect(linesOf(result.output).filter((line) => line.includes('ignored'))).toEqual([])
			expect(readScopedRuns(scoped)).toEqual([{ base: older, tree }])
			expect(vi.mocked(resolveGateBase).mock.calls.map(([given]) => given.handoverBase)).toEqual([
				handoverBase,
			])
		})

		it('honoured, a green gate --full of the tree at the hand-over base → reused, the base line names the hand-over base', async () => {
			const { root, scoped, older } = handDownPackage()
			const fullGate = await runGateIn({ cwd: root, argv: ['--full', '--base', older] })
			expect(fullGate.exitCode).toBe(0)
			const record = readFullRecord(root)
			const folder = startLiveHandoverRun({ root })
			const tree = indexTreeOf({ root })

			const result = await runGate({
				cwd: root,
				argv: ['--hook'],
				handoverBase: { commit: older, folder },
			})

			expect(sortedLines(result.output)).toEqual(
				[
					reuseLineOf({ tree, record }),
					baseLineOf({ commit: older, source: 'handover', selection: 'reused' }),
				].sort(),
			)
			expect(readScopedRuns(scoped)).toHaveLength(1)
		})

		it('honoured, a green gate --full of the tree at the merge-base only → not reused: another base', async () => {
			const { root, scoped, older, mergeBase } = handDownPackage()
			const fullGate = await runGateIn({ cwd: root, argv: ['--full'] })
			expect(fullGate.exitCode).toBe(0)
			const folder = startLiveHandoverRun({ root })
			const tree = indexTreeOf({ root })

			const result = await runGate({
				cwd: root,
				argv: ['--hook'],
				handoverBase: { commit: older, folder },
			})

			expect(result.exitCode).toBe(0)
			expect(readScopedRuns(scoped)).toEqual([
				{ base: mergeBase, tree },
				{ base: older, tree },
			])
		})

		describe.each([
			{
				name: 'A1: a base that is not an ancestor of HEAD',
				reason: HANDOVER_BASE_IGNORED_REASONS.notAncestorOfHead,
				pick: (given: { stale: string }) => given.stale,
				live: true,
			},
			{
				name: 'A1b: a base newer than the merge-base, an ancestor of HEAD but not of the base branch',
				reason: HANDOVER_BASE_IGNORED_REASONS.notAncestorOfBaseBranch.replace(
					'{ref}',
					'refs/heads/main',
				),
				pick: (given: { newer: string }) => given.newer,
				live: true,
			},
			{
				name: 'A1c: exported in a shell, no hand-over run live',
				reason: HANDOVER_BASE_IGNORED_REASONS.noLiveRun,
				pick: (given: { older: string }) => given.older,
				live: false,
			},
		])('$name', ({ reason, pick, live }) => {
			it('ignored with one line saying why: rule 3 answers, the step gets the merge-base, source base-branch', async () => {
				const given = handDownPackage()
				const { root, scoped, mergeBase } = given
				const commit = pick(given)
				const folder = live ? startLiveHandoverRun({ root }) : '/nowhere/handover'
				const tree = indexTreeOf({ root })

				const result = await runGate({
					cwd: root,
					argv: ['--hook'],
					handoverBase: { commit, folder },
				})

				const lines = linesOf(result.output)
				const expected = reason.replace('{base}', commit).replace('{folder}', folder)
				expect(result.exitCode).toBe(0)
				const ignoredLines = lines.filter((line) => line.includes(expected))
				expect(ignoredLines).toHaveLength(1)
				expect(ignoredLines[0].startsWith('gate --hook: ')).toBe(true)
				expect(lines.filter((line) => line.includes('hand-over base'))).toHaveLength(1)
				expect(lines).toContain(
					baseLineOf({ commit: mergeBase, source: 'base-branch', selection: 'selected T0' }),
				)
				expect(readScopedRuns(scoped)).toEqual([{ base: mergeBase, tree }])
			})
		})

		it('a live run of another folder → ignored, the line naming both folders', async () => {
			const { root, scoped, older, mergeBase } = handDownPackage()
			const live = startLiveHandoverRun({ root })
			const tree = indexTreeOf({ root })

			const result = await runGate({
				cwd: root,
				argv: ['--hook'],
				handoverBase: { commit: older, folder: '/elsewhere/handover' },
			})

			const expected = HANDOVER_BASE_IGNORED_REASONS.otherFolder
				.replace('{base}', older)
				.replace('{folder}', '/elsewhere/handover')
				.replace('{live}', live)
			const ignoredLines = linesOf(result.output).filter((line) => line.includes(expected))
			expect(ignoredLines).toHaveLength(1)
			expect(ignoredLines[0].startsWith('gate --hook: ')).toBe(true)
			expect(readScopedRuns(scoped)).toEqual([{ base: mergeBase, tree }])
		})
	},
)

describe(
	'gate --hook as a process: the hand-down comes from the environment the cli was given',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** `node cli gate <args>` in `root` with the hand-over variables as given (a variable not given is absent). */
		function runCli(params: {
			root: string
			timeout: number
			base?: string
			folder?: string
			args?: string[]
		}) {
			const {
				DIALECTE_HANDOVER_BASE: _strayBase,
				DIALECTE_HANDOVER_FOLDER: _strayFolder,
				...environment
			} = process.env
			return spawnSync('node', [REPOSITORY_CLI_PATH, 'gate', ...(params.args ?? ['--hook'])], {
				cwd: params.root,
				encoding: 'utf8',
				timeout: params.timeout,
				env: {
					...environment,
					...(params.base !== undefined && { DIALECTE_HANDOVER_BASE: params.base }),
					...(params.folder !== undefined && { DIALECTE_HANDOVER_FOLDER: params.folder }),
				},
			})
		}

		it('only the base variable given → ignored with the line saying it came without its folder, the merge-base used', () => {
			const { root, older, mergeBase } = handDownPackage()
			startLiveHandoverRun({ root })

			const result = runCli({ root, base: older, timeout: CLI_SURFACE_CASE_TIMEOUT })

			const ignoredLines = linesOf(result.stdout).filter((line) =>
				line.includes('hand-over base without its folder'),
			)
			expect(result.status).toBe(0)
			expect(ignoredLines).toHaveLength(1)
			expect(ignoredLines[0].startsWith('gate --hook: ')).toBe(true)
			expect(linesOf(result.stdout)).toContain(
				baseLineOf({ commit: mergeBase, source: 'base-branch', selection: 'selected T0' }),
			)
		})

		it('the hook’s own steps get no DIALECTE_HANDOVER_* even when both are given and honoured', () => {
			const log = join(temporaryFolder('dialecte-probe-'), 'env.log')
			const scoped = createScopedStep()
			const root = createScopedPackage({
				gate: {
					fast: [scoped.step],
					full: [createEnvironmentStep(log), scoped.step],
				},
			})
			const base = rev({ root, revision: 'main' })
			const folder = startLiveHandoverRun({ root })

			const result = runCli({ root, base, folder, timeout: CLI_SURFACE_CASE_TIMEOUT })

			expect(result.status).toBe(0)
			expect(linesOf(result.stdout)).toContain(
				baseLineOf({ commit: base, source: 'handover', selection: 'selected T0' }),
			)
			expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual(['unset|unset'])
		})

		it('gate --full given both variables (no live run: the gate refuses under one) → they are ignored: no hand-over base used, no ignored line, the record holds the base branch', () => {
			const { root, older } = handDownPackage()

			const result = runCli({
				root,
				base: older,
				folder: '/nowhere/handover',
				args: ['--full'],
				timeout: CLI_SURFACE_CASE_TIMEOUT,
			})

			const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
			expect(result.status).toBe(0)
			expect(result.stdout).not.toContain('hand-over base')
			expect(record?.base).toMatchObject({ source: 'base-branch' })
		})

		it('both variables and a live run of that folder → the base line names the hand-over base, source handover', () => {
			const { root, older } = handDownPackage()
			const folder = startLiveHandoverRun({ root })

			const result = runCli({ root, base: older, folder, timeout: CLI_SURFACE_CASE_TIMEOUT })

			expect(result.status).toBe(0)
			expect(linesOf(result.stdout)).toContain(
				baseLineOf({ commit: older, source: 'handover', selection: 'selected T0' }),
			)
		})

		it('A1c: the same variables exported with no hand-over run live → ignored with its line, the merge-base used', () => {
			const { root, older, mergeBase } = handDownPackage()

			const result = runCli({
				root,
				base: older,
				folder: '/nowhere/handover',
				timeout: CLI_SURFACE_CASE_TIMEOUT,
			})

			expect(result.status).toBe(0)
			expect(
				linesOf(result.stdout).filter((line) => line.includes('no live hand-over run')),
			).toHaveLength(1)
			expect(linesOf(result.stdout)).toContain(
				baseLineOf({ commit: mergeBase, source: 'base-branch', selection: 'selected T0' }),
			)
		})
	},
)
