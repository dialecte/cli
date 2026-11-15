/** Runs `rules` on a scratch Dialecte package and gives the length rules' findings. */
import { runRules } from '../src/commands/rules.ts'
import { BASE_VARIABLE, LENGTH_RULES } from './rules-length-run.constants.ts'
import { createScratchRepository, git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { RuleFinding } from '../src/lib/rules/check-code-rules.types.ts'
import type { LengthFinding, RulesJson } from './rules-length-run.types.ts'

/** The text of a file of `lineCount` lines of comments, the first line given (a comment too), a final newline. */
export function commentsOf(params: { lineCount: number; first?: string }): string {
	const lines = Array<string>(params.lineCount).fill('// one more row')
	if (params.first !== undefined) lines[0] = params.first
	return [...lines, ''].join('\n')
}

/** The text of an XML file of `lineCount` lines, the first line given, a final newline. */
export function documentOf(params: { lineCount: number; first?: string }): string {
	const lines = [
		params.first ?? '<Root>',
		...Array<string>(params.lineCount - 2).fill('\t<Item/>'),
		'</Root>',
	]
	return [...lines, ''].join('\n')
}

function machineOf(): Record<string, string> {
	return { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') }
}

function jsonOf(output: string): RulesJson {
	return JSON.parse(output) as RulesJson
}

function shapeOf(finding: RuleFinding): LengthFinding {
	return {
		rule: finding.rule,
		file: finding.file,
		line: finding.line,
		severity: finding.severity,
		message: finding.message,
	}
}

/** The length rules' findings (and the opt-out problems) of a run of `rules` on the files: with the commit as the base when `edited` is given, else without a base. */
export function runOn(params: {
	files: Record<string, string>
	argv: string[]
	/** The package's files change from the committed ones to these before the run; the base is the commit. */
	edited?: Record<string, string>
}): { findings: LengthFinding[]; json: RulesJson } {
	const root = createScratchRepository(params.files)
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	if (params.edited) writeFiles({ root, files: params.edited })
	const result = runRules({
		cwd: root,
		argv: [...params.argv, '--json'],
		environment: { ...machineOf(), ...(params.edited && { [BASE_VARIABLE]: base }) },
	})
	const json = jsonOf(result.output)
	return {
		json,
		findings: json.findings
			.filter((finding) => LENGTH_RULES.includes(finding.rule))
			.map(shapeOf)
			.sort((first, second) => first.rule.localeCompare(second.rule)),
	}
}
