import { chmodSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
	git,
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { POOL_COMMAND_CASE_MS, POOL_UNIT_CASE_MS } from '../../../test/worktree-pool.constants.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../handover/handover-store.ts'
import { removableIgnored } from './removable-ignored.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-11-09T10:00:00Z')

/** In a link target: the sandbox folder holding the worktree, the main checkout and the `outside` folder. */
const SANDBOX = '{sandbox}'

/** The files an `outside` folder holds: a link to it must never be entered. */
const OUTSIDE_FILES = { 'a.txt': 'outside a\n', 'deep/b.txt': 'outside b\n' }

const ARCHIVED_DECLARATION = '{"lot":"x","steps":[1]}\n'

/** What a folder holds: files (path -> text), the executable ones, and links (path -> target text). */
type Tree = {
	files?: Record<string, string>
	executable?: string[]
	links?: Record<string, string>
}

type Row = {
	name: string
	worktree: Tree
	main?: Tree
	lines: string[]
	archived?: string[]
	hooks?: string | null
	expected: string[]
}

type DialecteCase = {
	name: string
	/** What `.dialecte/` holds, paths relative to it. */
	holds: Tree
	/** What the main checkout's `.dialecte/` holds, paths relative to it. */
	mainHolds?: Tree
	archived?: string[]
	expected: string[]
}

/** Writes a tree under `root`; link targets have the sandbox token replaced by `sandbox`. */
function writeTree(params: { root: string; sandbox: string; tree: Tree }): void {
	const { root, sandbox, tree } = params
	mkdirSync(root, { recursive: true })
	for (const [path, content] of Object.entries(tree.files ?? {})) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), content)
		chmodSync(join(root, path), (tree.executable ?? []).includes(path) ? 0o755 : 0o644)
	}
	for (const [path, target] of Object.entries(tree.links ?? {})) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		symlinkSync(target.replace(SANDBOX, sandbox), join(root, path))
	}
}

/** The sandbox of one case: the worktree and the main checkout laid out as the row says, and the `outside` folder. */
function layOut(row: Pick<Row, 'worktree' | 'main'>): { worktree: string; main: string } {
	const sandbox = realpathSync(temporaryFolder('dialecte-removable-ignored-'))
	writeTree({ root: join(sandbox, 'outside'), sandbox, tree: { files: OUTSIDE_FILES } })
	writeTree({ root: join(sandbox, 'copy'), sandbox, tree: { files: OUTSIDE_FILES } })
	writeTree({ root: join(sandbox, 'worktree'), sandbox, tree: row.worktree })
	writeTree({ root: join(sandbox, 'main'), sandbox, tree: row.main ?? {} })
	return { worktree: join(sandbox, 'worktree'), main: join(sandbox, 'main') }
}

/** The rows of `.dialecte/` cases, at the root and at depth, in both shapes of git's listing. */
function dialecteRows(cases: DialecteCase[]): Row[] {
	const places = ['', 'packages/x/']
	const shapes = ['folder', 'entries'] as const
	return places.flatMap(function rowsAt(place) {
		return shapes.flatMap(function rowsInShape(shape) {
			return cases.map(function rowOf(dialecteCase): Row {
				const entries = [
					...Object.keys(dialecteCase.holds.files ?? {}),
					...Object.keys(dialecteCase.holds.links ?? {}),
				]
				return {
					name: `${dialecteCase.name} (${place || 'root'}, git prints ${shape === 'folder' ? 'the folder' : 'the entries'})`,
					worktree: {
						files: prefixed({ place: `${place}.dialecte/`, record: dialecteCase.holds.files }),
						links: prefixed({ place: `${place}.dialecte/`, record: dialecteCase.holds.links }),
					},
					main: {
						files: prefixed({ place: `${place}.dialecte/`, record: dialecteCase.mainHolds?.files }),
					},
					lines:
						shape === 'folder'
							? [`!! ${place}.dialecte/`]
							: entries.map((entry) => `!! ${place}.dialecte/${entry}`),
					archived: dialecteCase.archived,
					expected: dialecteCase.expected.map((entry) => `${place}.dialecte/${entry}`),
				}
			})
		})
	})
}

