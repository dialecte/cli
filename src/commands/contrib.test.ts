import { readRecordFile } from '../../test/gate-records.ts'
import { startedAt, reportRun } from '../../test/mutation-hooks.ts'
import { PACKAGE_NAME } from '../../test/mutation-package.constants.ts'
import { mutationPackage, survivorOf } from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { countRuns, createCounter, runGateIn, seedFullGate } from '../../test/scratch-checks.ts'
/** `contrib`: the contributor rows, their record, and the reuse of a step the gate or an earlier contrib ran. */
import {
	CONSUMER_REFUSAL,
	BROKEN_FILE,
	BROKEN_TEXT,
	CONTRIB_RECORD_FILE,
	EDITED_SOURCE_TEXT,
	GENERATED_DOCS_FILE,
	GENERATED_DOCS_TEXT,
	REWRITTEN_DOCS_TEXT,
	SOURCE_FILE,
} from '../../test/scratch-contrib.constants.ts'
import {
	counterStep,
	createContribPackage,
	parseContribJson,
	readPackageFile,
	removeCheckStore,
	runContribIn,
} from '../../test/scratch-contrib.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { addWorktree, treeOfWorkingFiles } from '../../test/scratch-tree.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import { RULES_RECORD_FILE } from '../lib/gate-records/gate-records.constants.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord, RulesRecord } from '../lib/gate-records/gate-records.types.ts'

/** The names on the step lines of a plain output, in order: `ok  docs ...`, `skip  type-bench ...`. */
function rowNamesOf(output: string): string[] {
	return output.split('\n').flatMap((line) => /^(?:ok|skip|FAIL) +(\S+)/.exec(line)?.slice(1) ?? [])
}

/** A contributor package whose docs and type-bench steps count their runs. */
function countingPackage(params: { docs: string; bench: string }): string {
	return createContribPackage({
		steps: [
			counterStep({ counter: params.docs, name: 'docs' }),
			counterStep({ counter: params.bench, name: 'type-bench' }),
		],
	})
}

function rulesRecordOf(root: string): RulesRecord | undefined {
	return readRecordFile<RulesRecord>({ root, name: RULES_RECORD_FILE })
}

function contribRecordOf(root: string): GateRecord | undefined {
	return readRecordFile<GateRecord>({ root, name: CONTRIB_RECORD_FILE })
}

describe('contrib: who may run it', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('consumer → exit 2, the consumer refusal line, no record written', async () => {
		const root = createContribPackage({ profile: null })

		await expect(runContribIn({ cwd: root })).resolves.toEqual({
			exitCode: 2,
			output: CONSUMER_REFUSAL,
		})
		expect(contribRecordOf(root)).toBeUndefined()
		expect(readTreeRecords({ root, tree: treeOfWorkingFiles(root) })).toEqual([])
	})

	it('an invalid dialecte.profile → refused, exit 2', async () => {
		const root = createContribPackage({ profile: 'Contributer' })

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringContaining(
				'dialecte.profile: "Contributer" is not a profile; profiles: contributor, consumer',
			),
		})
		expect(contribRecordOf(root)).toBeUndefined()
	})
})

