/** The host seam's constants, the same for every host. */
import type { HostNouns } from './host.types.ts'

/** The names of the known host vendors: what the config key `host` is checked against (`config/` imports this, never a vendor). */
export const HOST_VENDOR_NAMES = ['github'] as const

/** How long a host call may take: a read is short (offline answers fast), a write may wait on the host. */
export const HOST_READ_TIMEOUT_MS = 10_000
export const HOST_WRITE_TIMEOUT_MS = 60_000

/**
 * The command (and its first words) that opens a page in the browser, by platform; `default` for the others. Windows
 * opens through `url.dll`, never `cmd /c start`: cmd reads a link's `&` and `^` as its own syntax.
 */
export const BROWSER_OPENERS: Readonly<Record<string, readonly string[]>> & {
	default: readonly string[]
} = {
	darwin: ['open'],
	win32: ['rundll32', 'url.dll,FileProtocolHandler'],
	default: ['xdg-open'],
}

/** How long the browser opener may take: it hands the page over and returns. */
export const OPEN_TIMEOUT_MS = 10_000

/** The adapter methods a live probe may call: reads only (a probe never writes). */
export const HOST_READ_METHODS = [
	'readChangeRequest',
	'readChecks',
	'readQueued',
	'readQueueKind',
	'probeStacks',
] as const

/** The change-request nouns of a repository no vendor serves. */
export const GENERIC_NOUNS: HostNouns = {
	changeRequestNoun: 'change request',
	changeRequestNouns: 'change requests',
}
