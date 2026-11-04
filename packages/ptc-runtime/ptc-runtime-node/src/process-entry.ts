/** Private built Node-runtime child entry; source execution calls runNodeMain directly. */
import { runNodeMain } from './process.ts'
import { openProcessControlChannel } from './stdio-channel.ts'

void runNodeMain(openProcessControlChannel(), Number(process.argv[2]), process)
