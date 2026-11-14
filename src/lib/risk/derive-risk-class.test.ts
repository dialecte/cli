import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { deriveRiskClass, deriveStartRiskClass } from './derive-risk-class.ts'

import { describe, expect, it } from 'vitest'

import type { ApiChange, RiskDerivation, RiskDiffFile, RiskReason } from './risk.types.ts'

const STORE_GLOB = 'src/lib/store/**'
const API_REASON: RiskReason = { kind: 'api', detail: expect.any(String) }
const DOCS_REASON: RiskReason = { kind: 'docs', detail: expect.any(String) }

type DeriveCase = {
	name: string
	declaredHigh?: string[]
	files: RiskDiffFile[]
	apiChange?: ApiChange
	expected: RiskDerivation
}

/** A source file whose single added line is `text` at line 3. */
function sourceFile(params: { path: string; text: string }): RiskDiffFile {
	return {
		path: params.path,
		added: [{ line: 3, text: params.text }],
		addedCount: 1,
		removedCount: 0,
	}
}

/** A file of `addedCount` added and `removedCount` removed lines, the added text not listed. */
function sizedFile(params: {
	path: string
	addedCount: number
	removedCount: number
}): RiskDiffFile {
	return { ...params, added: [] }
}

const declaredCases: DeriveCase[] = [
	{
		name: 'case 21: a one-line change in a declared folder is high, never light by size',
		declaredHigh: [STORE_GLOB],
		files: [sizedFile({ path: 'src/lib/store/publish.ts', addedCount: 1, removedCount: 0 })],
		expected: {
			class: 'high',
			reasons: [{ kind: 'declared', file: 'src/lib/store/publish.ts', detail: STORE_GLOB }],
		},
	},
	{
		name: 'a declared test file is high as well, and every high reason is listed in file order',
		declaredHigh: [STORE_GLOB, 'src/commands/record.ts'],
		files: [
			sizedFile({ path: 'src/commands/record.ts', addedCount: 2, removedCount: 0 }),
			sizedFile({ path: 'src/lib/other.ts', addedCount: 2, removedCount: 0 }),
			sizedFile({ path: 'src/lib/store/publish.test.ts', addedCount: 2, removedCount: 0 }),
		],
		expected: {
			class: 'high',
			reasons: [
				{ kind: 'declared', file: 'src/commands/record.ts', detail: 'src/commands/record.ts' },
				{ kind: 'declared', file: 'src/lib/store/publish.test.ts', detail: STORE_GLOB },
			],
		},
	},
	{
		name: 'a declared file with a destructive added line lists the declared reason then the call',
		declaredHigh: [STORE_GLOB],
		files: [sourceFile({ path: 'src/lib/store/publish.ts', text: '\trmSync(target)' })],
		expected: {
			class: 'high',
			reasons: [
				{ kind: 'declared', file: 'src/lib/store/publish.ts', detail: STORE_GLOB },
				{ kind: 'destructive', file: 'src/lib/store/publish.ts', line: 3, detail: 'rmSync' },
			],
		},
	},
	{
		name: 'a file outside every declared glob is not high',
		declaredHigh: [STORE_GLOB],
		files: [sizedFile({ path: 'src/lib/storefront/x.ts', addedCount: 1, removedCount: 0 })],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	},
]

