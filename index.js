#!/usr/bin/env node

const path = require('path')
const fs = require('fs')
const brotliSize = require('brotli-size').default
const cleanup = require('rollup-plugin-cleanup')
const commonjs = require('@rollup/plugin-commonjs')
const json = require('@rollup/plugin-json')
const nodeResolve = require('@rollup/plugin-node-resolve').default
const rollup = require('rollup')
const terser = require('rollup-plugin-terser').terser
const { visualizer } = require('rollup-plugin-visualizer')
const sourcemaps = require('rollup-plugin-sourcemaps')
const typescript = require('@rollup/plugin-typescript')
const css = require('rollup-plugin-css-only')

const argv = process.argv.slice(2)
const compress = (argv.includes('--minify') && argv.splice(argv.indexOf('--minify'), 1))
  || (argv.includes('-m') && argv.splice(argv.indexOf('-m'), 1))

const format = (argv.includes('--format') && argv.splice(argv.indexOf('--format'), 2)[1]) || 'es'

const inline = (argv.includes('--inline') && argv.splice(argv.indexOf('--inline'), 1))

const visualize = (argv.includes('--visualize') && argv.splice(argv.indexOf('--visualize'), 2)[1]) || ''

const [input, file] = argv
if (!input || !file) {
  console.error('Usage: bunzee <input> <output> [--minify|-m] [--inline] [--visualize treemap] [--format <cjs|es|..>]')
  process.exit(1)
}

exports.tsOptions = {
  tsconfig: false,
  include: ['**/*.ts', '**/*.tsx'],
  compilerOptions: {
    module: 'esnext',
    target: 'esnext',
    moduleResolution: 'node',
    useDefineForClassFields: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipDefaultLibCheck: true,
    skipLibCheck: true,
    allowJs: true,
    inlineSources: true,
    sourceMap: true,
    jsx: 'react-jsx',
  },
}

exports.terserOptions = {
  compress: {
    keep_infinity: true,
    passes: 10,
  },
  format: {
    wrap_func_args: false,
    comments: /^\s*([@#]__[A-Z]+__\s*$|@cc_on)/,
    preserve_annotations: true,
  },
  module: true,
  ecma: 2022,
  toplevel: true,
  mangle: true,
}

exports.getCode = chunks => {
  const { output } = chunks
  const { code, map } = output[0]
  // https://github.com/rollup/rollup/issues/3913
  // this looks ridiculous, but it prevents sourcemap tooling from mistaking
  // this for an actual sourceMappingURL
  let SOURCEMAPPING_URL = 'sourceMa'
  SOURCEMAPPING_URL += 'ppingURL'
  const url = map.toUrl()
  return code + `//# ${SOURCEMAPPING_URL}=${url}\n`
}

const audioWorkletToDataUrl = require('./audioworklet-to-data-url')

let outputOptions
let outputType = path.extname(file)

let cssOutput = ''

const inputOptions = {
  input,
  plugins: [
    json(),
    css({
      output(styles) {
        cssOutput = styles
      },
    }),
    commonjs(),
    nodeResolve(),
    typescript(exports.tsOptions),
    sourcemaps(),
    visualize && visualizer({ template: visualize, open: true, sourcemap: true }),
    audioWorkletToDataUrl(),
    !compress && cleanup({
      comments: /.*/g,
    }),
    compress && terser(exports.terserOptions),
    {
      name: 'postprocessing',
      writeBundle(_, bundle) {
        Object.values(bundle).map(({ code }) => {
          if (code) {
            brotliSize(code).then(size => {
              console.log('actual:', code.length)
              console.log('brotli:', size)
            }).catch(() => null)
          }
        })
      },
    },
  ],
}

async function buildHtml(inputOptions, outputOptions) {
  try {
    const bundle = await rollup.rollup(inputOptions)
    return await bundle.generate(outputOptions)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

async function buildJs(inputOptions, outputOptions) {
  try {
    const bundle = await rollup.rollup(inputOptions)
    await bundle.write(outputOptions)
    console.log('Finished. Output file:', file)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

if (outputType === '.js') {
  outputOptions = {
    file,
    format,
    sourcemap: inline ? 'inline' : true,
  }
  buildJs(inputOptions, outputOptions)
} else if (outputType === '.html') {
  outputOptions = {
    format: 'es',
    sourcemap: 'inline',
  }
  buildHtml(inputOptions, outputOptions).then(chunks => {
    const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
    const html = template
      .replace('<!-- title -->', () => path.basename(input, path.extname(input)))
      .replace('/* css */', () => cssOutput)
      .replace('<!-- bundle -->', () => `<script type="module">${exports.getCode(chunks)}</script>`)
    fs.writeFileSync(file, html, 'utf8')
    console.log('Finished. Output file:', file)
  })
}
