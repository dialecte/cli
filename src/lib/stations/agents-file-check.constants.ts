import { SESSION_CHECK_COMMAND } from './session-check.constants.ts'

/** The vendor-neutral file every coding agent reads at a session start. */
export const AGENTS_FILE = 'AGENTS.md'

/** The markers that own the section: what is between them is ours, everything else is the user's. */
export const AGENTS_CHECK_START = '<!-- dialecte-skills:session-check -->'
export const AGENTS_CHECK_END = '<!-- /dialecte-skills:session-check -->'

/** The question a sync asks on a terminal when there is no `AGENTS.md` and it would write the section. */
export const AGENTS_CREATE_QUESTION =
	'No AGENTS.md here: create it with the session-start check? [y/N] '

/** What a sync prints about `AGENTS.md` (the created and added lines add the session-check command). */
export const AGENTS_CREATED_LINE = `✅ ${AGENTS_FILE} created with the session-start check (${SESSION_CHECK_COMMAND})`
export const AGENTS_ADDED_LINE = `✅ ${AGENTS_FILE}: session-start check (${SESSION_CHECK_COMMAND})`
export const AGENTS_NOT_CREATED_LINE = `${AGENTS_FILE}: none here, not created (skills sync --agents-file creates it)`
export const AGENTS_LEFT_ALONE_LINE = `${AGENTS_FILE}: left alone (--no-agents-file)`
export const AGENTS_UNCHANGED_LINE = `${AGENTS_FILE}: session-start check unchanged`
export const AGENTS_UPDATED_LINE = `✅ ${AGENTS_FILE}: session-start check updated`
export const AGENTS_LEFT_IN_PLACE_LINE = `${AGENTS_FILE}: session-start check left in place (sync never removes it; delete it by hand if you do not want it)`
export const AGENTS_UNCLOSED_LINE = `⚠️  ${AGENTS_FILE}: the dialecte session-check section is not closed: left as it is`

/** The sentence between the markers. */
export const AGENTS_CHECK_LINE = `At the start of a session, run \`${SESSION_CHECK_COMMAND}\`: nothing printed means the Dialecte skills are in sync; otherwise each line is a problem with its fix.`
