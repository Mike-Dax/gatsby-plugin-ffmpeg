const crypto = require(`crypto`)
const _ = require(`lodash`)
const Promise = require(`bluebird`)
const fs = require(`fs`)
const ProgressBar = require(`progress`)
const queue = require(`async/queue`)
const path = require(`path`)
const existsSync = require(`fs-exists-cached`).sync
const { boundActionCreators } = require(`gatsby/dist/redux/actions`)

const ffmpeg = require('fluent-ffmpeg')

// Promisify ffmpeg for ffprobe
Promise.promisifyAll(ffmpeg, { multiArgs: true })

const bar = new ProgressBar(
  `Transcoding Videos [:bar] :current/:total :elapsed secs :percent`,
  {
    total: 0,
    width: 30,
  },
)

const reportError = (message, err, reporter) => {
  if (reporter) {
    reporter.error(message, err)
  } else {
    console.error(message, err)
  }

  if (process.env.gatsby_executing_command === `build`) {
    process.exit(1)
  }
}

function notMemoizedGetVideoDimensions(path) {
  return ffmpeg.ffprobeAsync(path).then(metadata => {
    // just pick the first stream

    if (!metadata[0].streams) {
      console.warn(path, 'has no video streams?')
      return null
    }

    const stream = metadata[0].streams[0]

    return {
      width: stream.width,
      height: stream.height,
    }
  })
}

const videoDimensionCache = new Map()
const getVideoDimensions = async file => {
  if (
    process.env.NODE_ENV !== `test` &&
    videoDimensionCache.has(file.internal.contentDigest)
  ) {
    return videoDimensionCache.get(file.internal.contentDigest)
  } else {
    const dimensions = await notMemoizedGetVideoDimensions(file.absolutePath)
    videoDimensionCache.set(file.internal.contentDigest, dimensions)
    return dimensions
  }
}

let totalJobs = 0
const processFile = async (file, jobs, cb, reporter) => {
  bar.total = totalJobs

  let videosFinished = 0

  const filePath = file.absolutePath

  let pipeline
  try {
    pipeline = ffmpeg(filePath)
  } catch (err) {
    reportError(`Failed to process video ${filePath}`, err, reporter)
    jobs.forEach(job => job.outsideReject(err))
    return
  }

  const dimensions = await getVideoDimensions(file)
  const aspectRatio = dimensions.width / dimensions.height

  jobs.forEach(async job => {
    const options = job.options
    let clonedPipeline
    if (jobs.length > 1) {
      clonedPipeline = pipeline.clone()
    } else {
      clonedPipeline = pipeline
    }

    // use the provided pipeline
    clonedPipeline = options.transcode(clonedPipeline)

    let width
    let height

    if (aspectRatio < 1) {
      width = options.maxWidth
      height = Math.round(width / aspectRatio)
    } else {
      height = options.maxHeight
      width = Math.round(height * aspectRatio)
    }

    // resize
    clonedPipeline = clonedPipeline.size(`${width}x${height}`)

    const onFinish = err => {
      videosFinished += 1
      bar.tick()

      boundActionCreators.setJob(
        {
          id: `processing video ${job.file.absolutePath}`,
          videosFinished,
        },
        { name: `gatsby-plugin-ffmpeg` },
      )

      if (err) {
        reportError(`Failed to process video ${filePath}`, err, reporter)
        job.outsideReject(err)
      } else {
        job.outsideResolve()
      }
    }

    // run the pipeline
    clonedPipeline
      .output(job.outputPath)
      .on('end', onFinish)
      .on('error', onFinish)
      .run()
  })

  // Wait for each job promise to resolve.
  Promise.all(jobs.map(job => job.finishedPromise)).then(() => cb())
}

const toProcess = {}
const q = queue((task, callback) => {
  task(callback)
}, 1)

