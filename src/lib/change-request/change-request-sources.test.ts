/**
 * The gathering half of `lot describe` reads the lot's records and its committed head against the merge base: what main
 * moved since never shows, what the lot deletes still names the tree, what no commit holds never passes.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { writeStoreLot } from '../../../test/brief-workspace.ts'
import { LOT_NAME } from '../../../test/lot-describe.constants.ts'
import { changeRequestLot } from '../../../test/lot-describe.ts'
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
import { GITHUB_VENDOR } from '../host/github/github-vendor.ts'
import { GITHUB_NOUNS } from '../host/github/github.constants.ts'
import { GENERIC_NOUNS } from '../host/host.constants.ts'
import { writeLanded } from '../landing/landed-record.ts'
import { STACK_RECORD_DAMAGED } from '../landing/lot-landing.constants.ts'
import { STACK_FILE, STACK_SCHEMA } from '../store/stack.constants.ts'
import { prepareChangeRequest, readChangeRequestSources } from './change-request-sources.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChangeRequestLot } from '../../../test/lot-describe.types.ts'
import type { HostVendorRecord } from '../host/host.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The sources of the lot against local main. */
function sourcesOf(lot: ChangeRequestLot) {
	return readChangeRequestSources({
		lotFolder: lot.lotFolder,
		worktree: lot.worktree,
		baseRef: 'main',
	})
}

/** A contrib record of the lot's worktree whose docs step ran with `status` on the tree `stateHash`. */
function writeDocsRecord(params: {
	lot: ChangeRequestLot
	stateHash: string
	status: string
}): void {
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

describe('readChangeRequestSources', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot that merged main after main took another fragment → only its own fragment', () => {
		const lot = changeRequestLot()
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
		const lot = changeRequestLot({ lotFiles: { 'changes/x.none.md': 'wording only\n' } })

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : sources.changelog).toEqual({
			kind: 'none',
			reason: 'wording only',
			file: 'changes/x.none.md',
		})
	})

	it('a lot that folds the fragments into the changelog and bumps the version → a release that bumps', () => {
		const lot = changeRequestLot({
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

		expect('refusal' in sources ? sources : [sources.release, sources.bumpedTo]).toEqual([
			true,
			'1.1.0',
		])
	})

	it('an ordinary lot that bumps the version → no release, bumped', () => {
		const lot = changeRequestLot({
			mainFiles: { 'package.json': '{ "version": "1.0.0" }\n' },
			lotFiles: { 'package.json': '{ "version": "1.0.1" }\n' },
		})

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : [sources.release, sources.bumpedTo]).toEqual([
			false,
			'1.0.1',
		])
	})

	it.each([
		['passed on the landed tree', 'passed', true, true],
		['failed on the landed tree', 'failed', true, false],
		['passed on another tree', 'passed', false, undefined],
	])('a docs step %s → docs %s', (_name, status, landed, docsPassed) => {
		const lot = changeRequestLot()
		writeDocsRecord({ lot, status, stateHash: landed ? lot.treeHash : 'another' })

		const sources = sourcesOf(lot)

		expect('refusal' in sources ? sources : sources.docsPassed).toBe(docsPassed)
	})
})

describe(
	'prepareChangeRequest checks paths against the commits',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a summary naming a file the lot deletes → passes: the base holds it', () => {
			const lot = changeRequestLot({
				mainFiles: { 'src/old/gone.ts': 'export {}\n' },
				lotDeletes: ['src/old/gone.ts'],
				brief: { summary: 'Removes `src/old/gone.ts` for good.' },
			})

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe('rendered')
		})

		it('a summary naming an untracked file of the worktree → refused: no commit holds it', () => {
			const lot = changeRequestLot({ brief: { summary: 'Follows `notes/a/plan.md` closely.' } })
			writeFiles({ root: lot.worktree, files: { 'notes/a/plan.md': 'private\n' } })

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe(
				'the change request text holds a path outside the tree or a link `notes/a/plan.md` in brief.json summary: rewrite that record, nothing sent',
			)
		})
	},
)