function prefixed(params: {
	place: string
	record: Record<string, string> | undefined
}): Record<string, string> {
	return Object.fromEntries(
		Object.entries(params.record ?? {}).map(([path, value]) => [`${params.place}${path}`, value]),
	)
}

const REBUILT_ROWS: Row[] = [
	{
		name: 'node_modules, dist and the vitepress caches → not kept',
		worktree: {
			files: {
				'node_modules/a/index.js': 'x\n',
				'dist/x.js': 'x\n',
				'.vitepress/cache/c.json': 'x\n',
				'.vitepress/dist/i.html': 'x\n',
			},
		},
		lines: ['!! node_modules/', '!! dist/', '!! .vitepress/cache/', '!! .vitepress/dist/'],
		expected: [],
	},
	{
		name: '.DS_Store at the root and deeper → not kept',
		worktree: { files: { '.DS_Store': 'x', 'src/.DS_Store': 'y' } },
		lines: ['!! .DS_Store', '!! src/.DS_Store'],
		expected: [],
	},
	{
		name: 'the configured hooks folder → not kept',
		worktree: { files: { '.husky/_/husky.sh': 'x\n' } },
		lines: ['!! .husky/_/'],
		hooks: '.husky/_',
		expected: [],
	},
	{
		name: 'the configured hooks folder written with a trailing slash → not kept',
		worktree: { files: { '.husky/_/husky.sh': 'x\n' } },
		lines: ['!! .husky/_/'],
		hooks: '.husky/_/',
		expected: [],
	},
	{
		name: 'a file that only starts like the configured hooks folder → kept, named',
		worktree: { files: { '.husky/_old.txt': 'x\n' } },
		lines: ['!! .husky/_old.txt'],
		hooks: '.husky/_',
		expected: ['.husky/_old.txt'],
	},
	{
		name: 'a folder that looks like a hooks folder when none is configured → kept',
		worktree: { files: { '.husky/_/husky.sh': 'x\n' } },
		lines: ['!! .husky/_/'],
		hooks: null,
		expected: ['.husky/_/husky.sh'],
	},
]

