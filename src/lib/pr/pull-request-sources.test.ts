/**
 * The gathering half of `lot pr` reads the lot's records and its committed head against the merge base: what main
 * moved since never shows, what the lot deletes still names the tree, what no commit holds never passes.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { pullRequestLot } from '../../../test/lot-pr.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { GATE_RECORD_FILE } from '../gate-records/gate-records.constants.ts'
import { preparePullRequest, readPullRequestSources } from './pull-request-sources.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PullRequestLot } from '../../../test/lot-pr.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The sources of the lot against local main. */
function sourcesOf(lot: PullRequestLot) {
	return readPullRequestSources({
		lotFolder: lot.lotFolder,
		worktree: lot.worktree,
		baseRef: 'main',
	})
}

/** A contrib record of the lot's worktree whose docs step ran with `status` on the tree `stateHash`. */
function writeDocsRecord(params: { lot: PullRequestLot; stateHash: string; status: string }): void {
	const name = GATE_RECORD_FILE.replace('{mode}', 'contrib')
	const path = git({ root: params.lot.worktree, args: ['rev-parse', '--git-path', name] }).trim()
	writeFileSync(
		resolve(params.lot.worktree, path),
		JSON.stringify({
			mode: 'contrib',
			at: '2026-11-17T00:00:00Z',
			head: 'h',
			stateHash: params.stateHash,
			steps: [{ name: 'docs', status: params.status, counts: {} }],
		}),
	)
}

describe('readPullRequestSources', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot that merged main after main took another fragment → only its own fragment', () => {
		const lot = pullRequestLot()
		writeFiles({
			root: lot.workspace.repository,
			files: { 'changes/other.md': '### Fixed\n\n- Other.\n' },
		})
		git({ root: lot.workspace.repository, args: ['add', '-A'] })
		git({ root: lot.workspace.repository, args: ['commit', '-qm', 'fix: other'] })
		git({ root: lot.worktree, args: ['merge', '-q', '--no-edit', 'main'] })

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : sources.changelog).toEqual({
			kind: 'entries',
			entries: [{ section: 'Added', text: '- `x` answers one.', file: 'changes/x.md' }],
		})
	})

	it('a no-entry note → its reason and file', () => {
		const lot = pullRequestLot({ lotFiles: { 'changes/x.none.md': 'wording only\n' } })

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : sources.changelog).toEqual({
			kind: 'none',
			reason: 'wording only',
			file: 'changes/x.none.md',
		})
	})

	it('a lot that folds the fragments into the changelog and bumps the version → a release that bumps', () => {
		const lot = pullRequestLot({
			mainFiles: {
				'changes/old.md': '### Added\n\n- Old.\n',
				'CHANGELOG.md': '# Changelog\n',
				'package.json': '{ "version": "1.0.0" }\n',
			},
			lotFiles: {
				'CHANGELOG.md': '# Changelog\n\n## 1.1.0\n\n### Added\n\n- Old.\n',
				'package.json': '{ "version": "1.1.0" }\n',
			},
			lotDeletes: ['changes/old.md'],
		})

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : [sources.release, sources.versionBumped]).toEqual([
			true,
			true,
		])
	})

	it('an ordinary lot that bumps the version → no release, bumped', () => {
		const lot = pullRequestLot({
			mainFiles: { 'package.json': '{ "version": "1.0.0" }\n' },
			lotFiles: { 'package.json': '{ "version": "1.0.1" }\n' },
		})

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : [sources.release, sources.versionBumped]).toEqual([
			false,
			true,
		])
	})

	it.each([
		['passed on the landed tree', 'passed', true, true],
		['failed on the landed tree', 'failed', true, false],
		['passed on another tree', 'passed', false, undefined],
	])('a docs step %s → docs %s', (_name, status, landed, docsPassed) => {
		const lot = pullRequestLot()
		writeDocsRecord({ lot, status, stateHash: landed ? lot.treeHash : 'another' })

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : sources.docsPassed).toBe(docsPassed)
	})
})

describe(
	'preparePullRequest checks paths against the commits',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a summary naming a file the lot deletes → passes: the base holds it', () => {
			const lot = pullRequestLot({
				mainFiles: { 'src/old/gone.ts': 'export {}\n' },
				lotDeletes: ['src/old/gone.ts'],
				brief: { summary: 'Removes `src/old/gone.ts` for good.' },
			})

			const prepared = preparePullRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe('rendered')
		})

		it('a summary naming an untracked file of the worktree → refused: no commit holds it', () => {
			const lot = pullRequestLot({ brief: { summary: 'Follows `notes/a/plan.md` closely.' } })
			writeFiles({ root: lot.worktree, files: { 'notes/a/plan.md': 'private\n' } })

			const prepared = preparePullRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe(
				'the pull request text holds a path outside the tree or a link `notes/a/plan.md` in brief.json summary: rewrite that record, nothing sent',
			)
		})
	},
)
