/** The order rule findings are reported in. */
import { RULE_NAMES } from './check-code-rules.constants.ts'

import type { RuleFinding } from './check-code-rules.types.ts'

/** The order findings are reported in: by line, then column, then the rule's place in `RULE_NAMES`. */
export function compareFindings(left: RuleFinding, right: RuleFinding): number {
	return (
		left.line - right.line ||
		left.column - right.column ||
		RULE_NAMES.indexOf(left.rule) - RULE_NAMES.indexOf(right.rule)
	)
}
