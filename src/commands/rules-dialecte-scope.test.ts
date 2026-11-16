import { createScratchRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { NOT_JUDGED_LINE } from '../lib/rules/dialecte-change.constants.ts'
import { runRules } from './rules.ts'

import { describe, expect, it } from 'vitest'

import type { RuleFinding } from '../lib/rules/check-code-rules.types.ts'
import type { DialecteChangeEntry } from '../lib/rules/dialecte-change.types.ts'

type RulesJson = {
	findings: RuleFinding[]
	notJudged?: number
	dialecteChanges?: DialecteChangeEntry[]
}

const FINDING_LINE = /^\S+:\d+:\d+ {2}(error|warning) {2}/
const VIEW_FILE = 'src/view/panel.ts'
const SERVICE_FILE = 'src/services/widgets.ts'

function packageJsonOf(name: string): string {
	return `${JSON.stringify({ name })}\n`
}

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

const ARROW_ONLY = moduleOf([
	'export function panelName(value: string) {',
	'\tconst trim = (text: string) => text.trim()',
	'\treturn trim(value)',
	'}',
])

const ARROW_WITH_CORE = moduleOf([
	"import { read } from '@dialecte/core'",
	'export function widgetName(value: string) {',
	'\tconst trim = (text: string) => text.trim()',
	'\treturn trim(value) + String(read)',
	'}',
])

const INSTALLED_CORE = {
	'node_modules/@dialecte/core/package.json': packageJsonOf('@dialecte/core'),
}

const TWO_FILES = { [VIEW_FILE]: ARROW_ONLY, [SERVICE_FILE]: ARROW_WITH_CORE }

function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

function runOn(params: { files: Record<string, string>; argv: string[] }): {
	exitCode: number
	output: string
} {
	const root = createScratchRepository(params.files)
	return runRules({ cwd: root, argv: params.argv, environment: machineOf() })
}

function jsonOf(output: string): RulesJson {
	return JSON.parse(output) as RulesJson
}

function findingFilesOf(findings: readonly RuleFinding[]): string[] {
	return [...new Set(findings.map((finding) => finding.file))].sort()
}

describe('dialecte rules: the Dialecte-change scope', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	const APP = { 'package.json': packageJsonOf('demo-app'), ...INSTALLED_CORE, ...TWO_FILES }
	const DIALECTE = {
		'package.json': packageJsonOf('@dialecte/demo'),
		'src/v1/generated/definition.generated.ts': 'export {}\n',
		...INSTALLED_CORE,
		...TWO_FILES,
	}
	const CLI = {
		'package.json': packageJsonOf('@dialecte/cli'),
		'src/lib/panel.ts': ARROW_ONLY,
	}

	it('an app, text output -> findings only on the Dialecte-change file, the not-judged line, exit 1', () => {
		const result = runOn({ files: APP, argv: [VIEW_FILE, SERVICE_FILE] })

		const lines = result.output.split('\n')
		expect({
			exitCode: result.exitCode,
			findingFiles: [
				...new Set(
					lines.filter((line) => FINDING_LINE.test(line)).map((line) => line.split(':')[0]),
				),
			].sort(),
			notJudgedLine: lines.includes(NOT_JUDGED_LINE.replace('{count}', '1')),
		}).toEqual({ exitCode: 1, findingFiles: [SERVICE_FILE], notJudgedLine: true })
	})

	it('an app, --json -> notJudged 1 and the verdicts of both files sorted by file', () => {
		const result = runOn({ files: APP, argv: [VIEW_FILE, SERVICE_FILE, '--json'] })

		const json = jsonOf(result.output)
		expect({
			findingFiles: findingFilesOf(json.findings),
			notJudged: json.notJudged,
			dialecteChanges: json.dialecteChanges,
		}).toEqual({
			findingFiles: [SERVICE_FILE],
			notJudged: 1,
			dialecteChanges: [
				{ file: SERVICE_FILE, dialecteChange: true, rule: 'import' },
				{ file: VIEW_FILE, dialecteChange: false, rule: 'none' },
			],
		})
	})

	it('a dialecte package -> both files judged, no not-judged line, verdicts listed', () => {
		const text = runOn({ files: DIALECTE, argv: [VIEW_FILE, SERVICE_FILE] })
		const json = jsonOf(
			runOn({ files: DIALECTE, argv: [VIEW_FILE, SERVICE_FILE, '--json'] }).output,
		)

		expect({
			notJudgedLine: text.output.includes('not Dialecte changes'),
			findingFiles: findingFilesOf(json.findings),
			notJudged: json.notJudged,
			dialecteChanges: json.dialecteChanges,
		}).toEqual({
			notJudgedLine: false,
			findingFiles: [SERVICE_FILE, VIEW_FILE],
			notJudged: undefined,
			dialecteChanges: [
				{ file: SERVICE_FILE, dialecteChange: true, rule: 'package-source' },
				{ file: VIEW_FILE, dialecteChange: true, rule: 'package-source' },
			],
		})
	})

	it('the cli package -> its file judged, the entry marked cli', () => {
		const json = jsonOf(runOn({ files: CLI, argv: ['src/lib/panel.ts', '--json'] }).output)

		expect({
			findingFiles: findingFilesOf(json.findings),
			notJudged: json.notJudged,
			dialecteChanges: json.dialecteChanges,
		}).toEqual({
			findingFiles: ['src/lib/panel.ts'],
			notJudged: undefined,
			dialecteChanges: [{ file: 'src/lib/panel.ts', dialecteChange: false, rule: 'cli' }],
		})
	})

	it('the create package -> its file judged, no not-judged line, notJudged absent', () => {
		const files = { 'package.json': packageJsonOf('@dialecte/create'), 'src/x.ts': ARROW_ONLY }
		const text = runOn({ files, argv: ['src/x.ts'] })
		const json = jsonOf(runOn({ files, argv: ['src/x.ts', '--json'] }).output)

		expect({
			notJudgedLine: text.output.includes('not Dialecte changes'),
			findingFiles: findingFilesOf(json.findings),
			notJudged: json.notJudged,
			dialecteChanges: json.dialecteChanges,
		}).toEqual({
			notJudgedLine: false,
			findingFiles: ['src/x.ts'],
			notJudged: undefined,
			dialecteChanges: [{ file: 'src/x.ts', dialecteChange: false, rule: 'none' }],
		})
	})
})
