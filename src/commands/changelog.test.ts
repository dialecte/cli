/** `dialecte changelog check | release <version>`: the fragments read, then folded into CHANGELOG.md. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../test/scratch-repository.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runChangelog } from './changelog.ts'

import { describe, expect, it } from 'vitest'

const CHANGELOG =
	'# Changelog\n\n## [Unreleased]\n\n## [0.7.0] - 2026-11-14\n\n### Added\n\n- old.\n'

const CHANGELOG_RELEASE_ALTERED =
	'# Changelog\n\n## [Unreleased]\n\n## [0.7.0] - 2026-11-14\n\n### Added\n\n- old.\n- slipped in.\n'

/** A package with the changelog and the fragments given. */
function packageWith(fragments: Record<string, string>): string {
	return createScratchRepository({ 'CHANGELOG.md': CHANGELOG, ...fragments })
}

describe('dialecte changelog', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('check, two valid fragments → exit 0, one line counting them', () => {
		const root = packageWith({
			'changes/a.md': '### Added\n\n- a.\n',
			'changes/b.md': '### Fixed\n\n- b.\n',
		})

		expect(runChangelog({ cwd: root, argv: ['check'] })).toEqual({
			exitCode: 0,
			output: 'changelog: 2 fragments, every one readable',
		})
	})

	it('check, a fragment with an unknown heading → exit 1 naming the file and the problem', () => {
		const root = packageWith({ 'changes/a.md': '### Improved\n\n- a.\n' })

		expect(runChangelog({ cwd: root, argv: ['check'] })).toEqual({
			exitCode: 1,
			output:
				'changelog: changes/a.md: heading "### Improved" is no section: Added, Changed, Deprecated, Removed, Fixed, Security',
		})
	})

	it('release 0.8.0 --date 2026-11-16 → CHANGELOG.md holds the new version, the fragments are deleted, one line says so', () => {
		const root = packageWith({ 'changes/a.md': '### Added\n\n- a.\n' })

		const result = runChangelog({ cwd: root, argv: ['release', '0.8.0', '--date', '2026-11-16'] })

		expect(result).toEqual({
			exitCode: 0,
			output:
				'changelog: 0.8.0 - 2026-11-16 written in CHANGELOG.md, 1 fragment folded and deleted',
		})
		expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(
			'# Changelog\n\n## [Unreleased]\n\n## [0.8.0] - 2026-11-16\n\n### Added\n\n- a.\n\n## [0.7.0] - 2026-11-14\n\n### Added\n\n- old.\n',
		)
		expect(existsSync(join(root, 'changes/a.md'))).toBe(false)
	})

	it('release with a fragment and a no-entry note → the fragment folded, both deleted', () => {
		const root = packageWith({
			'changes/a.md': '### Added\n\n- a.\n',
			'changes/b.none.md': 'a wording fix\n',
		})

		const result = runChangelog({ cwd: root, argv: ['release', '0.8.0', '--date', '2026-11-16'] })

		expect(result.exitCode).toBe(0)
		expect(existsSync(join(root, 'changes/a.md'))).toBe(false)
		expect(existsSync(join(root, 'changes/b.none.md'))).toBe(false)
	})

	it('release with a fragment that cannot be read → exit 1, CHANGELOG.md and the fragments untouched', () => {
		const root = packageWith({ 'changes/a.md': '### Added\n\n- a.\n', 'changes/b.md': 'loose\n' })

		const result = runChangelog({ cwd: root, argv: ['release', '0.8.0', '--date', '2026-11-16'] })

		expect(result.exitCode).toBe(1)
		expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(CHANGELOG)
		expect(existsSync(join(root, 'changes/a.md'))).toBe(true)
	})

	it('check, the Unreleased part holding a heading that is no section → exit 1 naming it', () => {
		const root = createScratchRepository({
			'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n### Improved\n\n- x.\n',
		})

		expect(runChangelog({ cwd: root, argv: ['check'] })).toEqual({
			exitCode: 1,
			output:
				'changelog: the Unreleased part of CHANGELOG.md: heading "### Improved" is no section: Added, Changed, Deprecated, Removed, Fixed, Security',
		})
	})

	it('release in a package without CHANGELOG.md → exit 1, refused with one line, the fragment kept', () => {
		const root = createScratchRepository({ 'changes/a.md': '### Added\n\n- a.\n' })

		expect(runChangelog({ cwd: root, argv: ['release', '0.8.0', '--date', '2026-11-16'] })).toEqual(
			{
				exitCode: 1,
				output: 'changelog: no CHANGELOG.md in the package',
			},
		)
		expect(existsSync(join(root, 'changes/a.md'))).toBe(true)
	})

	it("changelog check --base a revision whose released sections equal the tree's → exit 0", () => {
		const root = packageWith({})
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()

		expect(runChangelog({ cwd: root, argv: ['check', '--base', base] })).toEqual({
			exitCode: 0,
			output: 'changelog: 0 fragments, every one readable',
		})
	})

	it('changelog check --base a revision holding other lines in a released section → exit 1', () => {
		const root = packageWith({})
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		writeFiles({ root, files: { 'CHANGELOG.md': CHANGELOG_RELEASE_ALTERED } })

		expect(runChangelog({ cwd: root, argv: ['check', '--base', base] })).toEqual({
			exitCode: 1,
			output: `changelog: [0.7.0] differs from ${base.slice(0, SHORT_SHA_LENGTH)}: 1 line added (a released section stays as released: restore it, and write new entries under [Unreleased] or in changes/<lot>.md)`,
		})
	})

	it('changelog check --base an unknown revision → exit 2 naming it', () => {
		const root = packageWith({})

		expect(runChangelog({ cwd: root, argv: ['check', '--base', 'no-such-revision'] })).toEqual({
			exitCode: 2,
			output: 'changelog: --base no-such-revision names no commit of this repository',
		})
	})

	it.each([
		{ label: 'no verb', argv: [] },
		{ label: 'release without a version', argv: ['release'] },
		{ label: 'release with a version that is no x.y.z', argv: ['release', 'next'] },
		{ label: 'a date that is no YYYY-MM-DD', argv: ['release', '0.8.0', '--date', '16/11/2026'] },
	])('$label → usage error, exit 2', ({ argv }) => {
		expect(runChangelog({ cwd: packageWith({}), argv }).exitCode).toBe(2)
	})
})
