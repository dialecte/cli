/** The package root a config call reads: the nearest marker folder up to the repository's top level, else that top, else cwd. */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { configRootOf } from './config-root-of.ts'

import { describe, expect, it } from 'vitest'

/** The root answered for `cwd`, or what the stub threw (so a missing implementation fails inside the assertion). */
function rootOf(cwd: string): string {
	try {
		return configRootOf({ cwd })
	} catch (error) {
		return String(error)
	}
}

/** A repository whose top level holds `files` (paths relative to it), with `folders` created; its path. */
function repositoryOf(params: { files?: Record<string, string>; folders?: string[] }): string {
	const root = initializeRepository({
		root: join(temporaryFolder('dialecte-config-root-'), 'repo'),
	})
	writeFiles({ root, files: params.files ?? {} })
	for (const folder of params.folders ?? []) mkdirSync(join(root, folder), { recursive: true })
	return root
}

describe('configRootOf', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the nearest .dialecterc wins over a package.json above it', () => {
		const root = repositoryOf({
			files: { 'package.json': '{}\n', 'packages/app/.dialecterc': 'schema: 1\n' },
			folders: ['packages/app/src'],
		})

		expect(rootOf(join(root, 'packages', 'app', 'src'))).toEqual(join(root, 'packages', 'app'))
	})

	it('a package.json alone, run from a subfolder → the folder holding it', () => {
		const root = repositoryOf({
			files: { 'packages/app/package.json': '{}\n' },
			folders: ['packages/app/src/deep'],
		})

		expect(rootOf(join(root, 'packages', 'app', 'src', 'deep'))).toEqual(
			join(root, 'packages', 'app'),
		)
	})

	it('a repository without either file → its top level', () => {
		const root = repositoryOf({ folders: ['a/b'] })

		expect(rootOf(join(root, 'a', 'b'))).toEqual(root)
	})

	it('outside a repository, no marker on the way → cwd itself', () => {
		const folder = temporaryFolder('dialecte-config-outside-')
		const cwd = join(folder, 'x', 'y')
		mkdirSync(cwd, { recursive: true })

		expect(rootOf(cwd)).toEqual(cwd)
	})

	it('a package.json above the repository top is never taken', () => {
		const outer = temporaryFolder('dialecte-config-above-')
		writeFiles({ root: outer, files: { 'package.json': '{}\n' } })
		const root = initializeRepository({ root: join(outer, 'repo') })
		mkdirSync(join(root, 'sub'), { recursive: true })

		expect(rootOf(join(root, 'sub'))).toEqual(root)
	})
})
