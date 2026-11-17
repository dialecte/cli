/**
 * The scope run's temporary folder never outlives the run: removed when the run cannot start, and on a signal that
 * ends the process while no step child runs (no process group watched).
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { signalChildScript } from '../../../test/signal-child.ts'
import { createScopeRun } from './selection.ts'

import { describe, expect, it } from 'vitest'

const SELECTION_SOURCE = join(import.meta.dirname, 'selection.ts')

/** A scratch repository and the scope of its HEAD against itself. */
function scratchScope(): { root: string; scope: { base: string; tree: string } } {
	const root = createScratchRepository()
	const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	return { root, scope: { base: head, tree: head } }
}

describe('a scope run that cannot start', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('its changed file cannot be written → the error thrown and its folder removed', () => {
		const written: string[] = []

		expect(() =>
			createScopeRun({
				...scratchScope(),
				writeChanged: function refuse(path) {
					written.push(path)
					throw new Error('disk full')
				},
			}),
		).toThrow('disk full')
		expect(written.map((path) => existsSync(dirname(path)))).toEqual([false])
	})

	it('its changed file cannot be written → no signal listener left behind', () => {
		const before = process.listenerCount('SIGTERM')

		expect(() =>
			createScopeRun({
				...scratchScope(),
				writeChanged: function refuse() {
					throw new Error('disk full')
				},
			}),
		).toThrow('disk full')
		expect(process.listenerCount('SIGTERM')).toBe(before)
	})
})

describe('a scope run and a signal', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('SIGTERM while no step child runs → the folder is removed and the process ends by SIGTERM', async () => {
		const { root, scope } = scratchScope()

		const ended = await signalChildScript({
			script: `import { createScopeRun } from ${JSON.stringify(SELECTION_SOURCE)}
const run = createScopeRun({ root: ${JSON.stringify(root)}, scope: ${JSON.stringify(scope)} })
console.log('folder ' + run.folder)
console.log('ready')
setInterval(function keepRunning() {}, 1000)
`,
			signal: 'SIGTERM',
			timeoutMs: 20_000,
		})

		const folders = ended.lines
			.filter((line) => line.startsWith('folder '))
			.map((line) => line.slice(7))
		expect({
			signal: ended.signal,
			folders: folders.length,
			left: folders.filter((folder) => existsSync(folder)),
		}).toEqual({ signal: 'SIGTERM', folders: 1, left: [] })
	})
})
