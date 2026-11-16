import { runNpm } from './npm-runner.ts'

import { describe, expect, it } from 'vitest'

import type { NpmSpawn } from './worktree.types.ts'

/** A spawn that records its calls and answers `answer`: npm never runs. */
function createRecordingSpawn(answer: ReturnType<NpmSpawn>): {
	spawn: NpmSpawn
	calls: Parameters<NpmSpawn>[0][]
} {
	const calls: Parameters<NpmSpawn>[0][] = []
	return {
		calls,
		spawn: function record(params) {
			calls.push(params)
			return answer
		},
	}
}

describe('runNpm: the default npm runner', () => {
	it('DIALECTE_NPM_INSTALL=off → a failure answered without spawning: status 1, npm install off (DIALECTE_NPM_INSTALL)', () => {
		const { spawn, calls } = createRecordingSpawn({ status: 0, stdout: '', stderr: '' })

		expect(
			runNpm({
				checkout: '/work/0001-cli-x',
				args: ['ci', '--prefer-offline'],
				spawn,
				environment: { DIALECTE_NPM_INSTALL: 'off' },
			}),
		).toEqual({ status: 1, output: 'npm install off (DIALECTE_NPM_INSTALL)' })
		expect(calls).toEqual([])
	})

	it.each([
		{ label: 'the switch unset', environment: {} },
		{ label: 'the switch on', environment: { DIALECTE_NPM_INSTALL: 'on' } },
		{ label: 'the switch empty', environment: { DIALECTE_NPM_INSTALL: '' } },
		{ label: 'the switch OFF (another case)', environment: { DIALECTE_NPM_INSTALL: 'OFF' } },
	])(
		'$label → npm spawned with the args in the checkout, its status and its stdout then stderr answered',
		({ environment }) => {
			const { spawn, calls } = createRecordingSpawn({
				status: 0,
				stdout: 'added 3 packages\n',
				stderr: 'npm warn deprecated x\n',
			})

			expect(
				runNpm({
					checkout: '/work/0001-cli-x',
					args: ['install', '--prefer-offline', '--no-save'],
					spawn,
					environment,
				}),
			).toEqual({ status: 0, output: 'added 3 packages\nnpm warn deprecated x\n' })
			expect(calls).toEqual([
				{
					command: 'npm',
					args: ['install', '--prefer-offline', '--no-save'],
					cwd: '/work/0001-cli-x',
				},
			])
		},
	)

	it('npm spawned and failing → its exit status and output answered', () => {
		const { spawn } = createRecordingSpawn({
			status: 1,
			stdout: '',
			stderr: 'npm error code ENOTFOUND\nnpm error network\n',
		})

		expect(
			runNpm({
				checkout: '/work/0001-cli-x',
				args: ['ci', '--prefer-offline'],
				spawn,
				environment: {},
			}),
		).toEqual({ status: 1, output: 'npm error code ENOTFOUND\nnpm error network\n' })
	})

	it('npm ended by a signal or not found (status null) → status 1 and its output', () => {
		const { spawn } = createRecordingSpawn({ status: null, stdout: '', stderr: 'killed' })

		expect(
			runNpm({
				checkout: '/work/0001-cli-x',
				args: ['ci', '--prefer-offline'],
				spawn,
				environment: {},
			}),
		).toEqual({ status: 1, output: 'killed' })
	})
})
