/** Constants of the fix round 1 cases of the `ask` command: facts and questions. */

/** The question of the unchecked fact of the dialecte's package, and of the one of another package. */
export const OWN_FACT_QUESTION = 'May the first example element be left out?'
export const OTHER_FACT_QUESTION = 'Does the third example element repeat?'

/** The text of the unchecked facts' answers: no ask record of a re-ask may hold it. */
export const FACT_ANSWER_TEXT = 'The example element may be left out.'

/** A package that is no installed dialecte: its facts are never re-asked by the dialecte's ask. */
export const FOREIGN_PACKAGE = '@acme/elsewhere'

/** The ids the facts above get, in the order they are recorded. */
export const OWN_FACT_ID = 'F-0001'
export const OTHER_FACT_ID = 'F-0002'

/** A structural question naming an attribute the element lacks: `aAAA_1` belongs to `AAA_1`, not to `AA_1`. */
export const LACKING_ATTRIBUTE_QUESTION = 'is aAAA_1 required on AA_1'

/** The kind of that question, the attribute of its subject and the answer of a person's fact keyed to it. */
export const LACKING_ATTRIBUTE_ANSWER_TEXT = 'The attribute is required.'
