import { spawnSync } from 'node:child_process'

/**
 * When the process with this pid started, as `ps` prints it (`lstart`, in the C locale and in UTC, so a reader in another time zone reads the same text); undefined when no process
 * holds the pid or `ps` cannot tell. Two processes that held the same pid one after the other differ here.
 */
export function processStartTime(pid: number): string | undefined {
	const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
		encoding: 'utf8',
		env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
	})
	const started = result.status === 0 ? result.stdout.trim() : ''
	return started === '' ? undefined : started
}
