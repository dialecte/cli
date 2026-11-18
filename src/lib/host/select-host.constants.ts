/** The constants of the vendor selection: the ssh alias read, and the refusal with no vendor. */

/** The ssh command, and the flag that prints the configuration it would use for a host, offline. */
export const SSH_COMMAND = 'ssh'
export const SSH_CONFIG_FLAG = '-G'

/** Ends ssh's options, so an alias starting with '-' is read as the host, never as an option. */
export const SSH_END_OF_OPTIONS = '--'

/** How long `ssh -G` may take: it reads the ssh configuration only, never the network. */
export const SSH_CONFIG_TIMEOUT_MS = 5_000

/** The key of the `ssh -G` line that names the real host of an alias. */
export const SSH_HOSTNAME_KEY = 'hostname'

/** The config key that names the vendor of a repository whose origin names none. */
export const HOST_CONFIG_KEY = 'host'

/** Why a call reaches no host: `{origin}` is the origin's host (or that there is no remote), `{vendors}` the known ones. */
export const NO_VENDOR_REFUSAL =
	'no host vendor for {origin}: it is none of the known vendors ({vendors}); set the key `host` to one of them in the personal config.yml'

/** How `{origin}` reads when the repository has no remote origin (none, a local path or a `file://` URL). */
export const NO_REMOTE_ORIGIN = 'a repository with no remote origin'

/** Why a call whose repository folder `{root}` does not exist (a removed worktree) reaches no host. */
export const GONE_ROOT_REFUSAL = 'no host for {root}: that folder does not exist'
