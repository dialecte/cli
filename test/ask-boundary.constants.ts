/** Values of the boundary cases (the definition as the hard limit of a `--decision` ask). */

/** What the definition says of `children of AA_1`: the boundary of that question. */
export const BOUNDARY_CHILDREN_ANSWER = { verdict: 'value', value: 'AAA_1, AAA_2, AAA_3' }

/** A prose list inside the boundary, and one naming an item the definition does not hold. */
export const PROSE_INSIDE_VALUE = 'AAA_1, AAA_2'
export const PROSE_OUTSIDE_VALUE = 'AAA_1, AAA_9'

/** The item the definition rejects. */
export const REJECTED_ITEM = 'AAA_9'

/** The same-valued prose, and the yes/no question the definition answers yes. */
export const REQUIRED_QUESTION = 'is aAA_1 required on AA_1'
export const REQUIRED_ATTRIBUTE = 'aAA_1'

/** The text a prose fact carries (never printed in an event). */
export const PROSE_TEXT = 'The element holds the listed children.'

/** The `schema` member of `ask --json`. */
export const ASK_JSON_SCHEMA = 1

/** The kind of conflict the ask flags. */
export const CONFLICT_KIND = 'standard-vs-xsd'

/** The wildcard parent (any child element) and the question on its children. */
export const WILDCARD_CHILDREN_QUESTION = 'children of AA_5'

/** A prose item that is no tag of the dialecte, and a tag of the dialecte the wildcard parent does not declare. */
export const NON_TAG_ITEM = 'extra-widget'
export const DIALECTE_TAG_ITEM = 'AAA_1'

/** The `values` boundary cases: an attribute with no enumeration (open), one with an enumeration (closed). */
export const OPEN_VALUES_QUESTION = 'values of AA_1@bAA_1'
export const OPEN_VALUES_ATTRIBUTE = 'bAA_1'
export const OPEN_VALUES_PROSE = 'north, south'
export const CLOSED_VALUES_QUESTION = 'values of A@bA'
export const CLOSED_VALUES_ATTRIBUTE = 'bA'
export const CLOSED_VALUES_PROSE = 'x, zzz'
export const CLOSED_VALUES_OUTSIDE_ITEM = 'zzz'