const destructiveCallCases: { text: string; detail: string }[] = [
	{ text: '\trmSync(target, { force: true })', detail: 'rmSync' },
	{ text: '\tawait fs.rm(target)', detail: 'rm' },
	{ text: '\tawait rm(target)', detail: 'rm' },
	{ text: '\tunlink(target)', detail: 'unlink' },
	{ text: '\tunlinkSync(target)', detail: 'unlinkSync' },
	{ text: '\trmdirSync(target)', detail: 'rmdirSync' },
	{ text: '\trename(from, to)', detail: 'rename' },
	{ text: '\trenameSync(from, to)', detail: 'renameSync' },
	{ text: '\ttruncateSync(target)', detail: 'truncateSync' },
	{ text: "\tgit(['worktree', 'remove', path])", detail: 'worktree remove' },
	{ text: '\tgit(["reset", "--hard"])', detail: 'reset --hard' },
	{ text: "\trun('worktree remove --force')", detail: 'worktree remove' },
	{ text: "\tgit(['branch', '-D', name])", detail: 'branch -D' },
	{ text: "\tgit(['branch', '-d', name])", detail: 'branch -d' },
	{ text: "\tgit(['clean', '-f'])", detail: 'clean -f' },
	{ text: "\tgit(['push', '--force'])", detail: 'push --force' },
	{ text: "\trun('git clean -fd')", detail: 'clean -f' },
	{ text: "\tgit(['clean', '-fdx'])", detail: 'clean -f' },
	{ text: "\tgit(['push', '--force-with-lease'])", detail: 'push --force' },
	{ text: "\tgit(['checkout', '--', path])", detail: 'checkout --' },
	{ text: "\tgit(['restore', path])", detail: 'restore' },
	{ text: "\tconst args = ['restore', 'src/x.ts']", detail: 'restore' },
	{ text: "\trun('git restore src/x.ts')", detail: 'restore' },
	{ text: "\trun('git reset --hard')", detail: 'reset --hard' },
	{ text: "\tgit(['stash', 'drop'])", detail: 'stash drop' },
	{ text: "\tgit(['update-ref', '-d', ref])", detail: 'update-ref -d' },
]

const destructiveCases: DeriveCase[] = [
	...destructiveCallCases.map((destructiveCall): DeriveCase => ({
		name: `case 24: ${destructiveCall.text.trim()}`,
		files: [sourceFile({ path: 'src/lib/x.ts', text: destructiveCall.text })],
		expected: {
			class: 'high',
			reasons: [
				{ kind: 'destructive', file: 'src/lib/x.ts', line: 3, detail: destructiveCall.detail },
			],
		},
	})),
	...[
		{ title: 'a // line', text: '\t// never call rmSync(target)' },
		{ title: 'a * doc line', text: ' * worktree remove in a doc line' },
		{ title: 'a quoted * doc line', text: " * git(['worktree', 'remove', path]) in a doc line" },
		{ title: 'a /* */ line', text: "/* 'reset --hard' */" },
		{ title: 'a /** */ line', text: '\t/** rmSync(target) was the old way */' },
	].map((comment): DeriveCase => ({
		name: `${comment.title} is not destructive`,
		files: [sourceFile({ path: 'src/lib/x.ts', text: comment.text })],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	})),
	{
		name: 'a trailing comment keeps the call',
		files: [sourceFile({ path: 'src/lib/x.ts', text: '\trmSync(target) // done' })],
		expected: {
			class: 'high',
			reasons: [{ kind: 'destructive', file: 'src/lib/x.ts', line: 3, detail: 'rmSync' }],
		},
	},
	{
		name: 'every source extension is scanned (.cjs)',
		files: [sourceFile({ path: 'scripts/x.cjs', text: 'rmSync(target)' })],
		expected: {
			class: 'high',
			reasons: [{ kind: 'destructive', file: 'scripts/x.cjs', line: 3, detail: 'rmSync' }],
		},
	},
	{
		name: 'two destructive lines of two files are both listed, in file order',
		files: [
			{
				path: 'src/a.ts',
				added: [
					{ line: 4, text: 'unlinkSync(one)' },
					{ line: 9, text: 'keep(two)' },
					{ line: 12, text: 'renameSync(two, three)' },
				],
				addedCount: 3,
				removedCount: 0,
			},
			sourceFile({ path: 'src/b.ts', text: 'rmSync(four)' }),
		],
		expected: {
			class: 'high',
			reasons: [
				{ kind: 'destructive', file: 'src/a.ts', line: 4, detail: 'unlinkSync' },
				{ kind: 'destructive', file: 'src/a.ts', line: 12, detail: 'renameSync' },
				{ kind: 'destructive', file: 'src/b.ts', line: 3, detail: 'rmSync' },
			],
		},
	},
	{
		name: 'case 23: rmSync added only in a test file is not high',
		files: [sourceFile({ path: 'src/lib/x.test.ts', text: 'rmSync(folder)' })],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	},
	{
		name: 'rmSync added under test/ is not high',
		files: [sourceFile({ path: 'test/helper.ts', text: 'rmSync(folder)' })],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	},
	{
		name: 'a file that is not source is not scanned (.json)',
		files: [sourceFile({ path: 'data/x.json', text: 'rmSync(folder)' })],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	},
	{
		name: 'confirm(, farm( and formSync( are not destructive calls',
		files: [
			{
				path: 'src/lib/x.ts',
				added: [
					{ line: 1, text: 'confirm(question)' },
					{ line: 2, text: 'farm(field)' },
					{ line: 3, text: 'formSync(data)' },
					{ line: 4, text: 'restoreState(snapshot)' },
					{ line: 5, text: '// restore the previous state' },
					{ line: 6, text: 'restore(snapshot)' },
					{ line: 7, text: 'this.restore()' },
					{ line: 8, text: 'const restored = true' },
					{ line: 9, text: '// worktree remove runs later' },
					{ line: 10, text: "const options = { mode: 'restore' }" },
				],
				addedCount: 10,
				removedCount: 0,
			},
		],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '10 lines in 1 files' }] },
	},
	{
		name: "a branch flag cluster is not branch -D: ['branch', '-Dx']",
		files: [sourceFile({ path: 'src/lib/x.ts', text: "\tgit(['branch', '-Dx', name])" })],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	},
]

