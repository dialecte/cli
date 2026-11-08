import { existsSync, mkdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { POOL_UNIT_CASE_MS } from '../../../test/worktree-pool.constants.ts'
import { copyNodeModules } from './copy-node-modules.ts'

import { describe, expect, it } from 'vitest'

describe('copyNodeModules', { timeout: POOL_UNIT_CASE_MS }, () => {
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

	/** Two checkouts beside a sibling repository: `main` with node_modules and a workspace package, `copy` to receive it. */
	function checkouts(): { sibling: string; from: string; to: string } {
		const workspace = temporaryFolder('dialecte-copy-')
		mkdirSync(join(workspace, 'sibling'), { recursive: true })
		mkdirSync(join(workspace, 'main/packages/pkg'), { recursive: true })
		mkdirSync(join(workspace, 'main/node_modules/@s'), { recursive: true })
		mkdirSync(join(workspace, 'main/node_modules/demo'), { recursive: true })
		writeFileSync(join(workspace, 'main/node_modules/demo/index.js'), 'module.exports = 1\n')
		return {
			sibling: join(workspace, 'sibling'),
			from: join(workspace, 'main/node_modules'),
			to: join(workspace, 'copy/node_modules'),
		}
	}

	it('a workspace link reaching inside its own checkout (@s/pkg → ../../packages/pkg) and one leaving it (@s/outside → ../../../sibling) → the first stays relative, only the second is made absolute', () => {
		const { sibling, from, to } = checkouts()
		symlinkSync('../../packages/pkg', join(from, '@s/pkg'))
		symlinkSync('../packages/pkg', join(from, 'pkg'))
		symlinkSync('../../../sibling', join(from, '@s/outside'))
		mkdirSync(join(to, '..'), { recursive: true })

		const copied = copyNodeModules({ from, to })

		expect(readlinkSync(join(to, '@s/pkg'))).toBe('../../packages/pkg')
		expect(readlinkSync(join(to, 'pkg'))).toBe('../packages/pkg')
		expect(readlinkSync(join(to, '@s/outside'))).toBe(sibling)
		expect(copied.relinked).toEqual(['@s/outside'])
	})
})
