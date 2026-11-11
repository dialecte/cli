import { STORE_FIRST_NAME } from '../../test/handover-store-scenario.constants.ts'

/** What an escaped line feed prints as. */
export const LINE_FEED_ESCAPE = '\\u{a}'

/** The second hand-over of the store: it holds the lock in the "kept" case. */
export const SECOND_NAME = `${STORE_FIRST_NAME}-2`

/** A lock line starts with these words. */
export const LOCK_LINE_PATTERN = /^the lock /

/** The files the hand-over's script changes. */
export const ABANDON_CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
