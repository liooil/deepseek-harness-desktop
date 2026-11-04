import { join } from 'node:path'

declare const DSH_DESKTOP_VERSION: string

if (process.env.DSH_PTC_RUNTIME_NODE === '1') {
  // A compiled executable is its own program child: the PTC runtime re-runs this
  // binary with the frame limit as its last argument. Load the program entry alone
  // so the child never initializes the desktop shell.
  const { openInheritedControlChannel } = await import('@deepseek-ai/dsh-subprocess/control')
  const { runNodeMain } = await import('@deepseek-ai/dsh-ptc-runtime-node/process')
  await runNodeMain(openInheritedControlChannel(), Number(process.argv.at(-1)), process)
} else {
  const bundesk = await import('bundesk')
  const { importDesktopPlugin } = await import('./generated/plugin-registry.ts')
  const { runDesktop } = await import('./bin.ts')
  const { configureEmbeddedDshRuntime, configureEmbeddedSharpRuntime } = await import('./dsh-web.ts')
  const { extractEmbeddedDshRuntime } = await import('./embedded-runtime.ts')
  const { configureBundeskRuntime } = await import('./window.ts')

  configureBundeskRuntime(bundesk)
  configureEmbeddedSharpRuntime()
  configureEmbeddedDshRuntime(await extractEmbeddedDshRuntime({
    root: join(import.meta.dir, 'dsh'),
    version: DSH_DESKTOP_VERSION,
  }), importDesktopPlugin)

  try {
    await runDesktop(Bun.argv.slice(2))
  } catch (error) {
    console.error(`dsh-desktop: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
