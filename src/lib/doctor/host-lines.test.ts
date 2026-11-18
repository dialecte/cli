/**
 * The host lines: every read of the vendor probed once through the adapter's own code. All seams are injected (the
 * adapter, the runner of the probe-only reads, the version reads), so no test reaches a real `gh`.
 */
import { isDeepStrictEqual } from 'node:util'

import { takeRefusingGhCalls } from '../../../test/suite-guard/refusing-gh.ts'
import { GITHUB_VENDOR } from '../host/github/github-vendor.ts'
import { hostLines } from './host-lines.ts'

import { afterEach, describe, expect, it } from 'vitest'

import type {
	HostAdapter,
	HostCallTable,
	HostDescribe,
	HostToolRun,
	HostLine,
	HostProbe,
	HostSubjectProbe,
	HostVendor,
} from '../host/host.types.ts'

const READS = [
	'listMergedPullRequests',
	'viewPullRequest',
	'viewChecks',
	'queuedState',
	'reviewComments',
	'stackHelp',
] as const

const PULL_REQUEST = {
	number: 73,
	url: 'https://github.com/example/repo/pull/73',
	title: 'a title',
	body: 'a body',
	state: 'merged',
	draft: false,
	queued: false,
	head: 'abc',
} as const

const REFERENCE = { owner: 'cli', repo: 'cli', number: '15071' }

const COMMENTS =
	'{"id":1,"path":"a.go","line":4,"body":"x","replyTo":null}\n{"id":2,"path":"a.go","line":4,"body":"y","replyTo":1}'

type Answer = { output: string } | { refusal: string }

/** An adapter answering as a healthy host does, for pull request 73 only; `overrides` replace what a row changes. */
function fakeHost(overrides: Partial<HostAdapter> = {}): HostAdapter {
	function refuse(): { refusal: string } {
		return { refusal: 'not probed' }
	}
	return {
		readPullRequest: ({ ref }) => (ref === '73' ? PULL_REQUEST : undefined),
		openPullRequest: refuse,
		editPullRequest: refuse,
		closePullRequest: refuse,
		queuePullRequest: refuse,
		draftPullRequest: refuse,
		readQueued: ({ number }) =>
			number === 73 ? { queued: false } : { refusal: `gh api graphql: no pull request ${number}` },
		readChecks: ({ number }) =>
			number === 73
				? { head: 'abc', state: 'green', failing: [], pending: [] }
				: { refusal: `gh pr view: no pull request ${number}` },
		readReviewComments: refuse,
		openFiles: refuse,
		probeStacks: () => ({ stacks: true }),
		linkStack: refuse,
		queueStack: refuse,
		retargetPullRequest: refuse,
		...overrides,
	}
}

/**
 * The runner of the probe-only reads, answering by call as a healthy gh does; the review comments only for the
 * reference pull request (any other values are refused). `answers` replace a call's output.
 */
function fakeRun(answers: Partial<Record<string, Answer>> = {}): HostToolRun {
	return function run(params) {
		const answer = answers[params.call]
		if (answer !== undefined) return answer
		if (params.call === 'listMergedPullRequests') return { output: '[{"number":73}]' }
		if (params.call === 'reviewComments')
			return isDeepStrictEqual(params.values, REFERENCE)
				? { output: COMMENTS }
				: { refusal: `gh api: asked for ${JSON.stringify(params.values)}` }
		return { refusal: `gh ${params.call}: unexpected` }
	}
}

/** The versions the tool and its extension report; a part given as `absent` is not installed. */
function fakeDescribe(versions: { cli?: string; stack?: string } = {}): HostDescribe {
	return {
		helpOf: () => ({ refusal: 'not probed' }),
		typeOf: () => ({ refusal: 'not probed' }),
		versionOf: function versionOf({ selector }) {
			const version = selector === 'cli' ? (versions.cli ?? '2.104.0') : (versions.stack ?? '0.3.0')
			if (version === 'absent') return { refusal: 'gh stack: unknown command', absent: 'gh-stack' }
			return { raw: `${version}\n`, version }
		},
	}
}

function linesOf(params: {
	host?: HostAdapter
	run?: HostToolRun
	describe?: HostDescribe
	git?: string
}): HostLine[] {
	return hostLines({
		root: process.cwd(),
		vendor: GITHUB_VENDOR,
		host: params.host ?? fakeHost(),
		run: params.run ?? fakeRun(),
		describe: params.describe ?? fakeDescribe(),
		readGitVersion: () => params.git ?? 'git version 2.54.0 (Apple Git-157)',
	})
}

