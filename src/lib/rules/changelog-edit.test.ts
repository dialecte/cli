/** A package that keeps changelog fragments: CHANGELOG.md changes only in a release (the version bumped). */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { checkRules } from './check-rules.ts'

import { describe, expect, it } from 'vitest'

const CHANGELOG = '# Changelog\n\n## [Unreleased]\n'

/** A committed package at version 1.0.0 with CHANGELOG.md, and `changes/` when it keeps fragments. */
function packageOf(params: { fragments: boolean }): string {
	return createScratchRepository({
		'package.json': `${JSON.stringify({ name: 'demo', version: '1.0.0' })}\n`,
		'CHANGELOG.md': CHANGELOG,
		...(params.fragments && { 'changes/.gitkeep': '' }),
	})
}

/** The changelog-edit findings of the working changes. */
function changelogFindings(root: string) {
	return checkRules({
		root,
		givenFiles: [],
		environment: { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') },
	}).findings.filter((finding) => finding.rule === 'changelog-edit')
}

describe('the changelog-edit rule', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("the gate's checked tree (a commit's index) keeps the version while the bump sits unstaged on disk → an error: the tree is read, not the disk", () => {
		const root = packageOf({ fragments: true })
		writeFiles({ root, files: { 'CHANGELOG.md': `${CHANGELOG}\n## [1.1.0] - 2026-11-16\n` } })
		git({ root, args: ['add', 'CHANGELOG.md'] })
		const tree = git({ root, args: ['write-tree'] }).trim()
		writeFiles({
			root,
			files: { 'package.json': `${JSON.stringify({ name: 'demo', version: '1.1.0' })}\n` },
		})

		const findings = checkRules({
			root,
			givenFiles: ['CHANGELOG.md'],
			tree,
			environment: { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') },
		}).findings.filter((finding) => finding.rule === 'changelog-edit')

		expect(findings.map((finding) => finding.file)).toEqual(['CHANGELOG.md'])
	})

	it('a package keeping fragments, CHANGELOG.md edited, the version unchanged → an error on CHANGELOG.md naming the fragment to write instead', () => {
		const root = packageOf({ fragments: true })
		writeFiles({ root, files: { 'CHANGELOG.md': `${CHANGELOG}\n### Added\n\n- x.\n` } })

		expect(changelogFindings(root)).toEqual([
			{
				file: 'CHANGELOG.md',
				line: 1,
				column: 1,
				rule: 'changelog-edit',
				severity: 'error',
				message:
					'CHANGELOG.md changes only in a release (the package version bumped): write the entry in changes/<lot>.md instead',
			},
		])
	})

	it.each<{ label: string; fragments: boolean; files: Record<string, string> }>([
		{
			label: 'the same change bumps the package version (a release)',
			fragments: true,
			files: {
				'CHANGELOG.md': `${CHANGELOG}\n## [1.1.0] - 2026-11-16\n`,
				'package.json': `${JSON.stringify({ name: 'demo', version: '1.1.0' })}\n`,
			},
		},
		{
			label: 'a package without a changes/ folder',
			fragments: false,
			files: { 'CHANGELOG.md': `${CHANGELOG}\n### Added\n\n- x.\n` },
		},
		{
			label: 'a fragment written, CHANGELOG.md untouched',
			fragments: true,
			files: { 'changes/lot.md': '### Added\n\n- x.\n' },
		},
	])('$label → no finding', ({ fragments, files }) => {
		const root = packageOf({ fragments })
		writeFiles({ root, files })

		expect(changelogFindings(root)).toEqual([])
	})
})
