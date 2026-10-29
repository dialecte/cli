import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { copyNodeModules } from './copy-node-modules.ts'

import { describe, expect, it } from 'vitest'

describe('copyNodeModules', () => {
	it('the copy-on-write cp killed by a signal (Ctrl-C) → no plain copy after it, the partial copy removed, an error', () => {
		const from = join(temporaryFolder('dialecte-copy-'), 'node_modules')
		mkdirSync(join(from, 'demo'), { recursive: true })
		writeFileSync(join(from, 'demo', 'index.js'), 'module.exports = 1\n')
		const to = join(temporaryFolder('dialecte-copy-'), 'node_modules')
		const calls: string[][] = []

		expect(() =>
			copyNodeModules({
				from,
				to,
				runCopy: function interrupted(args) {
					calls.push(args)
					mkdirSync(to, { recursive: true })
					return { status: null, signal: 'SIGINT' }
				},
			}),
		).toThrow(`copying ${from} was interrupted (SIGINT)`)
		expect(calls).toHaveLength(1)
		expect(existsSync(to)).toBe(false)
	})
})
