/**
 * The published manifest: npm installs the newest TypeScript the peer range admits next to the cli, and the cli
 * loads the compiler API (`ts.TypeFlags`, `ts.createProgram`) at startup.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..')

/**
 * The `>=<major>.<minor> <<major>` range as numbers; none for another spelling (the test then fails: read the range
 * by hand and extend this).
 */
function boundsOf(range: string): { lower: [number, number]; upper: number } | undefined {
	const bounds = /^>=\s*(\d+)\.(\d+)(?:\.\d+)?\s+<\s*(\d+)(?:\.0){0,2}$/.exec(range.trim())
	return bounds
		? { lower: [Number(bounds[1]), Number(bounds[2])], upper: Number(bounds[3]) }
		: undefined
}

/** Whether `version` sits in the bounds: at or above the lower major.minor, below the upper major. */
function admits(params: {
	bounds: { lower: [number, number]; upper: number }
	version: string
}): boolean {
	const [major, minor] = params.version.split('.').map(Number)
	const [lowerMajor, lowerMinor] = params.bounds.lower
	const aboveLower = major > lowerMajor || (major === lowerMajor && minor >= lowerMinor)
	return aboveLower && major < params.bounds.upper
}

describe('package.json', () => {
	it('the typescript peer range → stops before the first major with no compiler API (TypeScript 7, the native port), admits the 6 the cli builds with', async () => {
		const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
			peerDependencies: { typescript: string }
		}
		const native = (await import('@typescript/native')).default as Record<string, unknown>
		const built = (await import('typescript')).default

		const bounds = boundsOf(manifest.peerDependencies.typescript)

		expect({
			native: { major: Number(String(native.version).split('.')[0]), api: typeof native.TypeFlags },
			built: { major: Number(built.version.split('.')[0]), api: typeof built.TypeFlags },
			upperBound: bounds?.upper,
			admitsBuilt: bounds !== undefined && admits({ bounds, version: built.version }),
		}).toEqual({
			native: { major: 7, api: 'undefined' },
			built: { major: 6, api: 'object' },
			upperBound: 7,
			admitsBuilt: true,
		})
	})
})
