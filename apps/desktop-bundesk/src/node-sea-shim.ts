/**
 * Node single-executable-application probe for a compiled Bun host.
 *
 * Bun implements no `node:sea`, so the desktop build resolves that specifier here. A
 * compiled Bun executable is not a Node SEA, and reporting false keeps packages that
 * branch on the probe on their ordinary asset resolution.
 * @returns always false: this host is never a Node single-executable application.
 */
export function isSea(): boolean {
  return false
}
