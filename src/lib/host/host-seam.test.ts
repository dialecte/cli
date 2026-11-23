/**
 * The host seam scan: a vendor's tool literal lives only in its own folder, read from the tokens
 * (a comment or a refusal text never counts), and no file outside `src/lib/host/` reaches into a vendor's folder.
 * Each case writes a whole tree of files into a temporary folder.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { scanHostSeam } from './host-seam.ts'
import { HOST_VENDORS } from './host-vendors.constants.ts'

import { describe, expect, it } from 'vitest'

import type { HostSeamVendor } from './host-seam.types.ts'

const GITHUB: HostSeamVendor = {
	name: 'github',
	tool: 'gh',
	nounWords: ['pull', 'pulls', 'pullrequest', 'pullrequests'],
	nounPathPattern: /pull[-_]?request/i,
	nouns: { changeRequestNoun: 'pull request', changeRequestNouns: 'pull requests' },
}
const GITLAB: HostSeamVendor = {
	name: 'gitlab',
	tool: 'glab',
	nounWords: ['mergerequest', 'mergerequests', 'mr', 'mrs'],
	nounPathPattern: /merge[-_]?request/i,
	nouns: { changeRequestNoun: 'merge request', changeRequestNouns: 'merge requests' },
}

/** A tree of whole files written under a new temporary folder; the folder is the scanned root. */
function treeOf(files: Record<string, string>): string {
	const root = temporaryFolder('dialecte-host-seam-')
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), text)
	}
	return root
}

/** The scan's inputs for a tree of whole files. */
function scanOf(params: { files: Record<string, string>; vendors: readonly HostSeamVendor[] }) {
	return { root: treeOf(params.files), vendors: params.vendors }
}

/** The findings expected, from `file:kind` entries (the scan answers them by file path, then position). */
function findingsOf(entries: readonly string[]) {
	return entries.map((entry) => {
		const [file, kind] = entry.split(':')
		return { file, kind }
	})
}

describe('scanHostSeam: a tool literal outside the vendor folder', () => {
	it.each([
		{
			name: 'an exact literal handed to spawnSync',
			file: "import { spawnSync } from 'node:child_process'\n\nexport function view() {\n\treturn spawnSync('gh', ['pr', 'view'])\n}\n",
			kind: 'tool-literal',
		},
		{
			name: 'an exact literal under the key command',
			file: "import { run } from './run.ts'\n\nexport function view() {\n\treturn run({ command: 'gh', args: ['pr', 'view'] })\n}\n",
			kind: 'tool-literal',
		},
		{
			name: 'an argv array handed to a generic runner',
			file: "import { run } from './run.ts'\n\nexport function view() {\n\treturn run(['gh', 'pr', 'view'])\n}\n",
			kind: 'tool-literal',
		},
		{
			name: 'a no-substitution template',
			file: "import { run } from './run.ts'\n\nexport function view() {\n\treturn run([`gh`, 'pr'])\n}\n",
			kind: 'tool-literal',
		},
	])('$name → one finding, in that file', ({ file, kind }) => {
		expect(
			scanHostSeam(scanOf({ files: { 'src/lib/ci/view.ts': file }, vendors: [GITHUB] })),
		).toMatchObject(findingsOf([`src/lib/ci/view.ts:${kind}`]))
	})

	it('one finding each when several files break it, whole tree scanned', () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/ci/a.ts': "export const A = ['gh', 'pr']\n",
						'src/lib/ci/b.ts': "export const B = { command: 'gh' }\n",
						'src/lib/lot/c.ts': "export const C = { command: 'gh' }\n",
						'src/lib/lot/clean.ts': "export const D = ['git', 'status']\n",
					},
					vendors: [GITHUB],
				}),
			),
		).toMatchObject(
			findingsOf([
				'src/lib/ci/a.ts:tool-literal',
				'src/lib/ci/b.ts:tool-literal',
				'src/lib/lot/c.ts:tool-literal',
			]),
		)
	})

	it('a finding names its line and the literal', () => {
		const root = treeOf({
			'src/lib/ci/view.ts': "export const A = 1\nexport const B = ['gh', 'pr']\n",
		})

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{ file: 'src/lib/ci/view.ts', line: 2, kind: 'tool-literal', text: 'gh' },
		])
	})

	it('a test file is not scanned', () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/ci/view.test.ts': "export const A = ['gh', 'pr']\n",
					},
					vendors: [GITHUB],
				}),
			),
		).toMatchObject(findingsOf([]))
	})
})

