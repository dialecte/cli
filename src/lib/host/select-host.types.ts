/** The seams of the vendor selection: what a test injects so nothing is spawned; what the selection finds. */
import type { HostVendorRecord } from './host.types.ts'

/** The vendor the selection found for a repository, and its origin's host (undefined with no remote origin). */
export type HostSelection = { vendor: HostVendorRecord | undefined; host: string | undefined }

/** What the selection reads outside the origin; each defaults to the real read. */
export type HostSelectionSeams = {
	/** The `hostname` line of `ssh -G <alias>`; undefined when ssh does not answer. Asked only for an scp or ssh origin whose host is no vendor's. */
	sshHostname?: (alias: string) => string | undefined
	/** The value of the personal config key `host` for the repository at `root`; undefined when not set. */
	readHostKey?: (root: string) => string | undefined
}
