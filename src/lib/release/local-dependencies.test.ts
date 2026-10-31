import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { checkPublishable, findLocalDependencies } from './local-dependencies.ts'

import { describe, expect, it } from 'vitest'

const CLI_ROOT = join(import.meta.dirname, '..', '..', '..')

/** A folder holding only `package.json`, removed when the test ends. */
function packageFolder(packageJson: Record<string, unknown>): string {
	const root = temporaryFolder('dialecte-release-')
	writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, '\t')}\n`)
	return root
}

describe('a local dependency is refused at publish', () => {
	const ROWS: Record<
		string,
		{ packageJson: Record<string, unknown>; expected: ReturnType<typeof findLocalDependencies> }
	> = {
		'a file: devDependency → found, with its field and spec': {
			packageJson: { devDependencies: { vitest: '^4.1.8', '@dialecte/core': 'file:../core' } },
			expected: [{ field: 'devDependencies', name: '@dialecte/core', spec: 'file:../core' }],
		},
		'a link: dependency and a file: peer dependency → both found, in field order': {
			packageJson: {
				peerDependencies: { typescript: 'file:/opt/typescript' },
				dependencies: { 'jsonc-parser': 'link:../jsonc' },
			},
			expected: [
				{ field: 'dependencies', name: 'jsonc-parser', spec: 'link:../jsonc' },
				{ field: 'peerDependencies', name: 'typescript', spec: 'file:/opt/typescript' },
			],
		},
		'a file: optional dependency → found': {
			packageJson: { optionalDependencies: { fsevents: 'file:./vendor/fsevents' } },
			expected: [
				{ field: 'optionalDependencies', name: 'fsevents', spec: 'file:./vendor/fsevents' },
			],
		},
		'bare folder paths: relative, absolute and under the home folder → each found': {
			packageJson: {
				dependencies: { up: '../core', here: './x', root: '/abs', home: '~/x' },
			},
			expected: [
				{ field: 'dependencies', name: 'here', spec: './x' },
				{ field: 'dependencies', name: 'home', spec: '~/x' },
				{ field: 'dependencies', name: 'root', spec: '/abs' },
				{ field: 'dependencies', name: 'up', spec: '../core' },
			],
		},
		'a git+file: url → found': {
			packageJson: { devDependencies: { tool: 'git+file:///opt/tool.git' } },
			expected: [{ field: 'devDependencies', name: 'tool', spec: 'git+file:///opt/tool.git' }],
		},
		'registry ranges, an npm: alias and a git url → none': {
			packageJson: {
				dependencies: { oxfmt: '^0.53.0' },
				devDependencies: {
					typescript: 'npm:@typescript/typescript6@^6.0.2',
					tool: 'git+https://example.com/tool.git',
				},
			},
			expected: [],
		},
	}

	for (const [name, row] of Object.entries(ROWS))
		it(name, () => {
			expect(findLocalDependencies({ packageJson: row.packageJson })).toEqual(row.expected)
		})

	it('the check of a package holding one → exit 1, one line per dependency naming it and how to publish', () => {
		const root = packageFolder({ devDependencies: { '@dialecte/core': 'file:../core' } })
		expect(checkPublishable({ root })).toEqual({
			exitCode: 1,
			lines: [
				'refused: package.json names a dependency by a local folder, which only resolves on this machine',
				'  devDependencies  @dialecte/core  file:../core',
				'pin a published version of each (npm install --save-exact <name>@<version>) before publishing',
			],
		})
	})

	it('the check of a package holding none → exit 0, nothing said', () => {
		const root = packageFolder({ devDependencies: { vitest: '^4.1.8' } })
		expect(checkPublishable({ root })).toEqual({ exitCode: 0, lines: [] })
	})

	it('the cli publishes only through the check: prepublishOnly runs it before the build', () => {
		const packageJson = JSON.parse(readFileSync(join(CLI_ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(packageJson.scripts.prepublishOnly).toBe('node src/release-check.ts && npm run build')
	})

	it('src/release-check.ts run in a package holding a local dependency → exit 1, the refusal on stderr', () => {
		const root = packageFolder({ dependencies: { '@dialecte/core': 'file:../core' } })
		const run = spawnSync(process.execPath, [join(CLI_ROOT, 'src/release-check.ts')], {
			cwd: root,
			encoding: 'utf8',
		})
		expect({ status: run.status, stderr: run.stderr.split('\n')[1] }).toEqual({
			status: 1,
			stderr: '  dependencies  @dialecte/core  file:../core',
		})
	})
})
