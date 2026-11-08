/** What a call returned, or the message of the error it threw: a thrown error becomes a value an assertion compares. */
export type CallOutcome<Value> = { value: Value } | { error: string }
