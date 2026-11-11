/** `gate --fast` / `--full` with a scoped step: the base resolved once, the key, the records, `--base`, an invalid config. */
import { writeFileSync } from 'node:fs'

import { readRecordFile } from '../../test/gate-records.ts'
import { FEATURE_BRANCH } from '../../test/scoped-gate-package.constants.ts'
import {
	createScopedPackage,
	createScopedStep,
	readScopedRuns,
	recordGitCommands,
} from '../../test/scoped-gate-package.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import { countRuns, countingStep, createCounter, runGateIn } from '../../test/scratch-checks.ts'
import { createSharedScratchRepository, git, writeFiles } from '../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { gateCommandHash, hashGateCommand } from '../lib/gate-records/check-key.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { resolveGateBase } from '../lib/gate/gate-base.ts'
import { INVALID_STEP, INVALID_STEP_PROBLEMS } from '../lib/gate/gate-config.constants.ts'

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

vi.mock('../lib/gate/gate-base.ts', async function mockGateBase(importOriginal) {
	const actual = await importOriginal<typeof import('../lib/gate/gate-base.ts')>()
	return { ...actual, resolveGateBase: vi.fn(actual.resolveGateBase) }
})

const BASE_FLAG_LINE =
	'base from --base: no hand-over reuses this record unless its base is the same'
const MODES = [
	{ label: '--fast', argv: [] as string[], file: FAST_RECORD_FILE },
	{ label: '--full', argv: ['--full'], file: FULL_RECORD_FILE },
]

beforeEach(function clearResolverCalls() {
	vi.mocked(resolveGateBase).mockClear()
})

/** A package whose `--fast` and `--full` gates hold an unscoped counting step and a scoped step. */
function scopedGatePackage(params: { heavy?: boolean } = {}) {
	const counter = createCounter()
	const scoped = createScopedStep({ heavy: params.heavy })
	const steps = [countingStep({ counter }), scoped.step]
	const root = createScopedPackage({ gate: { fast: steps, full: steps } })
	return { root, counter, scoped, steps }
}

/** The repository the `gateCommandHash` cases read: they only hash, so they share one. */
const sharedPlainRepository = createSharedScratchRepository()

function mergeBaseOf(root: string): string {
	return git({ root, args: ['merge-base', 'HEAD', 'main'] }).trim()
}

function rev(params: { root: string; revision: string }): string {
	return git({ root: params.root, args: ['rev-parse', params.revision] }).trim()
}

/** `main` gets the notes file the feature branch already has, and is merged in: the base moves, the tree does not. */
function mergeMainThatLeavesTheTree(root: string): void {
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'docs/notes.md': 'notes\n' } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'docs: notes'] })
	git({ root, args: ['checkout', '-q', FEATURE_BRANCH] })
	git({ root, args: ['merge', '-q', '--no-ff', '--no-edit', 'main'] })
}

function recordOf(params: { root: string; file: string }): GateRecord | undefined {
	return readRecordFile<GateRecord>({ root: params.root, name: params.file })
}

