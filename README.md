# gatsby-plugin-ffmpeg

This is a relatively low level helper plugin for video transcoding with ffmpeg.
You generally shouldn't need to use this.

NOTE: This isn't actually published yet.

## Install

`npm install --save gatsby-plugin-ffmpeg`

ffmpeg with the correct codecs is also required.

### MacOS

The following will install ffmpeg with probably all the codecs you will need.

`brew install ffmpeg --with-vpx --with-vorbis --with-libvorbis --with-vpx --with-vorbis --with-theora --with-libogg --with-libvorbis --with-gpl --with-version3 --with-nonfree --with-postproc --with-libaacplus --with-libass --with-libcelt --with-libfaac --with-libfdk-aac --with-libfreetype --with-libmp3lame --with-libopencore-amrnb --with-libopencore-amrwb --with-libopenjpeg --with-openssl --with-libopus --with-libschroedinger --with-libspeex --with-libtheora --with-libvo-aacenc --with-libvorbis --with-libvpx --with-libx264 --with-libxvid`

You may already have ffmpeg installed via brew, in which case you should use the
`upgrade` command instead.

## How to use

```javascript
// In your gatsby-config.js
plugins: [`gatsby-plugin-ffmpeg`]
```
