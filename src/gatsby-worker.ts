import path from 'path'
import throat from 'throat'
import { processFile, WorkerPassedArgs } from './process-file'
import { cpuCoreCount } from 'gatsby-core-utils'

export const VIDEO_PROCESSING_JOB_NAME = `VIDEO_PROCESSING`

const q = throat(cpuCoreCount())

export function VIDEO_PROCESSING(args: WorkerPassedArgs, ...other: any[]) {
  // Queue up processing tasks
  return q(() => processFile(args))
}