describe('scanHostSeam: what is not a spawn passes', () => {
	it.each([
		{
			name: 'a doc comment holding gh',
			file: "/** Runs `gh` and reads what it answers. */\n// gh pr view is the call\nexport const A = 'git'\n",
		},
		{
			name: 'a refusal text starting with gh',
			file: "export const REFUSAL = 'gh pr view: not found'\nexport const OTHER = `gh pr view: ${'x'}`\n",
		},
		{
			name: 'a word that holds the tool',
			file: "export const A = ['ghost', 'high', 'GH']\n",
		},
	])('$name → no finding', ({ file }) => {
		expect(
			scanHostSeam(scanOf({ files: { 'src/lib/ci/text.ts': file }, vendors: [GITHUB] })),
		).toMatchObject(findingsOf([]))
	})

	it("the vendor's own folder holds its literal and its constant → no finding", () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/host/github/github.constants.ts': "export const GH_COMMAND = 'gh'\n",
						'src/lib/host/github/run-gh.ts':
							"import { GH_COMMAND } from './github.constants.ts'\n\nexport const ARGV = [GH_COMMAND, 'gh']\n",
					},
					vendors: [GITHUB],
				}),
			),
		).toMatchObject(findingsOf([]))
	})
})

describe('scanHostSeam: a second vendor, each tool only in its own folder', () => {
	it.each([
		{
			name: 'glab in its own folder',
			path: 'src/lib/host/gitlab/run-glab.ts',
			text: "export const A = ['glab', 'mr']\n",
			expected: [],
		},
		{
			name: 'glab in the first vendor folder',
			path: 'src/lib/host/github/run-gh.ts',
			text: "export const A = ['glab', 'mr']\n",
			expected: ['src/lib/host/github/run-gh.ts:tool-literal'],
		},
		{
			name: 'gh in the second vendor folder',
			path: 'src/lib/host/gitlab/run-glab.ts',
			text: "export const A = ['gh', 'pr']\n",
			expected: ['src/lib/host/gitlab/run-glab.ts:tool-literal'],
		},
		{
			name: 'glab outside every vendor folder',
			path: 'src/lib/ci/view.ts',
			text: "export const A = { command: 'glab' }\n",
			expected: ['src/lib/ci/view.ts:tool-literal'],
		},
	])('$name → $expected', ({ path, text, expected }) => {
		expect(
			scanHostSeam(scanOf({ files: { [path]: text }, vendors: [GITHUB, GITLAB] })),
		).toMatchObject(findingsOf(expected))
	})

	it('each vendor writes its own tool in its own folder, both at once → no finding', () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/host/github/run-gh.ts': "export const A = ['gh', 'pr']\n",
						'src/lib/host/gitlab/run-glab.ts': "export const A = ['glab', 'mr']\n",
					},
					vendors: [GITHUB, GITLAB],
				}),
			),
		).toEqual([])
	})
})

