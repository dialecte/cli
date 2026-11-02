import { join } from 'node:path'

import { SMALL_CASE_TIMEOUT } from '../../test/mutation-package.constants.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import config from '../../tsup.config.ts'
import { ignorerPluginPath } from './mutants.ts'

import { describe, expect, it } from 'vitest'

import type { Options } from 'tsup'

describe('the ignorer plugin path', { timeout: SMALL_CASE_TIMEOUT }, () => {
	it('a dist folder → the built ignorers.js in it, never the .ts source', () => {
		expect(ignorerPluginPath({ distFolder: join('/opt', 'cli', 'dist') })).toBe(
			join('/opt', 'cli', 'dist', 'ignorers.js'),
		)
	})

	it('tsup builds src/lib/mutation/ignorers.ts as the entry "ignorers", so the file is there', async () => {
		const outDir = temporaryFolder('dialecte-tsup-out-')
		const configs: Options[] = [
			typeof config === 'function' ? await config({ outDir }) : config,
		].flat()

		expect(
			configs.some(
				(entry) =>
					typeof entry.entry === 'object' &&
					!Array.isArray(entry.entry) &&
					entry.entry['ignorers'] === 'src/lib/mutation/ignorers.ts',
			),
		).toBe(true)
	})
})
