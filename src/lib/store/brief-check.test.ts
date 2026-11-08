import { createHash } from 'node:crypto'
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
	PLAN_HEADING,
	PLAN_TEXT,
	RELATIVE_REPOSITORY,
} from '../../../test/brief-workspace.constants.ts'
import {
	briefWith,
	checkArgumentsOf,
	createBriefWorkspace,
	refusalKeysOf,
	writeBriefFile,
	writeStoreLot,
} from '../../../test/brief-workspace.ts'
import { createLinkedWorktree } from '../../../test/handover-store-scenario.ts'
import { git, initializeRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkBrief, probeCaseInsensitive } from './brief.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'
import type { CheckBriefResult } from './brief.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The refusals and the real repository of a check, for one assertion on both. */
function summaryOf(result: CheckBriefResult): {
	refused: CheckBriefResult['refused']
	repository: string | undefined
} {
	return {
		refused: result.refused,
		repository: result.checked ? realpathSync(result.checked.repository) : undefined,
	}
}

function sha256Of(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}

/** Every path under the folders, sorted, git's own folders left out. */
function treeOf(folders: string[]): string[] {
	return folders
		.flatMap((folder) =>
			existsSync(folder)
				? readdirSync(folder, { recursive: true }).map((entry) => join(folder, String(entry)))
				: [],
		)
		.filter((path) => !path.split('/').includes('.git'))
		.sort()
}

describe('checkBrief: a valid brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('passes and gives the base commit, the plan, the hashes and the normalised scope', () => {
		const workspace = createBriefWorkspace()
		const briefPath = writeBriefFile({
			workspace,
			brief: briefWith({ scope: ['./src//dataflow/'] }),
		})
		const briefText = readFileSync(briefPath, 'utf8')
		expect(checkBrief({ briefPath, caseInsensitive: false })).toMatchObject({
			refused: [],
			checked: {
				base: { ref: 'main', commit: workspace.commit },
				branch: 'feat/dataflow-subscribe',
				feature: 'dataflow-subscribe',
				goal: 'One sentence: what the lot delivers.',
				scope: ['src/dataflow'],
				effort: undefined,
				plan: { text: PLAN_TEXT, hash: sha256Of(PLAN_TEXT) },
				briefText,
				briefHash: sha256Of(briefText),
			},
		})
	})

	it('the repository is the real main checkout', () => {
		const workspace = createBriefWorkspace()
		expect(
			summaryOf(checkBrief(checkArgumentsOf({ workspace, brief: briefWith() }))).repository,
		).toBe(realpathSync(workspace.repository))
	})

	it('reads a relative brief path against the given cwd', () => {
		const workspace = createBriefWorkspace()
		writeBriefFile({ workspace, brief: briefWith() })
		expect(
			checkBrief({
				briefPath: '_commit-plan/lot/brief.json',
				cwd: workspace.workspace,
				caseInsensitive: false,
			}).refused,
		).toEqual([])
	})

	it('creates nothing: no store, no list line, no worktree folder, no ref', () => {
		const workspace = createBriefWorkspace()
		const folders = [workspace.workspace, join(workspace.storeList, '..', '..')]
		const refsBefore = git({ root: workspace.repository, args: ['for-each-ref'] })
		const briefPath = writeBriefFile({ workspace, brief: briefWith() })
		const before = treeOf(folders)
		expect(checkBrief({ briefPath, caseInsensitive: false }).refused).toEqual([])
		expect(treeOf(folders)).toEqual(before)
		expect(existsSync(workspace.store)).toBe(false)
		expect(existsSync(workspace.storeList)).toBe(false)
		expect(existsSync(join(workspace.workspace, '.worktrees'))).toBe(false)
		expect(git({ root: workspace.repository, args: ['for-each-ref'] })).toBe(refsBefore)
	})
})