const queueJob = (job, reporter) => {
  const inputFileKey = job.file.absolutePath.replace(/\./g, `%2E`)
  const outputFileKey = job.outputPath.replace(/\./g, `%2E`)
  const jobPath = `${inputFileKey}.${outputFileKey}`

  // Check if the job has already been queued. If it has, there's nothing
  // to do, return.
  if (_.has(toProcess, jobPath)) {
    return
  }

  // Check if the output file already exists so we don't redo work.
  if (existsSync(job.outputPath)) {
    return
  }

  let notQueued = true
  if (toProcess[inputFileKey]) {
    notQueued = false
  }
  _.set(toProcess, jobPath, job)

  totalJobs += 1

  if (notQueued) {
    q.push(cb => {
      const jobs = _.values(toProcess[inputFileKey])
      // Delete the input key from the toProcess list so more jobs can be queued.
      delete toProcess[inputFileKey]
      boundActionCreators.createJob(
        {
          id: `processing video ${job.file.absolutePath}`,
          videosCount: _.values(toProcess[inputFileKey]).length,
        },
        { name: `gatsby-plugin-ffmpeg` },
      )
      // We're now processing the file's jobs.
      processFile(
        job.file,
        jobs,
        () => {
          boundActionCreators.endJob(
            {
              id: `processing video ${job.file.absolutePath}`,
            },
            { name: `gatsby-plugin-ffmpeg` },
          )
          cb()
        },
        reporter,
      )
    })
  }
}

async function queueVideoTranscode({ file, options = {}, reporter }) {
  const fileExtension = options.fileExtension

  const argsDigest = crypto
    .createHash(`md5`)
    .update(
      JSON.stringify(
        Object.assign({}, options, {
          transcode: options.transcode.toString(), // reflection!
        }),
      ),
    )
    .digest(`hex`)

  const argsDigestShort = argsDigest.substr(argsDigest.length - 5)

  const videoSrc = `/${file.name}-${
    file.internal.contentDigest
  }-${argsDigestShort}.${fileExtension}`
  const filePath = path.join(process.cwd(), `public`, `static`, videoSrc)

  // Create function to call when the image is finished.
  let outsideResolve, outsideReject
  const finishedPromise = new Promise((resolve, reject) => {
    outsideResolve = resolve
    outsideReject = reject
  })

  // Create job and process.
  const job = {
    file,
    options: options,
    finishedPromise,
    outsideResolve,
    outsideReject,
    inputPath: file.absolutePath,
    outputPath: filePath,
  }

  // queue up the job
  queueJob(job, reporter)

  // TODO: Do we need a path prefix?
  const prefixedSrc = `/static` + videoSrc

  let width
  let height

  // Calculate the eventual width/height of the image.
  const dimensions = await getVideoDimensions(file)

  let aspectRatio = dimensions.width / dimensions.height

  if (aspectRatio < 1) {
    width = options.maxWidth
    height = Math.round(width / aspectRatio)
  } else {
    height = options.maxHeight
    width = Math.round(height * aspectRatio)
  }

  const originalName = file.base

  return {
    src: prefixedSrc,
    absolutePath: filePath,
    finishedPromise,
    originalName,
    fileExtension,
    width,
    height,
    aspectRatio,
  }
}

async function transcode({ file, options = {}, reporter }) {
  if (!options.pipelines || options.pipelines.length < 1) {
    reportError(
      `FFMPEG Options has no pipelines`,
      new Error('gatsby-plugin-ffmpeg has no pipelines!'),
      reporter,
    )
    return
  }

  const videos = await Promise.all(
    options.pipelines.map(pipeline =>
      queueVideoTranscode({
        file,
        options: pipeline,
        reporter,
      }),
    ),
  )

  const originalName = file.base

  let presentationMaxWidth = 999999
  let presentationMaxHeight = 999999

  options.pipelines.forEach(pipeline => {
    if (pipeline.maxWidth < presentationMaxWidth) {
      presentationMaxWidth = pipeline.maxWidth
    }
    if (pipeline.maxHeight < presentationMaxHeight) {
      presentationMaxHeight = pipeline.maxHeight
    }
  })

  const aspectRatio = videos[0].aspectRatio

  return {
    aspectRatio,
    width: videos[0].width,
    height: videos[0].height,
    presentationMaxWidth,
    presentationMaxHeight,
    videos: videos,
    originalName: originalName,
  }
}

exports.getVideoDimensions = getVideoDimensions
exports.transcode = transcode
