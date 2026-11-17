/**
 * `isCiFirstRepository` on scratch folders: a repository is CI-first when its `ci.yml` runs on the merge queue
 * (`merge_group`) and holds the `ci-ok` job the queue's ruleset requires; anything else keeps the hand-over flow.
 */
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { isCiFirstRepository } from './ci-first.ts'

import { describe, expect, it } from 'vitest'

const CI_PATH = '.github/workflows/ci.yml'

describe('isCiFirstRepository', () => {
	it.each<{ name: string; files: Record<string, string>; ciFirst: boolean }>([
		{
			name: 'ci.yml with merge_group and a ci-ok job → CI-first',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on:',
					'  pull_request:',
					'    branches:',
					'      - main',
					'  merge_group:',
					'jobs:',
					'  check:',
					'    runs-on: ubuntu-latest',
					'  ci-ok:',
					'    name: ci-ok',
					'    needs:',
					'      - check',
					'',
				].join('\n'),
			},
			ciFirst: true,
		},
		{
			name: 'ci.yml without merge_group → not CI-first',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on:',
					'  pull_request:',
					'jobs:',
					'  ci-ok:',
					'    name: ci-ok',
					'',
				].join('\n'),
			},
			ciFirst: false,
		},
		{
			name: 'ci.yml without a ci-ok job → not CI-first',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on:',
					'  merge_group:',
					'jobs:',
					'  check:',
					'    runs-on: ubuntu-latest',
					'',
				].join('\n'),
			},
			ciFirst: false,
		},
		{
			name: 'no workflows folder → not CI-first',
			files: { 'package.json': '{ "name": "demo" }\n' },
			ciFirst: false,
		},
		{
			name: 'ci.yml that is no YAML → not CI-first',
			files: { [CI_PATH]: 'on: [merge_group\njobs: {ci-ok\n' },
			ciFirst: false,
		},
		{
			name: 'merge_group in the list form of on → CI-first',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on: [pull_request, merge_group]',
					'jobs:',
					'  ci-ok:',
					'    name: ci-ok',
					'',
				].join('\n'),
			},
			ciFirst: true,
		},
	])('$name', ({ files, ciFirst }) => {
		const root = temporaryFolder('dialecte-ci-first-')
		writeFiles({ root, files })

		expect(isCiFirstRepository(root)).toBe(ciFirst)
	})
})
