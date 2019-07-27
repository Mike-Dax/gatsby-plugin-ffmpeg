# gatsby-plugin-ffmpeg

This is a relatively low level helper plugin for video transcoding with ffmpeg.
You generally shouldn't need to use this.

You're most likely looking for [gatsby-remark-videos](https://github.com/Mike-Dax/gatsby-remark-videos) if you want to automatically convert videos in your markdown, or [gatsby-transformer-ffmpeg](https://github.com/Mike-Dax/gatsby-transformer-ffmpeg) if you're looking to use these videos elsewhere in your website

## Install

`npm install --save gatsby-plugin-ffmpeg`

ffmpeg with the correct codecs is also required.

### MacOS

With Homebrew 2.0.3/ffmpeg 4.1.1 ffmpeg options are no longer available on the default tap.

From https://trac.ffmpeg.org/wiki/CompilationGuide/macOS

The following will install ffmpeg.

```
brew tap varenc/ffmpeg
brew tap-pin varenc/ffmpeg
brew install ffmpeg $(brew options ffmpeg --compact)
```
