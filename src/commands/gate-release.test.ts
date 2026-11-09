/** `gate --release`: the modes it refuses, the empty-tree base (A16), its record and store, its reuse, the covering line. */
import { readFileSync } from 'node:fs'

import { readRecordFile } from '../../test/gate-records.ts'
import { RELEASE_RECORD_FILE } from '../../test/scoped-gate-package.constants.ts'
import {
	createScopedPackage,
	createScopedStep,
	emptyTreeOf,
	readScopedRuns,
	recordGitCommands,
} from '../../test/scoped-gate-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { countRuns, countingStep, createCounter, runGateIn } from '../../test/scratch-checks.ts'
import { git } from '../../test/scratch-repository.ts'
import { treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { hashGateCommand } from '../lib/gate-records/check-key.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { readGateRecords, readReleaseRecord } from '../lib/gate-records/gate-records.ts'
import { resolveGateBase } from '../lib/gate/gate-base.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

vi.mock('../lib/gate/gate-base.ts', async function mockGateBase(importOriginal) {
	const actual = await importOriginal<typeof import('../lib/gate/gate-base.ts')>()
	return { ...actual, resolveGateBase: vi.fn(actual.resolveGateBase) }
})

beforeEach(function clearResolverCalls() {
	vi.mocked(resolveGateBase).mockClear()
})

function releaseRecordOf(root: string): GateRecord | undefined {
	return readRecordFile<GateRecord>({ root, name: RELEASE_RECORD_FILE })
}

/** A package whose gates (and release, the default list) hold an unscoped counting step and a scoped step. */
function releasePackage() {
	const counter = createCounter()
	const scoped = createScopedStep()
	const steps = [countingStep({ counter }), scoped.step]
	const root = createScopedPackage({ gate: { fast: steps, full: steps } })
	return { root, counter, scoped, steps }
}

describe('gate --release', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	describe.each([['--fast'], ['--full'], ['--hook']])('gate --release %s', (flag) => {
		it('refused: exit 2, no step ran', async () => {
			const { root, counter, scoped } = releasePackage()

			const result = await runGateIn({ cwd: root, argv: ['--release', flag] })

			expect(result.exitCode).toBe(2)
			expect(countRuns(counter)).toBe(0)
			expect(readScopedRuns(scoped)).toEqual([])
			expect(releaseRecordOf(root)).toBeUndefined()
		})
	})

	it('A16: a scoped step gets the empty-tree base, the state tree and a changed file of every path of the tree; no base is looked up', async () => {
		const { root, scoped } = releasePackage()
		const tree = treeOfWorkingFiles(root)
		const paths = git({ root, args: ['ls-tree', '-r', '--name-only', '-z', tree] })
			.split('\0')
			.filter(Boolean)
			.sort()

		const result = await runGateIn({ cwd: root, argv: ['--release'] })

		expect(result.exitCode).toBe(0)
		expect(readScopedRuns(scoped)).toEqual([{ base: emptyTreeOf(root), tree }])
		expect(
			readFileSync(`${scoped.log}.changed`, 'utf8').split('\0').filter(Boolean).sort(),
		).toEqual(paths)
		expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
	})

	it('runs the tdd step and no hygiene, and ends gate --release: green', async () => {
		const { root } = releasePackage()
		const spawned = recordGitCommands()

		const result = await runGateIn({ cwd: root, argv: ['--release'] })

		const lines = result.output.split('\n')
		expect(result.exitCode).toBe(0)
		// the tdd step measures the whole branch, as --full does: its one merge-base of HEAD and main
		expect(spawned().filter((line) => /\bmerge-base HEAD main\b/.test(line))).toHaveLength(1)
		expect(lines.filter((line) => /^(ok|skip|FAIL) +tdd\b/.test(line))).toHaveLength(1)
		expect(lines.filter((line) => /^(ok|skip|FAIL) +hygiene\b/.test(line))).toEqual([])
		expect(lines.at(-1)).toBe('gate --release: green')
	})

	it('the record is dialecte-gate-release.json, mode release, keyed on the tree with the release steps and the empty-tree base; the step records its selection of everything', async () => {
		const { root, steps } = releasePackage()
		const tree = treeOfWorkingFiles(root)

		await runGateIn({ cwd: root, argv: ['--release'] })

		const record = releaseRecordOf(root)
		expect(record).toMatchObject({ mode: 'release', key: { tree } })
		expect(record?.key?.commandHash).toBe(hashGateCommand({ steps, gateBase: emptyTreeOf(root) }))
		expect(record?.base).toEqual({ commit: emptyTreeOf(root), source: 'release' })
		expect(record?.steps.find((step) => step.name === 'scoped')?.selection).toMatchObject({
			base: emptyTreeOf(root),
			tree,
		})
	})

	it('the stored record holds the release base too', async () => {
		const { root } = releasePackage()

		await runGateIn({ cwd: root, argv: ['--release'] })

		const [stored] = readTreeRecords({ root, tree: treeOfWorkingFiles(root) })
		expect(stored?.base).toEqual({ commit: emptyTreeOf(root), source: 'release' })
	})

	it('--json → mode release, ok, the scoped step with its selection', async () => {
		const { root } = releasePackage()

		const result = await runGateIn({ cwd: root, argv: ['--release', '--json'] })

		expect(JSON.parse(result.output)).toMatchObject({
			mode: 'release',
			ok: true,
			steps: expect.arrayContaining([
				expect.objectContaining({ step: expect.objectContaining({ name: 'scoped' }) }),
			]),
		})
	})

	describe.each([
		{ label: 'a known ref', ref: 'main', exitCode: 0 },
		{ label: 'an unknown ref', ref: 'no-such-ref', exitCode: 1 },
	])('--base with --release, $label', ({ ref, exitCode }) => {
		it('only the tdd step reads the ref (an unknown one fails it, exit 1); the gate base stays the empty tree, no base line, nothing resolved', async () => {
			const { root, scoped } = releasePackage()

			const result = await runGateIn({ cwd: root, argv: ['--release', '--base', ref] })

			expect(result.exitCode).toBe(exitCode)
			expect(result.output).not.toContain('base from --base')
			expect(result.output).not.toContain('gate: --base')
			expect(vi.mocked(resolveGateBase)).not.toHaveBeenCalled()
			expect(readScopedRuns(scoped)).toEqual(
				exitCode === 0 ? [{ base: emptyTreeOf(root), tree: treeOfWorkingFiles(root) }] : [],
			)
		})
	})

	it('a package without a scoped step: a green gate --full on the tree does not answer gate --release', async () => {
		const counter = createCounter()
		const steps = [countingStep({ counter })]
		const root = createScopedPackage({ gate: { fast: steps, full: steps } })
		await runGateIn({ cwd: root, argv: ['--full'] })

		const release = await runGateIn({ cwd: root, argv: ['--release'] })

		expect(release.exitCode).toBe(0)
		expect(release.output.split('\n').at(-1)).toBe('gate --release: green')
		expect(countRuns(counter)).toBe(2)
	})

	it('the record goes to the store under mode release', async () => {
		const { root } = releasePackage()
		const tree = treeOfWorkingFiles(root)

		await runGateIn({ cwd: root, argv: ['--release'] })

		expect(readTreeRecords({ root, tree }).map((record) => record.mode)).toEqual(['release'])
	})

	it('readReleaseRecord reads it, readGateRecords does not list it', async () => {
		const { root } = releasePackage()
		await runGateIn({ cwd: root, argv: ['--full'] })

		await runGateIn({ cwd: root, argv: ['--release'] })

		expect(readReleaseRecord(root)).toEqual(releaseRecordOf(root))
		expect(readReleaseRecord(root)?.mode).toBe('release')
		expect(readGateRecords(root).map((record) => record.mode)).toEqual(['full'])
	})

	it('readReleaseRecord answers undefined when no release ran, a full gate has', async () => {
		const { root } = releasePackage()
		await runGateIn({ cwd: root, argv: ['--full'] })

		expect(readReleaseRecord(root)).toBeUndefined()
	})

	it('a second run on the same key → the steps are not run again, gate --release: green (reused)', async () => {
		const { root, counter, scoped } = releasePackage()
		await runGateIn({ cwd: root, argv: ['--release'] })

		const second = await runGateIn({ cwd: root, argv: ['--release'] })

		expect(second.exitCode).toBe(0)
		expect(second.output.split('\n').at(-1)).toBe('gate --release: green (reused)')
		expect(countRuns(counter)).toBe(1)
		expect(readScopedRuns(scoped)).toHaveLength(1)
	})

	it('--no-reuse runs the steps again', async () => {
		const { root, counter, scoped } = releasePackage()
		await runGateIn({ cwd: root, argv: ['--release'] })

		const second = await runGateIn({ cwd: root, argv: ['--release', '--no-reuse'] })

		expect(second.exitCode).toBe(0)
		expect(second.output.split('\n').at(-1)).toBe('gate --release: green')
		expect(countRuns(counter)).toBe(2)
		expect(readScopedRuns(scoped)).toHaveLength(2)
	})

	describe.each([
		{
			label: 'a declared list missing two full steps',
			full: ['one', 'two', 'three'],
			release: ['one'],
			line: 'release does not run: two, three: its record answers no full gate',
		},
		{
			label: 'a declared list missing one full step',
			full: ['one', 'two'],
			release: ['two'],
			line: 'release does not run: one: its record answers no full gate',
		},
		{
			label: 'a declared list that covers full',
			full: ['one', 'two'],
			release: ['two', 'one'],
			line: undefined,
		},
		{
			label: 'no declared list (it is full)',
			full: ['one', 'two'],
			release: undefined,
			line: undefined,
		},
	])('$label', ({ full, release, line }) => {
		it(
			line
				? 'prints the line naming the missing steps once, and the run is green'
				: 'prints no such line',
			async () => {
				const counter = createCounter()
				function stepOf(name: string) {
					return countingStep({ counter, name })
				}
				const root = createScopedPackage({
					gate: {
						fast: full.map(stepOf),
						full: full.map(stepOf),
						...(release && { release: release.map(stepOf) }),
					},
				})

				const result = await runGateIn({ cwd: root, argv: ['--release'] })

				const notCovering = result.output
					.split('\n')
					.filter((entry) => entry.startsWith('release does not run'))
				expect(result.exitCode).toBe(0)
				expect(result.output.split('\n').at(-1)).toBe('gate --release: green')
				expect(notCovering).toEqual(line ? [line] : [])
			},
		)
	})
})
