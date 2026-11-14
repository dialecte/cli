import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ownCliCommand } from './own-cli-command.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-own-cli-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

/** A scratch package with the given package.json text, and a bundled module path inside it. */
function bundledModuleIn(params: { packageJson: object }): string {
	mkdirSync(join(root, 'dist'), { recursive: true })
	writeFileSync(join(root, 'package.json'), JSON.stringify(params.packageJson))
	return join(root, 'dist', 'cli.js')
}

describe('ownCliCommand', () => {
	it('a bundled module in a package whose bin names no dialecte → throws, naming the missing dialecte bin', () => {
		const modulePath = bundledModuleIn({
			packageJson: { name: 'scratch-cli', version: '1.0.0', bin: { other: 'dist/other.js' } },
		})

		expect(() => ownCliCommand({ modulePath })).toThrow(/no dialecte bin/)
	})

	it('a bundled module in a package with no bin field → throws, naming the missing dialecte bin', () => {
		const modulePath = bundledModuleIn({ packageJson: { name: 'scratch-cli', version: '1.0.0' } })

		expect(() => ownCliCommand({ modulePath })).toThrow(/no dialecte bin/)
	})

	it('a bundled module in a package whose bin names dialecte → the node and the bin file in that package', () => {
		const modulePath = bundledModuleIn({
			packageJson: { name: 'scratch-cli', version: '1.0.0', bin: { dialecte: 'dist/cli.js' } },
		})

		expect(ownCliCommand({ modulePath })).toEqual([process.execPath, join(root, 'dist/cli.js')])
	})
})
