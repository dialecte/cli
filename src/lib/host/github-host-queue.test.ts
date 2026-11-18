/**
 * The fields the GitHub adapter asks `gh pr view --json` for are fields gh has (a field gh rejects fails every read),
 * and whether a pull request is queued is read through one GraphQL query: auto-merge on, or in the merge queue, which
 * `gh pr view` cannot say. A fake `gh` on the PATH answers as the real one does.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { createGithubHost } from './github-host.ts'
import { CHECKS_FIELDS, GH_PR_VIEW_FIELDS, PULL_REQUEST_FIELDS } from './host.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A `gh` first on the PATH that prints `stdout` and writes its arguments to `gh.args`, one per line. */
function fakeGh(stdout: string): string {
	const folder = temporaryFolder('dialecte-fake-gh-queue-')
	const script = join(folder, 'gh')
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, 'gh.args')}'\nprintf '%s' '${stdout}'\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

describe('the fields asked of gh pr view', () => {
	it.each([
		{ label: 'PULL_REQUEST_FIELDS', fields: PULL_REQUEST_FIELDS },
		{ label: 'CHECKS_FIELDS', fields: CHECKS_FIELDS },
	])('$label → every field one gh pr view --json takes', ({ fields }) => {
		const known: readonly string[] = GH_PR_VIEW_FIELDS.fields
		const unknown = fields.split(',').filter((field) => !known.includes(field))

		expect(unknown).toEqual([])
	})
})

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
