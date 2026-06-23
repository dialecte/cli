import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveBin } from './bin.ts'

import { afterEach, describe, expect, it } from 'vitest'

const made: string[] = []
afterEach(() => {
	for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

function tmpRoot(withBin?: string): string {
	const root = mkdtempSync(join(tmpdir(), 'dialecte-cli-bin-'))
	made.push(root)
	if (withBin) {
		const bin = join(root, 'node_modules/.bin')
		mkdirSync(bin, { recursive: true })
		writeFileSync(join(bin, withBin), '#!/bin/sh\n')
	}
	return root
}

describe('resolveBin', () => {
	it("prefers the consumer's node_modules/.bin when present", () => {
		const root = tmpRoot('oxfmt')
		const r = resolveBin('oxfmt', 'oxfmt', root)
		expect(r?.source).toBe('consumer')
		expect(r?.path).toBe(join(root, 'node_modules/.bin/oxfmt'))
	})
	it("falls back to the CLI's own copy when the project lacks it", () => {
		// oxfmt is a dependency of @dialecte/cli, so its own copy always resolves
		const r = resolveBin('oxfmt', 'oxfmt', tmpRoot())
		expect(r?.source).toBe('own')
		expect(r?.path).toBeTruthy()
	})
	it('returns null when neither the project nor the CLI has the tool', () => {
		expect(resolveBin('nope', 'totally-missing-pkg-xyz', tmpRoot())).toBeNull()
	})
})
