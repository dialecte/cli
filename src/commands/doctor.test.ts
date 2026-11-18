import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { createScratchRepository, git } from '../../test/scratch-repository.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { run, runDoctor } from './doctor.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HostLine } from '../lib/host/host.types.ts'

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

describe('runDoctor profile', () => {
	function doctor(): ReturnType<typeof runDoctor> {
		return runDoctor({ argv: [], cwd: app, dialecteRoot: undefined, cliVersion: '0.2.0' })
	}

	it('a consumer without a field → profile consumer (default)', () => {
		write('package.json', JSON.stringify({ name: 'app', dependencies: {} }))

		expect(doctor().output).toContain('✅ profile  consumer (default)\n')
	})

	it('a consumer with allowReferences → the warning allowReferences is the consumer default: remove it', () => {
		write(
			'package.json',
			JSON.stringify({
				name: 'app',
				dependencies: {},
				dialecte: { allowReferences: ['ticket number'] },
			}),
		)

		const result = doctor()

		expect(result.output).toContain('allowReferences is the consumer default: remove it')
		expect(result.exitCode).toBe(1)
	})

	it('a contributor → profile contributor', () => {
		write(
			'package.json',
			JSON.stringify({ name: 'app', dependencies: {}, dialecte: { profile: 'contributor' } }),
		)

		expect(doctor().output).toContain('profile  contributor\n')
	})

	it('a contributor whose dialecte.gate.full holds docs → the warning to move it to dialecte.contrib.steps', () => {
		write(
			'package.json',
			JSON.stringify({
				name: 'app',
				dependencies: {},
				dialecte: {
					profile: 'contributor',
					gate: { full: [{ name: 'docs', run: 'npm run doc:build' }] },
				},
			}),
		)

		const result = doctor()

		expect(result.output).toContain('dialecte.contrib.steps')
		expect(result.exitCode).toBe(1)
	})

	it('a contributor whose skills manifest is not contributing → the warning with dialecte skills sync', () => {
		write(
			'package.json',
			JSON.stringify({ name: 'app', dependencies: {}, dialecte: { profile: 'contributor' } }),
		)
		write('.claude/skills/.dialecte-skills.json', JSON.stringify({ installed: ['dialecte'] }))

		const result = doctor()

		expect(result.output).toContain('dialecte skills sync')
		expect(result.exitCode).toBe(1)
	})

	it('an invalid profile → an error line naming the value, not a crash', () => {
		write(
			'package.json',
			JSON.stringify({ name: 'app', dependencies: {}, dialecte: { profile: 'Contributer' } }),
		)

		const result = doctor()

		expect(result.output).toMatch(/^❌ profile .*"Contributer" is not a profile/m)
		expect(result.exitCode).not.toBe(0)
	})

	it('an invalid profile with --brief → the ❌ line printed, exit 0', () => {
		write(
			'package.json',
			JSON.stringify({ name: 'app', dependencies: {}, dialecte: { profile: 'Contributer' } }),
		)

		const result = brief()

		expect(result.output).toMatch(/^❌ profile .*"Contributer" is not a profile/m)
		expect(result.exitCode).toBe(0)
	})

	it('a contributor whose dialecte.gate.full holds type-bench → the warning to move it to dialecte.contrib.steps', () => {
		write(
			'package.json',
			JSON.stringify({
				name: 'app',
				dependencies: {},
				dialecte: {
					profile: 'contributor',
					gate: { full: [{ name: 'type-bench', run: 'npm run type-bench:check' }] },
				},
			}),
		)

		const result = doctor()

		expect(result.output).toContain('dialecte.contrib.steps')
		expect(result.exitCode).toBe(1)
	})

	it('a plain contributor → no dialecte.contrib.steps warning', () => {
		write(
			'package.json',
			JSON.stringify({ name: 'app', dependencies: {}, dialecte: { profile: 'contributor' } }),
		)

		const result = doctor()

		expect(result.output).toContain('profile  contributor\n')
		expect(result.output).not.toContain('dialecte.contrib.steps')
	})
})

