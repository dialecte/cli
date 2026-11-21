import { compareSemVer, lowestVersionOf, parseSemVer } from './semver.ts'

import { describe, expect, it } from 'vitest'

import type { SemVer } from './semver.types.ts'

/** The parts of a plain `major.minor.patch[-pre.release]` version, split by hand (no reader under test). */
function partsOf(version: string): SemVer {
	const [core, prerelease] = version.split('-')
	const [major, minor, patch] = core.split('.').map(Number)
	return {
		core: [major, minor, patch],
		prerelease: prerelease === undefined ? [] : prerelease.split('.'),
	}
}

describe('lowestVersionOf', () => {
	const ADMITTED: Array<[spec: string, lowest: string]> = [
		['^1.2.3', '1.2.3'],
		['~1.2.3', '1.2.3'],
		['>=1.2.3', '1.2.3'],
		['>1.2.3', '1.2.3'],
		['1.2.3', '1.2.3'],
		['=1.2.3', '1.2.3'],
		['1.2', '1.2.0'],
		['1.x', '1.0.0'],
		['1.2.3 - 2.0.0', '1.2.3'],
		['^2.0.0 || ^1.5.0', '1.5.0'],
		['workspace:^1.2.3', '1.2.3'],
		['npm:@dialecte/cli@^1.2.3', '1.2.3'],
		['1.2.3-beta.1', '1.2.3-beta.1'],
		['>=0.10.0 <1.0.0', '0.10.0'],
		['>= 0.10.0', '0.10.0'],
		['v0.10.0', '0.10.0'],
		['^0.10', '0.10.0'],
		['~0.10', '0.10.0'],
		['0.10.*', '0.10.0'],
		['<1.0.0 >=0.10.0', '0.10.0'],
	]
	for (const [spec, lowest] of ADMITTED)
		it(`${JSON.stringify(spec)} → ${lowest}`, () => {
			expect(lowestVersionOf({ spec })).toBe(lowest)
		})

	const NO_LOWEST: string[] = [
		'*',
		'',
		'<2.0.0',
		'^1.0.0 || <0.5.0',
		'latest',
		'file:../cli',
		'link:../cli',
		'./cli-1.0.0.tgz',
		'git+https://example.com/cli.git',
	]
	for (const spec of NO_LOWEST)
		it(`${JSON.stringify(spec)} → undefined`, () => {
			expect(lowestVersionOf({ spec })).toBeUndefined()
		})
})

describe('compareSemVer', () => {
	const ORDER: Array<[first: string, second: string, sign: number]> = [
		['1.2.3', '1.2.4', -1],
		['1.3.0', '1.2.9', 1],
		['2.0.0', '1.9.9', 1],
		['1.2.3', '1.2.3', 0],
		['1.0.0-beta', '1.0.0', -1],
		['1.0.0', '1.0.0-beta', 1],
		['1.0.0-alpha.1', '1.0.0-alpha.2', -1],
		['1.0.0-alpha.2', '1.0.0-alpha.10', -1],
		['1.0.0-1', '1.0.0-alpha', -1],
		['1.0.0-alpha', '1.0.0-alpha.1', -1],
	]
	for (const [first, second, sign] of ORDER)
		it(`${first} against ${second} → ${sign}`, () => {
			expect(Math.sign(compareSemVer(partsOf(first), partsOf(second)))).toBe(sign)
		})
})

describe('parseSemVer', () => {
	const PARSED: Array<[version: string, parts: SemVer | undefined]> = [
		['1.2.3', { core: [1, 2, 3], prerelease: [] }],
		['1.2.3-beta.1', { core: [1, 2, 3], prerelease: ['beta', '1'] }],
		['1.2', undefined],
		['01.2.3', undefined],
		['latest', undefined],
	]
	for (const [version, parts] of PARSED)
		it(`${version} → ${parts === undefined ? 'undefined' : JSON.stringify(parts)}`, () => {
			expect(parseSemVer(version)).toEqual(parts)
		})
})
