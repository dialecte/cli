import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { worktreeCli } from './worktree-cli.ts'

import { afterEach, describe, expect, it } from 'vitest'

const REPOSITORY_ROOT = join(import.meta.dirname, '..', '..', '..')

const folders: string[] = []

afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A worktree folder; `installed` is the package.json of node_modules/@dialecte/cli, `own` its own package.json. */
function makeWorktree(params: { installed?: object; own?: object }): string {
	const worktree = mkdtempSync(join(tmpdir(), 'worktree-cli-'))
	folders.push(worktree)
	if (params.installed !== undefined) {
		const installedFolder = join(worktree, 'node_modules', '@dialecte', 'cli')
		mkdirSync(installedFolder, { recursive: true })
		writeFileSync(join(installedFolder, 'package.json'), JSON.stringify(params.installed))
	}
	if (params.own !== undefined)
		writeFileSync(join(worktree, 'package.json'), JSON.stringify(params.own))
	return worktree
}

type Row = {
	name: string
	build: () => string
	expected: { version: string; stepEvents: boolean } | null | undefined
}

const ROWS: Row[] = [
	{
		name: 'an installed cli without a dialecte block → its version, stepEvents false',
		build: () => makeWorktree({ installed: { name: '@dialecte/cli', version: '0.3.1' } }),
		expected: { version: '0.3.1', stepEvents: false },
	},
	{
		name: 'an installed cli with stepEvents 1 → stepEvents true',
		build: () =>
			makeWorktree({
				installed: { name: '@dialecte/cli', version: '0.5.0', dialecte: { stepEvents: 1 } },
			}),
		expected: { version: '0.5.0', stepEvents: true },
	},
	{
		name: 'an installed cli with stepEvents 2 → stepEvents true (1 or higher)',
		build: () =>
			makeWorktree({
				installed: { name: '@dialecte/cli', version: '0.9.0', dialecte: { stepEvents: 2 } },
			}),
		expected: { version: '0.9.0', stepEvents: true },
	},
	{
		name: 'an installed cli with stepEvents 0 → stepEvents false',
		build: () =>
			makeWorktree({
				installed: { name: '@dialecte/cli', version: '0.2.0', dialecte: { stepEvents: 0 } },
			}),
		expected: { version: '0.2.0', stepEvents: false },
	},
	{
		name: 'an installed cli whose dialecte block has no stepEvents → stepEvents false',
		build: () =>
			makeWorktree({
				installed: {
					name: '@dialecte/cli',
					version: '0.4.0',
					dialecte: { profile: 'contributor' },
				},
			}),
		expected: { version: '0.4.0', stepEvents: false },
	},
	{
		name: 'the cli repository itself with stepEvents 1 → read from its own package.json',
		build: () =>
			makeWorktree({
				own: { name: '@dialecte/cli', version: '0.6.0', dialecte: { stepEvents: 1 } },
			}),
		expected: { version: '0.6.0', stepEvents: true },
	},
	{
		name: 'the cli repository itself without the capability → stepEvents false',
		build: () => makeWorktree({ own: { name: '@dialecte/cli', version: '0.4.0' } }),
		expected: { version: '0.4.0', stepEvents: false },
	},
	{
		name: "the own package.json names another package and the cli is installed → the installed cli's answer",
		build: () =>
			makeWorktree({
				own: { name: 'some-package', version: '1.0.0', dialecte: { stepEvents: 1 } },
				installed: { name: '@dialecte/cli', version: '0.3.1' },
			}),
		expected: { version: '0.3.1', stepEvents: false },
	},
	{
		name: 'an installed cli with stepEvents "1" as a string → stepEvents false',
		build: () =>
			makeWorktree({
				installed: { name: '@dialecte/cli', version: '0.5.0', dialecte: { stepEvents: '1' } },
			}),
		expected: { version: '0.5.0', stepEvents: false },
	},
	{
		name: 'a worktree whose own package.json is another package → null',
		build: () => makeWorktree({ own: { name: 'some-package', version: '1.0.0' } }),
		expected: null,
	},
	{
		name: 'a worktree that exists and holds no package.json → null',
		build: () => makeWorktree({}),
		expected: null,
	},
	{
		name: 'a worktree folder that is gone → undefined',
		build: () => join(makeWorktree({}), 'gone'),
		expected: undefined,
	},
]

describe('worktreeCli', () => {
	for (const row of ROWS) {
		it(row.name, { timeout: STORE_CASE_TIMEOUT }, () => {
			const worktree = row.build()

			expect(worktreeCli({ worktree })).toEqual(row.expected)
		})
	}
})

describe('the cli package.json', () => {
	it('stepEvents → the cli declares the capability 1', () => {
		const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as {
			dialecte?: { stepEvents?: number }
		}

		expect(manifest.dialecte?.stepEvents).toBe(1)
	})
})
