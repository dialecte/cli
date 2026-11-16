import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { checkRules } from './check-rules.ts'

import { describe, expect, it } from 'vitest'

import type { RuleName } from './check-code-rules.types.ts'
import type { RulesCheck } from './check-rules.types.ts'

const PACKAGE_JSON = `${JSON.stringify({
	name: '@dialecte/core',
	exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
})}\n`

const CLASS_RULES: readonly RuleName[] = ['class', 'argument-mutation']

function moduleOf(lines: string[]): string {
	return [...lines, ''].join('\n')
}

/** The class and argument-mutation findings as `file:line rule`, and what the opt-outs silenced. */
function classOutcomeOf(result: RulesCheck): {
	findings: string[]
	allowed: RulesCheck['allowed']
} {
	return {
		findings: result.findings
			.filter((finding) => CLASS_RULES.includes(finding.rule))
			.map((finding) => `${finding.file}:${finding.line} ${finding.rule}`),
		allowed: result.allowed,
	}
}

const FILES = {
	'package.json': PACKAGE_JSON,
	'src/index.ts': "export * from './project/index'\n",
	'src/project/index.ts': "export { Project } from './project'\n",
	'src/project/project.ts': moduleOf([
		'export class Project {',
		'\topen() {',
		'\t\tthis.opened = true',
		'\t}',
		'}',
	]),
	'src/xml/writer.ts': moduleOf([
		'/**',
		' * Writes XML.',
		' * dialecte-allow class: a thin shell kept until the writer becomes functions',
		' */',
		'export class Writer {',
		'\twrite(text: string) {',
		'\t\tthis.parts.push(text)',
		'\t}',
		'}',
	]),
	'src/xml/session.ts': 'export class Session {}\n',
}

describe('checkRules: the class rule over a package', () => {
	it('a facade an entry re-exports → kept with its writes; an opted-out class → silenced, counted, its writes through this still found; any other → an error', () => {
		const root = temporaryFolder('rules-class-')
		writeFiles({ root, files: FILES })

		expect(
			classOutcomeOf(
				checkRules({
					root,
					givenFiles: ['src/project/project.ts', 'src/xml/writer.ts', 'src/xml/session.ts'],
					environment: { XDG_CONFIG_HOME: temporaryFolder('dialecte-config-') },
				}),
			),
		).toEqual({
			findings: ['src/xml/writer.ts:7 argument-mutation', 'src/xml/session.ts:1 class'],
			allowed: { class: 1 },
		})
	})
})
