/** A scratch package folder for the `dialecte ci` tests: no git, the verbs only read and write files. */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { OWN_TEST_PATH, OWN_TEST_WORKFLOW, PLAIN_PACKAGE_JSON } from './ci-package.constants.ts'
import { temporaryFolder, writeFiles } from './scratch-repository.ts'

/**
 * A package folder holding `files`, removed when the test ends. By default a plain package.json and the
 * repository's own `_test.yml`; a `null` value leaves that file out.
 */
export function ciPackage(params: { files?: Partial<Record<string, string | null>> } = {}): string {
	const root = temporaryFolder('dialecte-ci-')
	const files = {
		'package.json': PLAIN_PACKAGE_JSON,
		[OWN_TEST_PATH]: OWN_TEST_WORKFLOW,
		...params.files,
	}
	writeFiles({
		root,
		files: Object.fromEntries(
			Object.entries(files).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string',
			),
		),
	})
	return root
}

/** Each file's text and modification time, by path. */
export function snapshotOf(params: {
	root: string
	paths: readonly string[]
}): Record<string, { text: string; mtime: number }> {
	return Object.fromEntries(
		params.paths.map((path) => {
			const file = join(params.root, path)
			return [path, { text: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs }]
		}),
	)
}
