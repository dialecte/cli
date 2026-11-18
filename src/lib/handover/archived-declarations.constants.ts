/** The archive names, the folder of the packages' archives, and the lines a move writes. */

/** The archive names, in the order they are written: `lot.landed.json` only after `lot.json` holds other bytes. */
export const ARCHIVE_NAMES = ['lot.json', 'lot.landed.json'] as const

/** The folder of a hand-over folder that holds the packages' archives, each under its package path. */
export const PACKAGE_ARCHIVES_FOLDER = 'lots'

/** The line for a lot file a run that committed no lot leaves as it is. */
export const LOT_FILE_NOT_OWNED =
	"lot file left as it is: {path} (this run committed no lot, so it is not the archived lot's declaration)"

/** The line for a lot file whose two archives already hold other bytes. */
export const LOT_FILE_KEPT =
	'lot file left as it is: {path} ({archived} and {landed} hold other bytes)'

/** The card's tdd line for a package's own non-empty lot file: counted, never judged by the root's gate. */
export const PACKAGE_LOT_FILE_LINE =
	"{package}: {accept} accept, {revised} revised, {gone} gone (judged by that package's gate)"