describe('checkBrief: the case-insensitive volume', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each([true, false])('an injected %j is the checked brief’s flag', (flag) => {
		const workspace = createBriefWorkspace()
		expect(
			checkBrief(checkArgumentsOf({ workspace, brief: briefWith(), caseInsensitive: flag })).checked
				?.caseInsensitive,
		).toBe(flag)
	})

	it('probes the repository path when nothing is injected', () => {
		const workspace = createBriefWorkspace()
		expect(
			checkBrief(checkArgumentsOf({ workspace, brief: briefWith() })).checked?.caseInsensitive,
		).toBe(probeCaseInsensitive({ path: workspace.repository }))
	})
})

describe('checkBrief: a brief file that is not a brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each([
		{ name: 'not JSON', text: '{ "schema": ' },
		{ name: 'an array', text: '[]' },
		{ name: 'empty', text: '' },
	])('$name -> shape, nothing checked further', ({ text }) => {
		const workspace = createBriefWorkspace()
		expect(checkBrief(checkArgumentsOf({ workspace, brief: text }))).toEqual({
			refused: [expect.objectContaining({ rule: 'shape' })],
			checked: undefined,
		})
	})
})

type RepositoryRow = { name: string; repository: (workspace: BriefWorkspace) => string }

const REPOSITORY_FORMS: RepositoryRow[] = [
	{ name: 'a path relative to the brief file’s folder', repository: () => RELATIVE_REPOSITORY },
	{ name: 'an absolute path', repository: (workspace) => workspace.repository },
	{ name: 'a bare name, resolved in the workspace', repository: () => 'repo' },
]

describe('checkBrief: the repository forms', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(REPOSITORY_FORMS)('$name', ({ repository }) => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({ repository: repository(workspace) })
		expect(summaryOf(checkBrief(checkArgumentsOf({ workspace, brief })))).toEqual({
			refused: [],
			repository: realpathSync(workspace.repository),
		})
	})

	it('a bare name is never read relative to the brief file: the workspace’s repository, not a folder beside the brief', () => {
		const workspace = createBriefWorkspace()
		initializeRepository({ root: join(workspace.briefFolder, 'repo') })
		const brief = briefWith({ repository: 'repo' })
		expect(summaryOf(checkBrief(checkArgumentsOf({ workspace, brief })))).toEqual({
			refused: [],
			repository: realpathSync(workspace.repository),
		})
	})

	it('no workspace: a bare name resolves in the folder above the brief folder’s repository (D10)', () => {
		createBriefWorkspace()
		const root = temporaryFolder('dialecte-nows-')
		const host = initializeRepository({ root: join(root, 'host') })
		const sibling = initializeRepository({ root: join(root, 'sibling') })
		const briefFolder = join(host, 'docs')
		mkdirSync(briefFolder)
		writeFileSync(join(briefFolder, 'plan.md'), PLAN_TEXT)
		const briefPath = join(briefFolder, 'brief.json')
		writeFileSync(briefPath, JSON.stringify(briefWith({ repository: 'sibling' })))
		expect(summaryOf(checkBrief({ briefPath, caseInsensitive: false }))).toEqual({
			refused: [],
			repository: realpathSync(sibling),
		})
	})

	it('a linked worktree given: its main checkout is taken', () => {
		const workspace = createBriefWorkspace()
		const linked = createLinkedWorktree({ root: workspace.repository, branch: 'wt-branch' })
		const brief = briefWith({ repository: linked })
		expect(summaryOf(checkBrief(checkArgumentsOf({ workspace, brief })))).toEqual({
			refused: [],
			repository: realpathSync(workspace.repository),
		})
	})

	it.each([
		{ name: 'a folder that is not a repository', repository: '../../plain' },
		{ name: 'a path that does not exist', repository: '../../nowhere' },
		{ name: 'a bare name the workspace does not hold', repository: 'nowhere' },
	])('$name -> repository', ({ repository }) => {
		const workspace = createBriefWorkspace()
		mkdirSync(join(workspace.workspace, 'plain'))
		const brief = briefWith({ repository })
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toContain(
			'repository:repository',
		)
	})
})