describe('runDoctor --host', () => {
	const OK: HostLine = { status: 'ok', subject: 'viewChecks', detail: 'a pull request read' }
	const WARNING: HostLine = {
		status: 'warning',
		subject: 'stackHelp',
		detail: 'gh stack is not installed',
		fix: 'gh extension install github/gh-stack',
	}
	const ERROR: HostLine = { status: 'error', subject: 'reviewComments', detail: 'gh api: HTTP 403' }

	/** `--host` run in `app` with the host lines given; the folders and vendors it was asked for are recorded. */
	function host(params: { lines: HostLine[]; argv?: string[]; cwd?: string }) {
		const asked: { root: string; vendor: string }[] = []
		const result = runDoctor({
			argv: ['--host', ...(params.argv ?? [])],
			cwd: params.cwd ?? app,
			dialecteRoot: undefined,
			cliVersion: '0.2.0',
			hostLines: ({ root, vendor }) => (asked.push({ root, vendor: vendor.name }), params.lines),
		})
		return { result, asked }
	}

	it('the host lines only, none of the install checks, though the folder has a problem and a package.json', () => {
		const origin = createScratchRepository({
			'package.json': JSON.stringify({ dependencies: { '@dialecte/core': '0.7.0' } }),
		})
		git({ root: origin, args: ['remote', 'add', 'origin', 'https://github.com/example/repo.git'] })

		const { result, asked } = host({ lines: [OK], cwd: origin })

		expect(result).toEqual({ output: '✅ viewChecks  a pull request read\n', exitCode: 0 })
		expect(asked).toEqual([{ root: origin, vendor: 'github' }])
	})

	it('no package.json in the folder → the host lines still print (no installed package is needed)', () => {
		const { result } = host({ lines: [OK], argv: ['--vendor', 'github'] })

		expect(result).toEqual({ output: '✅ viewChecks  a pull request read\n', exitCode: 0 })
	})

	it.each([
		{ label: 'ok lines only', lines: [OK], exitCode: 0 },
		{ label: 'warnings only', lines: [OK, WARNING], exitCode: 0 },
		{ label: 'one error among ok lines and a warning', lines: [OK, WARNING, ERROR], exitCode: 1 },
	])('$label → exit $exitCode', ({ lines, exitCode }) => {
		const { result } = host({ lines, argv: ['--vendor', 'github'] })

		expect(result.exitCode).toBe(exitCode)
	})

	it('a warning and an error → each printed as doctor prints it, the warning with its fix', () => {
		const { result } = host({ lines: [WARNING, ERROR], argv: ['--vendor', 'github'] })

		expect(result.output).toBe(
			'⚠️  stackHelp  gh stack is not installed - fix: gh extension install github/gh-stack\n❌ reviewComments  gh api: HTTP 403\n',
		)
	})

	it('--vendor github in a repository whose origin names no vendor → the github probes run', () => {
		const noVendor = createScratchRepository()

		const { asked } = host({ lines: [OK], argv: ['--vendor', 'github'], cwd: noVendor })

		expect(asked).toEqual([{ root: noVendor, vendor: 'github' }])
	})

	it.each([
		{ label: 'no origin and no --vendor', argv: [] },
		{ label: 'a --vendor that names no known vendor', argv: ['--vendor', 'gitlab'] },
	])(
		'$label → exit 1, an error naming the origin, the known vendors and the key host; the host lines never asked',
		({ argv }) => {
			const noVendor = createScratchRepository()

			const { result, asked } = host({ lines: [OK], argv, cwd: noVendor })

			expect(result.exitCode).toBe(1)
			expect(result.output).toContain('❌')
			expect(result.output).toContain('github')
			expect(asked).toEqual([])
		},
	)

	it('--vendor with no value → a usage error, exit 2; the host lines never asked', () => {
		const { result, asked } = host({ lines: [OK], argv: ['--vendor'] })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('dialecte doctor --host [--vendor <name>]')
		expect(asked).toEqual([])
	})

	it('an origin on an unknown host and no --vendor → exit 1, the error names the host; the host lines never asked', () => {
		const origin = createScratchRepository()
		git({ root: origin, args: ['remote', 'add', 'origin', 'https://example.com/x.git'] })

		const { result, asked } = host({ lines: [OK], cwd: origin })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('example.com')
		expect(asked).toEqual([])
	})

	it('no origin and no --vendor → the error names the missing origin and the key host', () => {
		const { result } = host({ lines: [OK], cwd: createScratchRepository() })

		expect(result.output).toContain('no remote origin')
		expect(result.output).toContain('`host`')
	})

	it('plain doctor and --brief → the host lines are never asked for', () => {
		write('package.json', JSON.stringify({ name: 'app', dependencies: {} }))
		const asked: string[] = []
		function hostLines(): HostLine[] {
			asked.push('asked')
			return [ERROR]
		}

		runDoctor({ argv: [], cwd: app, dialecteRoot: undefined, cliVersion: '0.2.0', hostLines })
		runDoctor({
			argv: ['--brief'],
			cwd: app,
			dialecteRoot: undefined,
			cliVersion: '0.2.0',
			hostLines,
		})

		expect(asked).toEqual([])
	})
})