describe('contrib: the rows', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('contributor all green → exit 0, one line per row, record dialecte-gate-contrib.json and a store entry', async () => {
		const root = countingPackage({ docs: createCounter(), bench: createCounter() })

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(/^ok +rules\b/m),
		})
		const result = await runContribIn({ cwd: root, argv: ['--no-reuse'] })
		const record = contribRecordOf(root)
		expect(rowNamesOf(result.output)).toEqual(['rules', 'docs', 'type-bench', 'release'])
		expect(rulesRecordOf(root)).toMatchObject({ errors: 0, warnings: 0 })
		expect(record).toMatchObject({ mode: 'contrib', head: expect.stringMatching(/^[0-9a-f]{40}$/) })
		expect(record?.steps.map((step) => [step.name, step.status])).toEqual([
			['rules', 'passed'],
			['docs', 'passed'],
			['type-bench', 'passed'],
			['release', 'passed'],
		])
		expect(
			readTreeRecords({ root, tree: record?.key?.tree ?? '' }).filter(
				(stored) => stored.mode === 'contrib',
			),
		).toHaveLength(1)
	})

	it('a rule error in a changed file → exit 1, the rules row failed, the record failed', async () => {
		const root = createContribPackage({ steps: [] })
		writeFiles({ root, files: { [BROKEN_FILE]: BROKEN_TEXT } })

		await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
			exitCode: 1,
			output: expect.stringContaining('"rules"'),
		})
		const result = await runContribIn({ cwd: root, argv: ['--json', '--no-reuse'] })
		expect(parseContribJson(result.output).rows).toContainEqual({
			name: 'rules',
			status: 'failed',
			detail: expect.stringContaining('function-as-const'),
		})
		expect(contribRecordOf(root)?.steps).toContainEqual(
			expect.objectContaining({ name: 'rules', status: 'failed' }),
		)
	})

	it('a failed contrib record is never reused: the broken package run twice stays failed, no reused', async () => {
		const root = createContribPackage({ steps: [] })
		writeFiles({ root, files: { [BROKEN_FILE]: BROKEN_TEXT } })

		await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
			exitCode: 1,
		})
		const second = await runContribIn({ cwd: root, argv: ['--json'] })
		const parsed = parseContribJson(second.output)

		expect(second.exitCode).toBe(1)
		expect(parsed.reused).toBeUndefined()
		expect(parsed.rows).toContainEqual(expect.objectContaining({ name: 'rules', status: 'failed' }))
	})

	it('a file: dependency → exit 1, the release row names the dependency', async () => {
		const root = createContribPackage({
			steps: [],
			packageJson: { devDependencies: { core: 'file:../core' } },
		})

		await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
			exitCode: 1,
		})
		const result = await runContribIn({ cwd: root, argv: ['--json', '--no-reuse'] })
		expect(parseContribJson(result.output).rows).toContainEqual({
			name: 'release',
			status: 'failed',
			detail: expect.stringMatching(/core\s+file:\.\.\/core/),
		})
	})

	it('no doc:build script → the docs row skipped with the missing-script detail, exit 0', async () => {
		const root = createContribPackage()

		await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
			exitCode: 0,
		})
		const result = await runContribIn({ cwd: root, argv: ['--json', '--no-reuse'] })
		expect(parseContribJson(result.output).rows).toContainEqual({
			name: 'docs',
			status: 'skipped',
			detail: expect.stringContaining('no npm script "doc:build"'),
		})
	})

	it('the docs step rewrites a generatedDocs file → restored byte for byte after the run', async () => {
		const counter = createCounter()
		const root = createContribPackage({
			generatedDocs: [GENERATED_DOCS_FILE],
			steps: [
				counterStep({
					counter,
					name: 'docs',
					before: `printf ${REWRITTEN_DOCS_TEXT} > ${GENERATED_DOCS_FILE}`,
					restoresGeneratedDocs: true,
				}),
			],
			files: { [GENERATED_DOCS_FILE]: GENERATED_DOCS_TEXT },
		})

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
		expect(countRuns(counter)).toBe(1)
		expect(readPackageFile({ root, path: GENERATED_DOCS_FILE })).toBe(GENERATED_DOCS_TEXT)
	})

	it('a package without a declared scope → no mutation row', async () => {
		const root = createContribPackage({ steps: [] })

		await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
			exitCode: 0,
		})
		const result = await runContribIn({ cwd: root, argv: ['--json', '--no-reuse'] })
		expect(parseContribJson(result.output).rows.map((row) => row.name)).toEqual([
			'rules',
			'release',
		])
	})

	it('a package with a declared scope and a new survivor → the mutation row printed failed, exit 1, not recorded', async () => {
		const root = mutationPackage({
			files: {
				'package.json': `${JSON.stringify({
					name: PACKAGE_NAME,
					dialecte: {
						profile: 'contributor',
						contrib: { steps: [] },
						mutation: { scope: ['src/engine/*.ts'], fast: { vitestConfig: 'v.config.ts' } },
					},
				})}\n`,
			},
		})
		reportRun({ root, survivors: [survivorOf({ key: 'k1' })], now: startedAt(1) })

		await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
			exitCode: 1,
		})
		const result = await runContribIn({ cwd: root, argv: ['--json', '--no-reuse'] })
		expect(parseContribJson(result.output).rows).toContainEqual({
			name: 'mutation',
			status: 'failed',
			detail: expect.stringContaining('1 new survivor'),
		})
		expect(contribRecordOf(root)?.steps.map((step) => step.name)).not.toContain('mutation')
	})
})

