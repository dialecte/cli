import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { runApi } from './api.ts'
import { runDoctor } from './doctor.ts'
import { runMembers } from './members.ts'
import { runSchema } from './schema.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { CommandOutput } from '../lib/command-output.types.ts'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-lookups-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

const commands: Record<string, (cwd: string) => CommandOutput | Promise<CommandOutput>> = {
	'api find': (cwd) => runApi({ argv: ['find', 'name'], cwd }),
	schema: (cwd) => runSchema({ argv: ['Bay'], cwd }),
	members: (cwd) => runMembers({ argv: ['doc.query'], cwd }),
	doctor: (cwd) => runDoctor({ argv: [], cwd, dialecteRoot: undefined, cliVersion: '0.2.0' }),
}

describe('a lookup run outside a package', () => {
	for (const [name, command] of Object.entries(commands))
		it(`${name} in a folder without package.json → says so, exit 2`, async () => {
			const result = await command(root)
			expect(result).toEqual({
				output: `no package.json in ${root}: run dialecte in your package's folder\n`,
				exitCode: 2,
			})
		})
})

describe('members in an app', () => {
	function writeJson(params: { path: string; content: unknown }): void {
		mkdirSync(dirname(join(root, params.path)), { recursive: true })
		writeFileSync(join(root, params.path), JSON.stringify(params.content))
	}

	function installDialecte(params: { name: string; version: string }): void {
		writeJson({
			path: `node_modules/${params.name}/package.json`,
			content: {
				name: params.name,
				dependencies: { '@dialecte/core': '1' },
				exports: { [`./${params.version}`]: './x.js', [`./${params.version}/test`]: './t.js' },
			},
		})
	}

	it('two dialectes installed, nothing named → each listed, exit 2, no type read', () => {
		writeJson({
			path: 'package.json',
			content: { dependencies: { '@acme/a': '1', '@acme/b': '1' } },
		})
		installDialecte({ name: '@acme/a', version: 'v1' })
		installDialecte({ name: '@acme/b', version: 'v2' })

		expect(runMembers({ argv: ['doc.query'], cwd: root })).toEqual({
			output:
				'several dialectes are installed: pass --package <name> [--version <v>]\n  @acme/a --version v1\n  @acme/b --version v2\n',
			exitCode: 2,
		})
	})

	it('no dialecte installed → says so, exit 2', () => {
		writeJson({ path: 'package.json', content: { dependencies: {} } })

		expect(runMembers({ argv: ['doc.query'], cwd: root }).output).toContain(
			'no dialecte installed here',
		)
	})
})