describe('scanHostSeam: imports across the seam', () => {
	it.each([
		{
			name: 'a file outside host/ importing a vendor folder',
			path: 'src/lib/lot/land.ts',
			text: "import { createGithubHost } from '../host/github/github-host.ts'\n\nexport const A = createGithubHost\n",
			expected: ['src/lib/lot/land.ts:vendor-import'],
		},
		{
			name: 'the command constant imported from a vendor folder',
			path: 'src/lib/ci/view.ts',
			text: "import { GH_COMMAND } from '../host/github/github.constants.ts'\n\nexport const A = [GH_COMMAND, 'pr']\n",
			expected: ['src/lib/ci/view.ts:vendor-import'],
		},
		{
			name: 'a star re-export from a vendor folder',
			path: 'src/lib/lot/land.ts',
			text: "export * from '../host/github/x.ts'\n",
			expected: ['src/lib/lot/land.ts:vendor-import'],
		},
		{
			name: 'a side-effect import of a vendor folder',
			path: 'src/lib/lot/land.ts',
			text: "import '../host/github/x.ts'\n",
			expected: ['src/lib/lot/land.ts:vendor-import'],
		},
		{
			name: 'a type-position import() of a vendor folder',
			path: 'src/lib/lot/land.ts',
			text: "export type A = typeof import('../host/github/x.ts')\n",
			expected: ['src/lib/lot/land.ts:vendor-import'],
		},
		{
			name: 'a path that only looks like the vendor folder, resolved against the importer',
			path: 'src/lib/ci/sync.ts',
			text: "import { A } from './github/workflows.ts'\n\nexport const B = A\n",
			expected: [],
		},
		{
			name: 'a type-only import of a vendor folder',
			path: 'src/commands/lot.ts',
			text: "import type { GithubCall } from '../lib/host/github/github.types.ts'\n\nexport type A = GithubCall\n",
			expected: ['src/commands/lot.ts:vendor-import'],
		},
		{
			name: 'a re-export from a vendor folder',
			path: 'src/lib/lot/land.ts',
			text: "export { GITHUB_CALLS } from '../host/github/github-calls.constants.ts'\n",
			expected: ['src/lib/lot/land.ts:vendor-import'],
		},
		{
			name: 'a dynamic import of a vendor folder',
			path: 'src/lib/lot/land.ts',
			text: "export async function load() {\n\treturn import('../host/github/github-host.ts')\n}\n",
			expected: ['src/lib/lot/land.ts:vendor-import'],
		},
		{
			name: 'a file outside host/ importing the generic host files',
			path: 'src/lib/lot/land.ts',
			text: "import { createHost } from '../host/select-host.ts'\nimport type { HostAdapter } from '../host/host.types.ts'\n\nexport const A = [createHost]\nexport type B = HostAdapter\n",
			expected: [],
		},
		{
			name: 'the host folder importing its own vendor folder',
			path: 'src/lib/host/host-vendors.constants.ts',
			text: "import { GITHUB_VENDOR } from './github/github-vendor.ts'\n\nexport const HOST_VENDORS = [GITHUB_VENDOR]\n",
			expected: [],
		},
		{
			name: 'a generic host file importing a vendor folder',
			path: 'src/lib/host/graphql-selections.ts',
			text: "import { GH_COMMAND } from './github/github.constants.ts'\n\nexport const A = GH_COMMAND\n",
			expected: ['src/lib/host/graphql-selections.ts:vendor-import'],
		},
		{
			name: 'a generic host file spawning the vendor tool through its imported constant',
			path: 'src/lib/host/graphql-selections.ts',
			text: "import { spawnSync } from 'node:child_process'\n\nimport { GH_COMMAND } from './github/github.constants.ts'\n\nexport function run() {\n\treturn spawnSync(GH_COMMAND, ['pr'])\n}\n",
			expected: ['src/lib/host/graphql-selections.ts:vendor-import'],
		},
		{
			name: 'the vendor registry importing its vendor folder',
			path: 'src/lib/host/host-vendors.constants.ts',
			text: "import { GH_COMMAND } from './github/github.constants.ts'\n\nexport const A = GH_COMMAND\n",
			expected: [],
		},
		{
			name: 'the contract registry importing its vendor folder',
			path: 'src/lib/host/host-contracts.constants.ts',
			text: "import { GH_COMMAND } from './github/github.constants.ts'\n\nexport const A = GH_COMMAND\n",
			expected: [],
		},
		{
			name: 'the vendor selection importing its vendor folder',
			path: 'src/lib/host/select-host.ts',
			text: "import { GH_COMMAND } from './github/github.constants.ts'\n\nexport const A = GH_COMMAND\n",
			expected: [],
		},
		{
			name: 'a vendor file importing its own constants',
			path: 'src/lib/host/github/run-gh.ts',
			text: "import { GH_COMMAND } from './github.constants.ts'\n\nexport const A = GH_COMMAND\n",
			expected: [],
		},
		{
			name: 'a vendor folder importing its own files and the generic ones',
			path: 'src/lib/host/github/github-host.ts',
			text: "import { GH_COMMAND } from './github.constants.ts'\nimport type { HostAdapter } from '../host.types.ts'\n\nexport const A = GH_COMMAND\nexport type B = HostAdapter\n",
			expected: [],
		},
		{
			name: 'a config file importing host.constants.ts',
			path: 'src/lib/config/config-checks.ts',
			text: "import { HOST_VENDOR_NAMES } from '../host/host.constants.ts'\n\nexport const A = HOST_VENDOR_NAMES\n",
			expected: [],
		},
		{
			name: 'a config file importing another generic host file',
			path: 'src/lib/config/config-checks.ts',
			text: "import { HOST_VENDORS } from '../host/host-vendors.constants.ts'\n\nexport const A = HOST_VENDORS\n",
			expected: ['src/lib/config/config-checks.ts:config-import'],
		},
		{
			name: 'a config file importing a vendor folder',
			path: 'src/lib/config/config-checks.ts',
			text: "import { createGithubHost } from '../host/github/github-host.ts'\n\nexport const A = createGithubHost\n",
			expected: ['src/lib/config/config-checks.ts:config-import'],
		},
		{
			name: 'a config file importing a type of host/',
			path: 'src/lib/config/config.types.ts',
			text: "import type { HostVendorName } from '../host/host.types.ts'\n\nexport type A = HostVendorName\n",
			expected: ['src/lib/config/config.types.ts:config-import'],
		},
	])('$name → $expected', ({ path, text, expected }) => {
		expect(scanHostSeam(scanOf({ files: { [path]: text }, vendors: [GITHUB] }))).toMatchObject(
			findingsOf(expected),
		)
	})

	it('a vendor import is one whole finding: file, line, kind and the specifier', () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/lot/land.ts':
							"export const A = 1\nimport { B } from '../host/github/github-host.ts'\n",
					},
					vendors: [GITHUB],
				}),
			),
		).toEqual([
			{
				file: 'src/lib/lot/land.ts',
				line: 2,
				kind: 'vendor-import',
				text: '../host/github/github-host.ts',
			},
		])
	})

	it("a second vendor's folder is as closed to outside importers as the first", () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/lot/land.ts':
							"import { createGitlabHost } from '../host/gitlab/gitlab-host.ts'\n\nexport const A = createGitlabHost\n",
					},
					vendors: [GITHUB, GITLAB],
				}),
			),
		).toMatchObject(findingsOf(['src/lib/lot/land.ts:vendor-import']))
	})
})

