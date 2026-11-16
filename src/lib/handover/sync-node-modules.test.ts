/**
 * `syncNodeModules` with npm switched off (`DIALECTE_NPM_INSTALL=off`, the suite's setting): a staged lock that
 * node_modules does not install spawns no npm, and the sync answers npm's off failure as the commit's refusal.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { createScratchRepository, git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { NPM_INSTALL_OFF, NPM_INSTALL_SWITCH } from '../worktree/worktree.constants.ts'
import { syncNodeModules } from './sync-node-modules.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Clock } from '../progress/clock.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A lockfile of `demo-app` installing `demo` at `version`. */
function lockOf(version: string): string {
	return `${JSON.stringify({
		name: 'demo-app',
		version: '1.0.0',
		lockfileVersion: 3,
		requires: true,
		packages: {
			'': { name: 'demo-app', version: '1.0.0' },
			'node_modules/demo': { version },
		},
	})}\n`
}

/** A clock that never moves: the sync's duration is not under test. */
function createStillClock(): Clock {
	return {
		now: function now() {
			return 0
		},
		setTimeout: function setTimeout() {
			return undefined
		},
		clearTimeout: function clearTimeout() {},
		sleep: function sleep() {},
	}
}

/**
 * A folder holding an `npm` that writes `ran` beside itself and exits 0: put first on PATH, any npm the sync spawns
 * is this one.
 */
function createWitnessNpm(): { bin: string; ran: string } {
	const bin = temporaryFolder('dialecte-witness-npm-')
	const ran = join(bin, 'ran')
	writeFileSync(join(bin, 'npm'), `#!/bin/sh\ntouch '${ran}'\nexit 0\n`)
	chmodSync(join(bin, 'npm'), 0o755)
	return { bin, ran }
}

describe('syncNodeModules: npm switched off', () => {
	it('a staged lock node_modules does not install, DIALECTE_NPM_INSTALL=off → no npm spawned, the refusal carries the off answer', async () => {
		const root = createScratchRepository({
			'package.json': '{ "name": "demo-app", "version": "1.0.0" }\n',
			'package-lock.json': lockOf('1.0.0'),
			'.gitignore': 'node_modules/\n',
		})
		mkdirSync(join(root, 'node_modules/demo'), { recursive: true })
		writeFileSync(
			join(root, 'node_modules/demo/package.json'),
			'{ "name": "demo", "version": "1.0.0" }\n',
		)
		writeFileSync(join(root, 'package-lock.json'), lockOf('2.0.0'))
		git({ root, args: ['add', 'package-lock.json'] })
		const witness = createWitnessNpm()
		vi.stubEnv('PATH', `${witness.bin}${delimiter}${process.env.PATH ?? ''}`)
		vi.stubEnv(NPM_INSTALL_SWITCH, NPM_INSTALL_OFF)

		const synced = await syncNodeModules({ root, clock: createStillClock() })

		expect({ synced, npmRan: existsSync(witness.ran) }).toEqual({
			synced: { refusal: expect.stringContaining('npm install off (DIALECTE_NPM_INSTALL)') },
			npmRan: false,
		})
	})
})