describe(
	'contrib: its own record answers a second run',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('run twice on the same tree → the second answered from the record (reused line), no step run', async () => {
			const docs = createCounter()
			const root = countingPackage({ docs, bench: createCounter() })

			await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
			const second = await runContribIn({ cwd: root })

			expect(second.exitCode).toBe(0)
			expect(second.output).toMatch(/reused/)
			expect(countRuns(docs)).toBe(1)
		})

		it('--no-reuse on a green tree → the steps run again', async () => {
			const docs = createCounter()
			const root = countingPackage({ docs, bench: createCounter() })

			await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
			const second = await runContribIn({ cwd: root, argv: ['--no-reuse'] })

			expect(second.exitCode).toBe(0)
			expect(countRuns(docs)).toBe(2)
		})

		it('HEAD moved with the same tree → not reused', async () => {
			const docs = createCounter()
			const root = countingPackage({ docs, bench: createCounter() })
			writeFiles({ root, files: { [SOURCE_FILE]: EDITED_SOURCE_TEXT } })

			await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: first'] })
			const second = await runContribIn({ cwd: root })

			expect(second.exitCode).toBe(0)
			expect(countRuns(docs)).toBe(2)
		})

		it('--json → profile, rows with name/status/detail, reused on a reused run', async () => {
			const root = countingPackage({ docs: createCounter(), bench: createCounter() })

			await expect(runContribIn({ cwd: root, argv: ['--json'] })).resolves.toMatchObject({
				exitCode: 0,
				output: expect.stringContaining('"profile": "contributor"'),
			})
			const firstResult = await runContribIn({ cwd: root, argv: ['--json', '--no-reuse'] })
			const firstRun = parseContribJson(firstResult.output)
			const reusedResult = await runContribIn({ cwd: root, argv: ['--json'] })
			const reusedRun = parseContribJson(reusedResult.output)

			expect(firstRun.reused).toBeUndefined()
			expect(reusedRun.profile).toBe('contributor')
			expect(reusedRun.rows).toEqual([
				{ name: 'rules', status: 'passed', detail: expect.any(String) },
				{ name: 'docs', status: 'passed', detail: expect.any(String) },
				{ name: 'type-bench', status: 'passed', detail: expect.any(String) },
				{ name: 'release', status: 'passed', detail: expect.any(String) },
			])
			expect(reusedRun.reused).toEqual({
				at: expect.any(String),
				head: expect.stringMatching(/^[0-9a-f]+$/),
			})
		})
	},
)

