import { spawnSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { COMMIT_SCRIPT_PROBE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { renderCommitScript } from './commit-script.ts'

import { describe, expect, it } from 'vitest'

import type { HandoverPlan } from './handover.types.ts'

/** The guard the script's second line carries: it re-executes the script with bash, out of posix mode. */
const REEXEC_GUARD =
	'if [ -z "${BASH_VERSION:-}" ] || shopt -oq posix 2>/dev/null; then exec env -u POSIXLY_CORRECT bash "$0" "$@"; fi'

const PLAN: HandoverPlan = {
	repository: '/work/repository',
	branch: 'main',
	head: '0123456789abcdef0123456789abcdef01234567',
	gates: 'npm run check',
	lots: [],
}

function render(): string[] {
	return renderCommitScript({ plan: PLAN, folder: '/work/out', cliPath: '/work/cli.js' }).split(
		'\n',
	)
}

describe('renderCommitScript', () => {
	it('a plan → the second line is the re-exec guard, the header comes after it', () => {
		const lines = render()

		expect(lines[1]).toBe(REEXEC_GUARD)
		expect(lines[2]).toMatch(/^# 0 commit\(s\) on main in \/work\/repository/)
	})

	it(
		'a script of the template run as `bash --posix` → it re-executes itself with bash out of posix mode',
		{ timeout: COMMIT_SCRIPT_PROBE_TIMEOUT },
		() => {
			const [shebang, guard] = render()
			const script = join(temporaryFolder('dialecte-commit-script-'), 'probe.sh')
			writeFileSync(
				script,
				[shebang, guard, 'shopt -oq posix && echo posix || echo bash', ''].join('\n'),
			)
			chmodSync(script, 0o755)

			// POSIXLY_CORRECT would put every bash back in posix mode: the guard would re-execute forever
			const env = Object.fromEntries(
				Object.entries(process.env).filter(([name]) => name !== 'POSIXLY_CORRECT'),
			)

			const ran = spawnSync('bash', ['--posix', script], {
				encoding: 'utf8',
				env,
				timeout: COMMIT_SCRIPT_PROBE_TIMEOUT,
			})

			expect(ran.status).toBe(0)
			expect(ran.stdout.trim()).toBe('bash')
		},
	)

	it(
		'POSIXLY_CORRECT set in the environment → the probe re-executes once, runs out of posix mode, prints bash and exits 0, no timeout',
		{ timeout: COMMIT_SCRIPT_PROBE_TIMEOUT },
		() => {
			const [shebang, guard] = render()
			const script = join(temporaryFolder('dialecte-commit-script-'), 'probe.sh')
			writeFileSync(
				script,
				[shebang, guard, 'shopt -oq posix && echo posix || echo bash', ''].join('\n'),
			)
			chmodSync(script, 0o755)

			const ran = spawnSync('bash', [script], {
				encoding: 'utf8',
				env: { ...process.env, POSIXLY_CORRECT: '1' },
				timeout: COMMIT_SCRIPT_PROBE_TIMEOUT,
			})

			expect({
				status: ran.status,
				stdout: ran.stdout.trim(),
				signal: ran.signal,
				error: ran.error,
			}).toEqual({ status: 0, stdout: 'bash', signal: null, error: undefined })
		},
	)
})
