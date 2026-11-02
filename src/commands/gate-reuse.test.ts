/** `gate`: a green record of the same key answers instead of the steps; the records go to the shared store. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitPathOf, readRecordFile } from '../../test/gate-records.ts'
import {
	FAST_RECORD_FILE,
	FULL_RECORD_FILE,
	HOOK_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
	SHORT_SHA_LENGTH,
	TDD_GATE_TIMEOUT,
	TREE_ID_PATTERN,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	countingStep,
	createCounter,
	createGatePackage,
	createHookedPackage,
	editReadLot,
	headOf,
	runFolder,
	runGateIn,
	writeReadLotHandover,
} from '../../test/scratch-checks.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { addWorktree, commonGitDirOf, treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { computeCheckKey, hashGateCommand, hashHookCommand } from '../lib/gate-records/check-key.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { CHECK_STORE_FOLDER } from '../lib/gate-records/gate-records.constants.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

const REUSED_LINE =
	/^reused: gate --(fast|full) green on this tree at (\d{4}-\d{2}-\d{2}T[\d:.]+Z) \(HEAD ([0-9a-f]{12})\)$/m

/** A package whose `--fast` and `--full` gates hold the one counting step. */
function countingPackage(params: { counter: string; requires?: string }): string {
	const steps = [countingStep({ counter: params.counter, requires: params.requires })]
	return createGatePackage({ fast: steps, full: steps, files: { 'src/a.ts': 'export {}\n' } })
}

function fastRecordOf(root: string): GateRecord | undefined {
	return readRecordFile<GateRecord>({ root, name: FAST_RECORD_FILE })
}

