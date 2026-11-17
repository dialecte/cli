/** The landed fact's file in a lot's folder. */
export const LANDED_FILE = 'landed.json'

/** The schema `landed.json` is written with. */
export const LANDED_SCHEMA = 1

/** Why a `landed.json` is damaged: `{reason}` what does not hold. */
export const LANDED_DAMAGE = 'landed.json does not read as a landed fact: {reason}'

/** A full commit id, as the fact's tip is written. */
export const LANDED_COMMIT_PATTERN = /^[0-9a-f]{40}$/
