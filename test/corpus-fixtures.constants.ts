/** The size of a tar block: a header, and the unit its content is padded to. */
export const TAR_BLOCK = 512

/** How long a timeout case waits for a fetch before it gives up: long enough for any timeout under test, short of the case's own. */
export const GIVE_UP_AFTER_MILLISECONDS = 3_000
