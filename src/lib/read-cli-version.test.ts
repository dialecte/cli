import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readCliVersion } from './read-cli-version.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-version-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('readCliVersion', () => {
	it('from the sources → the version of the cli package', () => {
		expect(readCliVersion()).toMatch(/^\d+\.\d+\.\d+/)
	})

	it('from a folder tree with no package.json up to the root → throws, saying where it looked', () => {
		const deep = join(root, 'a', 'b')
		mkdirSync(deep, { recursive: true })
		expect(() => readCliVersion({ startFolder: deep })).toThrow(/no package\.json above .*a.b/)
	})
})