const DECLARED_ROWS: Row[] = [
	{
		name: 'a folder declared rebuilt, git printing the folder → not kept',
		worktree: { files: { 'coverage/lcov.info': 'x\n', 'coverage/html/i.html': 'y\n' } },
		main: { files: { 'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n' } },
		lines: ['!! coverage/'],
		expected: [],
	},
	{
		name: 'a folder declared rebuilt, git printing its entries → not kept',
		worktree: { files: { 'coverage/lcov.info': 'x\n', 'coverage/html/i.html': 'y\n' } },
		main: { files: { 'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n' } },
		lines: ['!! coverage/lcov.info', '!! coverage/html/i.html'],
		expected: [],
	},
	{
		name: 'the same folder undeclared (no package.json) → kept, named',
		worktree: { files: { 'coverage/lcov.info': 'x\n' } },
		lines: ['!! coverage/'],
		expected: ['coverage/lcov.info'],
	},
	{
		name: 'the same folder undeclared (a package.json without the field) → kept, named',
		worktree: { files: { 'coverage/lcov.info': 'x\n' } },
		main: { files: { 'package.json': '{"name":"demo"}\n' } },
		lines: ['!! coverage/'],
		expected: ['coverage/lcov.info'],
	},
	{
		name: 'another folder than the declared one → kept, named',
		worktree: { files: { 'coverage/lcov.info': 'x\n', 'reports/out.html': 'y\n' } },
		main: { files: { 'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n' } },
		lines: ['!! coverage/', '!! reports/'],
		expected: ['reports/out.html'],
	},
	{
		name: 'a declaration in the worktree package.json only (the main checkout declares nothing) → kept, named',
		worktree: {
			files: {
				'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n',
				'coverage/lcov.info': 'x\n',
			},
		},
		main: { files: { 'package.json': '{"name":"demo"}\n' } },
		lines: ['!! coverage/'],
		expected: ['coverage/lcov.info'],
	},
	{
		name: 'a declared folder matches at its package root only (src/coverage) → kept, named',
		worktree: { files: { 'src/coverage/lcov.info': 'x\n' } },
		main: { files: { 'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n' } },
		lines: ['!! src/coverage/'],
		expected: ['src/coverage/lcov.info'],
	},
	...[
		{ label: 'empty', entry: '' },
		{ label: 'dot slash', entry: './' },
		{ label: 'slash', entry: '/' },
		{ label: 'parent', entry: '../' },
		{ label: 'a parent in the middle', entry: '../x/' },
		{ label: 'absolute', entry: '/abs/' },
		{ label: 'no trailing slash', entry: 'coverage' },
		{ label: 'a number', entry: 7 },
	].map(function invalidRow({ label, entry }): Row {
		return {
			name: `an invalid declared entry (${label}) is ignored → the content stays kept, named`,
			worktree: { files: { 'coverage/lcov.info': 'x\n', 'x/y.txt': 'y\n' } },
			main: {
				files: {
					'package.json': JSON.stringify({ dialecte: { rebuiltIgnored: [entry] } }),
				},
			},
			lines: ['!! coverage/', '!! x/'],
			expected: ['coverage/lcov.info', 'x/y.txt'],
		}
	}),
	{
		name: 'a file that only starts like the declared folder → kept, named',
		worktree: { files: { 'coverage.json': 'x\n' } },
		main: { files: { 'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n' } },
		lines: ['!! coverage.json'],
		expected: ['coverage.json'],
	},
	{
		name: 'declared by the root package, in a package of its own that declares nothing → kept, named',
		worktree: { files: { 'packages/x/coverage/lcov.info': 'x\n' } },
		main: {
			files: {
				'package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n',
				'packages/x/package.json': '{"name":"x"}\n',
			},
		},
		lines: ['!! packages/x/coverage/'],
		expected: ['packages/x/coverage/lcov.info'],
	},
	{
		name: 'declared by the nearest package.json, a package below the root → not kept',
		worktree: { files: { 'packages/x/coverage/lcov.info': 'x\n' } },
		main: {
			files: {
				'package.json': '{"name":"root"}\n',
				'packages/x/package.json': '{"dialecte":{"rebuiltIgnored":["coverage/"]}}\n',
			},
		},
		lines: ['!! packages/x/coverage/'],
		expected: [],
	},
]

