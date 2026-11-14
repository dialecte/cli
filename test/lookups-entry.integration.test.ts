/**
 * `@dialecte/cli/lookups` is the library entry of the pure lookup answers, resolved through the package's own
 * `exports` (a package name resolves to itself in Node); the `dialecte` bin never loads `@dialecte/core`.
 */
import { execFileSync } from 'node:child_process'
import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	LOOKUP_CONSUMER_FILE,
	LOOKUP_CONSUMER_SOURCE,
	LOOKUP_DOCUMENTED_FUNCTIONS,
	LOOKUP_EXPORTS,
	LOOKUP_TYPE_EXPORTS,
} from './lookups-entry.constants.ts'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The package as a consumer gets it, built into a folder of this run's own: the checkout's `dist/` is the one other
 * sessions run `dialecte` from, never written by a test.
 */
const BUILT = mkdtempSync(join(tmpdir(), 'dialecte-lookups-entry-'))

/** The checkout's `dist/` before the build: each file with its last write, `[]` when there is none. */
const CHECKOUT_DIST_BEFORE = listWithTimes(join(ROOT, 'dist'))

function listWithTimes(folder: string): string[] {
	return existsSync(folder)
		? readdirSync(folder)
				.sort()
				.map((name) => `${name} ${statSync(join(folder, name)).mtimeMs}`)
		: []
}

beforeAll(() => {
	// always a fresh build: a stale dist would prove nothing
	execFileSync('npx', ['tsup', '--out-dir', join(BUILT, 'dist')], { cwd: ROOT, stdio: 'ignore' })
	copyFileSync(join(ROOT, 'package.json'), join(BUILT, 'package.json'))
	symlinkSync(join(ROOT, 'node_modules'), join(BUILT, 'node_modules'))
}, 120_000)

afterAll(() => {
	rmSync(BUILT, { recursive: true, force: true })
})

describe('@dialecte/cli/lookups', () => {
	it('exports the lookup answers through the package exports', () => {
		const names = execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				"import('@dialecte/cli/lookups').then((entry) => console.log(JSON.stringify(Object.keys(entry).sort())))",
			],
			{ cwd: BUILT, encoding: 'utf8' },
		)
		expect(JSON.parse(names)).toEqual([...LOOKUP_EXPORTS].sort())
	})

	it('ships declaration files that name them', () => {
		const declarations = readFileSync(join(BUILT, 'dist/lookups.d.ts'), 'utf8')
		for (const name of LOOKUP_EXPORTS) expect(declarations).toContain(name)
	})

	it('declares each ask function with an @intent line in its JSDoc', () => {
		const declarations = readFileSync(join(BUILT, 'dist/lookups.d.ts'), 'utf8')
		const withoutIntent = LOOKUP_DOCUMENTED_FUNCTIONS.filter((name) => {
			const match = new RegExp(
				String.raw`/\*\*((?:(?!\*/)[^])+)\*/\s*declare function ${name}\b`,
				'u',
			).exec(declarations)
			return match === null || !/@intent\s+\S/u.test(match[1])
		})

		expect(withoutIntent).toEqual([])
	})

	it('declares each ask function with a non-empty JSDoc summary above it', () => {
		const declarations = readFileSync(join(BUILT, 'dist/lookups.d.ts'), 'utf8')
		const summaries = LOOKUP_DOCUMENTED_FUNCTIONS.map((name) => {
			const match = new RegExp(
				String.raw`/\*\*((?:(?!\*/)[^])+)\*/\s*declare function ${name}\b`,
				'u',
			).exec(declarations)
			return match === null ? '' : match[1].replace(/[\s*]+/gu, ' ').trim()
		})

		expect(summaries.filter((summary) => summary === '')).toEqual([])
	})

	it('exports the types of the described element from its declaration file', () => {
		const declarations = readFileSync(join(BUILT, 'dist/lookups.d.ts'), 'utf8')
		const exportClause = declarations.slice(declarations.lastIndexOf('export {'))
		const exportedTypes = [...exportClause.matchAll(/\btype (\w+)/gu)].map((match) => match[1])

		expect(LOOKUP_TYPE_EXPORTS.filter((name) => !exportedTypes.includes(name))).toEqual([])
	})

	it('lets a consumer assign each lookup answer to the exported CommandOutput (exit 0, 1 or 2)', () => {
		const consumer = join(BUILT, 'consumer')
		mkdirSync(consumer)
		writeFileSync(join(consumer, LOOKUP_CONSUMER_FILE), LOOKUP_CONSUMER_SOURCE)
		const diagnostics = typeCheckOutput({ consumer })

		expect(diagnostics).toBe('')
	})

	it('keeps the bin free of a runtime import of @dialecte/core', () => {
		const bin = readFileSync(join(BUILT, 'dist/cli.js'), 'utf8')
		// the bin resolves the core of the user's project at run time (strings and resolver calls), never imports one
		expect(bin).not.toMatch(/^\s*import\b[^\n]*["']@dialecte\/core/mu)
		expect(bin).not.toMatch(/\bimport\(\s*["']@dialecte\/core/u)
	})

	it('builds the bin, the library entry and the tdd reporter the bin hands to vitest', () => {
		expect(readdirSync(join(BUILT, 'dist')).sort()).toEqual([
			'cli.js',
			'ignorers.js',
			'lookups.d.ts',
			'lookups.js',
			'tdd-reporter.js',
		])
	})

	it('leaves the checkout’s dist/ as it was: the build went to its own folder', () => {
		expect(listWithTimes(join(ROOT, 'dist'))).toEqual(CHECKOUT_DIST_BEFORE)
	})
})

/** What `tsc` prints for the consumer folder against the built declarations: `''` when it type-checks. */
function typeCheckOutput(params: { consumer: string }): string {
	try {
		execFileSync(
			join(ROOT, 'node_modules/.bin/tsc'),
			[
				'--noEmit',
				'--strict',
				'--skipLibCheck',
				'--module',
				'esnext',
				'--moduleResolution',
				'bundler',
				'--target',
				'es2022',
				'--types',
				'node',
				'--typeRoots',
				join(ROOT, 'node_modules/@types'),
				join(params.consumer, LOOKUP_CONSUMER_FILE),
			],
			{ cwd: BUILT, encoding: 'utf8', stdio: 'pipe' },
		)
		return ''
	} catch (error) {
		const failure = error as { stdout?: string; stderr?: string }
		return `${failure.stdout ?? ''}${failure.stderr ?? ''}`.trim() || 'tsc failed'
	}
}
