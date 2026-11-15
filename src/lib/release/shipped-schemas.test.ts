/** The schemas the build ships: found under src/, copied to dist/schemas, present in the packed file list. */
import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { copyShippedSchemas, shippedSchemaFilesOf } from './shipped-schemas.ts'

import { describe, expect, it } from 'vitest'

const CLI_ROOT = join(import.meta.dirname, '..', '..', '..')

const SCHEMA_NAMES = [
	'config-list.schema.json',
	'config-yml.schema.json',
	'dialecterc.schema.json',
	'lot-risk.schema.json',
	'risk-line.schema.json',
	'scope-change.schema.json',
]

/** The basenames of the listing of `root`, or what the listing threw (so a stub fails inside the assertion). */
function shippedNamesOf(root: string): string[] | string {
	try {
		return shippedSchemaFilesOf({ root }).map((file) => basename(file))
	} catch (error) {
		return String(error)
	}
}

/** `text` with every regular-expression character escaped (a win32 path holds backslashes). */
function escapedForRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('shippedSchemaFilesOf', () => {
	it('the real src/ → the six schemas, sorted', () => {
		expect(shippedNamesOf(CLI_ROOT)).toEqual(SCHEMA_NAMES)
	})

	it('two schemas with one basename → refused, naming both', () => {
		const root = temporaryFolder('dialecte-schemas-')
		writeFiles({
			root,
			files: { 'src/a/same.schema.json': '{}', 'src/b/same.schema.json': '{}' },
		})

		const error = thrownBy(() => shippedSchemaFilesOf({ root }))

		expect([error?.message].map((message) => message ?? '')).toEqual([
			expect.stringMatching(
				new RegExp(
					`${escapedForRegExp(join('src', 'a', 'same.schema.json'))}.*${escapedForRegExp(join('src', 'b', 'same.schema.json'))}`,
					's',
				),
			),
		])
	})
})

describe('copyShippedSchemas', () => {
	it('a scratch package with the real package.json files field → npm pack lists dist/schemas/<each>', () => {
		const folder = temporaryFolder('dialecte-pack-')
		copyFileSync(join(CLI_ROOT, 'package.json'), join(folder, 'package.json'))

		expect(() => copyShippedSchemas({ root: CLI_ROOT, outDir: join(folder, 'dist') })).not.toThrow()
		const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
			cwd: folder,
			encoding: 'utf8',
			shell: process.platform === 'win32',
		})
		const listed = (JSON.parse(packed.stdout) as { files: { path: string }[] }[])[0].files.map(
			(file) => file.path,
		)

		expect(SCHEMA_NAMES.map((name) => listed.includes(`dist/schemas/${name}`))).toEqual(
			SCHEMA_NAMES.map(() => true),
		)
	})
})
