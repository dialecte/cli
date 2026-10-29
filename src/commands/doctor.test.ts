import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { readCliVersion } from '../lib/read-cli-version.ts'
import { run, runDoctor } from './doctor.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/read-cli-version.ts', () => ({ readCliVersion: vi.fn(() => '0.2.0') }))

let parent: string
let app: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(app, path)), { recursive: true })
	writeFileSync(join(app, path), content)
}

function brief(): ReturnType<typeof runDoctor> {
	return runDoctor({
		argv: ['--brief'],
		cwd: app,
		dialecteRoot: undefined,
		cliVersion: '0.2.0',
	})
}

beforeEach(() => {
	// its own parent folder: the checkouts scan of the parent never meets another test's folders
	parent = mkdtempSync(join(tmpdir(), 'dialecte-cli-doctor-brief-'))
	app = join(parent, 'app')
	mkdirSync(app)
})

afterEach(() => {
	vi.restoreAllMocks()
	process.exitCode = undefined
	rmSync(parent, { recursive: true, force: true })
})

describe('runDoctor --brief', () => {
	it('everything in sync -> prints nothing, exit 0', () => {
		write('package.json', JSON.stringify({ name: 'app', dependencies: {} }))

		expect(brief()).toEqual({ output: '', exitCode: 0 })
	})

	it('a problem -> one line with its fix, still exit 0', () => {
		write('package.json', JSON.stringify({ dependencies: { '@dialecte/core': '0.7.0' } }))

		const result = brief()

		expect(result.exitCode).toBe(0)
		expect(result.output.trimEnd().split('\n')).toEqual([
			'⚠️  @dialecte/core  not installed - fix: npm install',
		])
	})

	it('no package.json -> prints nothing, exit 0 (a session start never fails)', () => {
		expect(brief()).toEqual({ output: '', exitCode: 0 })
	})

	it('a package.json that is not JSON -> prints nothing, exit 0', () => {
		write('package.json', '{ nope')

		expect(brief()).toEqual({ output: '', exitCode: 0 })
	})

	it('run(["--brief"]) with a cli version that cannot be read -> nothing printed, exit code 0', async () => {
		write('package.json', JSON.stringify({ name: 'app', dependencies: {} }))
		vi.mocked(readCliVersion).mockImplementation(() => {
			throw new Error('no package.json for the cli')
		})
		vi.spyOn(process, 'cwd').mockReturnValue(app)
		const printed = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		process.exitCode = undefined

		await run(['--brief'])

		expect(printed.mock.calls.filter(([chunk]) => chunk !== '')).toEqual([])
		expect(process.exitCode ?? 0).toBe(0)
	})

	it('without --brief the same problem still exits 1 and prints the ok lines too', () => {
		write('package.json', JSON.stringify({ dependencies: { '@dialecte/core': '0.7.0' } }))

		const result = runDoctor({
			argv: [],
			cwd: app,
			dialecteRoot: undefined,
			cliVersion: '0.2.0',
		})

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('✅ dialecte')
	})
})
