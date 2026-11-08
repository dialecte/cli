import { join } from 'node:path'

import { reachFrom } from './import-reach.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { writeRecordFile } from './store-records.ts'
import { STORE_CASE_TIMEOUT } from './test-timing.constants.ts'
import { thrownBy } from './thrown-by.ts'

import { describe, expect, it } from 'vitest'

/** A folder of modules `name → source`. */
function modulesOf(sources: Record<string, string>): string {
	const folder = temporaryFolder('dialecte-reach-')
	for (const [name, text] of Object.entries(sources)) writeRecordFile({ folder, name, text })
	return folder
}

describe('reachFrom', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('node:child_process two hops away -> the module that imports it is caught', () => {
		const folder = modulesOf({
			'a.ts': "import { b } from './b.ts'\n",
			'b.ts': "export { c } from './c.ts'\n",
			'c.ts': "import { spawn } from 'node:child_process'\n",
		})

		expect(reachFrom(join(folder, 'a.ts'))).toEqual({
			files: [join(folder, 'a.ts'), join(folder, 'b.ts'), join(folder, 'c.ts')],
			childProcessImporters: [join(folder, 'c.ts')],
		})
	})

	it('child_process without the node: prefix, a multi-line import and a dynamic import -> all caught', () => {
		const folder = modulesOf({
			'a.ts': "import {\n\ta,\n\tb,\n} from './b.ts'\nconst c = import('./c.ts')\n",
			'b.ts': "import { spawn } from 'child_process'\n",
			'c.ts': "import { fork } from 'node:child_process'\n",
		})

		expect(reachFrom(join(folder, 'a.ts')).childProcessImporters).toEqual([
			join(folder, 'b.ts'),
			join(folder, 'c.ts'),
		])
	})

	it('import type and export type ... from -> not followed', () => {
		const folder = modulesOf({
			'a.ts': "import type { X } from './gone.ts'\nexport type { Y } from './gone-too.ts'\n",
		})

		expect(reachFrom(join(folder, 'a.ts'))).toEqual({
			files: [join(folder, 'a.ts')],
			childProcessImporters: [],
		})
	})

	it('a relative import that resolves to no file -> a failure naming the importer and the specifier', () => {
		const folder = modulesOf({ 'a.ts': "import { x } from './missing.ts'\n" })

		expect(thrownBy(() => reachFrom(join(folder, 'a.ts')))?.message).toMatch(
			/a\.ts imports \.\/missing\.ts/,
		)
	})

	it('a package import and a module imported twice -> not followed, reached once', () => {
		const folder = modulesOf({
			'a.ts':
				"import { x } from 'vitest'\nimport { b } from './b.ts'\nimport { c } from './c.ts'\n",
			'b.ts': "import { d } from './d.ts'\n",
			'c.ts': "import { d } from './d.ts'\n",
			'd.ts': 'export const d = 1\n',
		})

		expect(reachFrom(join(folder, 'a.ts')).files).toEqual(
			['a.ts', 'b.ts', 'c.ts', 'd.ts'].map((name) => join(folder, name)),
		)
	})
})