describe(
	'gate with a scoped step: the base is resolved once, enters the key and the record',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		describe.each(MODES)('gate $label', ({ argv, file }) => {
			it('the scoped step gets the merge-base of HEAD and the base branch and the state tree; the record holds the base and the key hashes it', async () => {
				const { root, scoped, steps } = scopedGatePackage()
				const base = mergeBaseOf(root)

				const result = await runGateIn({ cwd: root, argv })

				const record = recordOf({ root, file })
				expect(result.exitCode).toBe(0)
				expect(readScopedRuns(scoped)).toEqual([{ base, tree: treeOfWorkingFiles(root) }])
				expect(record?.base).toEqual({ commit: base, source: 'base-branch' })
				expect(record?.key?.commandHash).toBe(hashGateCommand({ steps, gateBase: base }))
			})

			it('the base is resolved once per run', async () => {
				const { root } = scopedGatePackage()
				const spawned = recordGitCommands()

				await runGateIn({ cwd: root, argv })

				expect(vi.mocked(resolveGateBase)).toHaveBeenCalledTimes(1)
				// the gate's one merge-base, and the tdd step's own under --full
				expect(spawned().filter((line) => /\bmerge-base\b/.test(line))).toHaveLength(
					argv.includes('--full') ? 2 : 1,
				)
			})

			it('DIALECTE_HANDOVER_BASE and DIALECTE_HANDOVER_FOLDER in the environment → no hand-over base given to the resolver, no ignored line (rule 2 is for --hook)', async () => {
				const { root } = scopedGatePackage()
				vi.stubEnv('DIALECTE_HANDOVER_BASE', 'c'.repeat(40))
				vi.stubEnv('DIALECTE_HANDOVER_FOLDER', '/nowhere/handover')
				onTestFinished(function restoreEnvironment() {
					vi.unstubAllEnvs()
				})

				const result = await runGateIn({ cwd: root, argv })

				const calls = vi.mocked(resolveGateBase).mock.calls
				expect(result.exitCode).toBe(0)
				expect(calls).toHaveLength(1)
				expect(calls.map(([given]) => given.handoverBase)).toEqual([undefined])
				expect(result.output).not.toContain('hand-over base')
			})

			it('a second run on the same tree and base → the steps are not run again, gate: green (reused)', async () => {
				const { root, counter, scoped } = scopedGatePackage()
				await runGateIn({ cwd: root, argv })

				const second = await runGateIn({ cwd: root, argv })

				expect(second.exitCode).toBe(0)
				expect(second.output.split('\n').at(-1)).toBe(`gate ${argv[0] ?? '--fast'}: green (reused)`)
				expect(countRuns(counter)).toBe(1)
				expect(readScopedRuns(scoped)).toHaveLength(1)
			})

			it('A3: the base branch moved and was merged, the tree the same → the merge-base differs, the steps run again under another key', async () => {
				const { root, counter, scoped, steps } = scopedGatePackage()
				const firstBase = mergeBaseOf(root)
				const tree = treeOfWorkingFiles(root)
				await runGateIn({ cwd: root, argv })
				const firstKey = recordOf({ root, file })?.key
				mergeMainThatLeavesTheTree(root)
				const secondBase = mergeBaseOf(root)

				const second = await runGateIn({ cwd: root, argv })

				const record = recordOf({ root, file })
				expect(secondBase).not.toBe(firstBase)
				expect(treeOfWorkingFiles(root)).toBe(tree)
				expect(second.exitCode).toBe(0)
				expect(second.output).not.toContain('(reused)')
				expect(countRuns(counter)).toBe(2)
				expect(readScopedRuns(scoped)).toEqual([
					{ base: firstBase, tree },
					{ base: secondBase, tree },
				])
				expect(record?.base?.commit).toBe(secondBase)
				expect(record?.key?.commandHash).toBe(hashGateCommand({ steps, gateBase: secondBase }))
				expect(record?.key?.commandHash).not.toBe(firstKey?.commandHash)
			})

			it('A3b: the base branch ref moves while the step runs → the step, the key hash and the record hold the base resolved before', async () => {
				const { root, scoped, steps } = scopedGatePackage()
				const base = mergeBaseOf(root)
				git({ root, args: ['checkout', '-q', '-b', 'ahead'] })
				writeFiles({ root, files: { 'docs/ahead.md': 'ahead\n' } })
				git({ root, args: ['add', '-A'] })
				git({ root, args: ['commit', '-q', '-m', 'docs: ahead'] })
				const ahead = rev({ root, revision: 'HEAD' })
				git({ root, args: ['checkout', '-q', FEATURE_BRANCH] })
				writeFileSync(scoped.moveFile, ahead)

				const result = await runGateIn({ cwd: root, argv })

				const record = recordOf({ root, file })
				const [run] = readScopedRuns(scoped)
				// the step moved the ref: a base resolved again now would be another commit
				expect(rev({ root, revision: 'main' })).toBe(ahead)
				expect(mergeBaseOf(root)).not.toBe(base)
				expect(result.exitCode).toBe(0)
				expect(run?.base).toBe(base)
				expect(record?.steps.find((step) => step.name === 'scoped')?.selection?.base).toBe(base)
				expect(record?.base?.commit).toBe(base)
				expect(record?.key?.commandHash).toBe(hashGateCommand({ steps, gateBase: base }))
			})
		})

		it('gateCommandHash takes the base its caller resolved: the same hash as hashGateCommand with it, another base another hash', () => {
			const root = sharedPlainRepository()
			const steps = [createScopedStep().step]

			const hashes = ['a'.repeat(40), 'b'.repeat(40)].map((gateBase) => ({
				given: gateCommandHash({ root, steps, gateBase }),
				expected: hashGateCommand({ steps, gateBase }),
			}))

			expect(hashes[0]?.given).toBe(hashes[0]?.expected)
			expect(hashes[1]?.given).toBe(hashes[1]?.expected)
			expect(hashes[0]?.given).not.toBe(hashes[1]?.given)
		})

		it('gateCommandHash beside a changedOnly step: HEAD as base and the given gate base, no base resolved by itself', () => {
			const root = sharedPlainRepository()
			const steps = [createScopedStep().step, { name: 'only', run: 'true', changedOnly: true }]
			const gateBase = 'a'.repeat(40)
			const head = rev({ root, revision: 'HEAD' })

			const given = gateCommandHash({ root, steps, gateBase })

			expect(given).toBe(hashGateCommand({ steps, base: head, gateBase }))
			expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
		})

		it('A15: no base branch → the step gets the empty tree, the record says none, the note is printed once', async () => {
			// the control: without a scoped step the same repository gates green (the tdd step copes with no main)
			const counter = createCounter()
			const plain = [countingStep({ counter })]
			const control = createScopedPackage({ gate: { fast: plain, full: plain } })
			git({ root: control, args: ['branch', '-q', '-D', 'main'] })
			const { root, scoped } = scopedGatePackage()
			git({ root, args: ['branch', '-q', '-D', 'main'] })
			const empty = git({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()

			const controlResult = await runGateIn({ cwd: control, argv: ['--full'] })
			const result = await runGateIn({ cwd: root, argv: ['--full'] })

			expect(controlResult.exitCode).toBe(0)
			expect(result.exitCode).toBe(0)
			expect(readScopedRuns(scoped).map((run) => run.base)).toEqual([empty])
			expect(recordOf({ root, file: FULL_RECORD_FILE })?.base).toEqual({
				commit: empty,
				source: 'none',
			})
			expect(
				result.output
					.split('\n')
					.filter((line) => line === 'no base branch main: everything selected'),
			).toHaveLength(1)
		})

		it('a scoped step only in the full list: gate --fast resolves no base and records none', async () => {
			const counter = createCounter()
			const plain = [countingStep({ counter })]
			const root = createScopedPackage({
				gate: { fast: plain, full: [...plain, createScopedStep().step] },
			})

			const result = await runGateIn({ cwd: root, argv: [] })

			expect(result.exitCode).toBe(0)
			expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
			expect(recordOf({ root, file: FAST_RECORD_FILE })).not.toHaveProperty('base')
		})
	},
)

describe(
	'gate with a scoped step: the records hold the selection and the heavy mark',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		describe.each(MODES)('gate $label', ({ argv, file }) => {
			it('the scoped step is recorded with its selection and heavy: true; the unscoped step has neither', async () => {
				const { root } = scopedGatePackage({ heavy: true })
				const base = mergeBaseOf(root)
				const changed = git({
					root,
					args: ['diff', '--name-only', '--no-renames', base, treeOfWorkingFiles(root)],
				})
					.split('\n')
					.filter(Boolean).length

				await runGateIn({ cwd: root, argv })

				const steps = recordOf({ root, file })?.steps ?? []
				expect(steps.find((step) => step.name === 'scoped')).toMatchObject({
					status: 'passed',
					heavy: true,
					selection: {
						base,
						tree: treeOfWorkingFiles(root),
						changed,
						ids: ['T0'],
						reasons: { T0: { shown: ['always'], more: 0 } },
						skipped: [],
					},
				})
				expect(steps.find((step) => step.name === 'count')).not.toHaveProperty('selection')
				expect(steps.find((step) => step.name === 'count')).not.toHaveProperty('heavy')
			})

			it('a step that is not heavy has no heavy field in its record', async () => {
				const { root } = scopedGatePackage()

				await runGateIn({ cwd: root, argv })

				expect(
					recordOf({ root, file })?.steps.find((step) => step.name === 'scoped'),
				).not.toHaveProperty('heavy')
			})

			it('the record of a run answered from a record keeps the selection and heavy of the steps', async () => {
				const { root } = scopedGatePackage({ heavy: true })
				await runGateIn({ cwd: root, argv })
				const first = recordOf({ root, file })?.steps.find((step) => step.name === 'scoped')

				await runGateIn({ cwd: root, argv })

				const second = recordOf({ root, file })
				expect(first?.selection).toBeDefined()
				expect(second?.reused).toBeDefined()
				expect(second?.steps.find((step) => step.name === 'scoped')).toMatchObject({
					heavy: true,
					selection: first?.selection,
				})
			})

			it('the stored record holds the selection, heavy and the base too', async () => {
				const { root } = scopedGatePackage({ heavy: true })
				const base = mergeBaseOf(root)

				await runGateIn({ cwd: root, argv })

				const [stored] = readTreeRecords({ root, tree: treeOfWorkingFiles(root) })
				expect(stored?.base).toEqual({ commit: base, source: 'base-branch' })
				expect(stored?.steps.find((step) => step.name === 'scoped')).toMatchObject({
					heavy: true,
					selection: { base, ids: ['T0'] },
				})
			})

			it('--json holds selection and heavy on the steps', async () => {
				const { root } = scopedGatePackage({ heavy: true })

				const result = await runGateIn({ cwd: root, argv: [...argv, '--json'] })

				const { steps } = JSON.parse(result.output) as {
					steps: { step: { name: string; heavy?: boolean }; selection?: { ids: string[] } }[]
				}
				expect(result.exitCode).toBe(0)
				expect(steps.find((entry) => entry.step.name === 'scoped')).toMatchObject({
					step: { heavy: true },
					selection: { ids: ['T0'] },
				})
			})
		})
	},
)

