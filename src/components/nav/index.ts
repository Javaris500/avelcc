/**
 * The barrel is the interface. Session 2 imports NavTree and NAV from here and
 * needs nothing else from this directory.
 *
 * Types come from #/contract/ui/nav, which neither session may edit. They are
 * not re-exported here: one fact, one owner.
 */
export { NAV } from "#/components/nav/nav";
export { NavTree } from "#/components/nav/nav-tree";
