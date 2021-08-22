import { Reporter, Actions, Node } from 'gatsby'
import path from 'path'
import { VIDEO_PROCESSING_JOB_NAME } from './gatsby-worker'
import { WorkerProcessingArgs, WorkerReturnArgs } from './process-file'
import {
  Pipeline,
  FileNode,
  serialiseFfmpegPipeline,
  serialiseJob,
} from './pipeline'
import { createHash } from 'crypto'

export interface TranscodeOptions {
  pipelines: Pipeline[]
}

let actions!: Actions

export const setActions = (_actions: Actions) => {
  actions = _actions
}

export async function transcode({
  file,
  options,
  reporter,
}: {
  file: FileNode
  options: TranscodeOptions
  reporter: Reporter
}) {
  if (!actions) {
    reporter.panic(
      `Gatsby-plugin-ffmpeg wasn't setup correctly in gatsby-config.js. Make sure you add it to the plugins array.`
    )
  }

  if (!options.pipelines || options.pipelines.length < 1) {
    reporter.panic(
      `Gatsby-plugin-ffmpeg was passed a transcode job with no pipelines`
    )
  }

  // Calculate the smallest bounds for the video
  // TODO: Should this be the largest?
  let presentationMaxWidth = Infinity
  let presentationMaxHeight = Infinity

  options.pipelines.forEach((pipeline) => {
    if (pipeline.maxWidth < presentationMaxWidth) {
      presentationMaxWidth = pipeline.maxWidth
    }
    if (pipeline.maxHeight < presentationMaxHeight) {
      presentationMaxHeight = pipeline.maxHeight
    }
  })

  const jobs: Promise<WorkerReturnArgs>[] = []
  // Serialise the pipeline to send over the bridge
  //
  for (const pipeline of options.pipelines) {
    const argsDigestShort = hashPipeline(file, pipeline)
    const videoSrc = `/${file.name}-${file.internal.contentDigest}-${argsDigestShort}.${pipeline.fileExtension}`
    const filePath = path.join(process.cwd(), `public`, `static`, videoSrc)

    const serialised = serialiseJob(file, pipeline, filePath, reporter)

    const args: WorkerProcessingArgs = {
      userDisplayedName: `ffmpeg [${pipeline.name}] - ${file.base} -> ${file.name}.${pipeline.fileExtension}`,
      serialisedPipeline: serialised,
      maxHeight: pipeline.maxHeight,
      maxWidth: pipeline.maxWidth,

      absolutePath: filePath,
      originalName: file.base,
      fileExtension: pipeline.fileExtension,
      src: `/static${videoSrc}`,
    }

    // Create a job for the serialised pipeline
    const job = actions.createJobV2({
      name: VIDEO_PROCESSING_JOB_NAME,
      inputPaths: [file.absolutePath],
      args: args,
      outputDir: path.dirname(filePath),
    }) as Promise<WorkerReturnArgs>

    jobs.push(job)
  }

  const videos = await Promise.all(jobs)

  const aspectRatio = videos[0].aspectRatio

  return {
    aspectRatio,
    width: videos[0].width,
    height: videos[0].height,
    presentationMaxWidth,
    presentationMaxHeight,
    videos: videos,
    originalName: file.base,
  }
}

function hashPipeline(file: FileNode, pipeline: Pipeline) {
  const argsDigest = createHash(`md5`)
    .update(
      JSON.stringify(
        Object.assign({}, pipeline, {
          transcode: pipeline.transcode.toString(), // reflection!
        })
      )
    )
    .digest(`hex`)

  const argsDigestShort = argsDigest.substr(argsDigest.length - 5)

  return argsDigestShort
}