const apiCases: DeriveCase[] = [
	{
		name: 'a changed api index is high with an api reason',
		files: [sizedFile({ path: 'src/index.ts', addedCount: 1, removedCount: 0 })],
		apiChange: 'changed',
		expected: { class: 'high', reasons: [API_REASON] },
	},
	{
		name: 'case 33: an unknown api change is high with an api reason',
		files: [sizedFile({ path: 'src/index.ts', addedCount: 1, removedCount: 0 })],
		apiChange: 'unknown',
		expected: { class: 'high', reasons: [API_REASON] },
	},
	{
		name: 'the api reason comes after the reasons of the files',
		declaredHigh: [STORE_GLOB],
		files: [sizedFile({ path: 'src/lib/store/publish.ts', addedCount: 1, removedCount: 0 })],
		apiChange: 'changed',
		expected: {
			class: 'high',
			reasons: [
				{ kind: 'declared', file: 'src/lib/store/publish.ts', detail: STORE_GLOB },
				API_REASON,
			],
		},
	},
	{
		name: 'an api change over docs only is still high',
		files: [sizedFile({ path: 'README.md', addedCount: 1, removedCount: 0 })],
		apiChange: 'changed',
		expected: { class: 'high', reasons: [API_REASON] },
	},
	{
		name: 'an unchanged api index leaves a small change light',
		files: [sizedFile({ path: 'src/index.ts', addedCount: 1, removedCount: 0 })],
		apiChange: 'unchanged',
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '1 lines in 1 files' }] },
	},
]

