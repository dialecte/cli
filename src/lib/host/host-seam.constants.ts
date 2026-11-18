/** Where the host seam scan draws its lines, as paths from the scanned root with `/`. */

/** The host folder: the generic host files, and one folder per vendor under it. */
export const HOST_FOLDER = 'src/lib/host'

/** The config folder: it reads of the host only `HOST_CONSTANTS_FILE`. */
export const CONFIG_FOLDER = 'src/lib/config'

/** The one host file the config folder may import. */
export const HOST_CONSTANTS_FILE = 'src/lib/host/host.constants.ts'

/** The generic host files that may import a vendor's folder: the vendor list, the contract list and the selection. */
export const VENDOR_IMPORTERS: readonly string[] = [
	'src/lib/host/host-vendors.ts',
	'src/lib/host/host-contracts.ts',
	'src/lib/host/select-host.ts',
]