const DIALECTE_CASES: DialecteCase[] = [
	{
		name: 'lot a link to a folder full of files → not kept, never entered',
		holds: { links: { lot: `${SANDBOX}/outside` } },
		expected: [],
	},
	{
		name: 'lot a dangling link → not kept',
		holds: { links: { lot: `${SANDBOX}/missing` } },
		expected: [],
	},
	{
		name: 'lot.json parsing to {} → not kept',
		holds: { files: { 'lot.json': '{}\n' } },
		expected: [],
	},
	{
		name: 'lot.json a spaced empty object → not kept',
		holds: { files: { 'lot.json': ' { }\n' } },
		expected: [],
	},
	{
		name: 'lot.json byte-equal to an archived declaration → not kept',
		holds: { files: { 'lot.json': ARCHIVED_DECLARATION } },
		archived: ['{"other":true}\n', ARCHIVED_DECLARATION],
		expected: [],
	},
	{
		name: 'lot.json differing from the archived one by a byte → kept, named',
		holds: { files: { 'lot.json': ARCHIVED_DECLARATION.trimEnd() } },
		archived: [ARCHIVED_DECLARATION],
		expected: ['lot.json'],
	},
	{
		name: 'a non-empty lot.json with nothing archived → kept, named',
		holds: { files: { 'lot.json': ARCHIVED_DECLARATION } },
		expected: ['lot.json'],
	},
	{
		name: 'lot.json that is not JSON → kept, named',
		holds: { files: { 'lot.json': 'not json\n' } },
		expected: ['lot.json'],
	},
	{
		name: 'notes.md → kept, named',
		holds: { files: { 'notes.md': 'my notes\n' } },
		expected: ['notes.md'],
	},
	{
		name: 'a lot link and an empty lot.json → not kept',
		holds: { links: { lot: `${SANDBOX}/outside` }, files: { 'lot.json': '{}\n' } },
		expected: [],
	},
	{
		name: 'a lot link, an empty lot.json and notes.md → only notes.md kept',
		holds: {
			links: { lot: `${SANDBOX}/outside` },
			files: { 'lot.json': '{}\n', 'notes.md': 'my notes\n' },
		},
		expected: ['notes.md'],
	},
	{
		name: 'lot a regular file → kept, named',
		holds: { files: { lot: 'not a view\n' } },
		expected: ['lot'],
	},
	{
		name: 'a file in a subfolder → kept, the file named',
		holds: { files: { 'sub/x.md': 'x\n' } },
		expected: ['sub/x.md'],
	},
	{
		name: 'notes.md byte-equal to the main checkout copy → kept (the copy rule never applies here)',
		holds: { files: { 'notes.md': 'my notes\n' } },
		mainHolds: { files: { 'notes.md': 'my notes\n' } },
		expected: ['notes.md'],
	},
	...['[]', '""', 'true', 'null'].map(function nonObjectCase(text): DialecteCase {
		return {
			name: `lot.json holding ${text} (no object) → kept, named`,
			holds: { files: { 'lot.json': `${text}\n` } },
			expected: ['lot.json'],
		}
	}),
]

