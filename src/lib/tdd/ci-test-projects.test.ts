/**
 * The vitest projects a package's CI runs, read from its own test workflow and the npm scripts its steps reach:
 * every named project, in first-seen order; every project (`all`, with the reason) whenever the reader cannot tell.
 */
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { readCiTestProjects } from './ci-test-projects.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../package-json.types.ts'
import type { CiTestProjects } from './tdd.types.ts'

const WORKFLOW_PATH = '.github/workflows/_test.yml'

/** A test workflow of one job whose only step runs `run`. */
function oneStepWorkflow(run: string): string {
	return [
		'name: _test',
		'',
		'on:',
		'  workflow_call:',
		'',
		'jobs:',
		'  test:',
		'    runs-on: ubuntu-24.04',
		'    steps:',
		'      - name: Checkout',
		'        uses: actions/checkout@v6',
		'      - name: Run Tests',
		`        run: ${run}`,
		'',
	].join('\n')
}

const TWO_JOBS_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'jobs:',
	'  test-node:',
	'    runs-on: ubuntu-24.04',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Install dependencies',
	'        run: npm ci',
	'      - name: Node tests',
	'        run: npm run test:node',
	'  test-browser:',
	'    runs-on: ubuntu-24.04',
	'    strategy:',
	'      matrix:',
	'        shard: [1, 2, 3, 4, 5, 6, 7, 8]',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Install browsers',
	'        run: npx playwright install --with-deps chromium',
	'      - name: Browser tests',
	'        run: npm run test:browser:all -- --retry=1 --shard=1/8',
	'',
].join('\n')

const GUARDED_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'    inputs:',
	'      mode:',
	'        type: string',
	'        default: pr',
	'',
	'jobs:',
	'  test:',
	'    runs-on: ubuntu-24.04',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Pull request tests',
	"        if: inputs.mode == 'pr'",
	'        run: npm run test:node',
	'      - name: Full tests',
	"        if: inputs.mode == 'full'",
	'        run: npm run test:browser:all',
	'',
].join('\n')

const REMOTE_USES_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'jobs:',
	'  test:',
	'    uses: org/repo/.github/workflows/test.yml@main',
	'',
].join('\n')

const WORKFLOW_DEFAULTS_WORKFLOW = [
	'name: _test',
	'',
	'on:',
	'  workflow_call:',
	'',
	'defaults:',
	'  run:',
	'    working-directory: sub',
	'',
	'jobs:',
	'  test:',
	'    runs-on: ubuntu-24.04',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Run Tests',
	'        run: npm run test:node',
	'',
].join('\n')

const MATRIX_WORKFLOW = [
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
	'        p: [node, browser-all]',
	'    steps:',
	'      - uses: actions/checkout@v6',
	'      - name: Run Tests',
	'        run: npx vitest run --project ${{ matrix.p }}',
	'',
].join('\n')

const WORKING_DIRECTORY_WORKFLOW = [
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
	'      - name: Run Tests',
	'        working-directory: packages/inner',
	'        run: npm run test:node',
	'',
].join('\n')

const LOCAL_USES_WORKFLOW = [
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
	'      - name: Run Tests',
	'        run: npm run test:node',
	'      - name: More tests',
	'        uses: ./.github/actions/more-tests',
	'',
].join('\n')

const UNPARSABLE_WORKFLOW = [
	'name: _test',
	'jobs:',
	'  test:',
	'    steps:',
	'      - run: npm run test:node',
	'     - run: [unclosed',
	'',
].join('\n')

const NODE_SCRIPTS = { 'test:node': 'vitest run --project node' }

/** `projects` naming `names`, read from the test workflow (and the scripts it reaches). */
function projectsAnswer(names: string[]): CiTestProjects {
	return { kind: 'projects', names, source: expect.stringContaining(WORKFLOW_PATH) }
}

/** `all`, its reason matching `pattern`. */
function allMatching(pattern: RegExp): CiTestProjects {
	return { kind: 'all', reason: expect.stringMatching(pattern) }
}

/** `all`, its reason holding `words`. */
function allAnswer(words: string): CiTestProjects {
	return { kind: 'all', reason: expect.stringContaining(words) }
}