describe('contrib: a step gate --full already ran', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/** A contributor whose gate --full and contrib steps both hold the docs step counting in `counter`. */
	function sharedDocsPackage(counter: string): string {
		const docs = counterStep({ counter, name: 'docs' })
		return createContribPackage({ steps: [docs], gateFull: [docs] })
	}

	it('gate --full passed docs (same name and command) on this tree and install → the docs row reused from gate --full, the step not run', async () => {
		const counter = createCounter()
		const root = sharedDocsPackage(counter)
		await seedFullGate(root)

		const outcome = runContribIn({ cwd: root, argv: ['--json'] })

		await expect(outcome).resolves.toMatchObject({ exitCode: 0 })
		const settled = await outcome
		expect(parseContribJson(settled.output).rows).toContainEqual({
			name: 'docs',
			status: 'passed',
			detail: expect.stringContaining('reused from gate --full'),
		})
		expect(countRuns(counter)).toBe(1)
	})

	it('a green gate record in the worktree’s own records only → the docs row reused', async () => {
		const counter = createCounter()
		const root = sharedDocsPackage(counter)
		await seedFullGate(root)
		removeCheckStore(root)

		const outcome = runContribIn({ cwd: root, argv: ['--json'] })

		await expect(outcome).resolves.toMatchObject({ exitCode: 0 })
		const settled = await outcome
		expect(parseContribJson(settled.output).rows).toContainEqual({
			name: 'docs',
			status: 'passed',
			detail: expect.stringContaining('reused from gate --full'),
		})
		expect(countRuns(counter)).toBe(1)
	})

	it('a green gate record in the store only (another worktree, same tree and install) → the docs row reused', async () => {
		const counter = createCounter()
		const root = sharedDocsPackage(counter)
		await seedFullGate(addWorktree(root))

		const outcome = runContribIn({ cwd: root, argv: ['--json'] })

		await expect(outcome).resolves.toMatchObject({ exitCode: 0 })
		const settled = await outcome
		expect(parseContribJson(settled.output).rows).toContainEqual({
			name: 'docs',
			status: 'passed',
			detail: expect.stringContaining('reused from gate --full'),
		})
		expect(countRuns(counter)).toBe(1)
	})

	it('gate --full passed docs on another tree → the docs step runs', async () => {
		const counter = createCounter()
		const root = sharedDocsPackage(counter)
		await seedFullGate(root)
		writeFiles({ root, files: { [SOURCE_FILE]: EDITED_SOURCE_TEXT } })

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
		expect(countRuns(counter)).toBe(2)
	})

	it('gate --full passed docs with another command → the docs step runs', async () => {
		const gateCounter = createCounter()
		const contribCounter = createCounter()
		const root = createContribPackage({
			steps: [counterStep({ counter: contribCounter, name: 'docs' })],
			gateFull: [counterStep({ counter: gateCounter, name: 'docs' })],
		})
		await seedFullGate(root)

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
		expect(countRuns(contribCounter)).toBe(1)
	})

	it('gate --full failed type-bench on this tree → the type-bench step runs', async () => {
		const counter = createCounter()
		const failing = counterStep({ counter, name: 'type-bench', exitCode: 1 })
		const root = createContribPackage({ steps: [failing], gateFull: [failing] })
		const gate = await runGateIn({ cwd: root, argv: ['--full'] })
		expect(gate.exitCode).toBe(1)

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 1 })
		expect(countRuns(counter)).toBe(2)
	})

	it('gate --full passed docs on this tree and install, then contrib --no-reuse → the docs step runs, no reused from gate --full', async () => {
		const counter = createCounter()
		const root = sharedDocsPackage(counter)
		await seedFullGate(root)

		await expect(runContribIn({ cwd: root, argv: ['--no-reuse'] })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.not.stringContaining('reused from gate --full'),
		})
		expect(countRuns(counter)).toBe(2)
	})

	it('a green gate --fast record whose fast steps hold the same docs step → the docs step runs', async () => {
		const counter = createCounter()
		const docs = counterStep({ counter, name: 'docs' })
		const root = createContribPackage({ steps: [docs], gateFast: [docs] })
		const gate = await runGateIn({ cwd: root, argv: ['--fast'] })
		expect(gate.exitCode).toBe(0)

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
		expect(countRuns(counter)).toBe(2)
	})

	it('gate --full passed docs, then a new install (same tree) → the docs step runs', async () => {
		const counter = createCounter()
		const root = sharedDocsPackage(counter)
		await seedFullGate(root)
		writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"packages":{}}\n' } })

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({ exitCode: 0 })
		expect(countRuns(counter)).toBe(2)
	})

	it('a failed gate --full whose docs step passed → the docs step runs, not reused', async () => {
		const counter = createCounter()
		const docs = counterStep({ counter, name: 'docs' })
		const failing = counterStep({ counter: createCounter(), name: 'type-bench', exitCode: 1 })
		const root = createContribPackage({ steps: [docs], gateFull: [docs, failing] })
		const gate = await runGateIn({ cwd: root, argv: ['--full'] })
		expect(gate.exitCode).toBe(1)

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 0,
			output: expect.not.stringContaining('reused from gate --full'),
		})
		expect(countRuns(counter)).toBe(2)
	})
})

describe('contrib: no usable repository', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const PACKAGE_TEXT = `${JSON.stringify({ name: 'demo', dialecte: { profile: 'contributor' } })}\n`

	it('no git repository → refused with a contrib: line, exit 2', async () => {
		const root = temporaryFolder('dialecte-contrib-no-git-')
		writeFiles({ root, files: { 'package.json': PACKAGE_TEXT } })

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/^contrib:/),
		})
	})

	it('a repository with no commit → refused with a contrib: line, exit 2', async () => {
		const root = temporaryFolder('dialecte-contrib-no-commit-')
		git({ root, args: ['init', '-q', '-b', 'main'] })
		writeFiles({ root, files: { 'package.json': PACKAGE_TEXT } })

		await expect(runContribIn({ cwd: root })).resolves.toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/^contrib:/),
		})
	})
})
