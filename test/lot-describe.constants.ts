/** The lot `lot describe` renders in its tests: its name, messages, public text and records. */

export const LOT_NAME = '0001-repo-x'

export const LOT_MESSAGE = 'feat(x): x answers one'

export const LOT_SUMMARY = 'X answers one, from its records.'

export const LOT_STEP = { title: 'x answers', behaviours: ['x asked -> one'] }

/** The lot's changelog fragment, under the changelog's own headings. */
export const LOT_FRAGMENT = '### Added\n\n- `x` answers one.\n'

/** The issue the lot closes. */
export const LOT_ISSUE = 12

/** A forbidden word of the machine's list in the lot's tests: never in a public body. */
export const FORBIDDEN_WORD = 'zorbco'
