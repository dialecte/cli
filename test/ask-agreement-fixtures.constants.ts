/** The answers the agreement cases give: a short one and a long one for the same behaviour. */
export const ANSWER_SHORT = 'D holds DD_1.'
export const ANSWER_LONG = 'Yes, the element D holds the child DD_1 in its content model.'

/** The lines of two cites that share line 13, and of one that shares none with the first. */
export const LINES_FIRST = { from: 12, to: 13 }
export const LINES_SHARING = { from: 13, to: 14 }
export const LINES_APART = { from: 20, to: 21 }

/** The clauses the slices of the cites came from. */
export const CLAUSE_ONE = '1'
export const CLAUSE_TWO = '2'

/** What the readers of a `values` question give: the same names in two orders and cases, and another name. */
export const VALUE_B_THEN_A = 'b, a'
export const VALUE_UPPER_A_THEN_B = 'A,B'
export const VALUE_OTHER = 'a, c'

/** A web cite of an outside report, and the page of a second one. */
export const WEB_CITE_ONE = {
	url: 'https://example.test/one',
	quote: 'the element D shall hold the child DD_1 in its content model',
	retrieved: '2026-11-14',
}
export const WEB_CITE_TWO = {
	url: 'https://example.test/two',
	quote: 'the element D shall hold the child DD_1 in its content model',
	retrieved: '2026-11-14',
}

/** What the live definition says of the subject: the answer an outside agreement is held against (D10). */
export const DEFINITION_NO = { verdict: 'no', value: null, text: 'The definition says no.' }
export const DEFINITION_YES = { verdict: 'yes', value: null, text: 'The definition says yes.' }
