/**
 * The vitest projects of one tdd command, probed on fixture packages: CI's projects matched to the projects vitest
 * resolves from the package's own config (a function-built one too), each project's module sharing and the asked
 * files it holds; a CI name the config lacks is a run failure; the probe leaves the tree as it was.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { createVitestPackage } from '../../../test/scratch-vitest-package.ts'
import { snapshotTree } from '../../../test/tdd-runners-base-red-workspace.ts'
import { readPackageJson } from '../package-json.ts'
import { runVitestCases } from './run-vitest-cases.ts'
import { readVitestSelection } from './vitest-selection.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProbedProject, VitestSelection } from './tdd.types.ts'

const PROBE_TIMEOUT = 120_000

const WORKFLOW_PATH = '.github/workflows/_test.yml'

/** A test workflow of one job running the node project, then the all project. */
const NODE_AND_ALL_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'jobs:',
	'  test:',
	'    runs-on: ubuntu-24.04',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Node tests',
	'        run: npm run test:node',
	'      - name: All tests',
	'        run: npm run test:all',
	'',
].join('\n')

/** A test workflow running the node project and a project the config does not declare. */
const NODE_AND_NOPE_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'jobs:',
	'  test:',
	'    runs-on: ubuntu-24.04',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Tests',
	'        run: npx vitest run --project node --project nope',
	'',
].join('\n')

/** The cli's own shape: the whole suite in shards, no project named. */
const SHARDED_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'jobs:',
	'  test:',
	'    runs-on: ubuntu-24.04',
	'    strategy:',
	'      matrix:',
	'        shard: [1, 2, 3, 4, 5, 6, 7, 8]',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Run Tests',
	'        run: npx vitest run --shard=${{ matrix.shard }}/8',
	'',
].join('\n')

/**
 * scl's shape: projects built by a function, an exclude spread from an imported list through a function, one project
 * from a spread call, a node project sharing modules (forks, isolate false) and a vm-pool one with isolate false.
 */
const FUNCTION_BUILT_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'',
	"import { NODE_ONLY_TEST_FILES } from './test/node-only-files.ts'",
	'',
	'type ProjectParams = {',
	'\tname: string',
	'\tinclude: string[]',
	'\texclude?: string[]',
	'\tisolate?: boolean',
	"\tpool?: 'forks' | 'vmThreads'",
	'}',
	'',
	'function project(params: ProjectParams) {',
	'\treturn {',
	'\t\ttest: {',
	'\t\t\tname: params.name,',
	'\t\t\tinclude: params.include,',
	'\t\t\texclude: params.exclude ?? [],',
	'\t\t\t...(params.isolate !== undefined && { isolate: params.isolate }),',
	'\t\t\t...(params.pool && { pool: params.pool }),',
	'\t\t},',
	'\t}',
	'}',
	'',
	'function excluding(files: readonly string[]): string[] {',
	'\treturn [...files]',
	'}',
	'',
	'function browserLikeProjects() {',
	"\treturn [project({ name: 'all', include: ['src/**/*.test.ts'], exclude: [...excluding(NODE_ONLY_TEST_FILES)] })]",
	'}',
	'',
	'export default defineConfig({',
	'\ttest: {',
	'\t\tprojects: [',
	"\t\t\tproject({ name: 'node', include: ['src/**/*.test.ts'], isolate: false, pool: 'forks' }),",
	'\t\t\t...browserLikeProjects(),',
	"\t\t\tproject({ name: 'vm', include: ['vm/**/*.test.ts'], isolate: false, pool: 'vmThreads' }),",
	'\t\t],',
	'\t},',
	'})',
	'',
].join('\n')

const NODE_ONLY_FILES_TEXT = "export const NODE_ONLY_TEST_FILES = ['src/node-only.test.ts']\n"

/** Two node projects holding the same files. */
const TWO_NODE_PROJECTS_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'node', include: ['src/**/*.test.ts'] } },",
	"\t{ test: { name: 'node-extra', include: ['src/**/*.test.ts'] } },",
	'] } })',
	'',
].join('\n')

/** The cli's own shape: no projects, the default isolation. */
const NO_PROJECTS_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	"export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })",
	'',
].join('\n')

/** Projects chosen on the environment: under CI (as a tdd run sets it) node alone, else node and local too. */
const CI_CHOSEN_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	"const node = { test: { name: 'node', include: ['src/**/*.test.ts'] } }",
	"const local = { test: { name: 'local', include: ['src/**/*.test.ts'] } }",
	"export default defineConfig({ test: { projects: process.env.CI === 'true' ? [node] : [node, local] } })",
	'',
].join('\n')

