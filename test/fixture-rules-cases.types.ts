import type { RuleName, UnitContext } from '../src/lib/rules/check-code-rules.types.ts'

export type Expected = { rule: RuleName; line: number }

export type FindingsCase = {
	file?: string
	/** The units the module is judged with (a Dialecte change); none known by default. */
	units?: UnitContext
	/** The module is given testRules (a Dialecte change) unless this is false. */
	testRules?: boolean
	/** No import header: a support module. */
	bare?: boolean
	/** Each line that ends with `// flag <rule>` is a finding the case expects, on that line. */
	body: string[]
	/** Findings expected on the first line that holds the text (for lines inside a template, where no mark fits). */
	found?: { rule: RuleName; needle: string }[]
}
