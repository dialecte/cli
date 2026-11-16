/**
 * The README with the command pages it links (`doc/commands/`: the worktree and lot pages) and the CHANGELOG name the
 * node_modules pool, the trash and `lot close`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { changelogSection } from './newest-changelog-section.ts'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..')

/** The command pages the README links, from the package root. */
const COMMAND_PAGES = join(PACKAGE_ROOT, 'doc', 'commands')

/** The README and every command page, one text. */
function readmeWithCommandPages(): string {
	return [
		join(PACKAGE_ROOT, 'README.md'),
		...readdirSync(COMMAND_PAGES)
			.filter((name) => name.endsWith('.md'))
			.map((name) => join(COMMAND_PAGES, name)),
	]
		.map((path) => readFileSync(path, 'utf8'))
		.join('\n')
}

/** What the text names for each thing this lot adds: a word a reader looks for. */
const NAMED = [
	{ thing: 'the pool', word: '_pool-' },
	{ thing: 'the trash', word: '_trash' },
	{ thing: 'lot close', word: 'lot close' },
] as const

describe('the docs of the worktree pool', () => {
	it.each(NAMED)('the README names $thing ($word)', ({ word }) => {
		expect(readmeWithCommandPages()).toContain(word)
	})

	it.each(NAMED)('the 0.4.0 CHANGELOG section names $thing ($word)', ({ word }) => {
		expect(changelogSection({ root: PACKAGE_ROOT, version: '0.4.0' })).toContain(word)
	})
})