const lightCases: DeriveCase[] = [
	{
		name: 'a CHANGELOG only is light by docs',
		files: [sizedFile({ path: 'CHANGELOG.md', addedCount: 90, removedCount: 3 })],
		expected: { class: 'light', reasons: [DOCS_REASON] },
	},
	{
		name: 'case 22: a docs-only diff whose .md holds rmSync( in a code fence is light',
		files: [
			{
				path: 'docs/guide.md',
				added: [
					{ line: 5, text: '```ts' },
					{ line: 6, text: 'rmSync(folder)' },
					{ line: 7, text: '```' },
				],
				addedCount: 3,
				removedCount: 0,
			},
		],
		expected: { class: 'light', reasons: [DOCS_REASON] },
	},
	{
		name: 'a version-only package.json and the lockfile are light by docs',
		files: [
			{ path: 'package-lock.json', added: [], addedCount: 300, removedCount: 300 },
			{
				path: 'package.json',
				added: [{ line: 3, text: '  "version": "1.0.1",' }],
				addedCount: 1,
				removedCount: 1,
				versionOnly: true,
			},
		],
		expected: { class: 'light', reasons: [DOCS_REASON] },
	},
	{
		name: 'a package.json with more than its version changed is a source file of the size bound',
		files: [
			{
				path: 'package.json',
				added: [{ line: 3, text: '  "version": "1.0.1",' }],
				addedCount: 2,
				removedCount: 1,
				versionOnly: false,
			},
		],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '3 lines in 1 files' }] },
	},
	{
		name: 'the size bound counts the other files only, not the docs beside them',
		files: [
			sizedFile({ path: 'CHANGELOG.md', addedCount: 100, removedCount: 0 }),
			sizedFile({ path: 'src/a.ts', addedCount: 20, removedCount: 0 }),
			sizedFile({ path: 'src/b.ts', addedCount: 10, removedCount: 10 }),
		],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '40 lines in 2 files' }] },
	},
	{
		name: 'boundary: 40 lines in 3 files is light, test files counting',
		files: [
			sizedFile({ path: 'src/a.ts', addedCount: 20, removedCount: 5 }),
			sizedFile({ path: 'src/a.test.ts', addedCount: 10, removedCount: 0 }),
			sizedFile({ path: 'test/helper.ts', addedCount: 0, removedCount: 5 }),
		],
		expected: { class: 'light', reasons: [{ kind: 'size', detail: '40 lines in 3 files' }] },
	},
]

const mediumCases: DeriveCase[] = [
	{
		name: 'boundary: 41 lines in 3 files is medium',
		files: [
			sizedFile({ path: 'src/a.ts', addedCount: 20, removedCount: 6 }),
			sizedFile({ path: 'src/a.test.ts', addedCount: 10, removedCount: 0 }),
			sizedFile({ path: 'test/helper.ts', addedCount: 0, removedCount: 5 }),
		],
		expected: { class: 'medium', reasons: [] },
	},
	{
		name: 'boundary: 4 files is medium whatever the lines',
		files: [
			sizedFile({ path: 'src/a.ts', addedCount: 1, removedCount: 0 }),
			sizedFile({ path: 'src/b.ts', addedCount: 1, removedCount: 0 }),
			sizedFile({ path: 'src/c.ts', addedCount: 1, removedCount: 0 }),
			sizedFile({ path: 'src/d.ts', addedCount: 1, removedCount: 0 }),
		],
		expected: { class: 'medium', reasons: [] },
	},
	{
		name: 'case 25: 200 test lines deleted and 10 source lines changed is medium',
		files: [
			sizedFile({ path: 'src/lib/x.test.ts', addedCount: 0, removedCount: 200 }),
			sizedFile({ path: 'src/lib/x.ts', addedCount: 10, removedCount: 0 }),
		],
		expected: { class: 'medium', reasons: [] },
	},
	{
		name: 'a large change without a destructive call is medium',
		files: [
			{
				path: 'src/lib/x.ts',
				added: [{ line: 7, text: 'confirm(question)' }],
				addedCount: 60,
				removedCount: 0,
			},
		],
		expected: { class: 'medium', reasons: [] },
	},
	{
		name: 'a large change with a package that has an api index and no change is medium',
		files: [sizedFile({ path: 'src/lib/x.ts', addedCount: 60, removedCount: 0 })],
		apiChange: 'unchanged',
		expected: { class: 'medium', reasons: [] },
	},
]

const deriveCases: DeriveCase[] = [
	...declaredCases,
	...destructiveCases,
	...apiCases,
	...lightCases,
	...mediumCases,
]

describe('deriveRiskClass', () => {
	it.each(deriveCases)('$name', (deriveCase) => {
		expect(
			deriveRiskClass({
				declaredHigh: deriveCase.declaredHigh ?? [],
				files: deriveCase.files,
				apiChange: deriveCase.apiChange ?? 'none',
			}),
		).toEqual(deriveCase.expected)
	})
})