describe('checkBrief: the branch', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(['a..b', 'bad name', 'feat/x.lock', 'trail/', 'a~b', 'a:b', '@'])(
		'%j is not a branch name -> branch-name',
		(branch) => {
			const workspace = createBriefWorkspace()
			const brief = briefWith({ branch })
			expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual([
				'branch-name:branch',
			])
		},
	)

	it('an existing ref with no lot -> branch-exists', () => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({ branch: 'main' })
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual([
			'branch-exists:branch',
		])
	})

	it('an existing ref that a real lot’s identity names -> branch-exists naming that lot (case 5)', () => {
		const workspace = createBriefWorkspace()
		git({ root: workspace.repository, args: ['branch', 'feat/taken'] })
		writeStoreLot({
			workspace,
			name: '0003-repo-taken',
			scope: ['lib/other'],
			branch: 'feat/taken',
		})
		const brief = briefWith({ branch: 'feat/taken' })
		expect(checkBrief(checkArgumentsOf({ workspace, brief })).refused).toEqual([
			{
				field: 'branch',
				rule: 'branch-exists',
				detail: expect.stringContaining('0003-repo-taken'),
			},
		])
	})

	it('an existing ref that only a simulated lot names -> branch-exists without that lot', () => {
		const workspace = createBriefWorkspace()
		git({ root: workspace.repository, args: ['branch', 'feat/taken'] })
		writeStoreLot({
			workspace,
			name: '0004-repo-simulated',
			scope: ['lib/other'],
			branch: 'feat/taken',
			simulated: true,
		})
		const brief = briefWith({ branch: 'feat/taken' })
		expect(checkBrief(checkArgumentsOf({ workspace, brief })).refused).toEqual([
			{
				field: 'branch',
				rule: 'branch-exists',
				detail: expect.not.stringContaining('0004-repo-simulated'),
			},
		])
	})

	it('a branch a lot names but no ref holds -> accepted', () => {
		const workspace = createBriefWorkspace()
		writeStoreLot({
			workspace,
			name: '0005-repo-never-made',
			scope: ['lib/other'],
			branch: 'feat/never-made',
		})
		const brief = briefWith({ branch: 'feat/never-made' })
		expect(checkBrief(checkArgumentsOf({ workspace, brief })).refused).toEqual([])
	})
})

describe('checkBrief: the base', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(['no-such-ref', 'main~5', 'refs/heads/nope', 'v9.9.9'])(
		'%j does not resolve -> base (case 6)',
		(base) => {
			const workspace = createBriefWorkspace()
			const brief = briefWith({ base })
			expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual([
				'base:base',
			])
		},
	)

	it('a branch, a tag, HEAD and a full commit all resolve; the commit and the ref as given are recorded', () => {
		const workspace = createBriefWorkspace()
		git({ root: workspace.repository, args: ['tag', 'v1.0.0'] })
		git({
			root: workspace.repository,
			args: ['commit', '-q', '--allow-empty', '-m', 'chore: second'],
		})
		const second = git({ root: workspace.repository, args: ['rev-parse', 'HEAD'] }).trim()
		git({ root: workspace.repository, args: ['branch', 'other'] })
		const forms = [
			{ base: 'other', commit: second },
			{ base: 'v1.0.0', commit: workspace.commit },
			{ base: 'HEAD', commit: second },
			{ base: workspace.commit, commit: workspace.commit },
		]
		for (const form of forms) {
			const brief = briefWith({ base: form.base })
			expect(checkBrief(checkArgumentsOf({ workspace, brief }))).toMatchObject({
				refused: [],
				checked: { base: { ref: form.base, commit: form.commit } },
			})
		}
	})
})