describe(
	'gate --base with a scoped step: it sets the gate base',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** A second commit on the feature branch: HEAD~1 is a base other than the merge-base with `main`. */
		function withSecondCommit(root: string): void {
			git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: second'] })
		}

		describe.each(MODES)('gate $label --base HEAD~1', ({ argv, file }) => {
			it('the scoped step runs with the merge-base of HEAD and that ref, the record says flag, one line says the base came from --base', async () => {
				const { root, scoped } = scopedGatePackage()
				withSecondCommit(root)
				const flagBase = rev({ root, revision: 'HEAD~1' })

				const result = await runGateIn({ cwd: root, argv: [...argv, '--base', 'HEAD~1'] })

				expect(result.exitCode).toBe(0)
				expect(flagBase).not.toBe(mergeBaseOf(root))
				expect(readScopedRuns(scoped).map((run) => run.base)).toEqual([flagBase])
				expect(recordOf({ root, file })?.base).toEqual({ commit: flagBase, source: 'flag' })
				expect(result.output.split('\n').filter((line) => line === BASE_FLAG_LINE)).toHaveLength(1)
			})

			it('without --base → no such line', async () => {
				const { root } = scopedGatePackage()

				const result = await runGateIn({ cwd: root, argv })

				expect(result.exitCode).toBe(0)
				expect(result.output).not.toContain('base from --base')
			})

			it('an unknown ref → exit 2, gate: --base <ref>: no such commit, no step ran', async () => {
				const { root, counter, scoped } = scopedGatePackage()

				const result = await runGateIn({ cwd: root, argv: [...argv, '--base', 'no-such-ref'] })

				expect(result).toMatchObject({
					exitCode: 2,
					output: expect.stringContaining('gate: --base no-such-ref: no such commit'),
				})
				expect(result.output).not.toMatch(/^(ok|skip|FAIL) +tdd\b/m)
				expect(countRuns(counter)).toBe(0)
				expect(readScopedRuns(scoped)).toEqual([])
				expect(recordOf({ root, file })).toBeUndefined()
			})
		})
	},
)

