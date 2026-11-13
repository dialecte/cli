import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { wholeFactOf } from '../../test/fact-check-fixtures.ts'
import { factDraft } from '../../test/fact-fixtures.ts'
import { WIDGET_PACKAGE } from '../../test/installed-test-dialecte.constants.ts'
import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import { createStandardWorkspace, sha256Of, writeTextFile } from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { factCheckOf } from '../lib/knowledge/facts/command-check.ts'
import { standardFilesKey } from '../lib/knowledge/standard/standard-files-key.ts'
import { definitionHash } from '../lib/schema/definition-hash.ts'
import { loadDialectes } from '../lib/schema/load-dialectes.ts'

import { describe, expect, it } from 'vitest'

import type { StandardWorkspace } from '../../test/standard-workspace.types.ts'
import type { Fact } from '../lib/knowledge/facts/facts.types.ts'

const STANDARD_ID = 'example-0000'
const ONE_TEXT = 'The first file.\n'
const TWO_TEXT = 'The second file.\n'
const OTHER_HASH = `sha256:${'0'.repeat(64)}`

/** A workspace whose standard `example-0000` holds two files. */
function workspaceWithStandard(): StandardWorkspace {
	return createStandardWorkspace({
		standards: { [STANDARD_ID]: { 'One.md': ONE_TEXT, 'two.md': TWO_TEXT } },
	})
}

/** The files key of the standard folder as it is on disk now. */
function filesKeyOf(params: { workspace: StandardWorkspace }): string {
	const folder = join(params.workspace.root, STANDARD_ID)
	return standardFilesKey({
		files: readdirSync(folder)
			.filter((name) => name.endsWith('.md'))
			.map((name) => ({
				// a file id is the lowercased name without .md (K1's)
				id: `${STANDARD_ID}/${name.slice(0, -'.md'.length).toLowerCase()}`,
				sha256: sha256Of(readFileSync(join(folder, name), 'utf8')),
			})),
	})
}

/** A valid standard fact whose source records the files key. */
function standardFactOf(params: { files: string }): Fact {
	return wholeFactOf({
		draft: factDraft({
			sources: [{ kind: 'standard', standard: STANDARD_ID, files: params.files }],
		}),
	})
}

/**
 * The state the command's check gives a fact: the fact is built first (it may read the workspace), then `change`
 * is applied to the workspace, then the check is made and asked. All of it is one promise for the caller to await.
 */
async function checkedStateOf(params: {
	workspace: StandardWorkspace
	environment?: NodeJS.ProcessEnv
	fact: () => Fact | Promise<Fact>
	change?: () => void
}): Promise<string> {
	const fact = await params.fact()
	params.change?.()
	const check = await factCheckOf({
		environment: params.environment ?? params.workspace.environment,
		cwd: params.workspace.cwd,
	})
	return check({ fact }).state
}

