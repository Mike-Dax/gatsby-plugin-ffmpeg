import fs from 'fs'
import ffmpeg, { FfprobeData } from 'fluent-ffmpeg'
import reporter from 'gatsby-cli/lib/reporter'
import { deserialiseFfmpegPipeline, FileNode } from './pipeline'
import { promisify } from 'util'

export class Deferred<T> {
  promise!: Promise<T>
  resolve!: (val: T) => void
  reject!: (err: any) => void
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

export interface WorkerProcessingArgs {
  userDisplayedName: string
  serialisedPipeline: string
  maxHeight: number
  maxWidth: number

  absolutePath: string
  originalName: string
  fileExtension: string
  src: string

  [key: string]: string | number
}

export interface WorkerPassedArgs {
  inputPaths: {
    path: string
    contentDigest: string
  }[]
  outputDir: string
  args: WorkerProcessingArgs
}

export interface WorkerReturnArgs {
  width: number
  height: number
  aspectRatio: number

  absolutePath: string
  originalName: string
  fileExtension: string
  src: string
}

export async function processFile(args: WorkerPassedArgs) {
  const options = args.args

  const logger = {
    error: (message: string) => reporter.error(message),
    warn: (message: string) => reporter.warn(message),
    info: (message: string) => reporter.info(message),
    debug: (message: string) => reporter.info(message),
  }

  let pipeline = deserialiseFfmpegPipeline(options.serialisedPipeline, logger)

  // Get the dimensions for sizing
  const stream = await getVideoStreamInfo(args.inputPaths[0].path)
  const aspectRatio = (stream.width ?? 1) / (stream.height ?? 1)

  let width: number
  let height: number

  if (aspectRatio < 1) {
    width = options.maxWidth
    height = Math.round(width / aspectRatio)
  } else {
    height = options.maxHeight
    width = Math.round(height * aspectRatio)
  }

  // Resize
  pipeline = pipeline.size(`${width}x${height}`)

  const deferred = new Deferred()

  let frames = 100

  if (stream.nb_frames) {
    frames = Number(stream.nb_frames)
  }

  const progress = reporter.createProgress(options.userDisplayedName, frames, 0)

  progress.start()

  // The progress reporter API is only incremental so we have to keep track of integer percents ourselves
  let reportedFrameCount = 0

  // Attach handlers to our pipeline
  pipeline
    .on('end', deferred.resolve)
    .on('error', deferred.reject)
    .on('progress', function (info: { percent: number }) {
      const currentFrameCount = Math.floor((info.percent / 100) * frames)
      const diff = currentFrameCount - reportedFrameCount

      if (diff >= 1) {
        progress.tick(diff)
        reportedFrameCount = currentFrameCount
      }
    })
    .run()

  await deferred.promise

  progress.done()

  return {
    width,
    height,
    aspectRatio,
    absolutePath: options.absolutePath,
    originalName: options.originalName,
    fileExtension: options.fileExtension,
    src: options.src,
  }

  //   await fs.promises.writeFile('flame.mp4', ffmpeg.FS('readFile', 'flame.mp4'))
}

const ffprobeAsync = promisify(ffmpeg.ffprobe)

async function getVideoStreamInfo(filePath: string) {
  const metadata = (await ffprobeAsync(filePath)) as FfprobeData

  // just pick the first stream
  if (metadata.streams.length === 0) {
    throw new Error(`Video file has no video streams: ${filePath}`)
  }

  const stream = metadata.streams[0]

  return stream
}
