import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
