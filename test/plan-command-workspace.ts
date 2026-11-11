/**
 * A hand-made workspace for the `plan` command tests: a plan file with its fenced block, one repository `cli` as a
 * git main checkout made of files (no git process), `XDG_STATE_HOME` stubbed to a folder of the test. The caller
 * unstubs the environment.
 */
import { commonOf, createPlanWorkspace, writeMainCheckout } from './plan-facts.ts'
import { writeRecordFile } from './store-records.ts'

import type { CommandWorkspace } from './plan-command-workspace.types.ts'

/** The plan workspace with `<root>/cli` as a main checkout. */
export function createCommandWorkspace(): CommandWorkspace {
	const workspace = createPlanWorkspace()
	const cli = writeMainCheckout({ root: workspace.root, name: 'cli' })
	return { ...workspace, cli, common: commonOf(cli) }
}

/** A plan file `plan.md` holding the block as its one fence; its path. */
export function writePlanWithBlock(params: {
	workspace: CommandWorkspace
	lots: unknown[]
	shared?: Record<string, string[]>
	repositories?: Record<string, string>
	name?: string
}): string {
	const block = {
		schema: 1,
		repositories: params.repositories ?? { cli: '../cli' },
		...(params.shared === undefined ? {} : { shared: params.shared }),
		lots: params.lots,
	}
	return writeRecordFile({
		folder: params.workspace.planFolder,
		name: params.name ?? 'plan.md',
		text: [
			'# The plan',
			'',
			'Some prose.',
			'',
			'```json dialecte-lots',
			JSON.stringify(block, null, 2),
			'```',
			'',
			'## Later',
			'',
		].join('\n'),
	})
}

/** A `lot` entry of the block as JSON: scope `src/<id lower-cased>/` in `cli`, branch `feat/<id lower-cased>`. */
export function lotJson(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	const lower = id.toLowerCase()
	return {
		id,
		title: `title of ${id}`,
		kind: 'lot',
		scope: { cli: [`src/${lower}/`] },
		match: { branch: `feat/${lower}` },
		...extra,
	}
}

/** A `person` entry of the block as JSON. */
export function personJson(id: string): Record<string, unknown> {
	return { id, title: `title of ${id}`, kind: 'person' }
}