describe(
	'gate: the record carries its key and goes to the store',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('gate --fast green → dialecte-gate-fast.json holds the key of the tree: its tree, lockHash none, a command hash, linked', async () => {
			const counter = createCounter()
			const root = countingPackage({ counter })

			const result = await runGateIn({ cwd: root, argv: [] })

			expect(result.exitCode).toBe(0)
			expect(fastRecordOf(root)?.key).toEqual({
				tree: treeOfWorkingFiles(root),
				lockHash: 'none',
				commandHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				linked: expect.stringMatching(/^[0-9a-f]{64}$/),
			})
		})

		it('gate --fast green → its key is the one computeCheckKey gives for the gate command now', async () => {
			const counter = createCounter()
			const root = countingPackage({ counter })
			const steps = [countingStep({ counter })]

			await runGateIn({ cwd: root, argv: [] })

			expect(computeCheckKey({ root, commandHash: hashGateCommand({ steps }) })).toEqual(
				fastRecordOf(root)?.key,
			)
		})

		it('gate --fast green → <git-common-dir>/dialecte-checks/<tree>.json exists and a second worktree of the repository reads the record', async () => {
			const counter = createCounter()
			const root = countingPackage({ counter })
			const second = addWorktree(root)

			await runGateIn({ cwd: root, argv: [] })

			const record = fastRecordOf(root)
			expect(
				existsSync(
					join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${treeOfWorkingFiles(root)}.json`),
				),
			).toBe(true)
			expect(readTreeRecords({ root: second, tree: treeOfWorkingFiles(root) })).toEqual([record])
		})

		it('gate --full green → the full record holds a key too', async () => {
			const root = countingPackage({ counter: createCounter() })

			await runGateIn({ cwd: root, argv: ['--full'] })

			expect(readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })?.key?.tree).toEqual(
				expect.stringMatching(TREE_ID_PATTERN),
			)
		})
	},
)

describe('gate: a second run on the same tree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a second gate --fast on the same tree → steps not run, the reuse line naming the first run, gate --fast: green (reused), exit 0', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		await runGateIn({ cwd: root, argv: [] })
		const first = fastRecordOf(root)

		const second = await runGateIn({ cwd: root, argv: [] })

		const lines = second.output.split('\n')
		expect(countRuns(counter)).toBe(1)
		expect(second.exitCode).toBe(0)
		expect(second.output).toContain(
			`reused: gate --fast green on this tree at ${first?.at} (HEAD ${first?.head.slice(0, SHORT_SHA_LENGTH)})`,
		)
		expect(lines.at(-1)).toBe('gate --fast: green (reused)')
		expect(lines.findIndex((line) => REUSED_LINE.test(line))).toBeLessThan(
			lines.findIndex((line) => /^ok +count\b/.test(line)),
		)
		expect(lines.findIndex((line) => /^ok +count\b/.test(line))).toBeLessThan(lines.length - 1)
		// the tdd step is never answered from a record: one fresh tdd line, before the reused steps
		expect(lines.filter((line) => /^(ok|skip|FAIL) +tdd\b/.test(line))).toHaveLength(1)
		expect(lines.findIndex((line) => /^(ok|skip) +tdd\b/.test(line))).toBeLessThan(
			lines.findIndex((line) => /^ok +count\b/.test(line)),
		)
	})

	it('the second run with --json → reused: true, ok true', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		await runGateIn({ cwd: root, argv: [] })

		const second = await runGateIn({ cwd: root, argv: ['--json'] })

		expect(countRuns(counter)).toBe(1)
		expect(JSON.parse(second.output)).toMatchObject({ mode: 'fast', ok: true, reused: true })
	})

	it("the second run → the worktree's record is marked reused with the first run's time and head", async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		await runGateIn({ cwd: root, argv: [] })
		const first = fastRecordOf(root)
		await runGateIn({ cwd: root, argv: [] })

		expect(fastRecordOf(root)?.reused).toEqual({ at: first?.at, head: first?.head })
	})

	it('a file staged after the green run (same tree) → the hygiene still fails the run, steps not run', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		await runGateIn({ cwd: root, argv: [] })
		const reused = await runGateIn({ cwd: root, argv: [] })
		writeFiles({ root, files: { 'src/a.ts': 'export const a = 1\n' } })
		const unstaged = await runGateIn({ cwd: root, argv: [] })
		expect(unstaged.exitCode).toBe(0)
		git({ root, args: ['add', 'src/a.ts'] })

		const staged = await runGateIn({ cwd: root, argv: [] })

		expect(reused.output).toContain('(reused)')
		expect(countRuns(counter)).toBe(2)
		expect(staged.exitCode).toBe(1)
		expect(staged.output).toMatch(/^FAIL +hygiene/m)
		expect(staged.output).not.toContain('(reused)')
	})
})

type NotReusedVariant = {
	/** Made before the first run. */
	prepare?: (root: string) => void
	firstArgv?: string[]
	/** Made between the control run and the last run. */
	change?: (root: string) => void
	lastArgv?: string[]
}

const NOT_REUSED: Record<string, NotReusedVariant> = {
	'a file changed': {
		change: (root) => writeFiles({ root, files: { 'src/a.ts': 'export const a = 2\n' } }),
	},
	'--no-reuse': { lastArgv: ['--no-reuse'] },
	'node_modules/.package-lock.json changed': {
		change: (root) =>
			writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"packages":{}}\n' } }),
	},
	'a --full record answers a --fast run: never': { firstArgv: ['--full'], lastArgv: ['--fast'] },
	'a --fast record answers a --full run: never': { firstArgv: ['--fast'], lastArgv: ['--full'] },
}

describe('gate: a run that is not reused', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	for (const [name, variant] of Object.entries(NOT_REUSED))
		it(`${name} → the steps run again (after a control run that did reuse)`, async () => {
			const counter = createCounter()
			const root = countingPackage({ counter })
			variant.prepare?.(root)
			const firstArgv = variant.firstArgv ?? []
			await runGateIn({ cwd: root, argv: firstArgv })
			const control = await runGateIn({ cwd: root, argv: firstArgv })
			const runsAfterControl = countRuns(counter)
			variant.change?.(root)

			const last = await runGateIn({ cwd: root, argv: variant.lastArgv ?? firstArgv })

			expect(runsAfterControl).toBe(1)
			expect(control.output).toContain('(reused)')
			expect(countRuns(counter)).toBe(2)
			expect(last.exitCode).toBe(0)
			expect(last.output).not.toContain('(reused)')
		})

	it('the earlier run failed on this tree → the next run runs the steps and is green; the one after reuses that green', async () => {
		const counter = createCounter()
		const flag = join(temporaryFolder('dialecte-flag-'), 'flag')
		const root = countingPackage({ counter, requires: flag })
		const failed = await runGateIn({ cwd: root, argv: [] })
		writeFileSync(flag, 'present\n')

		const green = await runGateIn({ cwd: root, argv: [] })
		const runsAfterGreen = countRuns(counter)
		const again = await runGateIn({ cwd: root, argv: [] })

		expect(failed.exitCode).toBe(1)
		expect(green.exitCode).toBe(0)
		expect(green.output).not.toContain('(reused)')
		expect(runsAfterGreen).toBe(2)
		expect(again.output).toContain('(reused)')
		expect(countRuns(counter)).toBe(2)
	})

	it('a record without key (an older cli wrote it) of the same tree → the steps run; the run after reuses the one that has a key', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		// no command can write a keyless record now: the file an older cli left, by hand
		const older: GateRecord = {
			mode: 'fast',
			at: '2026-01-01T00:00:00.000Z',
			head: headOf(root),
			stateHash: computeStateHash(root),
			steps: [{ name: 'count', status: 'passed', counts: {} }],
		}
		writeFileSync(gitPathOf({ root, name: FAST_RECORD_FILE }), `${JSON.stringify(older)}\n`)

		const first = await runGateIn({ cwd: root, argv: [] })
		const runsAfterFirst = countRuns(counter)
		const second = await runGateIn({ cwd: root, argv: [] })

		expect(first.output).not.toContain('(reused)')
		expect(runsAfterFirst).toBe(1)
		expect(second.output).toContain('(reused)')
		expect(countRuns(counter)).toBe(1)
	})
})

describe('gate: what a record may answer', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a gate --full --base <ref> green → a later gate --full without --base on the same tree is answered from it (the base reads the tdd step only)', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		writeFiles({ root, files: { 'src/b.ts': 'export {}\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: b'] })
		const first = await runGateIn({ cwd: root, argv: ['--full', '--base', 'HEAD~1'] })

		const second = await runGateIn({ cwd: root, argv: ['--full'] })

		expect(first.exitCode).toBe(0)
		expect(second.output).toContain('gate --full: green (reused)')
		expect(countRuns(counter)).toBe(1)
	})

	it('a gate --full without --base green → a later gate --full --base <ref> is answered from it', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		writeFiles({ root, files: { 'src/b.ts': 'export {}\n' } })
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: b'] })
		await runGateIn({ cwd: root, argv: ['--full'] })

		const second = await runGateIn({ cwd: root, argv: ['--full', '--base', 'HEAD~1'] })

		expect(second.output).toContain('gate --full: green (reused)')
		expect(countRuns(counter)).toBe(1)
	})

	it('a step that edits a tracked file while it runs → no record is stored for the state it left, and the next run runs the steps again', async () => {
		const counter = createCounter()
		const steps = [countingStep({ counter, edits: 'src/a.ts' })]
		const root = createGatePackage({
			fast: steps,
			full: steps,
			files: { 'src/a.ts': 'export {}\n' },
		})
		const before = treeOfWorkingFiles(root)

		const first = await runGateIn({ cwd: root, argv: [] })

		const after = treeOfWorkingFiles(root)
		expect(first.exitCode).toBe(0)
		expect(after).not.toBe(before)
		expect(readTreeRecords({ root, tree: after })).toEqual([])
		expect(readTreeRecords({ root, tree: before })).toEqual([])
		const second = await runGateIn({ cwd: root, argv: [] })
		expect(second.output).not.toContain('(reused)')
		expect(countRuns(counter)).toBe(2)
	})

	it('--json of a run whose record was not stored (a step edited a tracked file) → stored: false; of an ordinary green run → stored: true', async () => {
		const editing = createGatePackage({
			fast: [countingStep({ counter: createCounter(), edits: 'src/a.ts' })],
			files: { 'src/a.ts': 'export {}\n' },
		})
		const ordinary = countingPackage({ counter: createCounter() })

		const unstored = await runGateIn({ cwd: editing, argv: ['--json'] })
		const stored = await runGateIn({ cwd: ordinary, argv: ['--json'] })

		expect(JSON.parse(unstored.output)).toMatchObject({ ok: true, stored: false })
		expect(JSON.parse(stored.output)).toMatchObject({ ok: true, stored: true })
	})

	it('a record with no steps in the store for this tree → the gate runs its steps and is green, no crash', async () => {
		const counter = createCounter()
		const root = countingPackage({ counter })
		await runGateIn({ cwd: root, argv: [] })
		const key = fastRecordOf(root)?.key
		const storeFile = join(
			commonGitDirOf(root),
			CHECK_STORE_FOLDER,
			`${treeOfWorkingFiles(root)}.json`,
		)
		writeFileSync(
			storeFile,
			JSON.stringify([{ mode: 'fast', at: '2999-01-01T00:00:00.000Z', head: headOf(root), key }]),
		)

		await expect(runGateIn({ cwd: root, argv: [] })).resolves.toMatchObject({ exitCode: 0 })
		expect(countRuns(counter)).toBe(2)
	})
})

describe('gate: a step that runs only the changed tests', { timeout: TDD_GATE_TIMEOUT }, () => {
	it('a record made at another HEAD, the same tree → not reused (which tests ran depends on the diff against HEAD); at the same HEAD it is', async () => {
		const counter = createCounter()
		const steps = [countingStep({ counter, changedOnly: true })]
		const root = createVitestPackage({
			files: { 'src/a.ts': 'export {}\n' },
			dialecte: { gate: { fast: steps, full: steps } },
		})
		writeFiles({ root, files: { 'src/b.ts': 'export {}\n' } })
		git({ root, args: ['add', '--', 'src/b.ts'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: b'] })
		await runGateIn({ cwd: root, argv: [] })
		const control = await runGateIn({ cwd: root, argv: [] })
		const runsAfterControl = countRuns(counter)
		git({ root, args: ['reset', '-q', 'HEAD~1'] })

		const moved = await runGateIn({ cwd: root, argv: ['--declare', 'src/'] })

		expect(runsAfterControl).toBe(1)
		expect(control.output).toContain('(reused)')
		expect(moved.exitCode).toBe(0)
		expect(moved.output).not.toContain('(reused)')
		expect(countRuns(counter)).toBe(2)
	})
})

describe('gate: the tdd step is never reused', { timeout: TDD_GATE_TIMEOUT }, () => {
	/** A vitest package (the tdd step really runs) whose gates hold the counting step. */
	function vitestPackageWithCountingStep(counter: string): string {
		const steps = [countingStep({ counter })]
		return createVitestPackage({
			files: { 'src/a.ts': 'export {}\n' },
			dialecte: { gate: { fast: steps, full: steps } },
		})
	}

	it('a reused gate still runs its tdd step: the second run prints a fresh tdd line (ok) and the steps are answered from the record', async () => {
		const counter = createCounter()
		const root = vitestPackageWithCountingStep(counter)
		await runGateIn({ cwd: root, argv: [] })

		const second = await runGateIn({ cwd: root, argv: [] })

		const lines = second.output.split('\n')
		expect(countRuns(counter)).toBe(1)
		expect(second.output).toContain('(reused)')
		expect(lines.filter((line) => /^ok +tdd\b/.test(line))).toEqual([
			'ok    tdd  no test code new or changed since the base',
		])
		expect(lines.findIndex((line) => /^ok +tdd\b/.test(line))).toBeLessThan(
			lines.findIndex((line) => /^ok +count\b/.test(line)),
		)
	})

	it('the tdd step fails now on the same tree (a lot file changed, the tree has no .dialecte/) → no reuse: the gate fails at tdd, the steps not run', async () => {
		const counter = createCounter()
		const root = vitestPackageWithCountingStep(counter)
		await runGateIn({ cwd: root, argv: [] })
		const control = await runGateIn({ cwd: root, argv: [] })
		const runsAfterControl = countRuns(counter)
		mkdirSync(join(root, '.dialecte'))
		writeFileSync(join(root, '.dialecte/lot.json'), JSON.stringify({ tdd: 'skip' }))

		const failing = await runGateIn({ cwd: root, argv: [] })

		expect(runsAfterControl).toBe(1)
		expect(control.output).toContain('(reused)')
		expect(failing.exitCode).toBe(1)
		expect(failing.output).toContain('gate --fast: failed at tdd')
		expect(failing.output).toMatch(/^FAIL +tdd\b/m)
		expect(failing.output).not.toContain('(reused)')
		expect(countRuns(counter)).toBe(1)
	})

	it('only HEAD moves (a committed test file is un-committed, mixed reset: same files, same tree) → the test file is new against the base with no red: the gate fails at tdd, no reuse, steps not run', async () => {
		const counter = createCounter()
		const root = vitestPackageWithCountingStep(counter)
		writeFiles({
			root,
			files: {
				'src/a.test.ts':
					"import { expect, it } from 'vitest'\nit('one → one', () => { expect(1).toBe(1) })\n",
			},
		})
		git({ root, args: ['add', '--', 'src/a.test.ts'] })
		git({ root, args: ['commit', '-q', '-m', 'test: a'] })
		const green = await runGateIn({ cwd: root, argv: [] })
		const control = await runGateIn({ cwd: root, argv: [] })
		const runsAfterControl = countRuns(counter)
		git({ root, args: ['reset', '-q', 'HEAD~1'] })

		const failing = await runGateIn({ cwd: root, argv: ['--declare', 'src/'] })

		expect(green.exitCode).toBe(0)
		expect(runsAfterControl).toBe(1)
		expect(control.output).toContain('(reused)')
		expect(failing.exitCode).toBe(1)
		expect(failing.output).toMatch(/^FAIL +tdd\b/m)
		expect(failing.output).toContain('gate --fast: failed at tdd')
		expect(failing.output).not.toContain('(reused)')
		expect(countRuns(counter)).toBe(1)
	})
})

describe(
	'handover run: the hook record carries its key',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("a real commit with a hook → dialecte-gate-hook.json holds the commit's tree and the hash of the hook files, and the store holds the record under that tree", async () => {
			const hookCounter = createCounter()
			const root = createHookedPackage({ hookCounter, gateCounter: createCounter() })
			editReadLot(root)
			const { out } = writeReadLotHandover(root)

			const ran = await runFolder({ out })

			const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })
			const commitTree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			expect(ran.exitCode).toBe(0)
			expect(countRuns(hookCounter)).toBe(1)
			expect(hashHookCommand(root)).toBe(record?.key?.commandHash)
			expect(record?.key).toEqual({
				tree: commitTree,
				lockHash: 'none',
				commandHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				linked: expect.stringMatching(/^[0-9a-f]{64}$/),
			})
			expect(readTreeRecords({ root, tree: commitTree })).toContainEqual(record)
		})
	},
)
