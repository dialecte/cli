/**
 * The GitHub adapter takes a pull request back out of the queue (R1-16): an approval is for one head, so a push that
 * moves it turns auto-merge off and makes the pull request a draft again; a stack queued by `lot approve` is made
 * ready first. A fake `gh` on the PATH appends each call's arguments, one call per line.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { createGithubHost } from './github-host.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A `gh` first on the PATH that answers 0 and appends its arguments, space-joined, to `gh.calls`. */
function fakeGh(): string {
	const folder = temporaryFolder('dialecte-fake-gh-draft-')
	const script = join(folder, 'gh')
	writeFileSync(script, `#!/bin/sh\necho "$*" >> '${join(folder, 'gh.calls')}'\nexit 0\n`)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

/** The calls the fake `gh` was given, in order; none when it was never run. */
function callsOf(folder: string): string[] {
	const file = join(folder, 'gh.calls')
	return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []
}

describe('createGithubHost: draftPullRequest', () => {
	it.each([
		{
			label: 'a queued ready pull request → auto-merge turned off, then made a draft',
			queued: true,
			draft: false,
			calls: ['pr merge 7 --disable-auto', 'pr ready 7 --undo'],
		},
		{
			label: 'a ready pull request not queued → made a draft only',
			queued: false,
			draft: false,
			calls: ['pr ready 7 --undo'],
		},
		{
			label: 'a queued draft → auto-merge turned off only',
			queued: true,
			draft: true,
			calls: ['pr merge 7 --disable-auto'],
		},
		{
			label: 'a draft not queued → nothing asked of the host',
			queued: false,
			draft: true,
			calls: [],
		},
	])('$label', ({ queued, draft, calls }) => {
		const folder = fakeGh()

		const drafted = createGithubHost().draftPullRequest({
			root: process.cwd(),
			number: 7,
			queued,
			draft,
		})

		expect({ drafted, calls: callsOf(folder) }).toEqual({ drafted: undefined, calls })
	})

	it.each([
		{
			label: 'queueStack of a draft → made ready, then the stack merged up to it',
			draft: true,
			calls: ['pr ready 7', 'stack merge 7 --yes --squash'],
		},
	])('$label', ({ draft, calls }) => {
		const folder = fakeGh()

		const queued = createGithubHost().queueStack({ root: process.cwd(), number: 7, draft })

		expect({ queued, calls: callsOf(folder) }).toEqual({ queued: undefined, calls })
	})
})
