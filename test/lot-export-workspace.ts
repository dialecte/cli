/** A committed lot of a scratch store holding what an export copies and what it leaves out, written by hand. */
import { createHash } from 'node:crypto'
import {
	appendFileSync,
	chmodSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

import {
	ABSOLUTE_INSIDE_LINK_FILE,
	APPENDED_EVENT_LINE,
	FOLDER_LINK_FILE,
	FOLDER_LINK_TARGET,
	LEAVING_LINK_FILE,
	LEAVING_LINK_TARGET,
	TOOLS_FOLDER,
	TOOLS_FOLDER_MODE,
	ASKS_FOLDER,
	EVENTS_FILE,
	INSIDE_LINK_FILE,
	LINE_TIME,
	LOT_REMOVAL_ID,
	NOTES_FILE,
	NOTES_MODE,
	OTHER_LOT,
	OTHER_REMOVAL_ID,
	OUTSIDE_LINK_FILE,
	OUTSIDE_LINK_TARGET,
	SNAPSHOT_FILE,
	TOOL_FILE,
	TOOL_MODE,
} from './lot-export-workspace.constants.ts'
import { ASK_SENTINEL, REPORT_FEATURE } from './lot-report-workspace.constants.ts'
import { appendCardsLog, cardLineOf, removalLinesOf } from './lot-report-workspace.ts'
import { createStationLot } from './lot-station-workspace.ts'
import { temporaryFolder } from './scratch-repository.ts'

import type { ExportLot, TreeEntry } from './lot-export-workspace.types.ts'

/**
 * A committed lot with a registry entry, files of several modes, a `round-1/` holding a link outside the lot and a link
 * inside it, an `events.jsonl`, an `asks/` file holding the sentinel, and a `cards.log` with the lines of the lot (a
 * card, a removal) and of another lot. The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function createExportLot(
	params: { asks?: boolean; registryEntry?: boolean } = {},
): ExportLot {
	// a lot still working has no registry entry
	const lot = createStationLot({
		state: params.registryEntry === false ? 'working' : 'committed',
		feature: REPORT_FEATURE,
	})
	const { lotFolder } = lot
	const files: Record<string, string> = {
		[NOTES_FILE]: 'some notes\n',
		[TOOL_FILE]: '#!/bin/sh\necho tool\n',
		[SNAPSHOT_FILE]: 'a snapshot\n',
		[EVENTS_FILE]: '{"schema":1,"kind":"station-start"}\n{"schema":1,"kind":"station-end"}\n',
		...(params.asks !== false && {
			[`${ASKS_FOLDER}/A-1.json`]: JSON.stringify({ text: ASK_SENTINEL }),
		}),
	}
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(join(lotFolder, path, '..'), { recursive: true })
		writeFileSync(join(lotFolder, path), text)
	}
	chmodSync(join(lotFolder, NOTES_FILE), NOTES_MODE)
	chmodSync(join(lotFolder, TOOL_FILE), TOOL_MODE)
	chmodSync(join(lotFolder, TOOLS_FOLDER), TOOLS_FOLDER_MODE)
	symlinkSync(OUTSIDE_LINK_TARGET, join(lotFolder, OUTSIDE_LINK_FILE))
	symlinkSync(`../${NOTES_FILE}`, join(lotFolder, INSIDE_LINK_FILE))
	symlinkSync(LEAVING_LINK_TARGET, join(lotFolder, LEAVING_LINK_FILE))
	symlinkSync(join(realpathSync(lotFolder), NOTES_FILE), join(lotFolder, ABSOLUTE_INSIDE_LINK_FILE))
	symlinkSync(FOLDER_LINK_TARGET, join(lotFolder, FOLDER_LINK_FILE))
	const common = { feature: REPORT_FEATURE, at: LINE_TIME, records: null, repository: lot.cwd }
	const lotObjects = [
		cardLineOf({ lot: lot.name, ...common }),
		...removalLinesOf({ lot, id: LOT_REMOVAL_ID, at: LINE_TIME, records: {} }),
	]
	const otherObjects = [
		cardLineOf({ lot: OTHER_LOT, ...common }),
		...removalLinesOf({
			lot: { ...lot, name: OTHER_LOT },
			id: OTHER_REMOVAL_ID,
			at: LINE_TIME,
			records: {},
		}),
	]
	// the other lot's card first, its removal last: only this lot's own lines may reach the copy
	appendCardsLog({
		registry: lot.workspace.registry,
		lines: [otherObjects[0], ...lotObjects, ...otherObjects.slice(1)],
	})
	const lotLines = lotObjects.map((line) => JSON.stringify(line))
	const otherLines = otherObjects.map((line) => JSON.stringify(line))
	return {
		lot,
		dir: realpathSync(temporaryFolder('dialecte-export-dir-')),
		entryFile: join(lot.workspace.registry, `${lot.name}.json`),
		lotLines,
		otherLines,
	}
}

/** Appends one line to the lot's `events.jsonl` (a live lot writing while it is copied). */
export function appendEventWhileCopying(lotFolder: string): void {
	appendFileSync(join(lotFolder, EVENTS_FILE), APPENDED_EVENT_LINE)
}

/** Every path under `folder` (relative, folders included) with what it is; links are described, never followed. */
export function treeOf(folder: string): Record<string, TreeEntry> {
	const tree: Record<string, TreeEntry> = {}
	const pending = [folder]
	for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
		for (const name of readdirSync(current)) {
			const path = join(current, name)
			const stats = lstatSync(path)
			const key = relative(folder, path)
			if (stats.isSymbolicLink()) tree[key] = { kind: 'link', target: readlinkSync(path) }
			else if (stats.isDirectory()) {
				tree[key] = { kind: 'folder', mode: stats.mode & 0o7777 }
				pending.push(path)
			} else
				tree[key] = {
					kind: 'file',
					size: stats.size,
					sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
					mode: stats.mode & 0o7777,
				}
		}
	}
	return tree
}

/** The lines of a text file, empty ones left out. */
export function linesOfFile(path: string): string[] {
	return readFileSync(path, 'utf8').split('\n').filter(Boolean)
}

/** The names in `dir` that start with a dot and hold `.tmp-`: the temporary copies of exports. */
export function temporaryNamesIn(dir: string): string[] {
	return readdirSync(dir).filter((name) => name.startsWith('.') && name.includes('.tmp-'))
}
