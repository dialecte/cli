import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../test/scratch-repository.ts'

import { describe, expect, it } from 'vitest'

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, 'cli.ts')

describe('the cli', { timeout: 30_000 }, () => {
	it('lock → an unknown command, exit 1, nothing run; the help lists no lock', () => {
		const marker = join(temporaryFolder('dialecte-cli-lock-'), 'ran')

		const run = spawnSync(
			process.execPath,
			[CLI_SOURCE, 'lock', 'run', '--no-wait', '--', 'touch', marker],
			{
				encoding: 'utf8',
				// a cli that still had the machine lock takes it here, never in the user's cache
				env: { ...process.env, DIALECTE_CACHE_DIR: temporaryFolder('dialecte-cli-cache-') },
			},
		)

		expect(run.status).toBe(1)
		expect(run.stderr).toContain('dialecte: unknown command "lock"')
		expect(run.stdout).not.toMatch(/^\s+lock\s/m)
		expect(run.stdout).not.toContain('dialecte lock')
		expect(run.stdout).not.toContain('--no-wait')
		expect(existsSync(marker)).toBe(false)
	})

	it('tdd without a subcommand → its usage names no --no-wait; the README names neither lock run nor --no-wait', () => {
		const usage = spawnSync(process.execPath, [CLI_SOURCE, 'tdd'], {
			encoding: 'utf8',
			cwd: temporaryFolder('dialecte-cli-tdd-'),
		})
		const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8')

		expect(usage.status).toBe(2)
		expect(`${usage.stdout}${usage.stderr}`).toContain('tdd: red | green | status')
		expect(`${usage.stdout}${usage.stderr}`).not.toContain('--no-wait')
		expect(readme).not.toContain('--no-wait')
		expect(readme).not.toContain('lock run')
	})

	it('--help lists contrib', () => {
		const help = spawnSync(process.execPath, [CLI_SOURCE, '--help'], {
			encoding: 'utf8',
			cwd: temporaryFolder('dialecte-cli-help-'),
		})

		expect(help.stdout).toMatch(/^\s+dialecte contrib\b/m)
	})

	it('contrib in a folder whose package.json has no profile → exit 2, the consumer refusal', () => {
		const folder = temporaryFolder('dialecte-cli-contrib-')
		writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'app' }))

		const run = spawnSync(process.execPath, [CLI_SOURCE, 'contrib'], {
			encoding: 'utf8',
			cwd: folder,
		})

		expect(run.status).toBe(2)
		expect(run.stdout).toContain('contrib: no contributor checks in the consumer profile')
	})

	it('the README has a Profiles section naming dialecte contrib', () => {
		const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8')

		expect(readme).toContain('## Profiles')
		expect(readme).toContain('dialecte contrib')
	})
})
