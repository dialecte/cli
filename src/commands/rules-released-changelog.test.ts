/**
 * `dialecte rules` and the released-changelog rule on real git: a released section of `CHANGELOG.md` the change
 * altered, judged against the base branch and its merge-base; and the release base a commit's hook hands the scoped
 * rules step alone.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPOSITORY_CLI_PATH } from '../../test/gate-hook.constants.ts'
import { runHookIn } from '../../test/gate-hook.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'

const RELEASED = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

- one.
`

const ONE_LINE_ADDED = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

- one.
- two.
`

const ONE_LINE_EDITED = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

- one, edited.
`

const ADVICE =
	'(a released section stays as released: restore it, and write new entries under [Unreleased] or in changes/<lot>.md)'

/** The user's config folders of a case: none of the person's own lists is read. */
function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

/** A repository on `main` holding `files`, then on a new branch `lot` holding `changes` uncommitted. */
function lotWith(params: {
	files: Record<string, string>
	changes: Record<string, string>
}): string {
	const root = createScratchRepository(params.files)
	git({ root, args: ['checkout', '-q', '-b', 'lot'] })
	writeFiles({ root, files: params.changes })
	return root
}

function releasedFindingsOf(findings: readonly RuleFinding[]): RuleFinding[] {
	return findings.filter((finding) => finding.rule === 'released-changelog')
}

