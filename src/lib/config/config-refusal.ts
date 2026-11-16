import type { ConfigFinding } from './config.types.ts'

/** One finding as the refusal names it: `<file>:<line>: <key>: <problem>`, the key left out when it has none. */
function refusalLineOf(finding: ConfigFinding): string {
	const key = finding.key === undefined ? '' : `${finding.key}: `
	return `${finding.file}:${finding.line}: ${key}${finding.problem}`
}

/** What a reader refuses (D6, C8): one line naming each file:line, key and problem; never read as no setting. */
export class ConfigRefusal extends Error {
	override name = 'ConfigRefusal'
	readonly findings: readonly ConfigFinding[]

	constructor(findings: readonly ConfigFinding[]) {
		super(findings.map(refusalLineOf).join('; '))
		this.findings = findings
	}
}