describe('factCheckOf: a standard fact against the standard folder (D13, D14)', () => {
	/** One row: what happens to the folder after the fact recorded its files key, and the state the check gives. */
	type Row = {
		change: (workspace: StandardWorkspace) => void
		expected: 'valid' | 'stale'
	}
	const rows: Record<string, Row> = {
		'the files unchanged → valid': { change: () => undefined, expected: 'valid' },
		'a file changed → stale': {
			change: (workspace) =>
				writeTextFile({ path: join(workspace.root, STANDARD_ID, 'One.md'), text: 'Edited.\n' }),
			expected: 'stale',
		},
		'a file added → stale': {
			change: (workspace) =>
				writeTextFile({ path: join(workspace.root, STANDARD_ID, 'three.md'), text: 'Added.\n' }),
			expected: 'stale',
		},
		'a file removed → stale': {
			change: (workspace) => rmSync(join(workspace.root, STANDARD_ID, 'two.md')),
			expected: 'stale',
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(name, async () => {
			const workspace = workspaceWithStandard()

			await expect(
				checkedStateOf({
					workspace,
					fact: () => standardFactOf({ files: filesKeyOf({ workspace }) }),
					change: () => row.change(workspace),
				}),
			).resolves.toBe(row.expected)
		})

	it('DIALECTE_STANDARD not set → unverifiable', async () => {
		const workspace = workspaceWithStandard()
		const { DIALECTE_STANDARD: _unset, ...environment } = workspace.environment

		await expect(
			checkedStateOf({
				workspace,
				environment,
				fact: () => standardFactOf({ files: filesKeyOf({ workspace }) }),
			}),
		).resolves.toBe('unverifiable')
	})

	it('the standard folder gone → unverifiable', async () => {
		const workspace = workspaceWithStandard()

		await expect(
			checkedStateOf({
				workspace,
				fact: () => standardFactOf({ files: filesKeyOf({ workspace }) }),
				change: () => rmSync(workspace.root, { recursive: true, force: true }),
			}),
		).resolves.toBe('unverifiable')
	})
})

describe('factCheckOf: a schema fact against the installed dialecte (D13)', () => {
	/** A valid schema fact of a package, holding a definition hash. */
	function schemaFactOf(params: { packageName: string; hash: string }): Fact {
		return wholeFactOf({
			draft: factDraft({
				source: 'schema',
				sources: [
					{
						kind: 'schema',
						package: params.packageName,
						version: '1.0.0',
						definitionHash: params.hash,
					},
				],
			}),
		})
	}

	/** The definition hash of the installed test dialecte, read as the command reads it. */
	async function installedHashOf(params: { cwd: string }): Promise<string> {
		const loaded = await loadDialectes({ cwd: params.cwd })
		return definitionHash({ config: loaded.dialectes[0].config })
	}

	it(
		"the installed dialecte's definition hash → valid",
		async () => {
			const workspace = workspaceWithStandard()
			installTestDialecte({ cwd: workspace.cwd })
			const installedHash = await installedHashOf({ cwd: workspace.cwd })

			await expect(
				checkedStateOf({
					workspace,
					fact: async () => schemaFactOf({ packageName: WIDGET_PACKAGE, hash: installedHash }),
				}),
			).resolves.toBe('valid')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'another definition hash → stale',
		async () => {
			const workspace = workspaceWithStandard()
			installTestDialecte({ cwd: workspace.cwd })

			await expect(
				checkedStateOf({
					workspace,
					fact: () => schemaFactOf({ packageName: WIDGET_PACKAGE, hash: OTHER_HASH }),
				}),
			).resolves.toBe('stale')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the package not installed → unverifiable',
		async () => {
			const workspace = workspaceWithStandard()
			installTestDialecte({ cwd: workspace.cwd })

			await expect(
				checkedStateOf({
					workspace,
					fact: () => schemaFactOf({ packageName: '@acme/absent', hash: OTHER_HASH }),
				}),
			).resolves.toBe('unverifiable')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it('no dialecte installed at all → unverifiable', async () => {
		const workspace = workspaceWithStandard()

		await expect(
			checkedStateOf({
				workspace,
				fact: () => schemaFactOf({ packageName: WIDGET_PACKAGE, hash: OTHER_HASH }),
			}),
		).resolves.toBe('unverifiable')
	})
})

describe('factCheckOf: a dialecte or outside source keeps its stored state until the re-check lands', () => {
	const rows: Record<string, Fact> = {
		'a dialecte fact → valid': wholeFactOf({
			draft: factDraft({
				source: 'dialecte',
				sources: [{ kind: 'dialecte', apiHash: 'sha256:aa' }],
			}),
		}),
		'an outside source on a valid fact → valid': wholeFactOf({
			draft: factDraft({
				source: 'outside',
				sources: [{ kind: 'outside', url: 'https://example.com' }],
			}),
		}),
	}

	for (const [name, fact] of Object.entries(rows))
		it(name, async () => {
			const workspace = workspaceWithStandard()

			await expect(checkedStateOf({ workspace, fact: () => fact })).resolves.toBe('valid')
		})
})
