/**
 * The gathering half of `lot pr` reads the lot's records and its committed head against the merge base: what main
 * moved since never shows, what the lot deletes still names the tree, what no commit holds never passes.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { pullRequestLot } from '../../../test/lot-pr.ts'
import {
	CROWDING_INDEX,
	DOC_PAGE,
	EMPTY_INDEX,
	EXPORT_SOURCE,
	EXPORT_SOURCE_FILE,
	EXPORT_SOURCE_GROWN,
	INDEX_FILE,
	LABEL_FILE,
	LABEL_SOURCE,
	LIBRARY_PACKAGE_JSON,
	LIBRARY_TOOL_PACKAGE_JSON,
	OWNER_LABEL_FILE,
	OWNER_LABEL_SOURCE,
	PAGE,
	PAGE_TOUCHED,
	QUALITY_PACKAGE_JSON,
	SIZE_FILE,
	SIZE_INDEX,
	SIZE_RESIGNED_INDEX,
	SIZE_RESIGNED_OPTED_OUT_INDEX,
	SIZE_RESIGNED_OPTED_OUT_SOURCE,
	SIZE_RESIGNED_SOURCE,
	SIZE_ROUTE,
	SIZE_SOURCE,
	TOTAL_FILE,
	TOTAL_SOURCE,
	TSCONFIG,
	TSCONFIG_FILE,
	TSCONFIG_MOVED,
} from '../../../test/quality-workspace.constants.ts'
import { runRulesIn } from '../../../test/quality-workspace.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { SOURCE_INDEX_FILE } from '../api/source-functions.constants.ts'
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

describe(
	'readPullRequestSources reads the accepted overlaps',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a lot with an accepted overlap → the other lot and the reason, never the met paths or who', () => {
			const lot = pullRequestLot()
			writeFileSync(
				join(lot.lotFolder, 'overlaps.jsonl'),
				`${JSON.stringify({
					schema: 1,
					at: '2026-11-17T00:00:00.000Z',
					verb: 'start',
					lot: '0007-repo-other',
					met: ['src/a meets src/a/b.ts'],
					by: 'person-a',
					reason: 'separate lines in one file',
				})}\n`,
			)

			const sources = sourcesOf(lot)

			expect('refusal' in sources ? sources : sources.overlaps).toEqual([
				{ lot: '0007-repo-other', reason: 'separate lines in one file' },
			])
		})
	},
)

describe(
	'readPullRequestSources reads the fragments the lot adds',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a lot that edits another lot's fragment → only its own added fragment shows", () => {
			const lot = pullRequestLot({
				mainFiles: { 'changes/other.md': '### Fixed\n\n- Other.\n' },
				lotFiles: {
					'changes/x.md': '### Added\n\n- `x` answers one.\n',
					'changes/other.md': '### Fixed\n\n- Other, reworded.\n',
				},
			})

			const sources = sourcesOf(lot)

			expect('refusal' in sources ? sources : sources.changelog).toEqual({
				kind: 'entries',
				entries: [{ section: 'Added', text: '- `x` answers one.', file: 'changes/x.md' }],
			})
		})
	},
)

/** The library at main: the size export re-exported, its index entry, the page naming it. */
const LIBRARY_MAIN = {
	'package.json': LIBRARY_PACKAGE_JSON,
	[EXPORT_SOURCE_FILE]: EXPORT_SOURCE,
	[SIZE_FILE]: SIZE_SOURCE,
	[INDEX_FILE]: SIZE_INDEX,
	[DOC_PAGE]: PAGE,
}

/** The lot's fragment, kept beside the files a case's commit writes. */
const FRAGMENT = { 'changes/x.md': '### Added\n\n- `x` answers one.\n' }