const COPY_ROWS: Row[] = [
	{
		name: 'a file byte-equal to the main checkout copy → not kept',
		worktree: { files: { 'fixtures/a.xsd': '<schema/>\n' } },
		main: { files: { 'fixtures/a.xsd': '<schema/>\n' } },
		lines: ['!! fixtures/a.xsd'],
		expected: [],
	},
	{
		name: '.dialecte itself a link to a folder (git prints it without a slash) → kept, named, never entered',
		worktree: { links: { '.dialecte': `${SANDBOX}/outside` } },
		lines: ['!! .dialecte'],
		expected: ['.dialecte'],
	},
	{
		name: "the main checkout's folder is a link to the worktree's own folder → no copy, the file kept, named",
		worktree: { files: { '.tmp/n.md': 'research\n' } },
		main: { links: { '.tmp': `${SANDBOX}/worktree/.tmp` } },
		lines: ['!! .tmp/'],
		expected: ['.tmp/n.md'],
	},
	{
		name: "the main checkout's file is a link to the worktree's own file → no copy, kept, named",
		worktree: { files: { '.tmp/n.md': 'research\n' } },
		main: { links: { '.tmp/n.md': `${SANDBOX}/worktree/.tmp/n.md` } },
		lines: ['!! .tmp/n.md'],
		expected: ['.tmp/n.md'],
	},
	{
		name: 'a rename entry with its original-path field → the original path is never read as an entry',
		worktree: { files: { 'old-name': 'old\n', '.tmp/n.md': 'n\n' } },
		main: { files: { '.tmp/n.md': 'n\n' } },
		lines: ['R  new-name', 'old-name', '!! .tmp/'],
		expected: [],
	},
	{
		name: 'a rename entry whose original path looks like an ignored entry → still not read as one',
		worktree: { files: { 'old-name': 'old\n', '.tmp/n.md': 'n\n' } },
		main: { files: { '.tmp/n.md': 'n\n' } },
		lines: ['R  new-name', '!! old-name', '!! .tmp/'],
		expected: [],
	},
	{
		name: 'a link compared by its text: another target with the same bytes → kept, named',
		worktree: { links: { 'bench/link': `${SANDBOX}/outside/a.txt` } },
		main: { links: { 'bench/link': `${SANDBOX}/copy/a.txt` } },
		lines: ['!! bench/'],
		expected: ['bench/link'],
	},
	{
		name: 'several kept → sorted by code unit (B.log before a.log)',
		worktree: { files: { 'a.log': 'a\n', 'B.log': 'b\n' } },
		lines: ['!! a.log', '!! B.log'],
		expected: ['B.log', 'a.log'],
	},
	{
		name: 'a file with other bytes than the main checkout copy → kept, named',
		worktree: { files: { 'fixtures/a.xsd': '<schema a="1"/>\n' } },
		main: { files: { 'fixtures/a.xsd': '<schema/>\n' } },
		lines: ['!! fixtures/a.xsd'],
		expected: ['fixtures/a.xsd'],
	},
	{
		name: 'a file with a longer content than the copy that starts alike → kept, named',
		worktree: { files: { 'fixtures/a.xsd': '<schema/>\n<more/>\n' } },
		main: { files: { 'fixtures/a.xsd': '<schema/>\n' } },
		lines: ['!! fixtures/a.xsd'],
		expected: ['fixtures/a.xsd'],
	},
	{
		name: 'only the executable bit differs (the worktree one is executable) → kept, named',
		worktree: { files: { 'fixtures/run.sh': 'echo\n' }, executable: ['fixtures/run.sh'] },
		main: { files: { 'fixtures/run.sh': 'echo\n' } },
		lines: ['!! fixtures/run.sh'],
		expected: ['fixtures/run.sh'],
	},
	{
		name: 'only the executable bit differs (the main checkout one is executable) → kept, named',
		worktree: { files: { 'fixtures/run.sh': 'echo\n' } },
		main: { files: { 'fixtures/run.sh': 'echo\n' }, executable: ['fixtures/run.sh'] },
		lines: ['!! fixtures/run.sh'],
		expected: ['fixtures/run.sh'],
	},
	{
		name: 'both executable, same bytes → not kept',
		worktree: { files: { 'fixtures/run.sh': 'echo\n' }, executable: ['fixtures/run.sh'] },
		main: { files: { 'fixtures/run.sh': 'echo\n' }, executable: ['fixtures/run.sh'] },
		lines: ['!! fixtures/run.sh'],
		expected: [],
	},
	{
		name: 'a folder absent from the main checkout (git prints the folder) → kept, its file named',
		worktree: { files: { '.tmp/notes.md': 'research\n' } },
		lines: ['!! .tmp/'],
		expected: ['.tmp/notes.md'],
	},
	{
		name: 'a file absent from the main checkout (git prints the entry) → kept, named',
		worktree: { files: { '.tmp/notes.md': 'research\n' } },
		lines: ['!! .tmp/notes.md'],
		expected: ['.tmp/notes.md'],
	},
	{
		name: 'a folder walked, every file compared: one differing → only it kept',
		worktree: {
			files: { 'bench/a.json': 'a\n', 'bench/b.json': 'b changed\n', 'bench/c.json': 'c\n' },
		},
		main: { files: { 'bench/a.json': 'a\n', 'bench/b.json': 'b\n', 'bench/c.json': 'c\n' } },
		lines: ['!! bench/'],
		expected: ['bench/b.json'],
	},
	{
		name: 'a folder walked into its subfolders: a deep file differing → only it kept',
		worktree: { files: { 'bench/a.json': 'a\n', 'bench/sub/deep/y.json': 'y changed\n' } },
		main: { files: { 'bench/a.json': 'a\n', 'bench/sub/deep/y.json': 'y\n' } },
		lines: ['!! bench/'],
		expected: ['bench/sub/deep/y.json'],
	},
	{
		name: 'a folder walked: every file equal → not kept',
		worktree: { files: { 'bench/a.json': 'a\n', 'bench/sub/y.json': 'y\n' } },
		main: { files: { 'bench/a.json': 'a\n', 'bench/sub/y.json': 'y\n' } },
		lines: ['!! bench/'],
		expected: [],
	},
	{
		name: 'a folder walked: a file the main checkout lacks, the rest equal → only it kept',
		worktree: { files: { 'bench/a.json': 'a\n', 'bench/extra.json': 'extra\n' } },
		main: { files: { 'bench/a.json': 'a\n' } },
		lines: ['!! bench/'],
		expected: ['bench/extra.json'],
	},
	{
		name: 'a link with the same target text as the main checkout one → not kept',
		worktree: { links: { 'bench/link': `${SANDBOX}/outside` } },
		main: { links: { 'bench/link': `${SANDBOX}/outside` } },
		lines: ['!! bench/'],
		expected: [],
	},
	{
		name: 'a link to a folder full of files, absent from the main checkout → kept, the link named, never entered',
		worktree: { links: { 'bench/link': `${SANDBOX}/outside` } },
		lines: ['!! bench/'],
		expected: ['bench/link'],
	},
	{
		name: 'a link with another target text than the main checkout one → kept, named',
		worktree: { links: { 'bench/link': `${SANDBOX}/outside` } },
		main: { links: { 'bench/link': `${SANDBOX}/elsewhere` } },
		lines: ['!! bench/'],
		expected: ['bench/link'],
	},
	{
		name: 'a link where the main checkout holds a file with the target as text → kept, named',
		worktree: { links: { 'bench/link': `${SANDBOX}/outside` } },
		main: { files: { 'bench/link': 'whatever\n' } },
		lines: ['!! bench/'],
		expected: ['bench/link'],
	},
	{
		name: 'a file where the main checkout holds a link → kept, named',
		worktree: { files: { 'bench/link': 'text\n' } },
		main: { links: { 'bench/link': `${SANDBOX}/outside` } },
		lines: ['!! bench/'],
		expected: ['bench/link'],
	},
	{
		name: 'a file where the main checkout holds a folder → kept, named',
		worktree: { files: { 'bench/a': 'text\n' } },
		main: { files: { 'bench/a/inner.txt': 'text\n' } },
		lines: ['!! bench/'],
		expected: ['bench/a'],
	},
	{
		name: 'several kept → listed sorted whatever the order of git lines',
		worktree: { files: { 'zeta.log': 'z\n', 'alpha.log': 'a\n', '.tmp/n.md': 'n\n' } },
		lines: ['!! zeta.log', '!! alpha.log', '!! .tmp/'],
		expected: ['.tmp/n.md', 'alpha.log', 'zeta.log'],
	},
	{
		name: 'entries that are not ignored ones are not looked at',
		worktree: { files: { 'scratch.txt': 'x\n', '.tmp/n.md': 'n\n' } },
		lines: ['?? scratch.txt', ' M src/a.ts', '!! .tmp/'],
		expected: ['.tmp/n.md'],
	},
	{
		name: 'no ignored entry → nothing kept',
		worktree: { files: { 'src/a.ts': 'a\n' } },
		lines: [],
		expected: [],
	},
]

