/** The archive names, the folder of the packages' archives, the pending record, and the lines a move writes. */
import { ARCHIVED_LOT_FILE } from './handover.constants.ts'

/** The second archive of a package path: the declaration a lot landed with, beside a `lot.json` of other bytes. */
export const LANDED_LOT_FILE = 'lot.landed.json'

/** The archive names, in the order they are written: `lot.landed.json` only after `lot.json` holds other bytes. */
export const ARCHIVE_NAMES = [ARCHIVED_LOT_FILE, LANDED_LOT_FILE] as const

/** The folder of a hand-over folder that holds the packages' archives, each under its package path. */
export const PACKAGE_ARCHIVES_FOLDER = 'lots'

/**
 * The folder's record of the lot files a move failed to archive, each by its package path and the sha256 of its
 * bytes: a later run archives those bytes, and only those, though it commits nothing.
 */
export const ARCHIVE_PENDING_FILE = 'lot-archive.pending.json'

/** The line for a lot file a run that committed no lot leaves as it is. */
export const LOT_FILE_NOT_OWNED =
	"lot file left as it is: {path} (this run committed no lot, so it is not the archived lot's declaration)"

/** The line for a lot file whose two archives already hold other bytes. */
export const LOT_FILE_KEPT =
	'lot file left as it is: {path} ({archived} and {landed} hold other bytes)'

/** The line for a lot file whose archive could not be written or read back: kept, recorded as pending. */
export const LOT_FILE_NOT_ARCHIVED =
	'lot file not archived: {path} ({reason}); left as it is: run the hand-over again to archive it'

/** The reason when the archive written does not read back with the lot file's bytes. */
export const ARCHIVE_READ_BACK_DIFFERS = 'the archive {archive} reads back other bytes'

/** The card's tdd line for a package's own non-empty lot file: counted, never judged by the root's gate. */
export const PACKAGE_LOT_FILE_LINE =
	"{package}: {accept} accept, {revised} revised, {gone} gone (judged by that package's gate)"

/** Why a close keeps a worktree whose lot file changed after the close decided on it. */
export const LOT_FILE_CHANGED =
	'lot file changed since the close read it: {file}; nothing archived or moved, close it again'
