/** Where the host vendor is picked: per call, from that call's repository. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

import { CONFIG_KEYS } from '../config/config-keys.constants.ts'
import { repoKeyOf } from '../config/repo-key-of.ts'
import { resolveConfig } from '../config/resolve-config.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { HOST_VENDORS } from './host-vendors.constants.ts'
import {
	GONE_ROOT_REFUSAL,
	HOST_CONFIG_KEY,
	NO_REMOTE_ORIGIN,
	NO_VENDOR_REFUSAL,
	UNKNOWN_VENDOR_REFUSAL,
	SSH_COMMAND,
	SSH_CONFIG_FLAG,
	SSH_END_OF_OPTIONS,
	SSH_CONFIG_TIMEOUT_MS,
	SSH_HOSTNAME_KEY,
} from './select-host.constants.ts'

import type { HostAdapter, HostRefusal, HostVendorRecord } from './host.types.ts'
import type { HostSelection, HostSelectionSeams } from './select-host.types.ts'

/** The `hostname` line of an `ssh -G` output; undefined when it has none. */
export function hostnameOfSshConfig(params: { text: string }): string | undefined {
	for (const line of params.text.split('\n')) {
		const [key, value] = line.trim().split(/\s+/, 2)
		if (key === SSH_HOSTNAME_KEY && value !== undefined) return value
	}
	return undefined
}

