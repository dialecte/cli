/**
 * `@dialecte/cli/lookups` is the library entry of the pure lookup answers, resolved through the package's own
 * `exports` (a package name resolves to itself in Node); the `dialecte` bin never loads `@dialecte/core`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LOOKUP_EXPORTS } from './lookups-entry.constants.ts'

import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

beforeAll(() => {
	// always a fresh build: a stale dist would prove nothing
	execFileSync('npx', ['tsup'], { cwd: ROOT, stdio: 'ignore' })
}, 120_000)

describe('@dialecte/cli/lookups', () => {
	it('exports the lookup answers through the package exports', () => {
		const names = execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				"import('@dialecte/cli/lookups').then((entry) => console.log(JSON.stringify(Object.keys(entry).sort())))",
			],
			{ cwd: ROOT, encoding: 'utf8' },
		)
		expect(JSON.parse(names)).toEqual([...LOOKUP_EXPORTS].sort())
	})

	it('ships declaration files that name them', () => {
		const declarations = readFileSync(join(ROOT, 'dist/lookups.d.ts'), 'utf8')
		for (const name of LOOKUP_EXPORTS) expect(declarations).toContain(name)
	})

	it('keeps the bin free of a runtime import of @dialecte/core', () => {
		const bin = readFileSync(join(ROOT, 'dist/cli.js'), 'utf8')
		// the bin resolves the core of the user's project at run time (strings and resolver calls), never imports one
		expect(bin).not.toMatch(/^\s*import\b[^\n]*["']@dialecte\/core/mu)
		expect(bin).not.toMatch(/\bimport\(\s*["']@dialecte\/core/u)
	})
})
