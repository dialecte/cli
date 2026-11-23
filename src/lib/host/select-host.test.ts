/** Where the vendor is picked: per call from the repository's origin (real git), then the ssh alias, then the key `host`. */
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { createConfigWorkspace } from '../../../test/config-workspace.ts'
import { createScratchRepository, git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { takeRefusingGhCalls } from '../../../test/suite-guard/refusing-gh.ts'
import {
	createHost,
	hostNounsOf,
	hostnameOfSshConfig,
	memoisedLookup,
	vendorOf,
} from './select-host.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HostAdapter } from './host.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A scratch repository with `origin` as its origin (none when null). */
function repositoryWith(origin: string | null): string {
	const root = createScratchRepository()
	if (origin !== null) git({ root, args: ['remote', 'add', 'origin', origin] })
	return root
}

/** The two reads the selection may make, answered as given and recorded. */
function recordedSeams(params: { hostname?: string; key?: string }) {
	const ssh: string[] = []
	const key: string[] = []
	return {
		ssh,
		key,
		sshHostname: ({ alias }: { alias: string }) => (ssh.push(alias), params.hostname),
		readHostKey: ({ root }: { root: string }) => (key.push(root), params.key),
	}
}

describe('vendorOf', () => {
	it.each([
		{ name: 'https', origin: 'https://github.com/example/repo.git' },
		{ name: 'https, host in capitals', origin: 'https://GitHub.com/example/repo' },
		{ name: 'scp', origin: 'git@github.com:example/repo.git' },
		{ name: 'ssh url', origin: 'ssh://git@github.com/example/repo.git' },
		{
			name: 'ssh url with the port-443 host',
			origin: 'ssh://git@ssh.github.com:443/example/repo.git',
		},
	])('a github.com origin written as $name → github, no ssh, no key read', ({ origin }) => {
		const seams = recordedSeams({})

		expect([
			vendorOf({ root: repositoryWith(origin), ...seams })?.name,
			seams.ssh,
			seams.key,
		]).toEqual(['github', [], []])
	})

	it.each([
		{
			name: 'an scp alias answering github.com',
			origin: 'git@github:example/repo.git',
			alias: 'github',
			hostname: 'github.com',
			vendor: 'github',
			keyReads: () => [],
		},
		{
			name: 'an ssh-url alias answering github.com',
			origin: 'ssh://git@work-github/example/repo.git',
			alias: 'work-github',
			hostname: 'github.com',
			vendor: 'github',
			keyReads: () => [],
		},
		{
			name: 'an alias answering the port-443 host ssh.github.com',
			origin: 'git@gh443:example/repo.git',
			alias: 'gh443',
			hostname: 'ssh.github.com',
			vendor: 'github',
			keyReads: () => [],
		},
		{
			name: 'an alias answering another host',
			origin: 'git@mirror:example/repo.git',
			alias: 'mirror',
			hostname: 'git.other.example',
			vendor: undefined,
			keyReads: (root: string) => [root],
		},
		{
			name: 'an alias ssh does not answer',
			origin: 'git@nowhere:example/repo.git',
			alias: 'nowhere',
			hostname: undefined,
			vendor: undefined,
			keyReads: (root: string) => [root],
		},
	])('$name → asked once for the alias, the key read only when nothing resolved', (row) => {
		const root = repositoryWith(row.origin)
		const seams = recordedSeams({ hostname: row.hostname })

		expect([vendorOf({ root, ...seams })?.name, seams.ssh, seams.key]).toEqual([
			row.vendor,
			[row.alias],
			row.keyReads(root),
		])
	})

	it.each([
		{
			name: 'https',
			origin: 'https://git.company.com/team/repo.git',
			key: 'github',
			vendor: 'github',
			ssh: [],
			keyReads: (root: string) => [root],
		},
		{
			name: 'scp, ssh asked for the alias',
			origin: 'git@git.company.com:team/repo.git',
			key: 'github',
			vendor: 'github',
			ssh: ['git.company.com'],
			keyReads: (root: string) => [root],
		},
		{
			name: 'a key naming no known vendor',
			origin: 'https://git.company.com/team/repo.git',
			key: 'gitlab',
			vendor: undefined,
			ssh: [],
			keyReads: (root: string) => [root],
		},
		{
			name: 'a github.com origin, the key never read nor re-routing it',
			origin: 'https://github.com/example/repo.git',
			key: 'gitlab',
			vendor: 'github',
			ssh: [],
			keyReads: () => [],
		},
	])('git.company.com ($name) with the key host $key → $vendor', (row) => {
		const root = repositoryWith(row.origin)
		const seams = recordedSeams({ key: row.key })

		expect([vendorOf({ root, ...seams })?.name, seams.ssh, seams.key]).toEqual([
			row.vendor,
			row.ssh,
			row.keyReads(root),
		])
	})

	it.each([
		{ name: 'an unknown host without the key', origin: 'https://git.company.com/team/repo.git' },
		{ name: 'a local-path origin', origin: '/srv/git/repo.git' },
		{ name: 'a file-URL origin', origin: 'file:///srv/git/repo.git' },
		{ name: 'no origin', origin: null },
	])('$name → no vendor, ssh never asked, the key read once', ({ origin }) => {
		const root = repositoryWith(origin)
		const seams = recordedSeams({})

		expect([vendorOf({ root, ...seams }), seams.ssh, seams.key]).toEqual([undefined, [], [root]])
	})

	it('no readHostKey seam → the key host of the personal config.yml is read', () => {
		const workspace = createConfigWorkspace({
			origin: 'https://git.company.com/team/repo.git',
			personal: 'schema: 1\nhost: github\n',
		})
		vi.stubEnv('XDG_CONFIG_HOME', workspace.environment.XDG_CONFIG_HOME)

		expect(vendorOf({ root: workspace.root, sshHostname: () => undefined })?.name).toBe('github')
	})
})

describe('hostnameOfSshConfig', () => {
	it.each([
		{
			name: 'a whole ssh -G output, among lines that merely contain hostname',
			text: readFileSync(new URL('./select-host-ssh-config.txt', import.meta.url), 'utf8'),
			hostname: 'github.com',
		},
		{ name: 'an output with no hostname line', text: 'host x\nport 22\n', hostname: undefined },
		{ name: 'an empty output', text: '', hostname: undefined },
	])('$name → $hostname', ({ text, hostname }) => {
		expect(hostnameOfSshConfig({ text })).toBe(hostname)
	})
})

/** A `gh` first on the PATH that answers one pull request. */
function fakeGhAnswering(): void {
	const folder = temporaryFolder('dialecte-fake-gh-select-')
	const script = join(folder, 'gh')
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s' '{"number":7,"url":"https://host.test/pull/7","title":"t","body":"","state":"OPEN","isDraft":false,"autoMergeRequest":null,"headRefOid":"abc"}'\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
}

/** What `run` answers, or `{ threw }` so a throw is an assertion failure and not an error. */
function answerOrThrown(run: () => unknown): unknown {
	try {
		return run()
	} catch (error) {
		return { threw: error instanceof Error ? error.message : String(error) }
	}
}

describe('createHost', () => {
	it('no method called → nothing read, nothing spawned', () => {
		const seams = recordedSeams({})

		expect([typeof createHost(seams), seams.ssh, seams.key, takeRefusingGhCalls()]).toEqual([
			'object',
			[],
			[],
			[],
		])
	})

	it('the adapter → its methods name the change request, never a vendor noun', () => {
		expect(Object.keys(createHost(recordedSeams({}))).sort()).toEqual([
			'closeChangeRequest',
			'draftChangeRequest',
			'editChangeRequest',
			'linkStack',
			'openChangeRequest',
			'openFiles',
			'probeStacks',
			'queueChangeRequest',
			'queueStack',
			'readChangeRequest',
			'readChecks',
			'readQueueKind',
			'readQueued',
			'readReviewComments',
			'retargetChangeRequest',
		])
	})

	it.each([
		{
			name: 'readChangeRequest',
			call: (host: ReturnType<typeof createHost>, root: string) =>
				host.readChangeRequest({ root, ref: '7' }),
		},
		{
			name: 'readChecks',
			call: (host: ReturnType<typeof createHost>, root: string) =>
				host.readChecks({ root, number: 7 }),
		},
	])(
		'no vendor, $name called → a refusal naming the origin host, the known vendors and the key host',
		({ call }) => {
			const root = repositoryWith('https://git.company.com/team/repo.git')

			expect(call(createHost(recordedSeams({})), root)).toEqual({
				refusal: expect.stringMatching(
					/^(?=.*git\.company\.com)(?=.*github)(?=.*the key `?host`?)/s,
				),
			})
		},
	)

	it('no vendor, probeStacks called → stacks false with why, gh never run', () => {
		const root = repositoryWith('https://git.company.com/team/repo.git')

		expect([createHost(recordedSeams({})).probeStacks({ root }), takeRefusingGhCalls()]).toEqual([
			{ stacks: false, why: expect.stringContaining('git.company.com') },
			[],
		])
	})

	it.each([
		{
			name: 'readChangeRequest',
			call: (host: HostAdapter, root: string) => host.readChangeRequest({ root, ref: '7' }),
			shape: (root: string) => ({ refusal: expect.stringContaining(root) }),
		},
		{
			name: 'closeChangeRequest',
			call: (host: HostAdapter, root: string) => host.closeChangeRequest({ root, number: 7 }),
			shape: (root: string) => ({ refusal: expect.stringContaining(root) }),
		},
		{
			name: 'probeStacks',
			call: (host: HostAdapter, root: string) => host.probeStacks({ root }),
			shape: (root: string) => ({ stacks: false, why: expect.stringContaining(root) }),
		},
	])(
		'a root that no longer exists, $name called → a refusal naming that root, never a throw, nothing spawned',
		({ call, shape }) => {
			const root = temporaryFolder('dialecte-gone-root-')
			rmSync(root, { recursive: true })
			const seams = recordedSeams({})

			expect([
				answerOrThrown(() => call(createHost(seams), root)),
				seams.ssh,
				takeRefusingGhCalls(),
			]).toEqual([shape(root), [], []])
		},
	)

	it('one host over two roots → each call picks its own root vendor, the alias asked once', () => {
		fakeGhAnswering()
		const refusal = { refusal: expect.any(String) }
		const changeRequest = expect.objectContaining({ number: 7, state: 'open' })

		const seams = recordedSeams({ hostname: 'github.com' })

		expect(
			answersOf({
				host: createHost({ sshHostname: seams.sshHostname, readHostKey: () => undefined }),
				noVendor: repositoryWith('https://git.company.com/team/repo.git'),
				aliased: repositoryWith('git@gh-alias:team/repo.git'),
				asked: seams.ssh,
			}),
		).toEqual([refusal, changeRequest, refusal, changeRequest, ['gh-alias']])
	})
})

/** `host` asked A, B, A, B: the four answers, then the aliases ssh was asked for. */
function answersOf(params: {
	host: HostAdapter
	noVendor: string
	aliased: string
	asked: string[]
}) {
	const { host } = params
	return [
		host.readChangeRequest({ root: params.noVendor, ref: '7' }),
		host.readChangeRequest({ root: params.aliased, ref: '7' }),
		host.readChangeRequest({ root: params.noVendor, ref: '7' }),
		host.readChangeRequest({ root: params.aliased, ref: '7' }),
		params.asked,
	]
}

describe('hostNounsOf', () => {
	it.each([
		{
			name: 'a github.com https origin',
			origin: 'https://github.com/example/repo.git',
			nouns: { changeRequestNoun: 'pull request', changeRequestNouns: 'pull requests' },
		},
		{
			name: 'a local-path origin',
			origin: '/srv/git/repo.git',
			nouns: { changeRequestNoun: 'change request', changeRequestNouns: 'change requests' },
		},
		{
			name: 'no origin',
			origin: null,
			nouns: { changeRequestNoun: 'change request', changeRequestNouns: 'change requests' },
		},
	])('$name → its nouns, no ssh asked', ({ origin, nouns }) => {
		const seams = recordedSeams({})

		expect([hostNounsOf({ root: repositoryWith(origin), ...seams }), seams.ssh]).toEqual([
			nouns,
			[],
		])
	})
})

describe('memoisedLookup', () => {
	it('two aliases, the first asked twice → each looked up once, the same answers', () => {
		const asked: string[] = []
		const lookup = memoisedLookup({
			lookup: ({ alias }) => (
				asked.push(alias),
				alias === 'github' ? 'github.com' : 'other.example'
			),
		})

		expect([
			lookup({ alias: 'github' }),
			lookup({ alias: 'github' }),
			lookup({ alias: 'work' }),
			asked,
		]).toEqual(['github.com', 'github.com', 'other.example', ['github', 'work']])
	})

	it('an alias whose lookup answers nothing, asked twice → looked up once', () => {
		const asked: string[] = []
		const lookup = memoisedLookup({ lookup: ({ alias }) => (asked.push(alias), undefined) })

		expect([lookup({ alias: 'gone' }), lookup({ alias: 'gone' }), asked]).toEqual([
			undefined,
			undefined,
			['gone'],
		])
	})
})

describe('hostNounsOf on a folder that does not exist', () => {
	it('a missing root → the generic nouns, nothing thrown, no ssh asked', () => {
		const seams = recordedSeams({})
		const root = join(temporaryFolder('dialecte-gone-root-'), 'gone')

		expect([hostNounsOf({ root, ...seams }), seams.ssh]).toEqual([
			{ changeRequestNoun: 'change request', changeRequestNouns: 'change requests' },
			[],
		])
	})
})
