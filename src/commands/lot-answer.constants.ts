/** The flags and the value options `lot answer` takes, without the dashes. */
export const ANSWER_FLAGS: readonly string[] = ['json']
export const ANSWER_VALUE_OPTIONS: readonly string[] = ['by']

/** The words `lot answer` takes: the id, the question, the answer. */
export const ANSWER_WORDS = 3

/** The line the text form of `lot answer` starts with; `{question}` is its id, `{recorded}` new or already. */
export const ANSWER_LINE = 'answered {question} ({recorded})'