describe('checkBrief: the plan and its headings', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a plan that does not exist -> plan', () => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({ plan: 'missing.md' })
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toContain(
			'plan:plan',
		)
	})

	it.skipIf(process.getuid?.() === 0)('a plan that exists but cannot be read -> plan', () => {
		const workspace = createBriefWorkspace()
		chmodSync(join(workspace.briefFolder, 'plan.md'), 0o000)
		const brief = briefWith()
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toContain(
			'plan:plan',
		)
	})

	it('a plan that is a folder -> plan', () => {
		const workspace = createBriefWorkspace()
		mkdirSync(join(workspace.briefFolder, 'docs'))
		const brief = briefWith({ plan: 'docs' })
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toContain(
			'plan:plan',
		)
	})

	it('a plan in a folder below the brief file’s, resolved against it', () => {
		const workspace = createBriefWorkspace()
		mkdirSync(join(workspace.briefFolder, 'docs'))
		writeFileSync(join(workspace.briefFolder, 'docs', 'plan.md'), '# Other\n\n## 3. Subscribe\n')
		const brief = briefWith({ plan: 'docs/plan.md' })
		expect(checkBrief(checkArgumentsOf({ workspace, brief }))).toMatchObject({
			refused: [],
			checked: { plan: { text: '# Other\n\n## 3. Subscribe\n' } },
		})
	})

	it.each([
		{ spec: PLAN_HEADING, refused: false },
		{ spec: '## 4. Unsubscribe', refused: false },
		{ spec: '##  3. Subscribe', refused: true },
		{ spec: '## 3. Subscribe ', refused: true },
		{ spec: '## 3.  Subscribe', refused: true },
		{ spec: '## 3. Subscribe and more', refused: true },
		{ spec: '## 3. Subscr', refused: true },
		{ spec: '### 3. Subscribe', refused: true },
		{ spec: 'Subscribe one data set.', refused: true },
		{ spec: '## 5. Missing', refused: true },
	])('spec $spec -> refused: $refused (case 7)', ({ spec, refused }) => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({
			steps: [{ title: 'a step', spec, behaviours: ['a state -> an outcome'] }],
		})
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual(
			refused ? ['spec-heading:steps'] : [],
		)
	})
})

describe('checkBrief: every fault at once', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('four faults give four refusals in one run', () => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({
			goal: 'two\nlines',
			branch: 'a..b',
			base: 'no-such-ref',
			steps: [{ title: 'a step', spec: '##  3. Subscribe', behaviours: ['a state -> an outcome'] }],
		})
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual([
			'base:base',
			'branch-name:branch',
			'shape:goal',
			'spec-heading:steps',
		])
	})

	it('five faults across the fields, the branch, the base and the plan give five refusals (case 2)', () => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({
			goal: 'two\nlines',
			branch: 'a..b',
			base: 'no-such-ref',
			steps: [{ title: 'a step', spec: PLAN_HEADING, behaviours: [] }],
			plan: 'missing.md',
		})
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual([
			'base:base',
			'behaviour:steps',
			'branch-name:branch',
			'plan:plan',
			'shape:goal',
		])
	})

	it('a refused brief creates nothing, and a misspelt key is a shape refusal (case 1)', () => {
		const workspace = createBriefWorkspace()
		const folders = [workspace.workspace, join(workspace.storeList, '..', '..')]
		const briefPath = writeBriefFile({
			workspace,
			brief: briefWith({ scope: undefined, scopes: ['src/dataflow/'] }),
		})
		const before = treeOf(folders)
		expect(refusalKeysOf(checkBrief({ briefPath, caseInsensitive: false }).refused)).toEqual([
			'shape:scope',
			'shape:scopes',
		])
		expect(treeOf(folders)).toEqual(before)
		expect(existsSync(workspace.store)).toBe(false)
		expect(existsSync(workspace.storeList)).toBe(false)
	})

	it('a shape fault that blocks a check skips only that check (D9)', () => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({
			repository: undefined,
			plan: undefined,
			branch: 'main',
			base: 'no-such-ref',
			scope: ['src/dataflow/', '/abs'],
			steps: [
				{ title: 'a step', spec: '## 9. Not in any plan', behaviours: ['a state -> an outcome'] },
			],
		})
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual([
			'scope:scope',
			'shape:plan',
			'shape:repository',
		])
	})

	it('a repository that is not one still lets the branch name be checked', () => {
		const workspace = createBriefWorkspace()
		const brief = briefWith({ repository: 'nowhere', branch: 'a..b' })
		expect(refusalKeysOf(checkBrief(checkArgumentsOf({ workspace, brief })).refused)).toEqual(
			expect.arrayContaining(['branch-name:branch', 'repository:repository']),
		)
	})
})
