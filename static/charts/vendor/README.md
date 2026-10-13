`plot.js` is Observable Plot 0.6.17 (and the d3 modules it uses, all ISC licensed: see `LICENSE-plot`) bundled as a single ES module:

    echo 'export * from "@observablehq/plot";' > entry.js
    npx esbuild entry.js --bundle --minify --format=esm --outfile=plot.js
