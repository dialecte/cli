/** The store lot of the base-aware cases. */
export const QUALITY_LOT_NAME = '0090-repo-quality'

/** The package of the base-aware cases: a contributor's library, its source folder judged. */
export const QUALITY_PACKAGE_JSON = `${JSON.stringify({ name: '@dialecte/demo', dialecte: { profile: 'contributor' } })}\n`

/** An export of `src/core` counting a list. */
export const SIZE_FILE = 'src/core/size.ts'
export const SIZE_SOURCE = [
	'export function sizeOf(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')

/** `sizeOf` re-signed (an optional parameter) and its body changed. */
export const SIZE_RESIGNED_SOURCE = [
	'export function sizeOf(items: readonly string[], empty = false): number {',
	"\treturn empty ? items.length : items.filter((item) => item !== '').length",
	'}',
	'',
].join('\n')

/** The same re-signed `sizeOf` under a `docs-not-updated` opt-out: the export on line 2. */
export const SIZE_RESIGNED_OPTED_OUT_SOURCE = [
	'// dialecte-allow docs-not-updated: the page is rewritten with the next release notes',
	'export function sizeOf(items: readonly string[], empty = false): number {',
	"\treturn empty ? items.length : items.filter((item) => item !== '').length",
	'}',
	'',
].join('\n')

/** `src/use` importing `sizeOf` from another folder: it makes the export shared. */
export const TOTAL_FILE = 'src/use/total.ts'
export const TOTAL_SOURCE = [
	"import { sizeOf } from '../core/size.ts'",
	'',
	'export function total(items: readonly string[]): number {',
	'\treturn sizeOf(items) + 1',
	'}',
	'',
].join('\n')

/** The same importer with a `shared-export-changed` opt-out on its import line. */
export const TOTAL_OPTED_OUT_SOURCE = [
	"import { sizeOf } from '../core/size.ts' // dialecte-allow shared-export-changed: the importer moves with it in the next lot",
	'',
	'export function total(items: readonly string[]): number {',
	'\treturn sizeOf(items) + 1',
	'}',
	'',
].join('\n')

/** A second export of `src/core`, and its importer in `src/use`. */
export const COUNT_FILE = 'src/core/count.ts'
export const COUNT_SOURCE = [
	'export function countOf(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')
export const COUNT_RESIGNED_SOURCE = [
	'export function countOf(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
].join('\n')
export const SUM_FILE = 'src/use/sum.ts'
export const SUM_SOURCE = [
	"import { countOf } from '../core/count.ts'",
	'',
	'export function sum(items: readonly string[]): number {',
	'\treturn countOf(items) * 2',
	'}',
	'',
].join('\n')

/** An existing function named by two nouns, `widget` and `label`. */
export const LABEL_FILE = 'src/find/label.ts'
export const LABEL_SOURCE = [
	'/** The label of a widget. */',
	'export function widgetLabel(name: string): string {',
	'\treturn name',
	'}',
	'',
].join('\n')

/** An added function whose name holds both nouns: a find duplicate of `widgetLabel`. */
export const OWNER_LABEL_FILE = 'src/find/owner.ts'
export const OWNER_LABEL_SOURCE = [
	'/** The label of the owner of a widget. */',
	'export function ownerWidgetLabel(name: string): string {',
	'\treturn name.trim()',
	'}',
	'',
].join('\n')

/** A contributor's library with a runtime API: its `exports` map, its own skill index. */
export const LIBRARY_PACKAGE_JSON = `${JSON.stringify({
	name: '@x/runtime',
	version: '1.0.0',
	exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
	dialecte: { profile: 'contributor' },
})}\n`

/** The library's export source, re-exporting `sizeOf`. */
export const EXPORT_SOURCE_FILE = 'src/index.ts'
export const EXPORT_SOURCE = "export { sizeOf } from './core/size.ts'\n"

