/**
 * Whether a pull request is queued is read through one GraphQL query: auto-merge on, or in the merge queue, which
 * `gh pr view` cannot say. A fake `gh` on the PATH answers as the real one does (the fields it asks `gh pr view` for
 * are proven by the contract check, `host-contract.test.ts`).
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { createGithubHost } from './github-host.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * A `gh` first on the PATH that prints `stdout` and writes its arguments to `gh.args`, one per line; with `failure`, it
 * writes that to stderr instead and exits 1.
 */
function fakeGh(stdout: string, failure?: string): string {
	const folder = temporaryFolder('dialecte-fake-gh-queue-')
	const script = join(folder, 'gh')
	const answer =
		failure === undefined
			? `printf '%s' '${stdout}'\n`
			: `printf '%s\\n' '${failure}' >&2\nexit 1\n`
	writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, 'gh.args')}'\n${answer}`)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

describe('createGithubHost: readQueued', () => {
	it.each([
		{
			label: 'auto-merge on → queued',
			stdout: '{"isInMergeQueue":false,"autoMergeRequest":{"enabledAt":"x"}}',
			queued: true,
		},
		{
			label: 'in the merge queue without auto-merge (a stack merge) → queued',
			stdout: '{"isInMergeQueue":true,"autoMergeRequest":null}',
			queued: true,
		},
		{
			label: 'neither → not queued',
			stdout: '{"isInMergeQueue":false,"autoMergeRequest":null}',
			queued: false,
		},
	])('$label', ({ stdout, queued }) => {
		const folder = fakeGh(stdout)

		const read = createGithubHost().readQueued({ root: process.cwd(), number: 7 })
		const argsFile = join(folder, 'gh.args')
		const args = existsSync(argsFile) ? readFileSync(argsFile, 'utf8').trim().split('\n') : []

		expect({ read, asked: args.slice(0, 2), number: args.includes('number=7') }).toEqual({
			read: { queued },
			asked: ['api', 'graphql'],
			number: true,
		})
	})

	it('an answer that is not the JSON gh writes → a refusal naming the call', () => {
		fakeGh('not json')

		expect(createGithubHost().readQueued({ root: process.cwd(), number: 7 })).toEqual({
			refusal: 'gh api graphql: not the JSON it writes: not json',
		})
	})
})

describe('createGithubHost: readQueued argv', () => {
	it.each([
		{
			label: 'the owner and repo left to gh, the number and the query, the filter last',
			args: [
				'api',
				'graphql',
				'-F',
				'owner={owner}',
				'-F',
				'repo={repo}',
				'-F',
				'number=7',
				'-f',
				'query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){isInMergeQueue autoMergeRequest{enabledAt}}}}',
				'--jq',
				'.data.repository.pullRequest',
			],
		},
	])('$label', ({ args }) => {
		const folder = fakeGh('{}')

		createGithubHost().readQueued({ root: process.cwd(), number: 7 })

		expect(readFileSync(join(folder, 'gh.args'), 'utf8').trimEnd().split('\n')).toEqual(args)
	})
})

describe('createGithubHost: readQueueKind', () => {
	it.each([
		{
			label: 'the base has a merge queue → queue, named merge queue',
			stdout: '{"autoMergeAllowed":true,"pullRequest":{"isMergeQueueEnabled":true}}',
			read: { kind: 'queue', noun: 'merge queue' },
		},
		{
			label: 'auto-merge allowed, no merge queue → auto-merge',
			stdout: '{"autoMergeAllowed":true,"pullRequest":{"isMergeQueueEnabled":false}}',
			read: { kind: 'auto-merge', noun: 'auto-merge' },
		},
		{
			label: 'neither → none',
			stdout: '{"autoMergeAllowed":false,"pullRequest":{"isMergeQueueEnabled":false}}',
			read: { kind: 'none', noun: 'no queue' },
		},
		{
			label: 'an answer that is not the JSON gh writes → a refusal naming the call',
			stdout: 'not json',
			read: { refusal: 'gh api graphql: not the JSON it writes: not json' },
		},
	])('$label', ({ stdout, read }) => {
		fakeGh(stdout)

		expect(createGithubHost().readQueueKind({ root: process.cwd(), number: 7 })).toEqual(read)
	})

	it('gh failing → a refusal carrying its first line', () => {
		fakeGh('', 'HTTP 502: Bad Gateway')

		expect(createGithubHost().readQueueKind({ root: process.cwd(), number: 7 })).toEqual({
			refusal: expect.stringContaining('HTTP 502: Bad Gateway'),
		})
	})

	it('asks the queue settings query with the number, the filter on the repository', () => {
		const folder = fakeGh('{}')

		createGithubHost().readQueueKind({ root: process.cwd(), number: 7 })
		const argsFile = join(folder, 'gh.args')

		expect(
			existsSync(argsFile) ? readFileSync(argsFile, 'utf8').trimEnd().split('\n') : [],
		).toEqual([
			'api',
			'graphql',
			'-F',
			'owner={owner}',
			'-F',
			'repo={repo}',
			'-F',
			'number=7',
			'-f',
			'query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){autoMergeAllowed pullRequest(number:$number){isMergeQueueEnabled}}}',
			'--jq',
			'.data.repository',
		])
	})
})
