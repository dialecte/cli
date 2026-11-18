/**
 * `rules --json` against its versioned schema (`rules.schema.json`): real outputs validate, and a field the output
 * adds that the schema lacks is a fault, so a drift of either side fails here.
 */
import { readFileSync } from 'node:fs'

import { schemaFaultsOf } from '../../test/json-schema-faults.ts'
import { TEST_FILE } from '../../test/rules-lot-worktree.constants.ts'
import { createLotWorktree } from '../../test/rules-lot-worktree.ts'
import { createScratchRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

import type { JsonSchema } from '../../test/json-schema-faults.types.ts'

const SCHEMA = JSON.parse(
	readFileSync(new URL('./rules.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const SOURCE = 'src/lib/add-item.ts'
const BROKEN_INDEX = 'skills/broken/references/api.json'

const MUTATING_WITH_OPT_OUT = [
	'// dialecte-allow argument-mutation: the caller hands a scratch list',
	'export function addItem(params: Params) {',
	'\tparams.items.push(1)',
	'}',
	'export function clearItems(params: Params) {',
	'\tparams.items.length = 0',
	'}',
	'',
].join('\n')

const ACT_FILE = 'src/widget/add-widget.test.ts'
const ACT_REPEATING_CALL = [
	"import { addWidget } from './add-widget.ts'",
	"import { runWidgetTestCases } from '@dialecte/demo/test'",
	"const testCases = { 'a widget': { sourceXml: '<Root/>' } }",
	'runWidgetTestCases.withExport({',
	'\ttestCases,',
	'\tact: async () => {',
	'\t\tawait addWidget({ id: 1 })',
	'\t\tawait addWidget({ id: 2 })',
	'\t},',
	'})',
	'',
].join('\n')

const CONTRIBUTOR_PACKAGE = `${JSON.stringify({ name: 'demo', dialecte: { profile: 'contributor' } })}\n`
const APP_PACKAGE = `${JSON.stringify({ name: 'demo-app' })}\n`

function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

function outputOf(params: { root: string; argv: string[] }): unknown {
	return JSON.parse(
		runRules({
			cwd: params.root,
			argv: [...params.argv, '--json'],
			environment: machineOf(),
		}).output,
	)
}

describe('dialecte rules --json: the schema', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const scratchCases: Record<
		string,
		{ files: Record<string, string>; argv: string[]; expectedKeys: string[] }
	> = {
		'findings, an opt-out count and a missing word list validate': {
			files: {
				'package.json': CONTRIBUTOR_PACKAGE,
				[SOURCE]: MUTATING_WITH_OPT_OUT,
			},
			argv: [SOURCE],
			expectedKeys: [
				'allowed',
				'dialecteChanges',
				'errors',
				'files',
				'findings',
				'noForbiddenWordsList',
				'qualityLine',
				'warnings',
			],
		},
		'an API index that cannot be read validates with its not-run line': {
			files: {
				'package.json': CONTRIBUTOR_PACKAGE,
				[BROKEN_INDEX]: '{not json',
				[SOURCE]: 'export {}\n',
			},
			argv: [SOURCE],
			expectedKeys: [
				'dialecteChanges',
				'errors',
				'files',
				'findings',
				'noForbiddenWordsList',
				'qualityLine',
				'queryInLoopNotRun',
				'warnings',
			],
		},
		'an app with a file that is no Dialecte change validates with its verdicts and the count': {
			files: {
				'package.json': APP_PACKAGE,
				'src/view/panel.ts': 'export const panel = 1\n',
			},
			argv: ['src/view/panel.ts'],
			expectedKeys: [
				'dialecteChanges',
				'errors',
				'files',
				'findings',
				'notJudged',
				'qualityLine',
				'warnings',
			],
		},
	}

	for (const [title, testCase] of Object.entries(scratchCases))
		it(title, () => {
			const root = createScratchRepository(testCase.files)

			const output = outputOf({ root, argv: testCase.argv })

			expect({
				faults: schemaFaultsOf({ value: output, schema: SCHEMA }),
				keys: Object.keys(output as object).sort(),
			}).toEqual({ faults: [], keys: testCase.expectedKeys })
		})

	it('an act-wide finding validates, its function line left out of the output', () => {
		const root = createScratchRepository({
			'package.json': `${JSON.stringify({ name: '@dialecte/demo' })}\n`,
			'src/v1/generated/definition.generated.ts': 'export {}\n',
			'src/widget/add-widget.ts':
				'export function addWidget(params: { id: number }) {\n\treturn params.id\n}\n',
			[ACT_FILE]: ACT_REPEATING_CALL,
		})

		const output = outputOf({ root, argv: [ACT_FILE] }) as {
			findings: { rule: string; functionLine?: number }[]
		}

		expect({
			faults: schemaFaultsOf({ value: output, schema: SCHEMA }),
			findings: output.findings
				.filter((finding) => finding.rule === 'act-repeats-call')
				.map((finding) => 'functionLine' in finding),
		}).toEqual({ faults: [], findings: [false] })
	})

	it('a run on a lot worktree validates with its base line', () => {
		const worktree = createLotWorktree({ source: 'lot-link' })

		const output = outputOf({ root: worktree.root, argv: [TEST_FILE] })

		expect({
			faults: schemaFaultsOf({ value: output, schema: SCHEMA }),
			hasBaseLine: typeof (output as { baseLine?: unknown }).baseLine === 'string',
		}).toEqual({ faults: [], hasBaseLine: true })
	})

	it('a missing key, a stranger key, a wrong type and a severity out of the list are each a fault', () => {
		const finding = {
			file: 'a.ts',
			line: 1,
			column: 1,
			rule: 'plan-tag',
			severity: 'error',
			message: 'text',
		}
		const whole = {
			files: ['a.ts'],
			errors: 1,
			warnings: 0,
			findings: [finding],
		}

		expect({
			whole: schemaFaultsOf({ value: whole, schema: SCHEMA }),
			missing: schemaFaultsOf({
				value: { files: [], errors: 0, warnings: 0 },
				schema: SCHEMA,
			}),
			stranger: schemaFaultsOf({
				value: { ...whole, extra: 1 },
				schema: SCHEMA,
			}),
			strangerFindingKey: schemaFaultsOf({
				value: { ...whole, findings: [{ ...finding, functionLine: 3 }] },
				schema: SCHEMA,
			}),
			type: schemaFaultsOf({
				value: { ...whole, baseLine: 3 },
				schema: SCHEMA,
			}),
			severity: schemaFaultsOf({
				value: { ...whole, findings: [{ ...finding, severity: 'info' }] },
				schema: SCHEMA,
			}),
		}).toEqual({
			whole: [],
			missing: ['$.findings: missing'],
			stranger: ['$.extra: unknown key'],
			strangerFindingKey: ['$.findings[0].functionLine: unknown key'],
			type: ['$.baseLine: not a string'],
			severity: ['$.findings[0].severity: not in enum'],
		})
	})
})
