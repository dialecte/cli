/**
 * The rehearsal clones of a feature for `lot close --feature` (design 3.8 item 4): each rehearsal folder of each
 * scratch root whose marker names a hand-over folder of a lot of the feature goes to its trash when its owner is dead
 * by pid and start time and no link reaches it; a kept lot keeps its clones. Every other clone is listed with why,
 * named for `worktree prune`, and never moved. The move decides again first and writes `removing` / `removed` lines.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { writeRemoved, writeRemoving } from '../events/cards-log.ts'
import { realPathOf } from '../file-system.ts'
import { REHEARSAL_FOLDER_PREFIX, REMOVAL_ID_PREFIX } from '../handover/handover.constants.ts'
import { readRehearsalRun } from '../handover/live-handover-run.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { keptByDecisionOf } from '../store/lot-keep.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { linkReaching, rehearsalMarkerPath, scratchTrashOf } from '../worktree/prune-worktrees.ts'
import { trashFolder } from '../worktree/trash.ts'
import { cardsLogFileOf } from './act-lot-prune.ts'
import { CLONE_KEEP_TEXTS } from './rehearsal-clones.constants.ts'

import type { RemovalBy } from '../events/cards-log.types.ts'
import type { BackgroundSpawner } from '../worktree/worktree.types.ts'
import type { CloneOwner, CloneReads, FeatureClone, MovedClone } from './rehearsal-clones.types.ts'

/**
 * Every rehearsal folder of `scratchRoots` decided, nothing moved.
 *
 * @intent decide each rehearsal clone a feature's close may move
 * @internal
 */
export function readFeatureClones(
	params: CloneReads & { scratchRoots: readonly string[] },
): FeatureClone[] {
	// one root spelled two ways (through a link) is read once
	return [...new Set(params.scratchRoots.map((root) => realPathOf(root)))].flatMap(
		function clonesIn(scratchRoot) {
			if (!existsSync(scratchRoot)) return []
			return readdirSync(scratchRoot)
				.filter((name) => name.startsWith(REHEARSAL_FOLDER_PREFIX))
				.sort()
				.map((name) => decideClone({ ...params, clone: join(scratchRoot, name) }))
		},
	)
}

/**
 * The clone decided: kept when it is a link, its marker names no hand-over of the feature, its lot is kept on purpose,
 * its owner runs or cannot be told dead, or a link reaches it; else it goes to its scratch root's trash.
 */
function decideClone(params: CloneReads & { clone: string }): FeatureClone {
	const { clone, workspace } = params
	const trash = scratchTrashOf({
		root: dirname(clone),
		worktreesFolder: join(workspace, WORKTREES_FOLDER),
	})
	const markerPath = rehearsalMarkerPath(clone)
	const handover = isLink(clone) ? undefined : markedHandoverOf(markerPath)
	const owner = handover === undefined ? undefined : params.owners.get(realPathOf(handover))
	function kept(why: string): FeatureClone {
		return { clone, trash, owner, decision: { kept: why } }
	}
	if (isLink(clone))
		return kept(fillMessage({ template: CLONE_KEEP_TEXTS.link, values: { link: clone } }))
	if (owner === undefined)
		return kept(
			handover === undefined
				? fillMessage({
						template: CLONE_KEEP_TEXTS.noHandover,
						values: { why: markerPath, workspace },
					})
				: fillMessage({
						template: CLONE_KEEP_TEXTS.otherHandover,
						values: { handover, workspace },
					}),
		)
	if (owner.kept !== undefined) return kept(owner.kept)
	const run = readRehearsalRun({ markerPath, readStartTime: params.readStartTime })
	if (run.state === 'alive')
		return kept(
			fillMessage({
				template: CLONE_KEEP_TEXTS.alive,
				values: { pid: String(run.pid), workspace },
			}),
		)
	if (run.state === 'unknown')
		return kept(
			fillMessage({ template: CLONE_KEEP_TEXTS.unknown, values: { why: run.why, workspace } }),
		)
	const link = linkReaching({ folder: clone, links: params.links })
	if (link !== undefined)
		return kept(fillMessage({ template: CLONE_KEEP_TEXTS.link, values: { link } }))
	return { clone, trash, owner, decision: { go: true } }
}

/**
 * A clone the plan let go, decided again at the move on `params`' reads (the caller reads the links and each lot's keep
 * again after the plan): its `removing` line written in its owner's repository, moved into its trash, its `removed`
 * line written, then its background removal started. Kept with why when anything changed or its `removing` line
 * cannot be written; never throws.
 *
 * @intent never move a clone on a decision older than the move, nor without its record
 * @internal
 */
