import { SESSION_CHECK_COMMAND } from './session-check.constants.ts'

/** The vendor-neutral file every coding agent reads at a session start. */
export const AGENTS_FILE = 'AGENTS.md'

/** The markers that own the section: what is between them is ours, everything else is the user's. */
export const AGENTS_CHECK_START = '<!-- dialecte-skills:session-check -->'
export const AGENTS_CHECK_END = '<!-- /dialecte-skills:session-check -->'

/** The sentence between the markers. */
export const AGENTS_CHECK_LINE = `At the start of a session, run \`${SESSION_CHECK_COMMAND}\`: nothing printed means the Dialecte skills are in sync; otherwise each line is a problem with its fix.`