describe('scanHostSeam: the change-request noun of one vendor stays in the vendor folders', () => {
	it.each([
		{
			name: 'a type',
			file: 'export const A = 1\nexport type PullRequest = { number: number }\n',
			found: [{ line: 2, text: 'PullRequest' }],
		},
		{
			name: 'a field, declared then read',
			file: 'export function numberOf(found: { pullRequest: number }) {\n\treturn found.pullRequest\n}\n',
			found: [
				{ line: 1, text: 'pullRequest' },
				{ line: 2, text: 'pullRequest' },
			],
		},
		{
			name: 'a constant',
			file: "export const A = 1\nexport const PULL_REQUEST_LINES = ['a']\n",
			found: [{ line: 2, text: 'PULL_REQUEST_LINES' }],
		},
		{
			name: 'a bare short name',
			file: 'export const A = 1\nexport const pull = 7\n',
			found: [{ line: 2, text: 'pull' }],
		},
		{
			name: 'a short name first',
			file: 'export const A = 1\nexport const pullNumber = 7\n',
			found: [{ line: 2, text: 'pullNumber' }],
		},
		{
			name: 'a capitalised short name first',
			file: 'export const A = 1\nexport type PullState = { open: boolean }\n',
			found: [{ line: 2, text: 'PullState' }],
		},
		{
			name: 'a short name last',
			file: 'export const A = 1\nexport const parentPull = 7\n',
			found: [{ line: 2, text: 'parentPull' }],
		},
		{
			name: 'a short constant',
			file: "export const A = 1\nexport const PULL_URL = 'https://host.test/7'\n",
			found: [{ line: 2, text: 'PULL_URL' }],
		},
	])(
		'$name holding the noun outside a vendor folder → one noun finding per occurrence, naming it',
		({ file, found }) => {
			const root = treeOf({ 'src/lib/landing/land.ts': file })

			expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual(
				found.map(({ line, text }) => ({
					file: 'src/lib/landing/land.ts',
					line,
					kind: 'noun-identifier',
					text,
				})),
			)
		},
	)

	it('a test file and a test helper holding the noun → one noun finding each', () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/landing/land.test.ts': 'export const pullRequest = 7\n',
						'test/land-lot.ts': 'export const pullRequest = 7\n',
					},
					vendors: [GITHUB],
				}),
			),
		).toMatchObject(
			findingsOf([
				'src/lib/landing/land.test.ts:noun-identifier',
				'test/land-lot.ts:noun-identifier',
			]),
		)
	})

	it.each([
		{ name: 'a private field', file: 'export class A {\n\t#pull = 7\n}\n', text: '#pull' },
		{
			name: 'a leading underscore',
			file: 'export const A = 1\nexport const _pull = 7\n',
			text: '_pull',
		},
		{
			name: 'a lower snake name',
			file: 'export const A = 1\nexport const parent_pull = 7\n',
			text: 'parent_pull',
		},
		{ name: 'a plural', file: 'export const A = 1\nexport const pulls = [7]\n', text: 'pulls' },
		{
			name: 'a capitalised plural',
			file: 'export const A = 1\nexport type Pulls = number[]\n',
			text: 'Pulls',
		},
		{
			name: 'an acronym before it',
			file: 'export const A = 1\nexport const HTTPPull = 7\n',
			text: 'HTTPPull',
		},
	])('$name spelling the noun → one noun finding naming it', ({ file, text }) => {
		const root = treeOf({ 'src/lib/landing/land.ts': file })

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{ file: 'src/lib/landing/land.ts', line: 2, kind: 'noun-identifier', text },
		])
	})

	it.each([
		{
			name: 'in lower case',
			file: 'export const A = 1\nexport const pullrequest = 7\n',
			text: 'pullrequest',
		},
		{
			name: 'in capitals',
			file: 'export const A = 1\nexport const PULLREQUEST = 7\n',
			text: 'PULLREQUEST',
		},
		{
			name: 'as a plural',
			file: 'export const A = 1\nexport type Pullrequests = number[]\n',
			text: 'Pullrequests',
		},
	])('the long noun written as one word $name → one noun finding naming it', ({ file, text }) => {
		const root = treeOf({ 'src/lib/landing/land.ts': file })

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{ file: 'src/lib/landing/land.ts', line: 2, kind: 'noun-identifier', text },
		])
	})

	it('a tree with a test folder and no source folder → its noun found, nothing thrown', () => {
		const root = treeOf({ 'test/land-lot.ts': 'export const A = 1\nexport const pull = 7\n' })

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{ file: 'test/land-lot.ts', line: 2, kind: 'noun-identifier', text: 'pull' },
		])
	})

	it.each([
		{ name: 'snake case', file: 'src/lib/change-request/pull_request.ts' },
		{ name: 'camel case', file: 'src/lib/change-request/pullRequest.ts' },
	])('a file name holding the noun in $name → one path finding naming the file', ({ file }) => {
		const root = treeOf({ [file]: 'export const A = 1\n' })

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{ file, line: 1, kind: 'noun-path', text: file },
		])
	})

	it.each([
		{ name: 'a module file', file: 'src/lib/landing/land.mts' },
		{ name: 'a common module file', file: 'src/lib/landing/land.cts' },
		{ name: 'a TSX file', file: 'test/land.tsx' },
	])('$name holding the noun → one noun finding', ({ file }) => {
		const root = treeOf({ [file]: 'export const A = 1\nexport const pull = 7\n' })

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{ file, line: 2, kind: 'noun-identifier', text: 'pull' },
		])
	})

	it('a file whose name holds the noun → one path finding naming the file', () => {
		const root = treeOf({
			'src/lib/change-request/compose-pull-request.ts': 'export const A = 1\n',
		})

		expect(scanHostSeam({ root, vendors: [GITHUB] })).toEqual([
			{
				file: 'src/lib/change-request/compose-pull-request.ts',
				line: 1,
				kind: 'noun-path',
				text: 'src/lib/change-request/compose-pull-request.ts',
			},
		])
	})

	it.each([
		{
			name: 'a comment and a doc comment',
			file: '/** The pull request, read. */\n// pullRequest is the field\nexport const A = 1\n',
		},
		{
			name: 'a template splitting the noun across its parts',
			file: "export const B = `pull ${'x'} request`\n",
		},
		{
			name: 'a word that only starts with pull',
			file: "export const PULLED_LINE_SCHEMA = 1\nexport const pulled = 'a'\nexport const pullover = 2\n",
		},
	])('$name → no finding', ({ file }) => {
		expect(
			scanHostSeam(scanOf({ files: { 'src/lib/landing/text.ts': file }, vendors: [GITHUB] })),
		).toMatchObject(findingsOf([]))
	})

	it('a string and a template holding the noun and a pullRequest-like word → the noun-text finding only, never a noun identifier', () => {
		const file =
			"export const A = 'pull request #7 pullRequest'\nexport const B = `pull ${'x'} pullRequest`\n"

		expect(
			scanHostSeam(scanOf({ files: { 'src/lib/landing/text.ts': file }, vendors: [GITHUB] })),
		).toEqual([
			expect.objectContaining({ file: 'src/lib/landing/text.ts', line: 1, kind: 'noun-text' }),
		])
	})

	it("each vendor's own folders hold the noun, a second vendor's too → no finding", () => {
		expect(
			scanHostSeam(
				scanOf({
					files: {
						'src/lib/host/github/github-host.ts': 'export type PullRequest = { number: number }\n',
						'src/lib/host/github/github-host.test.ts': 'export const pullRequest = 7\n',
						'src/lib/host/github/pull-request-reads.ts': 'export const A = 1\n',
						'src/lib/host/gitlab/gitlab-host.ts': 'export const pullNumber = 7\n',
						'test/fixtures/host-contract/gitlab/pull-request.ts': 'export const pull = 7\n',
						'test/fixtures/host-contract/github/pull-request.ts': 'export const pullRequest = 7\n',
					},
					vendors: [GITHUB, GITLAB],
				}),
			),
		).toMatchObject(findingsOf([]))
	})
})

