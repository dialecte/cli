import { join, resolve } from 'node:path'

import { createPlanWorkspace, writeMainCheckout } from '../../../test/plan-facts.ts'
import { writeRecordFile } from '../../../test/store-records.ts'
import { readPlanBlock } from './plan-block.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlanBlockRead } from './plan-block.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const BLOCK_VALUE = {
	schema: 1,
	repositories: { cli: '../cli' },
	lots: [
		{
			id: 'A',
			title: 'a title',
			kind: 'lot',
			scope: { cli: ['./src//a/'] },
			spec: 'a-spec.md',
			brief: 'a/brief.json',
			match: { branch: 'feat/a', handover: '../h/A' },
		},
	],
}

const BLOCK_JSON = JSON.stringify(BLOCK_VALUE, null, 2)

function fenceOf(json: string, info = 'json dialecte-lots'): string {
	return `\`\`\`${info}\n${json}\n\`\`\`\n`
}

function planWith(...parts: string[]): string {
	return ['# The plan', '', 'Some prose.', '', ...parts, '## Later', '', 'More prose.', ''].join(
		'\n',
	)
}

/** The faults of a read, sorted by `at`; none for a block. */
function atsOf(read: PlanBlockRead): string[] {
	return 'faults' in read ? read.faults.map((fault) => fault.at).sort() : []
}

function detailOf(read: PlanBlockRead): string {
	return 'faults' in read ? read.faults.map((fault) => fault.detail).join('\n') : ''
}

/** What the valid block reads as, for a workspace. */
function expectedBlock(planFolder: string, root: string): unknown {
	return {
		schema: 1,
		repositories: { cli: resolve(planFolder, '../cli') },
		shared: {},
		lots: [
			{
				id: 'A',
				title: 'a title',
				kind: 'lot',
				dependsOn: [],
				scope: { cli: ['src/a'] },
				heavy: [],
				spec: join(planFolder, 'a-spec.md'),
				brief: join(planFolder, 'a/brief.json'),
				match: { branch: 'feat/a', handover: join(root, 'h/A') },
			},
		],
	}
}

describe('readPlanBlock: where the block is', () => {
	it('a plan with one dialecte-lots fence -> the block, resolved against the plan folder', () => {
		const workspace = createPlanWorkspace()
		writeMainCheckout({ root: workspace.root, name: 'cli' })
		writeRecordFile({
			folder: workspace.planFolder,
			name: 'plan.md',
			text: planWith(fenceOf(BLOCK_JSON)),
		})
		expect(readPlanBlock({ planPath: workspace.planPath })).toEqual({
			block: expectedBlock(workspace.planFolder, workspace.root),
			source: { kind: 'fence', path: workspace.planPath },
		})
	})

	it('other fences of the plan are not the block', () => {
		const workspace = createPlanWorkspace()
		writeMainCheckout({ root: workspace.root, name: 'cli' })
		writeRecordFile({
			folder: workspace.planFolder,
			name: 'plan.md',
			text: planWith(
				fenceOf('{ "other": true }', 'json'),
				fenceOf('const a = 1', 'ts'),
				fenceOf(BLOCK_JSON),
				fenceOf('{ "other": 2 }', 'json lots'),
			),
		})
		expect(readPlanBlock({ planPath: workspace.planPath })).toEqual({
			block: expectedBlock(workspace.planFolder, workspace.root),
			source: { kind: 'fence', path: workspace.planPath },
		})
	})

	it('a <plan>.lots.json sidecar and no fence -> the sidecar', () => {
		const workspace = createPlanWorkspace()
		writeMainCheckout({ root: workspace.root, name: 'cli' })
		writeRecordFile({ folder: workspace.planFolder, name: 'plan.md', text: planWith() })
		const sidecar = writeRecordFile({
			folder: workspace.planFolder,
			name: 'plan.lots.json',
			text: BLOCK_JSON,
		})
		expect(readPlanBlock({ planPath: workspace.planPath })).toEqual({
			block: expectedBlock(workspace.planFolder, workspace.root),
			source: { kind: 'sidecar', path: sidecar },
		})
	})
})

type RefusedRow = {
	name: string
	/** Files of the plan folder, by name. */
	files: Record<string, string>
	at: string[]
	detail: RegExp
}

const BOTH_NAMED = /^(?=[\s\S]*dialecte-lots)(?=[\s\S]*\.lots\.json)/

const REFUSED_ROWS: RefusedRow[] = [
	{
		name: 'a fence and a sidecar -> refused, both named',
		files: { 'plan.md': planWith(fenceOf(BLOCK_JSON)), 'plan.lots.json': BLOCK_JSON },
		at: ['block'],
		detail: /both/,
	},
	{
		name: 'neither -> refused, the two forms named',
		files: { 'plan.md': planWith() },
		at: ['block'],
		detail: BOTH_NAMED,
	},
	{
		name: 'a file named lots.json beside the plan is never read',
		files: { 'plan.md': planWith(), 'lots.json': BLOCK_JSON },
		at: ['block'],
		detail: BOTH_NAMED,
	},
	{
		name: 'two fences -> refused',
		files: { 'plan.md': planWith(fenceOf(BLOCK_JSON), fenceOf(BLOCK_JSON)) },
		at: ['block'],
		detail: /two|2/,
	},
	{
		name: 'a fence that is not JSON -> refused',
		files: { 'plan.md': planWith(fenceOf('{ "schema": 1, ')) },
		at: ['block'],
		detail: /JSON/,
	},
	{
		name: 'a sidecar that is not JSON -> refused',
		files: { 'plan.md': planWith(), 'plan.lots.json': 'not json' },
		at: ['block'],
		detail: /JSON/,
	},
	{
		name: 'a block with an unknown key -> the parse fault comes back',
		files: {
			'plan.md': planWith(fenceOf(JSON.stringify({ ...BLOCK_VALUE, dependOn: [] }))),
		},
		at: ['dependOn'],
		detail: /dependOn/,
	},
	{
		name: 'a repository that is no git checkout -> the repository fault comes back',
		files: {
			'plan.md': planWith(
				fenceOf(JSON.stringify({ ...BLOCK_VALUE, repositories: { cli: '../missing' } })),
			),
		},
		at: ['repositories.cli'],
		detail: /missing|git main checkout/,
	},
]

describe('readPlanBlock: the refusals', () => {
	it.each(REFUSED_ROWS)('$name', ({ files, at }) => {
		const workspace = createPlanWorkspace()
		writeMainCheckout({ root: workspace.root, name: 'cli' })
		for (const [name, text] of Object.entries(files))
			writeRecordFile({ folder: workspace.planFolder, name, text })
		expect(atsOf(readPlanBlock({ planPath: workspace.planPath }))).toEqual(at)
	})

	it.each(REFUSED_ROWS)('$name: the detail', ({ files, detail }) => {
		const workspace = createPlanWorkspace()
		writeMainCheckout({ root: workspace.root, name: 'cli' })
		for (const [name, text] of Object.entries(files))
			writeRecordFile({ folder: workspace.planFolder, name, text })
		expect(detailOf(readPlanBlock({ planPath: workspace.planPath }))).toMatch(detail)
	})

	it('a plan file that does not exist -> one fault at block', () => {
		const workspace = createPlanWorkspace()
		expect(atsOf(readPlanBlock({ planPath: join(workspace.planFolder, 'missing.md') }))).toEqual([
			'block',
		])
	})
})
