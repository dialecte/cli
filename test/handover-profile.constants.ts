/** What the tests of the hand-over per profile share: the lot, the wordings the guards and the card print. */

/** The one lot of the scratch package: its file and message. */
export const PROFILE_LOT_PATH = 'src/'
export const PROFILE_LOT_MESSAGE = 'feat(a): first'

/** A lot message with a ticket number, kept out of the literals: a ticket number is a reference to the rules. */
export const TICKET_MESSAGE = `fix ${'#'}3328`

/** A citation of a standard, kept out of the literals. */
export const CITATION_TEXT = `As ${'Annex'} B says.\n`

/** What the `references` guard says is wrong, per profile. */
export const CONTRIBUTOR_REFERENCES_DETAIL = 'a plan tag or a standard citation'
export const CONSUMER_REFERENCES_DETAIL = 'a standard citation'

/** What the `contrib` guard says when no green record of the tree exists. */
export const NO_GREEN_CONTRIB = 'no green dialecte contrib of this tree: run dialecte contrib'

/** The contrib line of a card without a record of the tree. */
export const CONTRIB_NEVER_RUN = 'never run: dialecte contrib'

/** A gate step that passes, so the card holds a green gate. */
export const GREEN_GATE_STEP = { name: 'check', run: 'true' }

/** The mutation scope a package declares for the cards that read the mutation row. */
export const MUTATION_DECLARATION = {
	scope: ['src/engine/*.ts'],
	fast: { vitestConfig: 'v.config.ts' },
}

/** The standard line's wordings, as the card prints them: the third is what comes before the folder, the note is the placeholder. */
export const STANDARD_NOT_CONFIGURED = 'not consulted: none configured (DIALECTE_STANDARD)'
export const STANDARD_NOT_CONSULTED_START = 'configured, not consulted: dialecte lot standard'
export const STANDARD_NOT_CONSULTED_END = 'consulted <note>'

/** The time a standard record written by the tests says it was made. */
export const STANDARD_RECORDED_AT = '2026-11-04T10:00:00.000Z'
