/** Where a fixture repository keeps its change-request template: its origin is a local path, so no vendor serves it. */
import { HOST_VENDORS } from '../src/lib/host/host-vendors.constants.ts'

/** The first known vendor's template path: the one a tree with no vendor is read for first. */
export const FIXTURE_TEMPLATE_PATH = HOST_VENDORS[0].changeRequestTemplate