const NODE_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'jobs:',
	'  test:',
	'    runs-on: ubuntu-24.04',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Tests',
	'        run: npx vitest run --project node',
	'',
].join('\n')

/** A config holding a handle open at its module level (an interval): a process that loads it never exits by itself. */
const OPEN_HANDLE_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'setInterval(() => {}, 1000)',
	"export default defineConfig({ test: { projects: [{ test: { name: 'node', include: ['src/**/*.test.ts'] } }] } })",
	'',
].join('\n')

/** How long the probe of a config holding a handle open may take before the row calls it hung. */
const OPEN_HANDLE_BOUND_MS = 30_000

const PASSING_TEST = [
	"import { expect, it } from 'vitest'",
	"it('one', () => { expect(1).toBe(1) })",
	'',
].join('\n')

const MOCKING_TEST = [
	"import { expect, it, vi } from 'vitest'",
	"vi.mock('./value.ts', () => ({ value: 2 }))",
	"import { value } from './value.ts'",
	"it('the mocked value', () => { expect(value).toBe(2) })",
	'',
].join('\n')

const SHARED_FILE = 'src/shared.test.ts'
const NODE_ONLY_FILE = 'src/node-only.test.ts'
const VM_FILE = 'vm/vm.test.ts'

/** The package's selection for `files`, its projects in name order. */
async function selectionOf(params: {
	root: string
	files: string[]
}): Promise<VitestSelection | { failure: string }> {
	const selection = await readVitestSelection({
		root: params.root,
		packageJson: readPackageJson(params.root),
		files: params.files,
	})
	if ('failure' in selection) return selection
	return {
		...selection,
		projects: [...selection.projects].sort((left, right) => left.name.localeCompare(right.name)),
	}
}