const EXACT_PATH_ROWS: Row[] = [
	{ name: 'a space', path: 'docs/my file.xsd' },
	{ name: 'a quote', path: 'docs/"quoted".xsd' },
	{ name: 'a non-ASCII character', path: 'docs/été.xsd' },
].flatMap(function rowsOf({ name, path }): Row[] {
	return [
		{
			name: `${name} in an equal file's path → not kept`,
			worktree: { files: { [path]: 'same\n' } },
			main: { files: { [path]: 'same\n' } },
			lines: [`!! ${path}`],
			expected: [],
		},
		{
			name: `${name} in a differing file's path → kept, named exactly`,
			worktree: { files: { [path]: 'changed\n' } },
			main: { files: { [path]: 'same\n' } },
			lines: [`!! ${path}`],
			expected: [path],
		},
	]
})

const ROWS: Row[] = [
	...REBUILT_ROWS,
	...DECLARED_ROWS,
	...dialecteRows(DIALECTE_CASES),
	...COPY_ROWS,
	...EXACT_PATH_ROWS,
]

describe('removableIgnored: the pure cases', { timeout: POOL_UNIT_CASE_MS }, () => {
	// one case per row under its full title: the runner cuts a formatted title, and cases would share an id
	for (const row of ROWS)
		it(row.name, function checkRow() {
			const { worktree, main } = layOut(row)

			expect(
				removableIgnored({
					worktree,
					main,
					ignoredLines: row.lines,
					archivedDeclarations: row.archived ?? [],
					hooksFolder: row.hooks ?? null,
				}),
			).toEqual({ kept: row.expected })
		})
})

