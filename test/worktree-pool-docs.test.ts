/** The README and the CHANGELOG name the node_modules pool, the trash and `lot close`. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..')

/** What the text names for each thing this lot adds: a word a reader looks for. */
const NAMED = [
	{ thing: 'the pool', word: '_pool-' },
	{ thing: 'the trash', word: '_trash' },
	{ thing: 'lot close', word: 'lot close' },
] as const

/** The `## [Unreleased]` section of the changelog: up to the next version heading. */
function unreleasedSection(): string {
	const changelog = readFileSync(join(PACKAGE_ROOT, 'CHANGELOG.md'), 'utf8')
	const start = changelog.indexOf('## [Unreleased]')
	const next = changelog.indexOf('\n## [', start + 1)
	return changelog.slice(start, next === -1 ? undefined : next)
}

describe('the docs of the worktree pool', () => {
	it.each(NAMED)('the README names $thing ($word)', ({ word }) => {
		expect(readFileSync(join(PACKAGE_ROOT, 'README.md'), 'utf8')).toContain(word)
	})

	it.each(NAMED)('the CHANGELOG [Unreleased] names $thing ($word)', ({ word }) => {
		expect(unreleasedSection()).toContain(word)
	})
})