describe('readVitestSelection', { timeout: PROBE_TIMEOUT }, () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('a function-built config (scl shape) and CI running node and all → each project as vitest resolves it: its name, module sharing (forks shares, vm does not) and held files; the vm file outside CI', async () => {
		const root = createVitestPackage({
			files: {
				'package.json': `${JSON.stringify(
					{
						name: 'demo',
						type: 'module',
						scripts: {
							'test:node': 'vitest run --project node',
							'test:all': 'vitest run --project all',
						},
						devDependencies: { vitest: '^4.1.8' },
					},
					null,
					'\t',
				)}\n`,
				'vitest.config.ts': FUNCTION_BUILT_CONFIG,
				'test/node-only-files.ts': NODE_ONLY_FILES_TEXT,
				[WORKFLOW_PATH]: NODE_AND_ALL_WORKFLOW,
				[SHARED_FILE]: PASSING_TEST,
				[NODE_ONLY_FILE]: PASSING_TEST,
				[VM_FILE]: PASSING_TEST,
			},
		})
		const projects: ProbedProject[] = [
			{ name: 'all', parent: 'all', sharesModules: false, holds: [SHARED_FILE] },
			{ name: 'node', parent: 'node', sharesModules: true, holds: [SHARED_FILE, NODE_ONLY_FILE] },
			{ name: 'vm', parent: 'vm', sharesModules: false, holds: [VM_FILE] },
		]

		await expect(
			selectionOf({ root, files: [SHARED_FILE, NODE_ONLY_FILE, VM_FILE] }),
		).resolves.toEqual({
			ci: {
				kind: 'projects',
				names: ['node', 'all'],
				source: expect.stringContaining(WORKFLOW_PATH),
			},
			projects,
			held: [SHARED_FILE, NODE_ONLY_FILE],
			outside: [VM_FILE],
			notes: [
				expect.stringMatching(
					/^vitest projects: node, all \(as \.github\/workflows\/_test\.yml.* runs them\)$/,
				),
				`not in CI's projects: ${VM_FILE}`,
			],
		})
	})

	it('CI running node and nope, the config declaring node and node-extra → a run failure naming nope and its source', async () => {
		const root = createVitestPackage({
			files: {
				'vitest.config.ts': TWO_NODE_PROJECTS_CONFIG,
				[WORKFLOW_PATH]: NODE_AND_NOPE_WORKFLOW,
				[SHARED_FILE]: PASSING_TEST,
			},
		})

		await expect(selectionOf({ root, files: [SHARED_FILE] })).resolves.toEqual({
			failure: expect.stringMatching(
				/^tdd: CI runs vitest --project nope \(.*\.github\/workflows\/_test\.yml.*\), which this config does not declare$/,
			),
		})
	})

	it('a probe on a committed fixture → its tree left as it was; the probed names of a file are the labels a run of it gives its cases', async () => {
		const root = createVitestPackage({
			files: { 'vitest.config.ts': TWO_NODE_PROJECTS_CONFIG, [SHARED_FILE]: PASSING_TEST },
		})
		const run = await runVitestCases({ root, files: [SHARED_FILE], filter: 'all' })
		const labels =
			'failure' in run
				? [run.failure]
				: [
						...new Set(run.flatMap((module) => module.cases.map((testCase) => testCase.project))),
					].sort()
		const before = snapshotTree(root)

		const probed = selectionOf({ root, files: [SHARED_FILE] }).then((selection) => ({
			names:
				'failure' in selection
					? [selection.failure]
					: selection.projects
							.filter((project) => project.holds.includes(SHARED_FILE))
							.map((project) => project.name),
			tree: snapshotTree(root),
		}))

		await expect(probed).resolves.toEqual({ names: labels, tree: before })
		expect(labels).toEqual(['node', 'node-extra'])
	})

	it('the cli shape: CI running the sharded suite, a config without projects, a vi.mock file → all, no notes, its one project isolating files', async () => {
		const root = createVitestPackage({
			files: {
				'vitest.config.ts': NO_PROJECTS_CONFIG,
				[WORKFLOW_PATH]: SHARDED_WORKFLOW,
				'src/value.ts': 'export const value = 1\n',
				'src/mocking.test.ts': MOCKING_TEST,
			},
		})

		await expect(selectionOf({ root, files: ['src/mocking.test.ts'] })).resolves.toMatchObject({
			ci: { kind: 'all' },
			projects: [{ sharesModules: false, holds: ['src/mocking.test.ts'] }],
			held: ['src/mocking.test.ts'],
			outside: [],
			notes: [],
		})
	})

	it('a config choosing its projects on CI, the probe run without CI in the environment → probed with the run environment (CI=true): node alone', async () => {
		const root = createVitestPackage({
			files: {
				'vitest.config.ts': CI_CHOSEN_CONFIG,
				[WORKFLOW_PATH]: NODE_WORKFLOW,
				[SHARED_FILE]: PASSING_TEST,
			},
		})
		vi.stubEnv('CI', '')

		await expect(
			selectionOf({ root, files: [SHARED_FILE] }).then((selection) =>
				'failure' in selection ? selection : selection.projects.map((project) => project.name),
			),
		).resolves.toEqual(['node'])
	})

	it(
		'a config holding an interval open → the probe still answers well within the bound, not at the stall watchdog',
		{ timeout: OPEN_HANDLE_BOUND_MS + 30_000 },
		async () => {
			const root = createVitestPackage({
				files: {
					'vitest.config.ts': OPEN_HANDLE_CONFIG,
					[WORKFLOW_PATH]: NODE_WORKFLOW,
					[SHARED_FILE]: PASSING_TEST,
				},
			})
			let timer: NodeJS.Timeout | undefined
			const hung = new Promise<string>((resolve) => {
				timer = setTimeout(
					() => resolve(`no answer after ${OPEN_HANDLE_BOUND_MS} ms`),
					OPEN_HANDLE_BOUND_MS,
				)
			})
			const answered = selectionOf({ root, files: [SHARED_FILE] }).then((selection) =>
				'failure' in selection ? selection : selection.projects.map((project) => project.name),
			)

			await expect(
				Promise.race([answered, hung]).finally(() => clearTimeout(timer)),
			).resolves.toEqual(['node'])
		},
	)

	it('no node_modules/.bin/vitest (the npx fallback), a config without projects → no all note, one note saying the module mock refusal is skipped', async () => {
		const root = createVitestPackage({
			files: {
				'vitest.config.ts': NO_PROJECTS_CONFIG,
				'src/value.ts': 'export const value = 1\n',
				'src/mocking.test.ts': MOCKING_TEST,
			},
		})
		rmSync(join(root, 'node_modules', '.bin'), { recursive: true, force: true })

		await expect(selectionOf({ root, files: ['src/mocking.test.ts'] })).resolves.toMatchObject({
			ci: { kind: 'all' },
			notes: [expect.stringMatching(/module mock/)],
		})
	})
})