describe("scanHostSeam: each vendor's own noun words, compounds included", () => {
	it.each([
		{
			name: "the second vendor's compound noun in generic code",
			path: 'src/lib/landing/text.ts',
			text: 'export function mergeRequestOf() {\n\treturn 1\n}\n',
			expected: ['src/lib/landing/text.ts:noun-identifier'],
		},
		{
			name: "the second vendor's short noun in generic code",
			path: 'src/lib/landing/text.ts',
			text: 'export const MR_URL = 1\n',
			expected: ['src/lib/landing/text.ts:noun-identifier'],
		},
		{
			name: "the second vendor's noun in a generic file's name",
			path: 'src/lib/landing/merge-request-text.ts',
			text: 'export const A = 1\n',
			expected: ['src/lib/landing/merge-request-text.ts:noun-path'],
		},
		{
			name: "git's own merge words in generic code",
			path: 'src/lib/landing/text.ts',
			text: 'export const mergeTree = 1\nexport const autoMerge = 2\nexport const requestOf = 3\n',
			expected: [],
		},
		{
			name: "the second vendor's compound noun in its own folder",
			path: 'src/lib/host/gitlab/gitlab-host.ts',
			text: 'export function mergeRequestOf() {\n\treturn 1\n}\n',
			expected: [],
		},
		{
			name: "GitHub's auto-merge request in GitHub's folder",
			path: 'src/lib/host/github/github-host.ts',
			text: 'export const autoMergeRequest = 1\n',
			expected: [],
		},
		{
			name: "GitHub's short noun in generic code",
			path: 'src/lib/landing/text.ts',
			text: 'export const pullNumber = 1\n',
			expected: ['src/lib/landing/text.ts:noun-identifier'],
		},
	])('$name → $expected', ({ path, text, expected }) => {
		expect(scanHostSeam(scanOf({ files: { [path]: text }, vendors: [GITHUB, GITLAB] }))).toEqual(
			findingsOf(expected).map((finding) => expect.objectContaining(finding)),
		)
	})
})

