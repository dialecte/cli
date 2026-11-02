/**
 * tsup builds the configs of `tsup.config.ts` at once: a config that empties the output folder when its own build
 * starts can delete what another one already wrote (the tdd reporter, under load). The config empties the folder
 * once, before any build, and no build config cleans.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import config from '../tsup.config.ts'
import { temporaryFolder } from './scratch-repository.ts'

import { describe, expect, it } from 'vitest'

import type { Options } from 'tsup'

describe('tsup.config.ts', () => {
	it('the folder it builds into → emptied once, before any build; no build config cleans', async () => {
		const outDir = temporaryFolder('dialecte-tsup-out-')
		writeFileSync(join(outDir, 'stale.js'), '')

		const configs: Options[] = [
			typeof config === 'function' ? await config({ outDir }) : config,
		].flat()

		expect(existsSync(join(outDir, 'stale.js'))).toBe(false)
		expect(configs.map((entry) => entry.clean ?? false)).toEqual([false, false, false])
	})
})
