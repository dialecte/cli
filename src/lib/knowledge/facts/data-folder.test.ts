import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { dataFolder, factsFolder, factsFolderRefusal } from './data-folder.ts'

import { describe, expect, it } from 'vitest'

describe('dataFolder and factsFolder', () => {
	it('XDG_DATA_HOME set → <it>/dialecte/facts, whatever the home', () => {
		expect(factsFolder({ environment: { XDG_DATA_HOME: '/data/x' }, home: '/home/person-a' })).toBe(
			join('/data/x', 'dialecte', 'facts'),
		)
	})

	it.each([
		{ name: 'unset', environment: {} },
		{ name: 'empty', environment: { XDG_DATA_HOME: '' } },
	])('XDG_DATA_HOME $name → <home>/.local/share/dialecte/facts', ({ environment }) => {
		expect(factsFolder({ environment, home: '/home/person-a' })).toBe(
			join('/home/person-a', '.local', 'share', 'dialecte', 'facts'),
		)
	})

	it('XDG_DATA_HOME set → dataFolder is that folder itself', () => {
		expect(dataFolder({ environment: { XDG_DATA_HOME: '/data/x' }, home: '/home/person-a' })).toBe(
			'/data/x',
		)
	})
})

describe('factsFolderRefusal', () => {
	/** A scratch folder holding `.git`, as the top of a work tree (symlinks resolved, as the refusal names it). */
	function workTreeTop(): string {
		const top = temporaryFolder('facts-work-tree-')
		mkdirSync(join(top, '.git'))
		return realpathSync(top)
	}

	it('a facts folder inside a work tree → the refusal names the folder, the work tree top and the fix', () => {
		const top = workTreeTop()
		const folder = join(top, 'data', 'dialecte', 'facts')
		mkdirSync(folder, { recursive: true })

		expect(factsFolderRefusal({ folder })).toEqual(
			expect.stringMatching(
				new RegExp(`(?=.*${patternOf(folder)})(?=.*${patternOf(top)})(?=.*XDG_DATA_HOME)`, 's'),
			),
		)
	})

	it('a facts folder that does not exist yet under a work tree → refused all the same', () => {
		const top = workTreeTop()
		const folder = join(top, 'not', 'made', 'yet', 'facts')

		expect(factsFolderRefusal({ folder })).toEqual(
			expect.stringMatching(new RegExp(`(?=.*${patternOf(top)})(?=.*XDG_DATA_HOME)`, 's')),
		)
	})

	it('a facts folder reached through a symlink into a work tree → refused, naming the work tree top', () => {
		const top = workTreeTop()
		const target = join(top, 'data')
		mkdirSync(target)
		const outside = temporaryFolder('facts-link-')
		const link = join(outside, 'data-link')
		symlinkSync(target, link, 'dir')

		expect(factsFolderRefusal({ folder: join(link, 'dialecte', 'facts') })).toEqual(
			expect.stringMatching(new RegExp(`(?=.*${patternOf(top)})(?=.*XDG_DATA_HOME)`, 's')),
		)
	})

	it('a facts folder outside every work tree → undefined', () => {
		const folder = join(temporaryFolder('facts-outside-'), 'dialecte', 'facts')

		expect(factsFolderRefusal({ folder })).toBeUndefined()
	})
})

/** A path as a pattern that matches it only. */
function patternOf(path: string): string {
	return path.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
