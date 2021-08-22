import ffmpeg, { FfmpegCommand, FfmpegCommandLogger } from 'fluent-ffmpeg'
import { Node, Reporter } from 'gatsby'

export interface FileNode extends Node {
  id: string
  internal: {
    contentDigest: string // 'cab08b36195edb1a1231d2d09fa450e0',
    type: string // 'File',
    mediaType: string // 'video/mp4',
    description: string // 'File "src/markdown-pages/BigBuckBunny.mp4"',
    owner: string // 'gatsby-source-filesystem',
    counter: number // 32
  }
  sourceInstanceName: string // 'markdown-pages',
  relativePath: string // 'BigBuckBunny.mp4',
  extension: string // 'mp4',
  prettySize: string // '158 MB',
  modifiedTime: string // '2021-08-21T04:47:35.603Z',
  accessTime: string // '2021-08-21T06:08:26.766Z',
  changeTime: string // '2021-08-21T04:47:39.613Z',
  birthTime: string // '2021-08-21T04:47:19.591Z',
  root: string // '/',
  dir: string // '/Users/whatever/src/markdown-pages',
  base: string // 'BigBuckBunny.mp4',
  ext: string // '.mp4',
  name: string // 'BigBuckBunny',
  absolutePath: string // '/Users/whatever/src/markdown-pages/BigBuckBunny.mp4',
  relativeDirectory: string // '',
  dev: number // 16777220,
  mode: number // 33188,
  nlink: number // 1,
  uid: number // 501,
  rdev: number // 0,
  blksize: number // 4096,
  ino: number // 125334133,
  size: number // 158008374,
  blocks: number // 308824,
  atimeMs: number // 1629526106766.1929,
  mtimeMs: number // 1629521255602.6372,
  ctimeMs: number // 1629521259613.3406,
  birthtimeMs: number // 1629521239590.8076,
  atime: string // '2021-08-21T06:08:26.766Z',
  mtime: string // '2021-08-21T04:47:35.603Z',
  ctime: string // '2021-08-21T04:47:39.613Z',
  birthtime: string // '2021-08-21T04:47:19.591Z'
}

export interface Pipeline {
  /**
   * The name of this pipeline
   */
  name: string

  /**
   * Transcode function, take the ffmpeg fluent object and return the chained pipeline with the desired attributes.
   */
  transcode: (chain: FfmpegCommand) => FfmpegCommand

  /**
   * The file extension of the final file
   */
  fileExtension: string

  /**
   * The maximum height of this pipeline result
   */
  maxHeight: number

  /**
   * The maximum width of this pipeline result
   */
  maxWidth: number
}

export function serialiseJob(
  file: FileNode,

  pipeline: Pipeline,
  outputFilePath: string,

  reporter: Reporter
) {
  let f: FfmpegCommand
  try {
    f = ffmpeg(file.absolutePath)
  } catch (err) {
    reporter.error(err)
    reporter.panic(`Failed to process video ${file.absolutePath}`)
  }

  // Run their transcode function to give us the ready pipeline
  f = pipeline.transcode(f).output(outputFilePath)

  const serialised = serialiseFfmpegPipeline(f)

  return serialised
}

interface Input {
  source: string
  options: {
    get: () => string[]
  }
}

interface Output {
  flags: {
    [key: string]: string
  }
  audio: string[]
  audioFilters: string[]
  video: string[]
  videoFilters: string[]
  sizeFilters: string[]
  options: string[]
  sizeData: {
    [key: string]: string
  }
  target: string
}

interface Serialised {
  _inputs: {
    source: string
    options: string[]
  }[]
  _output: Output
  _global: string[]
  _complexFilters: string[]
}

export function serialiseFfmpegPipeline(f: FfmpegCommand) {
  let unsafe = f as any

  // Options and loggers are stripped out

  let serialised: Partial<Serialised> = {
    // Inputs
    _inputs: unsafe._inputs.map((input: Input) => ({
      source: input.source,
      options: input.options.get(),
    })),

    _global: unsafe._global.get(),
    _complexFilters: unsafe._complexFilters.get(),
  }

  if (!('target' in unsafe._outputs[0])) {
    //
    throw new Error(`Only able to send complete pipelines over the bridge`)
  } else {
    // Grab the first output
    const currentOutput = unsafe._outputs[0]

    const output: Output = {
      flags: {},
      audio: currentOutput.audio.get(),
      audioFilters: currentOutput.audioFilters.get(),
      video: currentOutput.video.get(),
      videoFilters: currentOutput.videoFilters.get(),
      sizeFilters: currentOutput.sizeFilters.get(),
      options: currentOutput.options.get(),
      target: currentOutput.target,
      sizeData: {},
    }

    serialised._output = output

    if (currentOutput.sizeData) {
      for (const key of Object.keys(currentOutput.sizeData)) {
        output.sizeData[key] = currentOutput.sizeData[key]
      }
    }

    for (const key of Object.keys(currentOutput.flags)) {
      output.flags[key] = currentOutput.flags[key]
    }
  }

  return JSON.stringify(serialised as Serialised)
}

export function deserialiseFfmpegPipeline(
  serialised: string,
  logger: FfmpegCommandLogger
): FfmpegCommand {
  const obj: Serialised = JSON.parse(serialised)

  let f = ffmpeg({ logger })

  for (const input of obj._inputs) {
    f = f.input(input.source)
    if (input.options.length > 0) {
      f = f.inputOptions(input.options)
    }
  }

  f = f.output(obj._output.target)

  if (Object.keys(obj._output.flags).length > 0) {
    // mutate the flags directly, not sure how to set this with their API
    ;(f as any)._outputs[0].flags = obj._output.flags
  }

  if (obj._output.audio.length > 0) {
    for (const arg of obj._output.audio) {
      ;(f as any)._outputs[0].audio(arg)
    }
  }

  if (obj._output.audioFilters.length > 0) {
    ;(f as any)._outputs[0].audioFilters(obj._output.audioFilters)
  }

  if (obj._output.video.length > 0) {
    for (const arg of obj._output.video) {
      ;(f as any)._outputs[0].video(arg)
    }
  }

  if (obj._output.videoFilters.length > 0) {
    ;(f as any)._outputs[0].videoFilters(obj._output.videoFilters)
  }

  if (obj._output.sizeFilters.length > 0) {
    ;(f as any)._outputs[0].sizeFilters(obj._output.sizeFilters)
  }

  if (Object.keys(obj._output.sizeData).length > 0) {
    // mutate the sizeData directly, not sure how to set this with their API
    ;(f as any)._outputs[0].sizeData = obj._output.sizeData
  }

  if (obj._output.options.length > 0) {
    f = f.outputOptions(obj._output.options)
  }

  // console.log(serialised)
  // console.log('round trip ->')
  // console.log(serialiseFfmpegPipeline(f))

  return f
}
