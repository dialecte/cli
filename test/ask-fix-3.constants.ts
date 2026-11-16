/** Values of the fix-3 tests of `ask`: a folder holding core only, a code of core's catalogue, the verbs not built yet. */
export const CORE_ONLY_PACKAGE = '@dialecte/core'

/** A code of core's own catalogue. */
export const CORE_CATALOGUE_CODE = 'D3009'

/** The question naming that code. */
export const CORE_CODE_QUESTION = `what does ${CORE_CATALOGUE_CODE} mean`

/** A semantic question in a folder holding core only. */
export const CORE_ONLY_SEMANTIC_QUESTION = 'Explain the intent of AA_1'

/** The refusal text that must never appear with an empty tag list. */
export const EMPTY_TAGS_REFUSAL_PART = 'declares all of'

/** `ask answer` for an ask no folder holds, with the arguments the test gives it. */
export const ANSWER_OF_UNKNOWN_ASK: string[] = ['answer', 'A-0001', 'x', '--by', 'person-a']

/** What the one-line refusal says: it names the ask and never calls the verb unbuilt. */
export const UNKNOWN_ASK_WORDS = /^(?!.*not built yet).*A-0001/su

/** The id of the first fact an ask records. */
export const FIRST_FACT_ID = 'F-0001'