function lineOf(params: { lines: HostLine[]; subject: string }): HostLine | undefined {
	return params.lines.find((line) => line.subject === params.subject)
}

/** The lines of the reads, by read, in the table's order. */
function readStatuses(lines: HostLine[]): [string, string | undefined][] {
	return READS.map((read) => [read, lineOf({ lines, subject: read })?.status])
}

afterEach(() => {
	// no row reaches the suite's refusing gh: every read goes through an injected seam
	expect(takeRefusingGhCalls()).toEqual([])
})

describe('hostLines, the reads', () => {
	it('every read answering → exactly one ok line per read of the table, none other than ok', () => {
		const lines = linesOf({})

		expect(readStatuses(lines)).toEqual(READS.map((read) => [read, 'ok']))
		expect(
			lines.map((line) => line.subject).filter((subject) => READS.some((read) => read === subject)),
		).toHaveLength(READS.length)
		expect(lines.filter((line) => line.status !== 'ok')).toEqual([])
	})

	it.each([
		{
			label: 'listing the merged pull requests refused by gh',
			read: 'listMergedPullRequests',
			run: { listMergedPullRequests: { refusal: 'gh pr list: HTTP 502' } },
			detail: 'gh pr list: HTTP 502',
		},
		{
			label: 'the review comments refused by gh',
			read: 'reviewComments',
			run: { reviewComments: { refusal: 'gh api: HTTP 403' } },
			detail: 'gh api: HTTP 403',
		},
		{
			label: 'the pull request read refused',
			read: 'viewPullRequest',
			host: { readPullRequest: () => ({ refusal: 'gh pr view: unknown field' }) },
			detail: 'gh pr view: unknown field',
		},
		{
			label: 'the checks read refused',
			read: 'viewChecks',
			host: { readChecks: () => ({ refusal: 'gh pr view: no head' }) },
			detail: 'gh pr view: no head',
		},
		{
			label: 'the queued read refused',
			read: 'queuedState',
			host: { readQueued: () => ({ refusal: 'gh api graphql: not the JSON it writes' }) },
			detail: 'gh api graphql: not the JSON it writes',
		},
	] satisfies {
		label: string
		read: string
		run?: Record<string, { refusal: string }>
		host?: Partial<HostAdapter>
		detail: string
	}[])('$label → an error line carrying gh’s first line', ({ read, run, host, detail }) => {
		const lines = linesOf({ run: fakeRun(run), host: fakeHost(host) })

		expect(lineOf({ lines, subject: read })).toMatchObject({ status: 'error' })
		expect(lineOf({ lines, subject: read })?.detail).toContain(detail)
	})

	it('the no-pull-request read of a branch that cannot exist answering a refusal (its text changed) → an error line naming it', () => {
		const host = fakeHost({
			readPullRequest: ({ ref }) =>
				ref === '73' ? PULL_REQUEST : { refusal: 'gh pr view: Could not resolve to a branch' },
		})

		const line = lineOf({ lines: linesOf({ host }), subject: 'viewPullRequest' })

		expect(line?.status).toBe('error')
		expect(line?.detail).toMatch(/no pull request/i)
	})

	it.each([
		{
			label: 'the reference comments holding no reply',
			output: '{"id":1,"path":"a.go","line":4,"body":"x","replyTo":null}',
		},
		{
			label: 'the reference comments holding replies but no line',
			output:
				'{"id":1,"path":"a.go","line":null,"body":"x","replyTo":null}\n{"id":2,"path":"a.go","line":null,"body":"y","replyTo":1}',
		},
	])('$label → an error line saying the review-comment keys changed', ({ output }) => {
		const line = lineOf({
			lines: linesOf({ run: fakeRun({ reviewComments: { output } }) }),
			subject: 'reviewComments',
		})

		expect(line?.status).toBe('error')
		expect(line?.detail).toContain('review-comment keys changed')
	})
})

