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

const GITHUB: HostSeamVendor = { name: 'github', tool: 'gh' }
const GITLAB: HostSeamVendor = { name: 'gitlab', tool: 'glab' }

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
			file: "export const REFUSAL = 'gh pr view: no pull request'\nexport const OTHER = `gh pr view: ${'x'}`\n",
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

describe("scanHostSeam on the cli's own sources", () => {
	it('no vendor tool literal or vendor import outside its place → no finding', () => {
		const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
		const vendors = HOST_VENDORS.map((vendor) => ({
			name: vendor.name,
			tool: vendor.tool,
		}))

		expect(scanHostSeam({ root, vendors })).toEqual([])
	})
})
