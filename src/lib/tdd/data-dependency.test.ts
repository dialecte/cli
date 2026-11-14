import { isDataDependency } from './data-dependency.ts'

import { describe, expect, it } from 'vitest'

const DEPENDENCIES: { path: string; data: boolean }[] = [
	{ path: 'src/fixtures/one-ied.xml', data: true },
	{ path: 'src/fixtures/data.json', data: true },
	{ path: 'src/fixtures/schema.xsd', data: true },
	{ path: 'src/fixtures/notes.txt', data: true },
	{ path: 'src/__snapshots__/read.test.ts.snap', data: true },
	{ path: 'test/helper.ts', data: false },
	{ path: 'test/helper.tsx', data: false },
	{ path: 'test/helper.mts', data: false },
	{ path: 'test/helper.cjs', data: false },
	{ path: 'test/helper.js', data: false },
]

describe('isDataDependency', () => {
	for (const { path, data } of DEPENDENCIES)
		it(`a dependency named ${path} → ${data ? 'data' : 'code, not data'}`, () => {
			expect(isDataDependency(path)).toBe(data)
		})
})
