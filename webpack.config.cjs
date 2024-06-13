const webpack = require("webpack");
const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = (env) => {
  return {
    resolve: {
      modules: ["node_modules", "src/"],
      fallback: {
        fs: false,
        tls: false,
        net: false,
        path: false,
        zlib: false,
        http: false,
        https: false,
        url: false,
        "https-browserify": false,
        stream: false,
        "stream-browserify": false,
        crypto: false,
        buffer: require.resolve("buffer/"),
        os: false
      },
      extensions: [".ts", ".js", ".mjs"],
    },
    mode: "production",
    entry: ["./src/dokieli.js"],
    output: {
      path: path.join(__dirname, "/scripts/"),
      filename: "dokieli.js",
      library: undefined, 
      libraryExport: 'default', 
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: ["/src/__tests__/", "/node_modules/", "/__testUtils__/"],
        },
      ],
    },
    externals: {
      "text-encoding": "TextEncoder",
      "whatwg-url": "window",
      "isomorphic-fetch": "fetch",
      "@trust/webcrypto": "crypto",
    },
    devtool: "source-map",
    performance: {
      hints: false,
    },
    optimization: {
      usedExports: true,
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ],
    },

    plugins: [
      new webpack.ProvidePlugin({
        process: "process/browser",
        MediumEditor: "medium-editor", 
        MediumEditorTable: "medium-editor-tables"
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
    ],
  };
};