/** The same export source adding a constant while the index stays: the public API reads unknown. */
export const EXPORT_SOURCE_GROWN =
	"export { sizeOf } from './core/size.ts'\nexport const VERSION = 2\n"

/** The library's index. */
export const INDEX_FILE = 'skills/runtime/references/api.json'

/** The public route of `sizeOf`. */
export const SIZE_ROUTE = 'doc.core.sizeOf'

/** The index holding `sizeOf` as the base declares it. */
export const SIZE_INDEX = `${JSON.stringify({
	package: '@x/runtime',
	methods: [
		{
			path: 'doc.core.sizeOf',
			signature: '(items: string[]): number',
			declaredAt: 'src/core/size.ts:1',
			root: 'q',
			otherRoutes: [],
			summary: 'A method.',
			intents: [],
			example: null,
		},
	],
})}\n`

/** The index holding `sizeOf` re-signed, declared on line 1. */
export const SIZE_RESIGNED_INDEX = `${JSON.stringify({
	package: '@x/runtime',
	methods: [
		{
			path: 'doc.core.sizeOf',
			signature: '(items: string[], empty?: boolean): number',
			declaredAt: 'src/core/size.ts:1',
			root: 'q',
			otherRoutes: [],
			summary: 'A method.',
			intents: [],
			example: null,
		},
	],
})}\n`

/** The index holding `sizeOf` re-signed, declared on line 2 (under its opt-out). */
export const SIZE_RESIGNED_OPTED_OUT_INDEX = `${JSON.stringify({
	package: '@x/runtime',
	methods: [
		{
			path: 'doc.core.sizeOf',
			signature: '(items: string[], empty?: boolean): number',
			declaredAt: 'src/core/size.ts:2',
			root: 'q',
			otherRoutes: [],
			summary: 'A method.',
			intents: [],
			example: null,
		},
	],
})}\n`

/** The page naming `core.sizeOf`. */
export const DOC_PAGE = 'doc/api/core.md'
export const PAGE = '# Core\n\n`core.sizeOf(items)` tells how many items a list holds.\n'

/** The same page as it read before the base touched it. */
export const PAGE_BEFORE = '# Core\n\n`core.sizeOf(items)` counts a list.\n'

/** The same page touched by the lot. */
export const PAGE_TOUCHED =
	'# Core\n\n`core.sizeOf(items, empty)` tells how many items a list holds, empty ones counted on request.\n'

/** An app: no dialecte profile, a dialecte that ships a built definition installed. */
export const APP_PACKAGE_JSON = `${JSON.stringify({ name: 'demo-app' })}\n`
export const APP_DIALECTE_PACKAGE_FILE = 'node_modules/@dialecte/demo/package.json'
export const APP_DIALECTE_PACKAGE = `${JSON.stringify({ name: '@dialecte/demo' })}\n`
export const APP_DEFINITION_FILE =
	'node_modules/@dialecte/demo/dist/v1/generated/definition.generated.js'
export const APP_DEFINITION = 'export {}\n'

/** An app file importing the dialecte: a Dialecte change. */
export const APP_SIZE_FILE = 'src/model/size.ts'
export const APP_SIZE = [
	"import { definition } from '@dialecte/demo/dist/v1/generated/definition.generated.js'",
	'',
	'export function sizeOf(items: readonly string[]): number {',
	'\treturn items.length + Object.keys(definition).length',
	'}',
	'',
].join('\n')
export const APP_SIZE_RESIGNED = [
	"import { definition } from '@dialecte/demo/dist/v1/generated/definition.generated.js'",
	'',
	'export function sizeOf(items: readonly string[], extra = 0): number {',
	'\treturn items.length + Object.keys(definition).length + extra',
	'}',
	'',
].join('\n')

