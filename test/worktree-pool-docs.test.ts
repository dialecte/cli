/**
 * The command pages (`doc/commands/`: the worktree and lot pages), in their hand-written text, and the CHANGELOG name
 * the node_modules pool, the trash and `lot close`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { BLOCK_END, BLOCK_START } from '../src/lib/command-map/command-reference.constants.ts'
import { changelogSection } from './newest-changelog-section.ts'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..')

/** The command pages the README links, from the package root. */
const COMMAND_PAGES = join(PACKAGE_ROOT, 'doc', 'commands')

/** A command page (its command's name) without its generated block: the text written by hand. */
function handWrittenTextOf(params: { page: string }): string {
	const text = readFileSync(join(COMMAND_PAGES, `${params.page}.md`), 'utf8')
	const start = text.indexOf(BLOCK_START)
	const end = text.indexOf(BLOCK_END)
	if (start < 0 || end < start) return text
	return `${text.slice(0, start)}${text.slice(end + BLOCK_END.length)}`
}

/** What the text names for each thing this lot adds: a word a reader looks for. */
const NAMED = [
	{ thing: 'the pool', word: '_pool-' },
	{ thing: 'the trash', word: '_trash' },
	{ thing: 'lot close', word: 'lot close' },
] as const

/** The page whose hand-written text names each thing. */
const ON_PAGES = [
	{ thing: 'the pool', word: '_pool-', page: 'worktree' },
	{ thing: 'the trash', word: '_trash', page: 'worktree' },
	{ thing: 'lot close', word: 'lot close', page: 'lot' },
] as const

describe('the docs of the worktree pool', () => {
	it.each(ON_PAGES)(
		'the hand-written text of the $page command page names $thing ($word)',
		({ word, page }) => {
			expect(handWrittenTextOf({ page })).toContain(word)
		},
	)

	it.each(NAMED)('the 0.4.0 CHANGELOG section names $thing ($word)', ({ word }) => {
		expect(changelogSection({ root: PACKAGE_ROOT, version: '0.4.0' })).toContain(word)
	})
})
