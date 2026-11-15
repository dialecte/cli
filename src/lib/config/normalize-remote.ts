import { REMOTE_SCHEME, REMOTE_SCP_FORM } from './config.constants.ts'

/** `host/path` of a remote written with a scheme, a scp form or already shared: user and port dropped. */
function hostAndPathOf(url: string): { host: string; path: string } {
	const withoutScheme = url.replace(REMOTE_SCHEME, '')
	const scp = url === withoutScheme ? REMOTE_SCP_FORM.exec(url) : null
	if (scp !== null) return { host: scp[1], path: scp[2] }
	const slash = withoutScheme.indexOf('/')
	const authority = slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)
	const path = slash === -1 ? '' : withoutScheme.slice(slash + 1)
	const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '')
	return { host, path }
}

/**
 * A remote URL in its shared form `host/path` (D7): scheme, `user@`, port, `.git` and trailing `/` dropped, the host
 * lower-cased, the scp form `host:path` read as `host/path`; the path keeps its case.
 */
export function normalizeRemote(url: string): string {
	const { host, path } = hostAndPathOf(url.trim())
	const trimmedPath = path
		.replace(/^\/+|\/+$/g, '')
		.replace(/\.git$/, '')
		.replace(/\/+$/, '')
	return `${host.toLowerCase()}/${trimmedPath}`
}