/** The real host of an ssh alias as `ssh -G` answers it, offline; undefined when ssh does not answer. */
function sshHostnameOf(params: { alias: string }): string | undefined {
	const run = spawnSync(SSH_COMMAND, [SSH_CONFIG_FLAG, SSH_END_OF_OPTIONS, params.alias], {
		encoding: 'utf8',
		timeout: SSH_CONFIG_TIMEOUT_MS,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	return run.status === 0 ? hostnameOfSshConfig({ text: run.stdout }) : undefined
}

/** The personal config key `host` of the repository at `root` (its `repos:` entry included); undefined when not set. */
function hostKeyOf(params: { root: string }): string | undefined {
	const resolved = resolveConfig({
		root: params.root,
		environment: process.env,
		platform: process.platform,
		home: homedir(),
		keys: CONFIG_KEYS.filter(function isHostKey(spec) {
			return spec.key === HOST_CONFIG_KEY
		}),
		layers: ['personal'],
	})
	const value = resolved.values.find(function isHostValue(each) {
		return each.key === HOST_CONFIG_KEY
	})?.value
	return typeof value === 'string' ? value : undefined
}

/** The vendor whose remote hosts hold `host`, if any. */
function vendorOfRemoteHost(params: { host: string | undefined }): HostVendorRecord | undefined {
	if (params.host === undefined) return undefined
	const lowered = params.host.toLowerCase()
	return HOST_VENDORS.find(function servesHost(vendor) {
		return vendor.remoteHosts.includes(lowered)
	})
}

/** The selection of the repository at `root`: origin host, then ssh alias (scp and ssh forms only), then the key. */
function selectionOf(params: { root: string } & HostSelectionSeams): HostSelection {
	const { remote } = repoKeyOf({ root: params.root, platform: process.platform })
	const host = remote?.host
	const byOrigin = vendorOfRemoteHost({ host })
	if (byOrigin !== undefined) return { vendor: byOrigin, host }
	if (remote !== undefined && remote.form !== 'https') {
		const sshHostname = params.sshHostname ?? sshHostnameOf
		const byAlias = vendorOfRemoteHost({ host: sshHostname({ alias: remote.host }) })
		if (byAlias !== undefined) return { vendor: byAlias, host }
	}
	const readHostKey = params.readHostKey ?? hostKeyOf
	const name = readHostKey({ root: params.root })
	const named = name === undefined ? undefined : vendorNamed({ name })
	return { vendor: named !== undefined && 'vendor' in named ? named.vendor : undefined, host }
}

/** The names of the known vendors, joined for a message. */
function knownVendorNames(): string {
	return HOST_VENDORS.map(function nameOf(vendor) {
		return vendor.name
	}).join(', ')
}

/** The known vendor called `name`, or the refusal naming the known vendors. */
export function vendorNamed(params: { name: string }): { vendor: HostVendorRecord } | HostRefusal {
	const vendor = HOST_VENDORS.find(function isNamed(each) {
		return each.name === params.name
	})
	if (vendor !== undefined) return { vendor }
	return {
		refusal: fillMessage({
			template: UNKNOWN_VENDOR_REFUSAL,
			values: { name: params.name, vendors: knownVendorNames() },
		}),
	}
}

/**
 * The vendor of the repository at `root`: its origin's host, else the ssh alias's hostname, else the key `host`;
 * undefined when none matches.
 */
export function vendorOf(
	params: { root: string } & HostSelectionSeams,
): HostVendorRecord | undefined {
	return selectionOf(params).vendor
}

/**
 * The vendor of the repository at `root`, or why none serves it: its origin's host (or that it has none), the known
 * vendors and the key `host`.
 */
export function vendorOrRefusalOf(
	params: { root: string } & HostSelectionSeams,
): { vendor: HostVendorRecord } | HostRefusal {
	const { vendor, host } = selectionOf(params)
	return vendor === undefined ? { refusal: noVendorReason({ host }) } : { vendor }
}

/** Why a repository whose origin is `host` reaches no vendor. */
function noVendorReason(params: { host: string | undefined }): string {
	return fillMessage({
		template: NO_VENDOR_REFUSAL,
		values: {
			origin: params.host ?? NO_REMOTE_ORIGIN,
			vendors: knownVendorNames(),
		},
	})
}

/** The adapter of a repository no vendor serves: every method answers its refusal with `why`, nothing is spawned. */
function refusingHostOf(params: { why: string }): HostAdapter {
	const { why } = params
	const refusal = { refusal: why }
	function refuse(): HostRefusal {
		return refusal
	}
	return {
		readChangeRequest: refuse,
		openChangeRequest: refuse,
		editChangeRequest: refuse,
		closeChangeRequest: refuse,
		queueChangeRequest: refuse,
		draftChangeRequest: refuse,
		readQueued: refuse,
		readChecks: refuse,
		readReviewComments: refuse,
		openFiles: refuse,
		probeStacks: function noStacks() {
			return { stacks: false, why }
		},
		linkStack: refuse,
		queueStack: refuse,
		retargetChangeRequest: refuse,
	}
}

/**
 * The adapter that resolves the vendor of each call's `root` and forwards to it; with no vendor, each method answers
 * its own refusal. Nothing is read or spawned until a method is called.
 */
export function createHost(seams: HostSelectionSeams = {}): HostAdapter {
	return forwardingHost({ hostOf: servingHostOf({ seams }) })
}

/** The adapter serving a call's `root`, chosen once per root and created once per vendor (`createHost`). */
function servingHostOf(params: {
	seams: HostSelectionSeams
}): (params: { root: string }) => HostAdapter {
	const { seams } = params
	const served = new Map<string, HostAdapter>()
	const adapters = new Map<string, HostAdapter>()

	/**
	 * The adapter serving `root`: its vendor's (created once per vendor), else the refusing one; once per root. A root
	 * that does not exist is refused afresh on each call, never kept: it may exist by the next call.
	 */
	function hostOf(params: { root: string }): HostAdapter {
		const { root } = params
		const known = served.get(root)
		if (known !== undefined) return known
		if (!existsSync(root)) {
			return refusingHostOf({
				why: fillMessage({ template: GONE_ROOT_REFUSAL, values: { root } }),
			})
		}
		const { vendor, host } = selectionOf({ ...seams, root })
		const adapter =
			vendor === undefined
				? refusingHostOf({ why: noVendorReason({ host }) })
				: (adapters.get(vendor.name) ?? vendor.createAdapter())
		if (vendor !== undefined) adapters.set(vendor.name, adapter)
		served.set(root, adapter)
		return adapter
	}

	return hostOf
}

/** A host whose every method is forwarded to the adapter `hostOf` answers for its call's `root`. */
function forwardingHost(params: {
	hostOf: (params: { root: string }) => HostAdapter
}): HostAdapter {
	const { hostOf } = params
	return {
		readChangeRequest(params) {
			return hostOf(params).readChangeRequest(params)
		},
		openChangeRequest(params) {
			return hostOf(params).openChangeRequest(params)
		},
		editChangeRequest(params) {
			return hostOf(params).editChangeRequest(params)
		},
		closeChangeRequest(params) {
			return hostOf(params).closeChangeRequest(params)
		},
		queueChangeRequest(params) {
			return hostOf(params).queueChangeRequest(params)
		},
		draftChangeRequest(params) {
			return hostOf(params).draftChangeRequest(params)
		},
		readQueued(params) {
			return hostOf(params).readQueued(params)
		},
		readChecks(params) {
			return hostOf(params).readChecks(params)
		},
		readReviewComments(params) {
			return hostOf(params).readReviewComments(params)
		},
		openFiles(params) {
			return hostOf(params).openFiles(params)
		},
		probeStacks(params) {
			return hostOf(params).probeStacks(params)
		},
		linkStack(params) {
			return hostOf(params).linkStack(params)
		},
		queueStack(params) {
			return hostOf(params).queueStack(params)
		},
		retargetChangeRequest(params) {
			return hostOf(params).retargetChangeRequest(params)
		},
	}
}
