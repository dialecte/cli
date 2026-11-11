/** The lot a scratch store holds next to the exported one, whose `cards.log` lines never go into the copy. */
export const OTHER_LOT = '0172-repo-other'

/** The id the removal lines of the exported lot carry, and the other lot's. */
export const LOT_REMOVAL_ID = 'rm-lot-export'
export const OTHER_REMOVAL_ID = 'rm-lot-other'

/** The time of the `cards.log` lines the cases write. */
export const LINE_TIME = '2026-11-08T12:00:00.000Z'

/** The names the export adds to the copy. */
export const COPIED_LOG_NAME = 'cards.log'
export const COPIED_REGISTRY_NAME = 'registry.json'

/** The folder of a lot that is never copied. */
export const ASKS_FOLDER = 'asks'

/** The files of the lot the cases add to what the store wrote. */
export const NOTES_FILE = 'notes.txt'
export const TOOL_FILE = 'tools/run.sh'
export const SNAPSHOT_FILE = 'round-1/snapshot.txt'
export const OUTSIDE_LINK_FILE = 'round-1/etc-link'
export const INSIDE_LINK_FILE = 'round-1/inner-link'
export const EVENTS_FILE = 'events.jsonl'
/** A relative link leaving the lot folder (to the store folder), an absolute link into it, a link to a folder of it. */
export const LEAVING_LINK_FILE = 'round-1/leave-link'
export const LEAVING_LINK_TARGET = '../..'
export const ABSOLUTE_INSIDE_LINK_FILE = 'round-1/absolute-inner-link'
export const FOLDER_LINK_FILE = 'round-1/tools-link'
export const FOLDER_LINK_TARGET = '../tools'
/** A folder of the lot with permission bits of its own, to see folder modes kept. */
export const TOOLS_FOLDER = 'tools'
export const TOOLS_FOLDER_MODE = 0o750

/** What the link of `round-1` points to: a folder outside the lot, never followed. */
export const OUTSIDE_LINK_TARGET = '/etc'

/** A link to a file through a link to a folder outside the lot: lexically inside the lot, in fact outside it. */
export const HOP_FOLDER_LINK = 'hop'
export const HOP_FILE_LINK = 'hop-file-link'
export const HOP_TARGET_FILE = 'x'

/** A control character a path may hold, and how a text answer prints it. */
export const ESCAPE_CHARACTER = '\u001b'
export const ESCAPED_ESCAPE_CHARACTER = '\\u{1b}'

/** The permission bits the cases give to two files, to see them kept. */
export const NOTES_MODE = 0o640
export const TOOL_MODE = 0o755

/** A pid no process of the cases has: its leftover folder is another run's. */
export const OTHER_PID = 999_999

/** The line an events file is appended with during the copy. */
export const APPENDED_EVENT_LINE = '{"schema":1,"kind":"appended-while-copying"}\n'