/**
 * A repository (the main checkout) ignoring `.dialecte/` with one linked worktree holding what a lot leaves there:
 * a `lot` link, an empty `lot.json`, a note and a rebuilt folder. With `tracksRecords`, the main checkout tracks
 * `.dialecte/mutation-records.json` (force-added), so git lists the worktree's ignored entries one by one.
 */
function createRepositoryWithWorktree(params: {
	tracksRecords?: boolean
	/** False: no `.dialecte/` leftovers in the worktree (only what a case adds). */
	leftovers?: boolean
	/** Lines added to the repository's `.gitignore`. */
	ignore?: string
}): {
	sandbox: string
	main: string
	worktree: string
} {
	isolateGitConfig()
	const sandbox = realpathSync(temporaryFolder('dialecte-removable-git-'))
	writeTree({ root: join(sandbox, 'outside'), sandbox, tree: { files: OUTSIDE_FILES } })
	const main = initializeRepository({
		root: join(sandbox, 'main'),
		files: {
			'.gitignore': `.dialecte/\nnode_modules/\n${params.ignore ?? ''}`,
			'package.json': '{"name":"demo"}\n',
		},
	})
	if (params.tracksRecords) {
		writeFiles({ root: main, files: { '.dialecte/mutation-records.json': '[]\n' } })
		git({ root: main, args: ['add', '-f', '.dialecte/mutation-records.json'] })
		git({ root: main, args: ['commit', '-q', '-m', 'chore: track records'] })
	}
	const worktree = join(sandbox, 'worktree')
	git({ root: main, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree] })
	if (params.leftovers === false) return { sandbox, main, worktree }
	writeTree({
		root: worktree,
		sandbox,
		tree: {
			files: {
				'.dialecte/lot.json': '{}\n',
				'.dialecte/notes.md': 'my notes\n',
				'node_modules/a/index.js': 'x\n',
			},
			links: { '.dialecte/lot': `${SANDBOX}/outside` },
		},
	})
	return { sandbox, main, worktree }
}

/** Git's own listing of the worktree's ignored entries, split on NUL, as the cases claim to know its shape. */
function rawIgnoredEntries(worktree: string): string[] {
	return git({
		root: worktree,
		args: ['status', '-z', '--porcelain', '--untracked-files=all', '--ignored=matching'],
	})
		.split('\0')
		.filter(Boolean)
}

/** Registers a hand-over of `root` whose folder archives `ARCHIVED_DECLARATION`, in `state`. */
function registerArchivedHandover(params: {
	sandbox: string
	main: string
	root: string
	branch: string
	state: 'pending' | 'committed' | 'abandoned'
}): void {
	const folder = join(params.sandbox, `handover-${params.branch.replace('/', '-')}`)
	writeFiles({ root: folder, files: { 'lot.json': ARCHIVED_DECLARATION } })
	registerHandover({ root: params.root, folder, branch: params.branch, now: NOW })
	if (params.state !== 'pending')
		recordHandoverState({ store: handoverStoreOf(params.main), folder, state: params.state })
}