describe(
	'gate --base without a scoped step behaves as today',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		function unscopedPackage() {
			const counter = createCounter()
			const steps = [countingStep({ counter })]
			const root = createScopedPackage({ gate: { fast: steps, full: steps } })
			git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: second'] })
			return { root, counter, steps }
		}

		describe.each(MODES)('gate $label', ({ argv, file }) => {
			it('--base <known ref> → green, no base line, no base in the record, no base resolved', async () => {
				const { root } = unscopedPackage()

				const result = await runGateIn({ cwd: root, argv: [...argv, '--base', 'HEAD~1'] })

				expect(result.exitCode).toBe(0)
				expect(result.output).not.toContain('base from --base')
				expect(recordOf({ root, file })).not.toHaveProperty('base')
				expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
			})

			it('--base <unknown ref> → the tdd step fails (exit 1), not a refusal of the command', async () => {
				const { root, counter } = unscopedPackage()

				const result = await runGateIn({ cwd: root, argv: [...argv, '--base', 'no-such-ref'] })

				expect(result.exitCode).toBe(1)
				expect(result.output).toMatch(/^FAIL +tdd\b/m)
				expect(result.output).not.toContain('gate: --base no-such-ref: no such commit')
				expect(countRuns(counter)).toBe(0)
			})
		})
	},
)

