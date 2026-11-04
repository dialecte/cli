import { join } from 'node:path'

/** The cli's entry in the sources: Node runs it with its type stripping. */
export const CLI_SOURCE = join(import.meta.dirname, '..', 'src', 'cli.ts')

/** The day after `STORE_NOW`, for the names that must sort after it. */
export const STORE_NEXT_DAY = new Date(2026, 10, 5, 12, 0, 0)

/** The day before `STORE_NOW`. */
export const STORE_PREVIOUS_DAY = new Date(2026, 10, 3, 12, 0, 0)

/** The local time every store case is dated from: 4 November 2026, noon. */
export const STORE_NOW = new Date(2026, 10, 4, 12, 0, 0)

/** The date part of a name made at `STORE_NOW`. */
export const STORE_DATE = '2026-11-04'

/** The branch the store cases work on, and its slug in a name. */
export const STORE_BRANCH = 'feat/handover-show'
export const STORE_SLUG = 'feat-handover-show'

/** The name the first hand-over of `STORE_BRANCH` takes at `STORE_NOW`. */
export const STORE_FIRST_NAME = `${STORE_DATE}-${STORE_SLUG}`

/** The cli a hand-over names as its fallback: never run by these tests. */
export const STORE_WRITER_CLI = '/opt/dialecte/dist/cli.js'

/** The start of every terminal escape sequence. */
export const ESCAPE = '\u001B'

/** The card's width off a terminal when `$COLUMNS` is not set. */
export const DEFAULT_COLUMNS = 80

/** A width no footer wraps at. */
export const WIDE_COLUMNS = 400
