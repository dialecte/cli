import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run as coverage } from '../src/commands/coverage.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string
let prevCwd: string

beforeEach(() => {
	prevCwd = process.cwd()
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-cov-'))
	const def = join(root, 'src/minimal/definition')
	mkdirSync(def, { recursive: true })
	writeFileSync(join(root, 'package.json'), '{"name":"@dialecte/mini"}')
	writeFileSync(
		join(def, 'constants.generated.ts'),
		[
			"export const ELEMENT_NAMES = ['Root', 'Item'] as const",
			'export const CHILDREN = { Root: ["Item"], Item: [] } as const',
			"export const SINGLETON_ELEMENTS = ['Root'] as const",
			'',
		].join('\n'),
	)
	writeFileSync(
		join(def, 'definition.generated.ts'),
		'export const DEFINITION = { Root: {}, Item: { attributes: { details: { name: { required: true } } } } } as const\n',
	)
	process.chdir(root)
})

afterEach(() => {
	process.chdir(prevCwd)
	rmSync(root, { recursive: true, force: true })
})

describe('dialecte coverage (integration)', () => {
	it('discovers the dialect by convention and writes the three probe files', async () => {
		await coverage(['--no-format'])
		const gen = join(root, 'benchmarks/types/minimal/generated')
		expect(existsSync(join(gen, 'coverage.surface.generated.ts'))).toBe(true)
		expect(existsSync(join(gen, 'coverage.calls.generated.ts'))).toBe(true)
		expect(existsSync(join(gen, 'baseline.ts'))).toBe(true)

		// namespace = capitalized package name; surface fans generics over the element union
		const surface = readFileSync(join(gen, 'coverage.surface.generated.ts'), 'utf8')
		expect(surface).toContain("import type { Mini } from '@/minimal'")
		expect(surface).toContain('type All_Ref')

		// calls use a bare ref for the singleton (Root) and an id for the rest (Item)
		const calls = readFileSync(join(gen, 'coverage.calls.generated.ts'), 'utf8')
		expect(calls).toContain("q.getRecord({ tagName: 'Root' })")
		expect(calls).toContain("q.getRecord({ tagName: 'Item', id: 'x' })")
	})
})