describe(
	'readPullRequestSources judges the quality on the committed head',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const testCases: Record<
			string,
			{
				make: () => PullRequestLot
				baseRef?: string
				expected: unknown
			}
		> = {
			'a lot changing a shared export, no quality record anywhere → judged against the merge base, the export listed':
				{
					make: () =>
						pullRequestLot({
							mainFiles: {
								'package.json': QUALITY_PACKAGE_JSON,
								[SIZE_FILE]: SIZE_SOURCE,
								[TOTAL_FILE]: TOTAL_SOURCE,
							},
							lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
						}),
					expected: expect.objectContaining({
						kind: 'judged',
						sharedExports: [
							expect.objectContaining({
								name: 'sizeOf',
								changes: ['signature', 'behaviour'],
								allowed: false,
							}),
						],
					}),
				},
			'the same with an uncommitted function duplicating an existing one → the duplicate not in the body':
				{
					make: () => {
						const lot = pullRequestLot({
							mainFiles: {
								'package.json': QUALITY_PACKAGE_JSON,
								[SIZE_FILE]: SIZE_SOURCE,
								[TOTAL_FILE]: TOTAL_SOURCE,
								[LABEL_FILE]: LABEL_SOURCE,
							},
							lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
						})
						writeFiles({ root: lot.worktree, files: { [OWNER_LABEL_FILE]: OWNER_LABEL_SOURCE } })
						return lot
					},
					expected: expect.objectContaining({ kind: 'judged', duplicates: [] }),
				},
			'a committed docs-not-updated opt-out at HEAD → the docs finding allowed': {
				make: () =>
					pullRequestLot({
						mainFiles: LIBRARY_MAIN,
						lotFiles: {
							...FRAGMENT,
							[SIZE_FILE]: SIZE_RESIGNED_OPTED_OUT_SOURCE,
							[INDEX_FILE]: SIZE_RESIGNED_OPTED_OUT_INDEX,
						},
					}),
				expected: expect.objectContaining({
					kind: 'judged',
					docs: [expect.objectContaining({ route: SIZE_ROUTE, allowed: true })],
				}),
			},
			'a re-signed public entry committed, its page touched only in the worktree → the docs finding of HEAD':
				{
					make: () => {
						const lot = pullRequestLot({
							mainFiles: LIBRARY_MAIN,
							lotFiles: {
								...FRAGMENT,
								[SIZE_FILE]: SIZE_RESIGNED_SOURCE,
								[INDEX_FILE]: SIZE_RESIGNED_INDEX,
							},
						})
						writeFiles({ root: lot.worktree, files: { [DOC_PAGE]: PAGE_TOUCHED } })
						return lot
					},
					expected: expect.objectContaining({
						kind: 'judged',
						docs: [expect.objectContaining({ route: SIZE_ROUTE, allowed: false })],
					}),
				},
			'an export source changed while the index did not → the public API unknown note rules prints':
				{
					make: () =>
						pullRequestLot({
							mainFiles: LIBRARY_MAIN,
							lotFiles: { ...FRAGMENT, [EXPORT_SOURCE_FILE]: EXPORT_SOURCE_GROWN },
						}),
					expected: expect.objectContaining({
						kind: 'judged',
						notes: [
							'! public API unknown (an export source changed while every api.json did not: run dialecte skills generate)',
						],
					}),
				},
			'a public entry removed while its page still names it → the removed note rules prints, no docs finding':
				{
					make: () =>
						pullRequestLot({
							mainFiles: LIBRARY_MAIN,
							lotFiles: { ...FRAGMENT, [INDEX_FILE]: EMPTY_INDEX },
						}),
					expected: expect.objectContaining({
						kind: 'judged',
						notes: [`public API: ${SIZE_ROUTE} removed: still named by ${DOC_PAGE}`],
						docs: [],
					}),
				},
			'a tsconfig paths alias changed → the aliases note rules prints': {
				make: () =>
					pullRequestLot({
						mainFiles: {
							'package.json': QUALITY_PACKAGE_JSON,
							[SIZE_FILE]: SIZE_SOURCE,
							[TOTAL_FILE]: TOTAL_SOURCE,
							[TSCONFIG_FILE]: TSCONFIG,
						},
						lotFiles: { ...FRAGMENT, [TSCONFIG_FILE]: TSCONFIG_MOVED },
					}),
				expected: expect.objectContaining({
					kind: 'judged',
					notes: ["aliases changed: base edges read with the tree's"],
				}),
			},
			'a re-signed export its committed page names, an uncommitted package.json adding a bin → the docs finding of HEAD':
				{
					make: () => {
						const lot = pullRequestLot({
							mainFiles: LIBRARY_MAIN,
							lotFiles: {
								...FRAGMENT,
								[SIZE_FILE]: SIZE_RESIGNED_SOURCE,
								[INDEX_FILE]: SIZE_RESIGNED_INDEX,
							},
						})
						writeFiles({ root: lot.worktree, files: { 'package.json': LIBRARY_TOOL_PACKAGE_JSON } })
						return lot
					},
					expected: expect.objectContaining({
						kind: 'judged',
						docs: [expect.objectContaining({ route: SIZE_ROUTE, allowed: false })],
					}),
				},
			'a package.json HEAD holds, deleted in the worktree → judged': {
				make: () => {
					const lot = pullRequestLot({
						mainFiles: {
							'package.json': QUALITY_PACKAGE_JSON,
							[SIZE_FILE]: SIZE_SOURCE,
							[TOTAL_FILE]: TOTAL_SOURCE,
						},
						lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
					})
					rmSync(join(lot.worktree, 'package.json'))
					return lot
				},
				expected: expect.objectContaining({ kind: 'judged' }),
			},
			'no package.json at HEAD, one written in the worktree → not judged (no package.json)': {
				make: () => {
					const lot = pullRequestLot()
					writeFiles({ root: lot.worktree, files: { 'package.json': QUALITY_PACKAGE_JSON } })
					return lot
				},
				expected: { kind: 'not-judged', why: 'no package.json' },
			},
			'a committed function duplicating an existing one, an uncommitted api.json crowding the ranking → the duplicate of HEAD kept':
				{
					make: () => {
						const lot = pullRequestLot({
							mainFiles: { 'package.json': QUALITY_PACKAGE_JSON, [LABEL_FILE]: LABEL_SOURCE },
							lotFiles: { ...FRAGMENT, [OWNER_LABEL_FILE]: OWNER_LABEL_SOURCE },
						})
						writeFiles({
							root: lot.worktree,
							files: { 'skills/demo/references/api.json': CROWDING_INDEX },
						})
						return lot
					},
					expected: expect.objectContaining({
						kind: 'judged',
						duplicates: [
							expect.objectContaining({
								name: 'ownerWidgetLabel',
								existing: expect.objectContaining({ name: 'widgetLabel' }),
							}),
						],
					}),
				},
			'a worktree with no package.json → not judged (no package.json)': {
				make: () => pullRequestLot(),
				expected: { kind: 'not-judged', why: 'no package.json' },
			},
			'a base git cannot read → not judged, with why': {
				make: () =>
					pullRequestLot({
						mainFiles: {
							'package.json': QUALITY_PACKAGE_JSON,
							[SIZE_FILE]: SIZE_SOURCE,
							[TOTAL_FILE]: TOTAL_SOURCE,
						},
						lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
					}),
				baseRef: 'origin/nope',
				expected: { kind: 'not-judged', why: expect.stringContaining('origin/nope') },
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const lot = testCase.make()

				const sources = readPullRequestSources({
					lotFolder: lot.lotFolder,
					worktree: lot.worktree,
					baseRef: testCase.baseRef ?? 'main',
				})

				expect('refusal' in sources ? sources : sources.quality).toEqual(testCase.expected)
			})
	},
)

