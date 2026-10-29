/** A silent hook or a waiting lock says it is still there this often. */
export const HEARTBEAT_INTERVAL_MILLISECONDS = 30_000

/** After this many silent beats in a row, the heartbeat says what a silent hook often is. */
export const HEARTBEAT_HINT_AFTER_BEATS = 3