describe('hostLines, what cannot be probed here', () => {
	it('no merged pull request → one line per read: the subject and the reads that need a pull request warn, the others stay ok, no error', () => {
		const lines = linesOf({ run: fakeRun({ listMergedPullRequests: { output: '[]' } }) })

		expect(readStatuses(lines)).toEqual([
			['listMergedPullRequests', 'warning'],
			['viewPullRequest', 'warning'],
			['viewChecks', 'warning'],
			['queuedState', 'warning'],
			['reviewComments', 'ok'],
			['stackHelp', 'ok'],
		])
		expect(lines.filter((line) => line.status === 'error')).toEqual([])
	})

	it('gh-stack absent → a warning on its read, never an error', () => {
		const lines = linesOf({
			host: fakeHost({ probeStacks: () => ({ stacks: false, why: 'gh stack is not installed' }) }),
			describe: fakeDescribe({ stack: 'absent' }),
		})

		expect(lineOf({ lines, subject: 'stackHelp' })?.status).toBe('warning')
		expect(lines.filter((line) => line.status === 'error')).toEqual([])
	})

	it.each([
		{ label: 'gh', versions: { cli: '2.99.0' }, older: '2.99.0', recorded: '2.104.0' },
		{ label: 'gh-stack', versions: { stack: '0.2.9' }, older: '0.2.9', recorded: '0.3.0' },
	])(
		'$label older than the recorded version (numbers, not text, compared) → a warning naming both, never an error',
		({ versions, older, recorded }) => {
			const lines = linesOf({ describe: fakeDescribe(versions) })

			const warnings = lines.filter((line) => line.status === 'warning')
			expect(warnings).toHaveLength(1)
			expect(warnings[0]?.detail).toContain(older)
			expect(warnings[0]?.detail).toContain(recorded)
			expect(lines.filter((line) => line.status === 'error')).toEqual([])
		},
	)
})

describe('hostLines, the versions', () => {
	it('gh newer than the recorded version → an ok line naming both versions', () => {
		const lines = linesOf({ describe: fakeDescribe({ cli: '2.105.0' }) })

		const named = lines.filter(
			(line) => line.detail.includes('2.105.0') && line.detail.includes('2.104.0'),
		)
		expect(named.map((line) => line.status)).toEqual(['ok'])
		expect(lines.filter((line) => line.status !== 'ok')).toEqual([])
	})

	it('git below the floor → an error line carrying the version line', () => {
		const lines = linesOf({ git: 'git version 2.37.9' })

		const errors = lines.filter((line) => line.status === 'error')
		expect(errors).toHaveLength(1)
		expect(errors[0]?.detail).toContain('git version 2.37.9')
	})

	it('git at the floor → an ok line carrying the version, no line other than ok', () => {
		const lines = linesOf({ git: 'git version 2.38.0' })

		expect(
			lines.filter((line) => line.detail.includes('2.38.0')).map((line) => line.status),
		).toEqual(['ok'])
		expect(lines.filter((line) => line.status !== 'ok')).toEqual([])
	})
})

describe('a vendor whose table has a read without a probe', () => {
	const calls = {
		first: { words: ['first'], flags: [], kind: 'read' },
		second: { words: ['second'], flags: [], kind: 'read' },
		third: { words: ['third'], flags: [], kind: 'write' },
	} as const satisfies HostCallTable
	function probe(): ReturnType<HostProbe> {
		return { status: 'ok', subject: 'x', detail: 'x' }
	}
	function find(): ReturnType<HostSubjectProbe> {
		return { line: { status: 'ok', subject: 'x', detail: 'x' } }
	}
	const base = {
		name: 'github',
		tool: 'tool',
		remoteHosts: [],
		calls,
		recordedVersions: {},
		subject: { call: 'first', find },
		createAdapter: fakeHost,
	} as const

	it('misses a non-subject read → a compile error; one probe per other read (the subject and a write need none) → compiles', () => {
		const complete: HostVendor<typeof calls, 'first'> = { ...base, probes: { second: probe } }
		const missing: HostVendor<typeof calls, 'first'> = {
			...base,
			// @ts-expect-error `second` is a read other than the subject, with no probe
			probes: {},
		}

		expect([complete.probes.second, missing.name]).toEqual([probe, 'github'])
	})

	it('a write as the subject → a compile error', () => {
		const writeSubject: HostVendor<typeof calls, 'third'> = {
			...base,
			// @ts-expect-error a write subject
			subject: { call: 'third', find },
			probes: { first: probe, second: probe },
		}

		expect(writeSubject.subject.call).toBe('third')
	})
})