describe('A12: a package without a scoped step', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	describe.each(MODES)('gate $label', ({ argv, file }) => {
		it('no base is resolved, no merge-base is spawned for it, the record has no base and no selection, the key is the one of today', async () => {
			const counter = createCounter()
			const steps = [countingStep({ counter }), countingStep({ counter, name: 'other' })]
			const root = createScopedPackage({ gate: { fast: steps, full: steps } })
			const spawned = recordGitCommands()

			const result = await runGateIn({ cwd: root, argv })

			const record = recordOf({ root, file })
			expect(result.exitCode).toBe(0)
			expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
			expect(spawned().length).toBeGreaterThan(0)
			// the only merge-base is the tdd step's own, which `--full` makes (HEAD and main), as it did before
			expect(spawned().filter((line) => /\bmerge-base\b/.test(line))).toHaveLength(
				argv.includes('--full') ? 1 : 0,
			)
			expect(record).not.toHaveProperty('base')
			expect(record?.steps.filter((step) => 'selection' in step)).toEqual([])
			expect(record?.key?.commandHash).toBe(hashGateCommand({ steps }))
			expect(result.output).not.toContain('base from --base')
		})
	})

	it('a heavy mark on an unscoped step does not change the key', async () => {
		const counter = createCounter()
		const plain = [countingStep({ counter })]
		const heavy = plain.map((step) => ({ ...step, heavy: true }))
		const root = createScopedPackage({ gate: { fast: heavy, full: heavy } })

		await runGateIn({ cwd: root, argv: [] })

		expect(recordOf({ root, file: FAST_RECORD_FILE })?.key?.commandHash).toBe(
			hashGateCommand({ steps: plain }),
		)
	})
})

describe('A11: an invalid gate config', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const MESSAGE = INVALID_STEP.replace('{list}', 'dialecte.gate.fast')
		.replace('{step}', '"both"')
		.replace('{problem}', INVALID_STEP_PROBLEMS.scopedWithChangedOnly)

	// refused before anything runs or is written: the cases share one repository
	const invalidPackage = createSharedScratchRepository({
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: {},
			dialecte: {
				gate: { fast: [{ name: 'both', run: 'true', scoped: true, changedOnly: true }] },
			},
		})}\n`,
	})

	it.each([
		{ label: 'gate (fast)', argv: [] as string[] },
		{ label: 'gate --fast', argv: ['--fast'] },
		{ label: 'gate --full', argv: ['--full'] },
		{ label: 'gate --release', argv: ['--release'] },
	])('$label → the message of the config error, exit 2', async ({ argv }) => {
		const root = invalidPackage()

		await expect(runGateIn({ cwd: root, argv })).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(MESSAGE),
		})
	})

	it('gate --hook → the message, exit 1', async () => {
		const root = invalidPackage()

		await expect(runGateIn({ cwd: root, argv: ['--hook'] })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining(MESSAGE),
		})
	})
})
