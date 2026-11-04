/** Control channel over the child's standard streams for hosts without inherited descriptors. */
import { Duplex, type Readable, type Writable } from 'node:stream'
import { openInheritedControlChannel } from '@deepseek-ai/dsh-subprocess/control'

/** Child environment marker selecting the standard-stream control channel. */
export const PTC_STDIO_CONTROL_ENV = 'DSH_PTC_CONTROL_STDIO' as const

/**
 * Whether this process runs under Bun rather than Node.
 * @returns true when the runtime executes under Bun.
 */
export function isBunRuntime(): boolean {
  return (globalThis as { Bun?: unknown }).Bun !== undefined
}

/**
 * Build one duplex control channel from a readable and a writable stream.
 * A Bun host cannot inherit the descriptor Node children use, so the parent's
 * stdin/stdout pipes carry the same length-prefixed frames instead.
 * @param input - stream carrying child-to-host bytes.
 * @param output - stream carrying host-to-child bytes.
 * @returns the duplex the RPC transport owns.
 */
export function stdioControlChannel(input: Readable, output: Writable): Duplex {
  const write = output.write.bind(output)
  const channel = new Duplex({
    read() { input.resume() },
    write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      write(chunk, callback)
    },
    final(callback: (error?: Error | null) => void) {
      output.end()
      callback()
    },
  })
  input.on('data', (chunk: Buffer) => { channel.push(chunk) })
  input.on('end', () => { channel.push(null) })
  input.on('error', (error: Error) => { channel.destroy(error) })
  return channel
}

/**
 * Open the control channel the launching host requested: standard streams for a
 * Bun packaged host, the inherited descriptor otherwise.
 * @returns the duplex the program transport reads and writes.
 */
export function openProcessControlChannel(): Duplex {
  if (process.env[PTC_STDIO_CONTROL_ENV] === '1') {
    Reflect.deleteProperty(process.env, PTC_STDIO_CONTROL_ENV)
    return stdioControlChannel(process.stdin, process.stdout)
  }
  return openInheritedControlChannel()
}