type StartCase = {
	name: string
	declaredHigh: string[]
	scope: string[]
	expected: RiskDerivation
}

const startCases: StartCase[] = [
	{
		name: 'case 35: src/** holds the declared src/lib/store/** → high, broad scope',
		declaredHigh: [STORE_GLOB],
		scope: ['src/**'],
		expected: {
			class: 'high',
			reasons: [{ kind: 'broad-scope', detail: 'broad scope: may touch src/lib/store/**' }],
		},
	},
	{
		name: 'a scope entry equal to a declared glob → high, declared',
		declaredHigh: [STORE_GLOB, 'src/lib/events/**'],
		scope: [STORE_GLOB],
		expected: {
			class: 'high',
			reasons: [{ kind: 'declared', file: STORE_GLOB, detail: STORE_GLOB }],
		},
	},
	{
		name: "a scope entry that is a declared glob's own folder → high, declared",
		declaredHigh: [STORE_GLOB],
		scope: ['src/lib/store'],
		expected: {
			class: 'high',
			reasons: [{ kind: 'declared', file: 'src/lib/store', detail: STORE_GLOB }],
		},
	},
	{
		name: 'a scope entry that is a path under a declared glob → high, declared',
		declaredHigh: [STORE_GLOB],
		scope: ['src/lib/store/publish.ts'],
		expected: {
			class: 'high',
			reasons: [{ kind: 'declared', file: 'src/lib/store/publish.ts', detail: STORE_GLOB }],
		},
	},
	{
		name: 'a scope whose literal part is a prefix of a declared literal part → broad',
		declaredHigh: [STORE_GLOB, 'src/commands/record.ts'],
		scope: ['src/commands/*.ts'],
		expected: {
			class: 'high',
			reasons: [{ kind: 'broad-scope', detail: 'broad scope: may touch src/commands/record.ts' }],
		},
	},
	{
		name: 'two scope entries → their reasons in scope order',
		declaredHigh: [STORE_GLOB, 'src/lib/events/**'],
		scope: ['src/lib/events/**', 'src/**'],
		expected: {
			class: 'high',
			reasons: [
				{ kind: 'declared', file: 'src/lib/events/**', detail: 'src/lib/events/**' },
				{ kind: 'broad-scope', detail: 'broad scope: may touch src/lib/store/**' },
				{ kind: 'broad-scope', detail: 'broad scope: may touch src/lib/events/**' },
			],
		},
	},
	{
		name: 'a scope away from every declared glob → medium, never light',
		declaredHigh: [STORE_GLOB],
		scope: ['src/lib/tdd/**', 'README.md'],
		expected: { class: 'medium', reasons: [] },
	},
	{
		name: 'no declared glob → medium',
		declaredHigh: [],
		scope: ['src/**'],
		expected: { class: 'medium', reasons: [] },
	},
]

describe('deriveStartRiskClass', () => {
	it.each(startCases)('$name', (startCase) => {
		expect(
			deriveStartRiskClass({ declaredHigh: startCase.declaredHigh, scope: startCase.scope }),
		).toEqual(startCase.expected)
	})
})

describe('the cli declared list', () => {
	it('package.json holds dialecte.risk.high with the 15 globs of the spec', () => {
		const manifest = JSON.parse(
			readFileSync(join(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'),
		)
		expect(manifest.dialecte?.risk?.high).toEqual([
			'src/lib/store/**',
			'src/lib/events/**',
			'src/lib/cleanup/**',
			'src/lib/review-rounds/**',
			'src/commands/record.ts',
			'src/lib/worktree/trash.ts',
			'src/lib/worktree/node-modules-pool.ts',
			'src/lib/worktree/prune-worktrees.ts',
			'src/lib/handover/commit-lots.ts',
			'src/lib/handover/run-handover-folder.ts',
			'src/lib/handover/close-handovers.ts',
			'src/lib/handover/abandon-handover.ts',
			'src/lib/handover/handover-store.ts',
			'src/lib/handover/handover-lock.ts',
			'src/lib/handover/sync-node-modules.ts',
		])
	})
})