describe('removableIgnored: the real git listings', { timeout: POOL_COMMAND_CASE_MS }, () => {
	afterEach(function restoreEnvironment() {
		vi.unstubAllEnvs()
	})

	it('git prints `!! .dialecte/` (nothing tracked under it) → the note keeps, the view and the empty declaration go', () => {
		const { main, worktree } = createRepositoryWithWorktree({ tracksRecords: false })

		expect(rawIgnoredEntries(worktree)).toContain('!! .dialecte/')
		expect(removableIgnored({ worktree, main })).toEqual({ kept: ['.dialecte/notes.md'] })
	})

	it('git lists the ignored entries one by one (a tracked file under `.dialecte/`) → the same answer', () => {
		const { main, worktree } = createRepositoryWithWorktree({ tracksRecords: true })

		const entries = rawIgnoredEntries(worktree)
		expect(entries).toEqual(expect.arrayContaining(['!! .dialecte/notes.md', '!! .dialecte/lot']))
		expect(entries).not.toContain('!! .dialecte/')
		expect(removableIgnored({ worktree, main })).toEqual({ kept: ['.dialecte/notes.md'] })
	})

	it('a non-empty lot.json byte-equal to the one archived in a committed hand-over registered for this worktree → not kept', () => {
		const { sandbox, main, worktree } = createRepositoryWithWorktree({ tracksRecords: false })
		writeFileSync(join(worktree, '.dialecte/lot.json'), ARCHIVED_DECLARATION)
		registerArchivedHandover({
			sandbox,
			main,
			root: worktree,
			branch: 'feat/x',
			state: 'committed',
		})

		expect(removableIgnored({ worktree, main })).toEqual({ kept: ['.dialecte/notes.md'] })
	})

	it.each(['pending', 'abandoned'] as const)(
		'the same archived declaration of a %s hand-over registered for this worktree → kept, named',
		(state) => {
			const { sandbox, main, worktree } = createRepositoryWithWorktree({ tracksRecords: false })
			writeFileSync(join(worktree, '.dialecte/lot.json'), ARCHIVED_DECLARATION)
			registerArchivedHandover({ sandbox, main, root: worktree, branch: 'feat/x', state })

			expect(removableIgnored({ worktree, main })).toEqual({
				kept: ['.dialecte/lot.json', '.dialecte/notes.md'],
			})
		},
	)

	it('the same archived declaration of a hand-over registered for another worktree → kept, named', () => {
		const { sandbox, main, worktree } = createRepositoryWithWorktree({ tracksRecords: false })
		const other = join(sandbox, 'other')
		git({ root: main, args: ['worktree', 'add', '-q', '-b', 'feat/y', other] })
		writeFileSync(join(worktree, '.dialecte/lot.json'), ARCHIVED_DECLARATION)
		registerArchivedHandover({ sandbox, main, root: other, branch: 'feat/y', state: 'committed' })

		expect(removableIgnored({ worktree, main })).toEqual({
			kept: ['.dialecte/lot.json', '.dialecte/notes.md'],
		})
	})

	it('ignored differing files named with a space, a quote and a non-ASCII character → kept, each named exactly (git read with -z)', () => {
		const { main, worktree } = createRepositoryWithWorktree({ leftovers: false, ignore: '*.xsd\n' })
		const paths = ['"quoted.xsd', 'docs/a"b.xsd', 'docs/my file.xsd', 'docs/été.xsd']
		writeFiles({
			root: main,
			files: Object.fromEntries(paths.map((path) => [path, 'main bytes\n'])),
		})
		writeFiles({
			root: worktree,
			files: Object.fromEntries(paths.map((path) => [path, 'worktree bytes\n'])),
		})

		expect(removableIgnored({ worktree, main })).toEqual({ kept: paths })
	})

	it('the hooks folder git is configured with, read by default → its content not kept; a file that only starts like it kept', () => {
		const { main, worktree } = createRepositoryWithWorktree({
			leftovers: false,
			ignore: '.husky/_/\n.husky/_old.txt\n',
		})
		git({ root: main, args: ['config', 'core.hooksPath', '.husky/_'] })
		writeFiles({
			root: worktree,
			files: { '.husky/_/husky.sh': 'x\n', '.husky/_old.txt': 'old\n' },
		})

		expect(removableIgnored({ worktree, main })).toEqual({ kept: ['.husky/_old.txt'] })
	})
})
