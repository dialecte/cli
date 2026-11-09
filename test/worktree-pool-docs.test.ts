/** The README and the CHANGELOG name the node_modules pool, the trash and `lot close`. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { newestChangelogSection } from './newest-changelog-section.ts'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..')

/** What the text names for each thing this lot adds: a word a reader looks for. */
const NAMED = [
	{ thing: 'the pool', word: '_pool-' },
	{ thing: 'the trash', word: '_trash' },
	{ thing: 'lot close', word: 'lot close' },
] as const

describe('the docs of the worktree pool', () => {
	it.each(NAMED)('the README names $thing ($word)', ({ word }) => {
		expect(readFileSync(join(PACKAGE_ROOT, 'README.md'), 'utf8')).toContain(word)
	})

	it.each(NAMED)('the newest CHANGELOG section names $thing ($word)', ({ word }) => {
		expect(newestChangelogSection({ root: PACKAGE_ROOT })).toContain(word)
	})
})