describe(
	"readPullRequestSources judges the quality against the body's own base",
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a lot that merged main after its cut → judged against the merge base with main, not the lot's recorded base", () => {
			const lot = pullRequestLot({
				mainFiles: {
					'package.json': QUALITY_PACKAGE_JSON,
					[SIZE_FILE]: SIZE_SOURCE,
					[TOTAL_FILE]: TOTAL_SOURCE,
				},
				lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
			})
			writeFiles({
				root: lot.workspace.repository,
				files: { 'changes/other.md': '### Fixed\n\n- Other.\n' },
			})
			git({ root: lot.workspace.repository, args: ['add', '-A'] })
			git({ root: lot.workspace.repository, args: ['commit', '-qm', 'fix: other'] })
			git({ root: lot.worktree, args: ['merge', '-q', '--no-edit', 'main'] })
			const mergeBase = git({ root: lot.worktree, args: ['merge-base', 'main', 'HEAD'] }).trim()

			const sources = readPullRequestSources({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in sources ? sources : sources.quality).toEqual(
				expect.objectContaining({
					kind: 'judged',
					base: expect.objectContaining({ commit: mergeBase }),
					sharedExports: [expect.objectContaining({ name: 'sizeOf' })],
				}),
			)
		})
	},
)

describe(
	'readPullRequestSources leaves the source index alone',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a rules run, then a body read with uncommitted work → the worktree's source-index cache unchanged", () => {
			const lot = pullRequestLot({
				mainFiles: {
					'package.json': QUALITY_PACKAGE_JSON,
					[SIZE_FILE]: SIZE_SOURCE,
					[TOTAL_FILE]: TOTAL_SOURCE,
				},
				lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
			})
			writeFiles({
				root: lot.worktree,
				files: { [SIZE_FILE]: SIZE_SOURCE, [OWNER_LABEL_FILE]: OWNER_LABEL_SOURCE },
			})
			runRulesIn({ root: lot.worktree })
			const cache = resolve(
				lot.worktree,
				git({ root: lot.worktree, args: ['rev-parse', '--git-path', SOURCE_INDEX_FILE] }).trim(),
			)
			const before = readFileSync(cache, 'utf8')

			readPullRequestSources({ lotFolder: lot.lotFolder, worktree: lot.worktree, baseRef: 'main' })

			expect(readFileSync(cache, 'utf8')).toBe(before)
		})
	},
)
