/** Where the host seam scan draws its lines, as paths from the scanned root with `/`. */

/** The host folder: the generic host files, and one folder per vendor under it. */
export const HOST_FOLDER = 'src/lib/host'

/** The config folder: it reads of the host only `HOST_CONSTANTS_FILE`. */
export const CONFIG_FOLDER = 'src/lib/config'

/** The one host file the config folder may import. */
export const HOST_CONSTANTS_FILE = 'src/lib/host/host.constants.ts'