describe(
	'readChangeRequestSources reads the accepted overlaps',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a lot with an accepted overlap → the other lot and the reason, never the met paths or who', () => {
			const lot = changeRequestLot()
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
	'readChangeRequestSources reads the fragments the lot adds',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a lot that edits another lot's fragment → only its own added fragment shows", () => {
			const lot = changeRequestLot({
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
	'readChangeRequestSources judges the quality on the committed head',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		const testCases: Record<
			string,
			{
				make: () => ChangeRequestLot
				baseRef?: string
				expected: unknown
			}
		> = {
			'a lot changing a shared export, no quality record anywhere → judged against the merge base, the export listed':
				{
					make: () =>
						changeRequestLot({
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
						const lot = changeRequestLot({
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
					changeRequestLot({
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
						const lot = changeRequestLot({
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
						changeRequestLot({
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
						changeRequestLot({
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
					changeRequestLot({
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
						const lot = changeRequestLot({
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
					const lot = changeRequestLot({
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
					const lot = changeRequestLot()
					writeFiles({ root: lot.worktree, files: { 'package.json': QUALITY_PACKAGE_JSON } })
					return lot
				},
				expected: { kind: 'not-judged', why: 'no package.json' },
			},
			'a committed function duplicating an existing one, an uncommitted api.json crowding the ranking → the duplicate of HEAD kept':
				{
					make: () => {
						const lot = changeRequestLot({
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
				make: () => changeRequestLot(),
				expected: { kind: 'not-judged', why: 'no package.json' },
			},
			'a base git cannot read → refused naming it, nothing judged': {
				make: () =>
					changeRequestLot({
						mainFiles: {
							'package.json': QUALITY_PACKAGE_JSON,
							[SIZE_FILE]: SIZE_SOURCE,
							[TOTAL_FILE]: TOTAL_SOURCE,
						},
						lotFiles: { ...FRAGMENT, [SIZE_FILE]: SIZE_RESIGNED_SOURCE },
					}),
				baseRef: 'origin/nope',
				expected: {
					refusal:
						'the base origin/nope cannot be read here: fetch it, or name a base this repository holds',
				},
			},
		}

		for (const [title, testCase] of Object.entries(testCases))
			it(title, () => {
				const lot = testCase.make()

				const sources = readChangeRequestSources({
					lotFolder: lot.lotFolder,
					worktree: lot.worktree,
					baseRef: testCase.baseRef ?? 'main',
				})

				expect('refusal' in sources ? sources : sources.quality).toEqual(testCase.expected)
			})
	},
)

describe(
	"readChangeRequestSources judges the quality against the body's own base",
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a lot that merged main after its cut → judged against the merge base with main, not the lot's recorded base", () => {
			const lot = changeRequestLot({
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

			const sources = readChangeRequestSources({
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
	'readChangeRequestSources leaves the source index alone',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a rules run, then a body read with uncommitted work → the worktree's source-index cache unchanged", () => {
			const lot = changeRequestLot({
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

			readChangeRequestSources({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect(readFileSync(cache, 'utf8')).toBe(before)
		})
	},
)

const CHILD = '0002-repo-child'
const CHILD_BRANCH = 'feat/child'
const RELEASED_AT = '2026-11-17T21:00:00.000Z'

/**
 * A release lot (the parent: main at 0.8.4, its commit folds the fragment into the changelog and sets 0.9.0, its
 * branch pushed) and a lot started on it (the child: its own worktree on `feat/child` cut from the parent's tip, one
 * commit of `childFiles`, its `stack.json` naming the parent).
 */
function stackedOnRelease(
	params: { childFiles?: Record<string, string>; childMessage?: string } = {},
) {
	const parent = changeRequestLot({
		mainFiles: {
			'changes/old.md': '### Added\n\n- Old.\n',
			'CHANGELOG.md': '# Changelog\n',
			'package.json': '{ "version": "0.8.4" }\n',
		},
		lotFiles: {
			'CHANGELOG.md': '# Changelog\n\n## [0.9.0] - 2026-11-17\n\n### Added\n\n- Old.\n',
			'package.json': '{ "version": "0.9.0" }\n',
		},
		lotDeletes: ['changes/old.md'],
		brief: { lots: [{ paths: ['src/', 'changes/'], message: 'chore(release): @scope/x 0.9.0' }] },
	})
	const { repository } = parent.workspace
	git({ root: parent.worktree, args: ['push', '-q', 'origin', 'feat/x'] })
	const parentTip = git({ root: parent.worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const worktree = join(parent.workspace.workspace, '.worktrees', CHILD)
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', CHILD_BRANCH, worktree, 'feat/x'] })
	writeFiles({
		root: worktree,
		files: { 'src/child.ts': 'export const child = 1\n', ...params.childFiles },
	})
	git({ root: worktree, args: ['add', '-A'] })
	git({ root: worktree, args: ['commit', '-qm', 'feat(child): child answers'] })
	const main = git({ root: repository, args: ['rev-parse', 'main'] }).trim()
	const lotFolder = writeStoreLot({
		workspace: parent.workspace,
		name: CHILD,
		scope: ['src/'],
		branch: CHILD_BRANCH,
		repository,
		worktree,
		base: { ref: 'main', commit: main },
		brief: {
			lots: [{ paths: ['src/'], message: params.childMessage ?? 'feat(child): child answers' }],
		},
	})
	writeFileSync(
		join(lotFolder, STACK_FILE),
		JSON.stringify({ schema: STACK_SCHEMA, parent: LOT_NAME }),
	)
	return { parent, parentTip, repository, child: { lotFolder, worktree } }
}

/** The parent merged into main as one squash commit, as the host merges a pull request. */
function squashParent(params: { repository: string }): void {
	git({ root: params.repository, args: ['merge', '-q', '--squash', 'feat/x'] })
	git({ root: params.repository, args: ['commit', '-qm', 'chore(release): @scope/x 0.9.0 (#5)'] })
}

/** The child's release facts against `baseRef`: `[release, bumpedTo]`, or its refusal. */
function versionFactsOf(params: {
	child: { lotFolder: string; worktree: string }
	baseRef: string
}) {
	const sources = readChangeRequestSources({ ...params.child, baseRef: params.baseRef })
	return 'refusal' in sources ? sources : [sources.release, sources.bumpedTo]
}

describe(
	'the version a lot sets, read at its own fork point',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a base without package.json, a head at 0.1.0 → it sets 0.1.0', () => {
			const lot = changeRequestLot({ lotFiles: { 'package.json': '{ "version": "0.1.0" }\n' } })

			const sources = sourcesOf(lot)

			expect('refusal' in sources ? sources : sources.bumpedTo).toBe('0.1.0')
		})

		it.each([
			{ label: 'a package.json with no version', main: '{ "name": "x" }\n', bumpedTo: '0.1.0' },
			{ label: 'the same version', main: '{ "version": "0.1.0" }\n', bumpedTo: undefined },
		])('a base holding $label, a head at 0.1.0 → it sets $bumpedTo', ({ main, bumpedTo }) => {
			const lot = changeRequestLot({
				mainFiles: { 'package.json': main },
				lotFiles: { 'package.json': '{ "version": "0.1.0" }\n' },
			})

			const sources = sourcesOf(lot)

			expect('refusal' in sources ? sources : sources.bumpedTo).toBe(bumpedTo)
		})

		it('a lot read against a base it shares no commit with → refused naming the base, never a base reading no version', () => {
			const lot = changeRequestLot()
			git({ root: lot.worktree, args: ['checkout', '-q', '--orphan', 'unrelated'] })
			git({ root: lot.worktree, args: ['rm', '-rfq', '.'] })
			git({ root: lot.worktree, args: ['commit', '-qm', 'chore: unrelated', '--allow-empty'] })
			git({ root: lot.worktree, args: ['checkout', '-q', 'feat/x'] })

			expect(
				readChangeRequestSources({
					lotFolder: lot.lotFolder,
					worktree: lot.worktree,
					baseRef: 'unrelated',
				}),
			).toEqual({ refusal: expect.stringContaining('shares no commit with unrelated') })
		})

		it('a head that drops the version the base holds → it sets none', () => {
			const lot = changeRequestLot({
				mainFiles: { 'package.json': '{ "version": "0.8.4" }\n' },
				lotFiles: { 'package.json': '{ "name": "x" }\n' },
			})

			const sources = sourcesOf(lot)

			expect('refusal' in sources ? sources : sources.bumpedTo).toBeUndefined()
		})

		it('a lot started on an open release lot, setting nothing itself → neither a release nor a bump', () => {
			const { child } = stackedOnRelease()

			expect(versionFactsOf({ child, baseRef: 'main' })).toEqual([false, undefined])
		})

		it('a lot started on an open release lot at 0.9.0, setting 0.9.1 itself, titled with 0.9.0 → refused naming 0.9.1', () => {
			const { child } = stackedOnRelease({
				childFiles: { 'package.json': '{ "version": "0.9.1" }\n' },
				childMessage: 'chore(release): @scope/x 0.9.0',
			})

			expect(prepareChangeRequest({ ...child, baseRef: 'main' })).toEqual({
				refusal: `the title "chore(release): @scope/x 0.9.0" does not name 0.9.1, the version this lot sets: correct lots[0].message with dialecte lot brief ${CHILD} --from <brief.json> --by <who> --reason <why>`,
			})
		})

		it('the parent squash-merged and recorded landed, the child not rebased yet → neither a release nor a bump', () => {
			const { parent, parentTip, repository, child } = stackedOnRelease()
			squashParent({ repository })
			writeLanded({
				lotFolder: parent.lotFolder,
				fact: { schema: 1, how: 'host', tip: parentTip, base: 'main', at: RELEASED_AT },
			})

			expect(versionFactsOf({ child, baseRef: 'main' })).toEqual([false, undefined])
		})

		it('the parent squash-merged and recorded landed, the child rebased onto main → neither a release nor a bump', () => {
			const { parent, parentTip, repository, child } = stackedOnRelease()
			squashParent({ repository })
			writeLanded({
				lotFolder: parent.lotFolder,
				fact: { schema: 1, how: 'host', tip: parentTip, base: 'main', at: RELEASED_AT },
			})
			git({ root: child.worktree, args: ['rebase', '-q', '--onto', 'main', parentTip] })

			expect(versionFactsOf({ child, baseRef: 'main' })).toEqual([false, undefined])
		})

		it('the parent merged into main with no landed record (git proves it), the child not rebased → neither a release nor a bump', () => {
			const { repository, child } = stackedOnRelease()
			git({
				root: repository,
				args: ['merge', '-q', '--no-ff', '-m', 'merge the release', 'feat/x'],
			})

			expect(versionFactsOf({ child, baseRef: 'main' })).toEqual([false, undefined])
		})

		it('a lot started on an open release lot, read against main and against the parent’s branch → the same facts', () => {
			const { child } = stackedOnRelease()

			expect([
				versionFactsOf({ child, baseRef: 'main' }),
				versionFactsOf({ child, baseRef: 'feat/x' }),
			]).toEqual([
				[false, undefined],
				[false, undefined],
			])
		})

		it('a damaged stack.json → refused naming it, never read as a lot not stacked', () => {
			const { child } = stackedOnRelease()
			writeFileSync(join(child.lotFolder, STACK_FILE), '{ torn')

			expect(versionFactsOf({ child, baseRef: 'main' })).toEqual({
				refusal: expect.stringContaining(
					STACK_RECORD_DAMAGED.replace('{reason}', 'stack.json does not read as a stack record'),
				),
			})
		})

		it('a stack parent whose records do not read → refused naming the parent', () => {
			const { parent, child } = stackedOnRelease()
			rmSync(join(parent.lotFolder, 'identity.json'), { force: true })

			expect(versionFactsOf({ child, baseRef: 'main' })).toEqual({
				refusal: expect.stringContaining(`the stack parent ${LOT_NAME} cannot be read`),
			})
		})
	},
)

describe(
	'a lot whose title does not name the version it sets',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('main at 0.8.4, the lot sets 0.9.0, its title names 0.8.4 → no pull request text, the lot brief command named', () => {
			const lot = changeRequestLot({
				mainFiles: { 'package.json': '{ "version": "0.8.4" }\n' },
				lotFiles: {
					'package.json': '{ "version": "0.9.0" }\n',
					'changes/x.md': '### Added\n\n- x.\n',
				},
				brief: {
					lots: [{ paths: ['src/', 'changes/'], message: 'chore(release): @scope/x 0.8.4' }],
				},
			})

			expect(
				prepareChangeRequest({ lotFolder: lot.lotFolder, worktree: lot.worktree, baseRef: 'main' }),
			).toEqual({
				refusal: `the title "chore(release): @scope/x 0.8.4" does not name 0.9.0, the version this lot sets: correct lots[0].message with dialecte lot brief ${LOT_NAME} --from <brief.json> --by <who> --reason <why>`,
			})
		})

		it('the same lot titled with 0.9.0 → its text renders, titled so', () => {
			const lot = changeRequestLot({
				mainFiles: { 'package.json': '{ "version": "0.8.4" }\n' },
				lotFiles: {
					'package.json': '{ "version": "0.9.0" }\n',
					'changes/x.md': '### Added\n\n- x.\n',
				},
				brief: {
					lots: [{ paths: ['src/', 'changes/'], message: 'chore(release): @scope/x 0.9.0' }],
				},
			})

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in prepared ? prepared : prepared.sources.messages[0]).toBe(
				'chore(release): @scope/x 0.9.0',
			)
		})
	},
)

/** A second vendor, on paper: GitHub's record with its own name and template path. */
const PAPER_VENDOR: HostVendorRecord = {
	...GITHUB_VENDOR,
	remoteHosts: ['gitlab.com'],
	nouns: { changeRequestNoun: 'merge request', changeRequestNouns: 'merge requests' },
	changeRequestTemplate: '.gitlab/merge_request_templates/Default.md',
}

/** The lot's head with its template moved to `to`, or removed when `to` is null; the origin set to `origin` when given. */
function lotWithTemplateAt(params: { to: string | null; origin?: string }) {
	const lot = changeRequestLot()
	if (params.to === null)
		git({ root: lot.worktree, args: ['rm', '-q', GITHUB_VENDOR.changeRequestTemplate] })
	else {
		mkdirSync(join(lot.worktree, dirname(params.to)), { recursive: true })
		git({ root: lot.worktree, args: ['mv', GITHUB_VENDOR.changeRequestTemplate, params.to] })
	}
	git({ root: lot.worktree, args: ['commit', '-qm', 'chore: the template moved'] })
	if (params.origin !== undefined)
		git({ root: lot.worktree, args: ['remote', 'set-url', 'origin', params.origin] })
	return lot
}

describe(
	'prepareChangeRequest: the template from the vendor, else from the tree',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it("a GitHub origin and only another vendor's template in the tree → refused naming GitHub's path alone", () => {
			const lot = lotWithTemplateAt({
				to: PAPER_VENDOR.changeRequestTemplate,
				origin: 'https://github.com/o/r.git',
			})

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
				vendors: [GITHUB_VENDOR, PAPER_VENDOR],
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe(
				"the lot's head holds no .github/pull_request_template.md: copy the cli's template into the repository",
			)
		})

		it("no vendor and only another vendor's template in the tree → rendered through it", () => {
			const lot = lotWithTemplateAt({ to: PAPER_VENDOR.changeRequestTemplate })

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
				vendors: [GITHUB_VENDOR, PAPER_VENDOR],
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe('rendered')
		})

		it("no vendor and no template → refused naming every vendor's path", () => {
			const lot = lotWithTemplateAt({ to: null })

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
				vendors: [GITHUB_VENDOR, PAPER_VENDOR],
			})

			expect('refusal' in prepared ? prepared.refusal : 'rendered').toBe(
				"the lot's head holds no .github/pull_request_template.md or .gitlab/merge_request_templates/Default.md: copy the cli's template into the repository",
			)
		})
	},
)

describe(
	'prepareChangeRequest: the host nouns read from the worktree',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each([
			{ origin: 'a GitHub origin', url: 'https://github.com/o/r.git', nouns: GITHUB_NOUNS },
			{ origin: 'a local-path origin', url: '/srv/git/repo.git', nouns: GENERIC_NOUNS },
		])('$origin → its nouns beside the prepared text', ({ url, nouns }) => {
			const lot = changeRequestLot()
			git({ root: lot.worktree, args: ['config', 'remote.origin.url', url] })

			const prepared = prepareChangeRequest({
				lotFolder: lot.lotFolder,
				worktree: lot.worktree,
				baseRef: 'main',
			})

			expect('refusal' in prepared ? prepared.refusal : prepared.nouns).toEqual(nouns)
		})
	},
)
