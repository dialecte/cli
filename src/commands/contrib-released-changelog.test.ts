/**
 * `contrib`'s changelog row on a released `CHANGELOG.md` section: judged on every run, changed by the lot or not,
 * against the base branch; and its record keyed on the base's `CHANGELOG.md`.
 */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createContribPackage, parseContribJson } from '../../test/scratch-contrib.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { runContrib } from './contrib.ts'

import { describe, expect, it } from 'vitest'

const RELEASED = `# Changelog

## [Unreleased]

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
`

const OLD_EDITED = `# Changelog

## [Unreleased]

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
- slipped in.
`

const STACK = `# Changelog

## [Unreleased]

### Added

- main entry.
- stack entry.

## [0.9.0] - 2026-01-01

- old.
`

const MAIN_RELEASE = `# Changelog

## [Unreleased]

## [0.13.2] - 2026-11-10

### Added

- main entry.

## [0.9.0] - 2026-01-01

- old.
`

const MAIN_LATER = `# Changelog

## [Unreleased]

## [1.0.0] - 2026-11-12

- later.

## [0.9.0] - 2026-01-01

- old.
`

/** The changelog row of a `--json` run. */
function changelogRowOf(output: string): { status: string; detail: string } | undefined {
	const row = parseContribJson(output).rows.find((candidate) => candidate.name === 'changelog')
	return row === undefined ? undefined : { status: row.status, detail: row.detail }
}

/** A contributor package on `main` holding `changelog`, then on a new branch `lot`. */
function lotPackage(params: { changelog: string }): string {
	const root = createContribPackage({ steps: [], files: { 'CHANGELOG.md': params.changelog } })
	git({ root, args: ['checkout', '-q', '-b', 'lot'] })
	return root
}

describe(
	'contrib: the changelog row on released sections',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('contrib with CHANGELOG unchanged by the lot but altered in a released section by a merge, and no rules base → the changelog row fails naming the version', async () => {
			const root = lotPackage({ changelog: RELEASED })
			writeFiles({ root, files: { 'CHANGELOG.md': OLD_EDITED } })
			git({ root, args: ['commit', '-q', '-am', 'merge: bring a change'] })

			const result = await runContrib({ cwd: root, argv: ['--json'], rulesBase: null })

			expect(changelogRowOf(result.output)).toEqual({
				status: 'failed',
				detail: expect.stringContaining('[0.9.0] differs from main: 1 line added'),
			})
		})

		it('a conflict-free merge folding Unreleased entries under a just-released version, then contrib → the changelog row fails', async () => {
			const root = lotPackage({ changelog: RELEASED })
			writeFiles({ root, files: { 'CHANGELOG.md': STACK } })
			git({ root, args: ['commit', '-q', '-am', 'feat: a stack entry'] })
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({ root, files: { 'CHANGELOG.md': MAIN_RELEASE } })
			git({ root, args: ['commit', '-q', '-am', 'chore(release): 0.13.2'] })
			git({ root, args: ['checkout', '-q', 'lot'] })
			git({ root, args: ['merge', '-q', '--no-edit', 'main'] })

			const result = await runContrib({ cwd: root, argv: ['--json'] })

			expect(changelogRowOf(result.output)).toEqual({
				status: 'failed',
				detail: expect.stringContaining('[0.13.2] differs from main: 1 line added'),
			})
		})

		it('contrib green, then main changes its CHANGELOG → the record does not answer', async () => {
			const root = lotPackage({ changelog: RELEASED })
			writeFiles({ root, files: { 'notes.md': 'work\n' } })
			git({ root, args: ['add', 'notes.md'] })
			git({ root, args: ['commit', '-q', '-m', 'docs: notes'] })
			await runContrib({ cwd: root, argv: ['--json'] })
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({ root, files: { 'CHANGELOG.md': MAIN_LATER } })
			git({ root, args: ['commit', '-q', '-am', 'chore(release): 1.0.0'] })
			git({ root, args: ['checkout', '-q', 'lot'] })

			const result = await runContrib({ cwd: root, argv: ['--json'] })

			expect(parseContribJson(result.output).reused).toBeUndefined()
		})

		it('contrib green, then main moves without touching its CHANGELOG → the record answers', async () => {
			const root = lotPackage({ changelog: RELEASED })
			writeFiles({ root, files: { 'notes.md': 'work\n' } })
			git({ root, args: ['add', 'notes.md'] })
			git({ root, args: ['commit', '-q', '-m', 'docs: notes'] })
			await runContrib({ cwd: root, argv: ['--json'] })
			git({ root, args: ['checkout', '-q', 'main'] })
			writeFiles({ root, files: { 'other.md': 'other\n' } })
			git({ root, args: ['add', 'other.md'] })
			git({ root, args: ['commit', '-q', '-m', 'docs: other'] })
			git({ root, args: ['checkout', '-q', 'lot'] })

			const result = await runContrib({ cwd: root, argv: ['--json'] })

			expect(parseContribJson(result.output).reused).toBeDefined()
		})
	},
)
