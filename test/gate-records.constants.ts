/** What the record tests match a gate or rules record's fields against. */

/** `at`: an ISO 8601 time in UTC. */
export const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/** `stateHash`: a sha256 in hex. */
export const SHA256_PATTERN = /^[0-9a-f]{64}$/