export function moveClone(
	params: CloneReads & {
		planned: FeatureClone
		by: RemovalBy
		now: Date
		spawner: BackgroundSpawner
	},
): MovedClone {
	const { planned } = params
	if (!existsSync(planned.clone)) return { kept: CLONE_KEEP_TEXTS.gone }
	const again = decideClone({ ...params, clone: planned.clone })
	if ('kept' in again.decision || again.owner === undefined)
		return {
			kept: fillMessage({
				template: CLONE_KEEP_TEXTS.changed,
				values: { why: 'kept' in again.decision ? again.decision.kept : CLONE_KEEP_TEXTS.gone },
			}),
		}
	const id = `${REMOVAL_ID_PREFIX}${randomUUID()}`
	const recorded = recordRemoving({ ...params, id, owner: again.owner })
	if ('kept' in recorded) return recorded
	const { file } = recorded
	// the background removal held until the move is recorded: a spawn that fails leaves it in the trash, recorded
	const held: Parameters<BackgroundSpawner>[0][] = []
	let trashed: string
	try {
		trashed = trashFolder({
			folder: planned.clone,
			worktreesFolder: dirname(again.trash),
			trashName: basename(again.trash),
			now: params.now,
			spawner: function hold(command) {
				held.push(command)
			},
		}).trashed
	} catch (error) {
		const reason = (error as Error).message.trim()
		writeRemovedQuietly({
			file,
			line: { id, at: new Date().toISOString(), outcome: 'kept', reason },
		})
		return { kept: reason }
	}
	writeRemovedQuietly({
		file,
		line: { id, at: new Date().toISOString(), outcome: 'trashed', trashed },
	})
	for (const command of held) startQuietly({ spawner: params.spawner, command })
	return { removed: trashed }
}

/** The clone's `removing` line written in its owner's `cards.log`: the file, or why it could not be (nothing moves). */
function recordRemoving(params: {
	planned: FeatureClone
	owner: CloneOwner
	id: string
	by: RemovalBy
	now: Date
}): { file: string } | { kept: string } {
	try {
		const file = cardsLogFileOf(params.owner.main)
		writeRemoving({
			file,
			line: {
				id: params.id,
				at: params.now.toISOString(),
				lot: params.owner.lot,
				item: 'clone',
				path: params.planned.clone,
				branch: null,
				tip: null,
				records: null,
				by: params.by,
			},
		})
		return { file }
	} catch (error) {
		return {
			kept: fillMessage({
				template: CLONE_KEEP_TEXTS.notRecorded,
				values: { reason: (error as Error).message.trim() },
			}),
		}
	}
}

/** The `removed` line written; one that cannot be written leaves the `removing` line, read as a crash by its readers. */
function writeRemovedQuietly(params: Parameters<typeof writeRemoved>[0]): void {
	try {
		writeRemoved(params)
	} catch {
		// the readers of cards.log read a removal without its outcome as unknown: nothing else to tell
	}
}

/** The background removal started; one that cannot start leaves the moved clone in the trash, where it is recorded. */
function startQuietly(params: {
	spawner: BackgroundSpawner
	command: Parameters<BackgroundSpawner>[0]
}): void {
	try {
		params.spawner(params.command)
	} catch {
		// the clone waits in the trash its removed line names
	}
}

/**
 * The owners with each lot's keep read again (a keep written since the plan holds its clones).
 *
 * @intent read a lot's keep at the move, not only at the plan
 * @internal
 */
export function ownersReadAgain(owners: ReadonlyMap<string, CloneOwner>): Map<string, CloneOwner> {
	return new Map(
		[...owners].map(function withKeepNow([folder, owner]): [string, CloneOwner] {
			const kept = keptByDecisionOf({ lotFolder: owner.lotFolder })
			return [
				folder,
				{
					lot: owner.lot,
					lotFolder: owner.lotFolder,
					main: owner.main,
					...(kept !== undefined && { kept }),
				},
			]
		}),
	)
}

/** The hand-over folder a rehearsal marker names; undefined when there is no marker, it does not parse or names none. */
function markedHandoverOf(markerPath: string): string | undefined {
	try {
		const marker: unknown = JSON.parse(readFileSync(markerPath, 'utf8'))
		return typeof marker === 'object' &&
			marker !== null &&
			'handover' in marker &&
			typeof marker.handover === 'string'
			? marker.handover
			: undefined
	} catch {
		return undefined
	}
}

/** The path itself is a symbolic link (dangling or not). */
function isLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink()
	} catch {
		return false
	}
}