describe(
	'dialecte rules: the released-changelog rule',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('rules on a commit adding a line under a released section → exit 1, released-changelog naming the version, the base and the count', () => {
			const root = lotWith({
				files: { 'CHANGELOG.md': RELEASED },
				changes: { 'CHANGELOG.md': ONE_LINE_ADDED },
			})

			const result = runRules({
				cwd: root,
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect({
				exitCode: result.exitCode,
				findings: releasedFindingsOf(JSON.parse(result.output).findings),
			}).toEqual({
				exitCode: 1,
				findings: [
					{
						file: 'CHANGELOG.md',
						line: 8,
						column: 1,
						rule: 'released-changelog',
						severity: 'error',
						message: `[1.0.0] differs from main: 1 line added ${ADVICE}`,
					},
				],
			})
		})

		it('a package keeping changes/ with its version bumped and a released section changed → released-changelog only', () => {
			const root = lotWith({
				files: {
					'package.json': '{ "name": "demo", "version": "1.0.0" }\n',
					'changes/.gitkeep': '',
					'CHANGELOG.md': RELEASED,
				},
				changes: {
					'package.json': '{ "name": "demo", "version": "1.1.0" }\n',
					'CHANGELOG.md': ONE_LINE_ADDED,
				},
			})

			const result = runRules({
				cwd: root,
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect(
				(JSON.parse(result.output).findings as RuleFinding[]).map((finding) => finding.rule),
			).toEqual(['released-changelog'])
		})

		it('a stacked lot on a parent that changed a released section → flagged against the base branch', () => {
			const root = createScratchRepository({ 'CHANGELOG.md': RELEASED })
			git({ root, args: ['checkout', '-q', '-b', 'parent'] })
			writeFiles({ root, files: { 'CHANGELOG.md': ONE_LINE_EDITED } })
			git({ root, args: ['commit', '-q', '-am', 'docs: edit a release'] })
			git({ root, args: ['checkout', '-q', '-b', 'child'] })
			writeFiles({ root, files: { 'notes.md': 'child work\n' } })

			const result = runRules({
				cwd: root,
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect(
				releasedFindingsOf(JSON.parse(result.output).findings).map((finding) => finding.message),
			).toEqual([`[1.0.0] differs from main: 1 line added, 1 line removed ${ADVICE}`])
		})

		it('a branch made before main released a version and corrected an older one, the lot changing neither → nothing', () => {
			const root = createScratchRepository({ 'CHANGELOG.md': RELEASED })
			git({ root, args: ['checkout', '-q', '-b', 'lot'] })
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({
				root,
				files: {
					'CHANGELOG.md': `# Changelog

## [Unreleased]

## [1.1.0] - 2026-02-01

- three.

## [1.0.0] - 2026-01-01

- one, corrected.
`,
				},
			})
			git({ root, args: ['commit', '-q', '-am', 'chore(release): 1.1.0'] })
			git({ root, args: ['checkout', '-q', 'lot'] })
			writeFiles({
				root,
				files: {
					'CHANGELOG.md': `# Changelog

## [Unreleased]

- a new entry.

## [1.0.0] - 2026-01-01

- one.
`,
				},
			})

			const result = runRules({
				cwd: root,
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect(releasedFindingsOf(JSON.parse(result.output).findings)).toEqual([])
		})

		it('a branch older than CHANGELOG.md adding its own, main having added one since → nothing', () => {
			const root = createScratchRepository({})
			git({ root, args: ['checkout', '-q', '-b', 'lot'] })
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({ root, files: { 'CHANGELOG.md': RELEASED } })
			git({ root, args: ['add', 'CHANGELOG.md'] })
			git({ root, args: ['commit', '-q', '-m', 'docs: a changelog'] })
			git({ root, args: ['checkout', '-q', 'lot'] })
			writeFiles({
				root,
				files: {
					'CHANGELOG.md': `# Changelog

## [Unreleased]

- the branch's own entry.
`,
				},
			})

			const result = runRules({
				cwd: root,
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect(releasedFindingsOf(JSON.parse(result.output).findings)).toEqual([])
		})

		it('a package CHANGELOG checked from its package folder → read at its path', () => {
			const root = lotWith({
				files: {
					'packages/p/package.json': '{ "name": "p", "version": "1.0.0" }\n',
					'packages/p/CHANGELOG.md': RELEASED,
				},
				changes: { 'packages/p/CHANGELOG.md': ONE_LINE_ADDED },
			})

			const result = runRules({
				cwd: join(root, 'packages', 'p'),
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect(
				releasedFindingsOf(JSON.parse(result.output).findings).map((finding) => finding.message),
			).toEqual([`[1.0.0] differs from main: 1 line added ${ADVICE}`])
		})

		it('no base branch → released-changelog: no base branch, not judged, in text and json, exit 0', () => {
			const root = lotWith({
				files: { 'CHANGELOG.md': RELEASED },
				changes: { 'CHANGELOG.md': ONE_LINE_ADDED },
			})
			git({ root, args: ['branch', '-q', '-D', 'main'] })

			const text = runRules({ cwd: root, argv: ['CHANGELOG.md'], environment: machineOf() })
			const json = runRules({
				cwd: root,
				argv: ['CHANGELOG.md', '--json'],
				environment: machineOf(),
			})

			expect({
				exitCode: text.exitCode,
				line: text.output.split('\n').includes('released-changelog: no base branch, not judged'),
				field: JSON.parse(json.output).releasedChangelogNotJudged,
			}).toEqual({
				exitCode: 0,
				line: true,
				field: 'released-changelog: no base branch, not judged',
			})
		})
	},
)

const IEDR_BASE = `# Changelog

## [Unreleased]

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
`

const IEDR_STACK = `# Changelog

## [Unreleased]

### Added

- main entry.
- stack entry.

## [0.9.0] - 2026-01-01

- old.
`

const IEDR_RELEASED = `# Changelog

## [Unreleased]

## [0.13.2] - 2026-11-10

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
`

const IEDR_OLD_EDITED = `# Changelog

## [Unreleased]

### Added

- main entry.
- stack entry.

## [0.9.0] - 2026-01-01

- old, edited.
`

/** A hook package whose hook runs one step before the scoped rules step: it writes the release base it sees. */
function hookPackageWith(params: { seen: string }): Record<string, string> {
	return {
		'package.json': `${JSON.stringify({
			name: 'demo',
			dialecte: {
				gate: {
					hook: [
						{
							name: 'seen',
							run: `printf '%s' "\${DIALECTE_RELEASE_BASE:-unset}" > '${params.seen}'`,
						},
						{ name: 'rules', run: 'dialecte rules', scoped: true },
					],
				},
			},
		})}\n`,
		'.gitignore': 'node_modules\n',
		'CHANGELOG.md': IEDR_BASE,
	}
}

/**
 * A stack branched from main's first commit, holding an entry under Unreleased; main then released 0.13.2 from its
 * Unreleased part; the stack's merge of main is stopped before its commit. Answers the repository and main's first
 * commit.
 */
function stoppedMerge(params: { seen: string }): { root: string; first: string } {
	const root = createScratchRepository(hookPackageWith(params))
	const first = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', '-b', 'stack'] })
	writeFiles({ root, files: { 'CHANGELOG.md': IEDR_STACK } })
	git({ root, args: ['commit', '-q', '-am', 'feat: a stack entry'] })
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'CHANGELOG.md': IEDR_RELEASED } })
	git({ root, args: ['commit', '-q', '-am', 'chore(release): 0.13.2'] })
	git({ root, args: ['checkout', '-q', 'stack'] })
	git({ root, args: ['merge', '-q', '--no-commit', '--no-ff', 'main'] })
	return { root, first }
}

describe(
	'gate --hook: the released-changelog rule and the release base',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('a merge stopped with no commit that folds Unreleased entries under the version main just released, then git commit → the hook refuses it', async () => {
			const { root } = stoppedMerge({ seen: join(temporaryFolder('dialecte-seen-'), 'seen') })

			const result = await runHookIn({ cwd: root })

			expect({
				exitCode: result.exitCode,
				named: result.output.includes('[0.13.2] differs from main: 1 line added'),
			}).toEqual({ exitCode: 1, named: true })
		})

		it('the release base handed to the hook → the scoped rules step judges against it', async () => {
			const { root, first } = stoppedMerge({
				seen: join(temporaryFolder('dialecte-seen-'), 'seen'),
			})
			git({ root, args: ['merge', '--abort'] })
			writeFiles({ root, files: { 'CHANGELOG.md': IEDR_OLD_EDITED } })
			git({ root, args: ['add', 'CHANGELOG.md'] })

			const result = await runHookIn({ cwd: root, releaseBase: first })

			expect({
				exitCode: result.exitCode,
				named: result.output.includes(
					`[0.9.0] differs from ${first.slice(0, SHORT_SHA_LENGTH)}: 1 line added, 1 line removed`,
				),
			}).toEqual({ exitCode: 1, named: true })
		})

		it('the release base in the given environment of the gate --hook command → read by the command, the rules step judges against it', () => {
			const { root, first } = stoppedMerge({
				seen: join(temporaryFolder('dialecte-seen-'), 'seen'),
			})
			git({ root, args: ['merge', '--abort'] })
			writeFiles({ root, files: { 'CHANGELOG.md': IEDR_OLD_EDITED } })
			git({ root, args: ['add', 'CHANGELOG.md'] })

			const result = spawnSync('node', [REPOSITORY_CLI_PATH, 'gate', '--hook'], {
				cwd: root,
				encoding: 'utf8',
				env: { ...process.env, ...machineOf(), DIALECTE_RELEASE_BASE: first },
			})

			expect({
				status: result.status,
				named: result.stdout.includes(
					`[0.9.0] differs from ${first.slice(0, SHORT_SHA_LENGTH)}: 1 line added, 1 line removed`,
				),
			}).toEqual({ status: 1, named: true })
		})

		it('the release base handed to the hook → no other gate step sees the variable', async () => {
			const seen = join(temporaryFolder('dialecte-seen-'), 'seen')
			const { root, first } = stoppedMerge({ seen })
			git({ root, args: ['merge', '--abort'] })
			writeFiles({ root, files: { 'notes.md': 'work\n' } })
			git({ root, args: ['add', 'notes.md'] })

			await runHookIn({ cwd: root, releaseBase: first })

			expect(readFileSync(seen, 'utf8')).toBe('unset')
		})

		it('an invalid release base handed to the hook → the hook refuses', async () => {
			const { root } = stoppedMerge({ seen: join(temporaryFolder('dialecte-seen-'), 'seen') })
			git({ root, args: ['merge', '--abort'] })
			writeFiles({ root, files: { 'notes.md': 'work\n' } })
			git({ root, args: ['add', 'notes.md'] })

			const result = await runHookIn({ cwd: root, releaseBase: 'not-a-commit' })

			expect({
				exitCode: result.exitCode,
				named: result.output.includes(
					'DIALECTE_RELEASE_BASE is no full commit id this repository holds: not-a-commit',
				),
			}).toEqual({ exitCode: 1, named: true })
		})
	},
)