/** An app file importing the dialecte, deleted by the lot. */
export const APP_GONE_FILE = 'src/model/gone.ts'
export const APP_GONE = [
	"import { definition } from '@dialecte/demo/dist/v1/generated/definition.generated.js'",
	'',
	'export function goneOf(items: readonly string[]): number {',
	'\treturn items.length + Object.keys(definition).length',
	'}',
	'',
].join('\n')

/** An app file that is no Dialecte change. */
export const APP_PLAIN_FILE = 'src/plain/count.ts'
export const APP_PLAIN = [
	'export function countOf(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')
export const APP_PLAIN_RESIGNED = [
	'export function countOf(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
].join('\n')

/** The app file importing all three from other folders. */
export const APP_USER_FILE = 'src/view/panel.ts'
export const APP_USER = [
	"import { countOf } from '../plain/count.ts'",
	"import { goneOf } from '../model/gone.ts'",
	"import { sizeOf } from '../model/size.ts'",
	'',
	'export function panel(items: readonly string[]): number {',
	'\treturn sizeOf(items) + countOf(items) + goneOf(items)',
	'}',
	'',
].join('\n')

/** The library's index with no entry left: `sizeOf` removed from the public API. */
export const EMPTY_INDEX = `${JSON.stringify({ package: '@x/runtime', methods: [] })}\n`

/** A tsconfig with a `paths` alias, and the same alias pointed elsewhere. */
export const TSCONFIG_FILE = 'tsconfig.json'
export const TSCONFIG = '{ "compilerOptions": { "paths": { "@core/*": ["src/core/*"] } } }\n'
export const TSCONFIG_MOVED =
	'{ "compilerOptions": { "paths": { "@core/*": ["src/lib/core/*"] } } }\n'

/** The library as a tool: the same package with a `bin` (no docs judged for a tool). */
export const LIBRARY_TOOL_PACKAGE_JSON = `${JSON.stringify({
	name: '@x/runtime',
	version: '1.0.0',
	bin: { runtime: './dist/cli.js' },
	exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
	dialecte: { profile: 'contributor' },
})}\n`

/** An existing function of the find case, its index entries crowding the ranking: six methods worded like the added one. */
export const CROWDING_INDEX = `${JSON.stringify({
	package: '@dialecte/demo',
	methods: [1, 2, 3, 4, 5, 6].map((index) => ({
		path: `doc.owner.widget.label${index}`,
		signature: '(name: string): string',
		root: 'q',
		otherRoutes: [],
		summary: 'The label of the owner of a widget.',
		intents: ['label the owner of a widget'],
		example: null,
	})),
})}\n`

/** Twelve exports of `src/core`, and all twelve re-signed. */
export const MANY_FILE = 'src/core/many.ts'
export const MANY_SOURCE = [
	'export function size1Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size2Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size3Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size4Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size5Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size6Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size7Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size8Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size9Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size10Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size11Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
	'export function size12Of(items: readonly string[]): number {',
	'\treturn items.length',
	'}',
	'',
].join('\n')
export const MANY_RESIGNED_SOURCE = [
	'export function size1Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size2Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size3Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size4Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size5Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size6Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size7Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size8Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size9Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size10Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size11Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
	'export function size12Of(items: readonly string[], extra = 0): number {',
	'\treturn items.length + extra',
	'}',
	'',
].join('\n')

/** `src/use` importing the twelve. */
export const MANY_USER_FILE = 'src/use/many-total.ts'
export const MANY_USER_SOURCE = [
	'import {',
	'\tsize1Of,',
	'\tsize2Of,',
	'\tsize3Of,',
	'\tsize4Of,',
	'\tsize5Of,',
	'\tsize6Of,',
	'\tsize7Of,',
	'\tsize8Of,',
	'\tsize9Of,',
	'\tsize10Of,',
	'\tsize11Of,',
	'\tsize12Of,',
	"} from '../core/many.ts'",
	'',
	'export function totalOfMany(items: readonly string[]): number {',
	'\treturn size1Of(items) + size2Of(items) + size3Of(items) + size4Of(items)',
	'}',
	'',
].join('\n')
