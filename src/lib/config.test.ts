import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
	discoverNamespace,
	discoverVersions,
	getArg,
	hasFlag,
	resolveTargets,
	tsconfigOf,
} from './config.ts'

import { afterEach, describe, expect, it } from 'vitest'

const made: string[] = []
afterEach(() => {
	for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Build a throwaway package dir from a {relativePath: contents} map. */
function pkgDir(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), 'dialecte-cli-cfg-'))
	made.push(root)
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel)
		mkdirSync(dirname(abs), { recursive: true })
		writeFileSync(abs, content)
	}
	return root
}

const LEAF = 'export const x = 1\n' // discovery only checks the generated files exist
function dialectPkg(name: string, versions: string[], extra: Record<string, string> = {}): string {
	const files: Record<string, string> = { 'package.json': JSON.stringify({ name }) }
	for (const v of versions) {
		files[`src/${v}/definition/constants.generated.ts`] = LEAF
		files[`src/${v}/definition/definition.generated.ts`] = LEAF
	}
	return pkgDir({ ...files, ...extra })
}

describe('getArg / hasFlag', () => {
	it('reads a flag value, including later occurrences, and handles absence', () => {
		expect(getArg(['--namespace', 'Scl'], 'namespace')).toBe('Scl')
		expect(getArg(['--a', 'x', '--b', 'y'], 'b')).toBe('y')
		expect(getArg(['--namespace'], 'namespace')).toBeUndefined()
		expect(getArg([], 'namespace')).toBeUndefined()
	})
	it('detects flag presence', () => {
		expect(hasFlag(['--check'], 'check')).toBe(true)
		expect(hasFlag(['--no-format', '--check'], 'no-format')).toBe(true)
		expect(hasFlag(['--check'], 'no-format')).toBe(false)
	})
})

describe('discoverNamespace', () => {
	it('capitalizes the unscoped package name', () => {
		expect(discoverNamespace(pkgDir({ 'package.json': '{"name":"@dialecte/scl"}' }))).toBe('Scl')
		expect(discoverNamespace(pkgDir({ 'package.json': '{"name":"plc"}' }))).toBe('Plc')
	})
	it('falls back to Dialecte with no package.json', () => {
		expect(discoverNamespace(pkgDir({}))).toBe('Dialecte')
	})
})

describe('discoverVersions', () => {
	it('finds versions that have BOTH generated leaf files, sorted', () => {
		expect(discoverVersions(dialectPkg('@dialecte/scl', ['v2020', 'v2019C1']))).toEqual([
			'v2019C1',
			'v2020',
		])
	})
	it('skips a version missing definition.generated.ts', () => {
		const root = pkgDir({
			'package.json': '{"name":"@dialecte/scl"}',
			'src/v1/definition/constants.generated.ts': LEAF,
		})
		expect(discoverVersions(root)).toEqual([])
	})
	it('returns [] when there is no src dir', () => {
		expect(discoverVersions(pkgDir({ 'package.json': '{"name":"x"}' }))).toEqual([])
	})
})

describe('tsconfigOf', () => {
	it('honors flag > package "dialecte" config > default', () => {
		const cfg = pkgDir({ 'package.json': '{"name":"x","dialecte":{"tsconfig":"build.json"}}' })
		expect(tsconfigOf(['--tsconfig', 'custom.json'], cfg)).toBe('custom.json')
		expect(tsconfigOf([], cfg)).toBe('build.json')
		expect(tsconfigOf([], pkgDir({ 'package.json': '{"name":"x"}' }))).toBe('tsconfig.build.json')
	})
})

describe('resolveTargets', () => {
	it('detects @dialecte/core by name → the built-in test dialect', () => {
		const [t, ...rest] = resolveTargets([], pkgDir({ 'package.json': '{"name":"@dialecte/core"}' }))
		expect(rest).toHaveLength(0)
		expect(t.version).toBe('core')
		expect(t.binding).toMatchObject({ kind: 'core', configType: 'TestDialecteConfig' })
		expect(t.outDir).toBe('./benchmarks/types/generated')
	})
	it('core: flags override version/constants-dir/out', () => {
		const root = pkgDir({ 'package.json': '{"name":"@dialecte/core"}' })
		const [t] = resolveTargets(['--version', 'x', '--constants-dir', './d', '--out', './o'], root)
		expect(t).toMatchObject({ version: 'x', constantsDir: './d', outDir: './o' })
	})
	it('discovers a dialect: namespace + one target per version', () => {
		const targets = resolveTargets([], dialectPkg('@dialecte/scl', ['v2019C1', 'v2020']))
		expect(targets.map((t) => t.version)).toEqual(['v2019C1', 'v2020'])
		expect(targets[0].binding).toMatchObject({
			kind: 'namespace',
			name: 'Scl',
			import: '@/v2019C1',
		})
		expect(targets[0].outDir).toBe('./benchmarks/types/v2019C1/generated')
	})
	it('--version filters to a single discovered version', () => {
		const root = dialectPkg('@dialecte/scl', ['v2019C1', 'v2020'])
		expect(resolveTargets(['--version', 'v2020'], root).map((t) => t.version)).toEqual(['v2020'])
	})
	it('--namespace and --entry override discovery', () => {
		const [t] = resolveTargets(
			['--namespace', 'Custom', '--entry', '@/x'],
			dialectPkg('@dialecte/scl', ['v1']),
		)
		expect(t.binding).toMatchObject({ kind: 'namespace', name: 'Custom', import: '@/x' })
	})
	it('falls back to a synthetic target when discovery is empty but --constants-dir is given', () => {
		const root = pkgDir({ 'package.json': '{"name":"@dialecte/scl"}' })
		const [t] = resolveTargets(['--constants-dir', './x'], root)
		expect(t?.version).toBe('default')
		expect(t?.binding).toMatchObject({ name: 'Scl' })
		expect(t?.constantsDir).toBe('./x')
	})
})