const SCENARIOS: {
	title: string
	/** The package's scripts. */
	scripts: Record<string, string>
	/** The test workflow's text; none: the package has no test workflow. */
	workflow?: string
	answer: CiTestProjects
}[] = [
	{
		title:
			'a step running npm run test:node, its script vitest run --project node → projects [node]',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title:
			'two jobs, npm run test:node and npm run test:browser:all -- --retry=1 --shard=1/8 → projects [node, browser-all]',
		scripts: { ...NODE_SCRIPTS, 'test:browser:all': 'vitest run --project browser-all' },
		workflow: TWO_JOBS_WORKFLOW,
		answer: projectsAnswer(['node', 'browser-all']),
	},
	{
		title: 'a step npm run a && npm run b, each script naming a project → both, in order',
		scripts: { a: 'vitest run --project one', b: 'vitest run --project two' },
		workflow: oneStepWorkflow('npm run a && npm run b'),
		answer: projectsAnswer(['one', 'two']),
	},
	{
		title: 'scripts a → b → a (a cycle) → each read once, both projects, no hang',
		scripts: {
			a: 'vitest run --project one && npm run b',
			b: 'npm run a && vitest run --project two',
		},
		workflow: oneStepWorkflow('npm run a'),
		answer: projectsAnswer(['one', 'two']),
	},
	{
		title: 'a step npx --no-install vitest run --shard=1/8 (no project named) → all',
		scripts: {},
		workflow: oneStepWorkflow('npx --no-install vitest run --shard=1/8'),
		answer: allMatching(/project/),
	},
	{
		title: "steps guarded by if: inputs.mode == 'pr' and 'full' → the union of their projects",
		scripts: { ...NODE_SCRIPTS, 'test:browser:all': 'vitest run --project browser-all' },
		workflow: GUARDED_WORKFLOW,
		answer: projectsAnswer(['node', 'browser-all']),
	},
	{
		title:
			'a script STORE_CONTRACT_FULL_TABLE=1 vitest run --project browser-all (a leading assignment) → projects [browser-all]',
		scripts: { 'test:store': 'STORE_CONTRACT_FULL_TABLE=1 vitest run --project browser-all' },
		workflow: oneStepWorkflow('npm run test:store'),
		answer: projectsAnswer(['browser-all']),
	},
	{
		title: 'a script vitest run --project=node → projects [node]',
		scripts: { 'test:node': 'vitest run --project=node' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title: 'a script vitest list --project x beside a run of node → not a run: projects [node]',
		scripts: { ...NODE_SCRIPTS, 'test:list': 'vitest list --project x' },
		workflow: oneStepWorkflow('npm run test:list && npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title: 'a step npm test → the test script followed: projects [t]',
		scripts: { test: 'vitest run --project t' },
		workflow: oneStepWorkflow('npm test'),
		answer: projectsAnswer(['t']),
	},
	{
		title: 'a step npm t → the test script followed: projects [t]',
		scripts: { test: 'vitest run --project t' },
		workflow: oneStepWorkflow('npm t'),
		answer: projectsAnswer(['t']),
	},
	{
		title: 'a step npm run-script x → the script followed: projects [x]',
		scripts: { x: 'vitest run --project x' },
		workflow: oneStepWorkflow('npm run-script x'),
		answer: projectsAnswer(['x']),
	},
	{
		title: 'a step npm exec -- vitest run --project n → followed: projects [n]',
		scripts: {},
		workflow: oneStepWorkflow('npm exec -- vitest run --project n'),
		answer: projectsAnswer(['n']),
	},
	{
		title:
			'npm run x -- --project p, x = two runs naming a and b → p joins the last command only: projects [a, b, p]',
		scripts: { x: 'vitest run --project a && vitest run --project b' },
		workflow: oneStepWorkflow('npm run x -- --project p'),
		answer: projectsAnswer(['a', 'b', 'p']),
	},
	{
		title:
			'npm run x -- --project p, x = a run naming a then a run naming none → the last becomes a run of p: projects [a, p]',
		scripts: { x: 'vitest run --project a && vitest run' },
		workflow: oneStepWorkflow('npm run x -- --project p'),
		answer: projectsAnswer(['a', 'p']),
	},
	{
		title:
			'npm run x -- --project p, x = a run naming none then a run naming a → the first names no project: all',
		scripts: { x: 'vitest run && vitest run --project a' },
		workflow: oneStepWorkflow('npm run x -- --project p'),
		answer: allMatching(/project/),
	},
	{
		title:
			'a quoted node -e "a; b" before npm run test:node → one command, no split: projects [node]',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow(`node -e "console.log('a'); console.log('b')" && npm run test:node`),
		answer: projectsAnswer(['node']),
	},
	{
		title:
			'named runs beside a script running tsx scripts/test-scope/run-test-scope.ts → all, the reason naming the script',
		scripts: {
			'test:node': 'vitest run --project unit',
			'test:scope': 'tsx scripts/test-scope/run-test-scope.ts',
		},
		workflow: oneStepWorkflow('npm run test:node && npm run test:scope'),
		answer: allAnswer('test:scope (tsx scripts/test-scope/run-test-scope.ts) is not read'),
	},
	{
		title:
			'a script vitest run --config other.config.ts --project n → all, the reason naming --config',
		scripts: { 'test:node': 'vitest run --config other.config.ts --project n' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: allAnswer('--config'),
	},
	{
		title: 'no test workflow → all',
		scripts: NODE_SCRIPTS,
		answer: allAnswer(WORKFLOW_PATH),
	},
	{
		title: 'an unparsable test workflow → all, no throw',
		scripts: NODE_SCRIPTS,
		workflow: UNPARSABLE_WORKFLOW,
		answer: allMatching(/yaml/i),
	},
	{
		title: 'a step pnpm test → all',
		scripts: { test: 'vitest run --project t' },
		workflow: oneStepWorkflow('pnpm test'),
		answer: allAnswer('pnpm'),
	},
	{
		title: 'a pretest:node script naming a project → read with its script: projects [setup, node]',
		scripts: { ...NODE_SCRIPTS, 'pretest:node': 'vitest run --project setup' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: projectsAnswer(['setup', 'node']),
	},
	{
		title: 'a step npm run test:node --workspace inner → all, the reason naming --workspace',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm run test:node --workspace inner'),
		answer: allAnswer('--workspace'),
	},
	{
		title:
			'a step with working-directory packages/inner → all, the reason naming working-directory',
		scripts: NODE_SCRIPTS,
		workflow: WORKING_DIRECTORY_WORKFLOW,
		answer: allAnswer('working-directory'),
	},
	{
		title: 'a step using a local action (uses: ./...) → all, the reason naming it',
		scripts: NODE_SCRIPTS,
		workflow: LOCAL_USES_WORKFLOW,
		answer: allAnswer('./.github/actions/more-tests'),
	},
	{
		title:
			'a step npm run test:node && make test (a command of no known form) → all, the reason naming make test',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm run test:node && make test'),
		answer: allAnswer('make test'),
	},
	{
		title:
			'a step echo, cd and npm install (known non-runners) before npm run test:node → projects [node]',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('echo start && cd . && npm install && npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title: 'one step running npm run test:node twice (&&) → node named once: projects [node]',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm run test:node && npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title: 'a script vitest run -c other.config.ts --project n → all, the reason naming -c',
		scripts: { 'test:node': 'vitest run -c other.config.ts --project n' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: allAnswer('-c'),
	},
	{
		title: 'a script vitest run --root packages/inner --project n → all, the reason naming --root',
		scripts: { 'test:node': 'vitest run --root packages/inner --project n' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: allAnswer('--root'),
	},
	{
		title: 'a script vitest run --dir src --project n → all, the reason naming --dir',
		scripts: { 'test:node': 'vitest run --dir src --project n' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: allAnswer('--dir'),
	},
	{
		title: 'a step npx vitest run --project n → followed: projects [n]',
		scripts: {},
		workflow: oneStepWorkflow('npx vitest run --project n'),
		answer: projectsAnswer(['n']),
	},
	{
		title: 'a step node_modules/.bin/vitest run --project n → followed: projects [n]',
		scripts: {},
		workflow: oneStepWorkflow('node_modules/.bin/vitest run --project n'),
		answer: projectsAnswer(['n']),
	},
	{
		title: 'a step vitest run --project n (bare) → followed: projects [n]',
		scripts: {},
		workflow: oneStepWorkflow('vitest run --project n'),
		answer: projectsAnswer(['n']),
	},
	{
		title: 'a step npm exec vitest run --project n (no --) → followed: projects [n]',
		scripts: {},
		workflow: oneStepWorkflow('npm exec vitest run --project n'),
		answer: projectsAnswer(['n']),
	},
	{
		title:
			'a script a || b ; c | d of runs naming a, b, c, d → split on each: projects [a, b, c, d]',
		scripts: {
			'test:node':
				'vitest run --project a || vitest run --project b ; vitest run --project c | vitest run --project d',
		},
		workflow: oneStepWorkflow('npm run test:node'),
		answer: projectsAnswer(['a', 'b', 'c', 'd']),
	},
	{
		title:
			'a step echo "$(date; echo x)" before npm run test:node → $(...) kept whole, no split: projects [node]',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('echo "$(date; echo x)" && npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title: 'a step yarn test → all, the reason naming yarn',
		scripts: { test: 'vitest run --project t' },
		workflow: oneStepWorkflow('yarn test'),
		answer: allAnswer('yarn'),
	},
	{
		title:
			'a posttest:node script naming a project → read with its script: projects [node, teardown]',
		scripts: { ...NODE_SCRIPTS, 'posttest:node': 'vitest run --project teardown' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: projectsAnswer(['node', 'teardown']),
	},
	{
		title:
			'scripts vitest bench, vitest typecheck and vitest init naming projects beside a run of node → not runs: projects [node]',
		scripts: {
			...NODE_SCRIPTS,
			'test:other':
				'vitest bench --project b && vitest typecheck --project c && vitest init browser',
		},
		workflow: oneStepWorkflow('npm run test:other && npm run test:node'),
		answer: projectsAnswer(['node']),
	},
	{
		title: 'a step npm run test:node -w inner → all, the reason naming -w',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm run test:node -w inner'),
		answer: allAnswer('-w'),
	},
	{
		title: 'a step npm run test:node --prefix inner → all, the reason naming --prefix',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm run test:node --prefix inner'),
		answer: allAnswer('--prefix'),
	},
	{
		title:
			'a step npx vitest run --project ${{ matrix.p }} (a matrix expansion) → all, the reason naming the expansion',
		scripts: {},
		workflow: MATRIX_WORKFLOW,
		answer: allAnswer('${{ matrix.p }}'),
	},
	{
		title: 'a script vitest run --project $P (a variable) → all, the reason naming $P',
		scripts: { 'test:node': 'vitest run --project $P' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: allAnswer('$P'),
	},
	{
		title: 'a workflow running npm ci alone (no vitest run) → all, not projects []',
		scripts: NODE_SCRIPTS,
		workflow: oneStepWorkflow('npm ci'),
		answer: allMatching(/vitest/),
	},
	{
		title: 'a job using a remote reusable workflow → all, the reason naming it',
		scripts: NODE_SCRIPTS,
		workflow: REMOTE_USES_WORKFLOW,
		answer: allAnswer('org/repo/.github/workflows/test.yml@main'),
	},
	{
		title: 'a step cd e2e && npx vitest run --project e2e → all, the reason naming cd e2e',
		scripts: {},
		workflow: oneStepWorkflow('cd e2e && npx vitest run --project e2e'),
		answer: allAnswer('cd e2e'),
	},
	{
		title:
			'a workflow-level defaults.run.working-directory sub → all, the reason naming working-directory',
		scripts: NODE_SCRIPTS,
		workflow: WORKFLOW_DEFAULTS_WORKFLOW,
		answer: allAnswer('working-directory'),
	},
	{
		title:
			'a script vitest run src/fast --project node (a file filter) → all, the reason naming src/fast',
		scripts: { 'test:node': 'vitest run src/fast --project node' },
		workflow: oneStepWorkflow('npm run test:node'),
		answer: allAnswer('src/fast'),
	},
	{
		title:
			'a step npm run test:node 2>&1 | tee out.log, its script vitest run --project node > run.log → redirections are no file filters: projects [node]',
		scripts: { 'test:node': 'vitest run --project node > run.log' },
		workflow: oneStepWorkflow('npm run test:node 2>&1 | tee out.log'),
		answer: projectsAnswer(['node']),
	},
]

/** A package folder holding its package.json and, when given, its test workflow. */
function packageWith(params: { packageJson: PackageJson; workflow?: string }): string {
	const root = temporaryFolder('dialecte-ci-projects-')
	writeFiles({
		root,
		files: {
			'package.json': `${JSON.stringify(params.packageJson, null, '\t')}\n`,
			...(params.workflow !== undefined && { [WORKFLOW_PATH]: params.workflow }),
		},
	})
	return root
}

describe('readCiTestProjects', () => {
	for (const scenario of SCENARIOS)
		it(scenario.title, () => {
			const packageJson: PackageJson = { name: 'demo', scripts: scenario.scripts }
			const root = packageWith({ packageJson, workflow: scenario.workflow })

			expect(readCiTestProjects({ root, packageJson })).toEqual(scenario.answer)
		})
})