describe("scanHostSeam: a vendor's printed noun in a source string", () => {
	it.each([
		{
			name: "GitHub's noun in a generic source string",
			path: 'src/lib/landing/text.ts',
			text: "export const A = 'pull request #7 merged'\n",
			expected: [{ file: 'src/lib/landing/text.ts', line: 1, kind: 'noun-text' }],
		},
		{
			name: "GitHub's plural noun in a template part, in capitals",
			path: 'src/lib/landing/text.ts',
			text: 'export const A = (n: number) => `${n} Pull Requests open`\n',
			expected: [{ file: 'src/lib/landing/text.ts', line: 1, kind: 'noun-text' }],
		},
		{
			name: "the second vendor's noun in a generic source string",
			path: 'src/lib/landing/text.ts',
			text: "export const A = 'merge request #7 merged'\n",
			expected: [{ file: 'src/lib/landing/text.ts', line: 1, kind: 'noun-text' }],
		},
		{
			name: "GitHub's noun in GitHub's own folder",
			path: 'src/lib/host/github/github-text.ts',
			text: "export const A = 'pull request #7 merged'\n",
			expected: [],
		},
		{
			name: "GitHub's noun in a test file",
			path: 'src/lib/landing/text.test.ts',
			text: "export const A = 'pull request #7 merged'\n",
			expected: [],
		},
		{
			name: "GitHub's event and template names, written without a space",
			path: 'src/lib/landing/text.ts',
			text: "export const A = 'on pull_request, .github/pull_request_template.md'\n",
			expected: [],
		},
	])('$name → $expected.length finding(s)', ({ path, text, expected }) => {
		expect(scanHostSeam(scanOf({ files: { [path]: text }, vendors: [GITHUB, GITLAB] }))).toEqual(
			expected.map((finding) => expect.objectContaining(finding)),
		)
	})
})

describe("scanHostSeam on the cli's own sources", () => {
	it('no vendor tool literal, vendor import or change-request noun outside its place → no finding', () => {
		const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
		const vendors = HOST_VENDORS.map((vendor) => ({
			name: vendor.name,
			tool: vendor.tool,
			nounWords: vendor.nounWords,
			nounPathPattern: vendor.nounPathPattern,
			nouns: vendor.nouns,
		}))

		expect(scanHostSeam({ root, vendors })).toEqual([])
	})
})
