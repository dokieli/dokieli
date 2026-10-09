const webpack = require("webpack");
const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const dotenv = require('dotenv');

dotenv.config();

module.exports = (env) => {
  const minimize = !!(env && env.minimize);

  const base = {
    resolve: {
      alias: {
        'src': path.resolve(__dirname, 'src'),
      },
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
      minimize,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false,
              ascii_only: true,
            },
          },
          extractComments: false,
        }),
      ],
    },

    plugins: [
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new webpack.DefinePlugin({
        "process.env.CLIENT_ID": JSON.stringify(process.env.CLIENT_ID),
        "process.env.DEV_CLIENT_ID": JSON.stringify(process.env.DEV_CLIENT_ID),
        "process.env.OIDC_REDIRECT_URI": JSON.stringify(process.env.OIDC_REDIRECT_URI),
        "process.env.DEV_ORIGIN": JSON.stringify(process.env.DEV_ORIGIN),
        "process.env.YWEBSOCKET_URL": JSON.stringify(process.env.YWEBSOCKET_URL),
        "process.env.DEMO_URL": JSON.stringify(process.env.DEMO_URL),
        "process.env.NANOPUB_TEST_REGISTRY": JSON.stringify(process.env.NANOPUB_TEST_REGISTRY),
      })
    ],
  };

  const rules = [
    {
      test: /\.js$/,
      exclude: ["/src/__tests__/", "/node_modules/", "/__testUtils__/"],
    },
  ];

  // Built per entry so a script never downloads chunks for code it already has; chunks are found next to the script
  const web = (name, entry) => ({
    ...base,
    name,
    entry: { [name]: entry },
    output: {
      path: path.join(__dirname, "/scripts/"),
      filename: "[name].js",
      chunkFilename: `chunks/${name}.[name].[contenthash:8].js`,
      // Removes this build's old chunks; other builds share scripts/
      clean: { keep: (asset) => !asset.startsWith(`chunks/${name}.`) },
      publicPath: "auto",
      uniqueName: name,
      library: undefined,
      libraryExport: 'default',
    },
    module: { rules },
    plugins: [...base.plugins, new webpack.DefinePlugin({ "process.env.SINGLE_FILE": JSON.stringify(false) })],
  });

  // Extension and single-file use: everything in one file, because a script injected by the extension cannot load more files
  const bundle = {
    ...base,
    name: "bundle",
    entry: {
      "dokieli.bundle": "./src/dokieli.js",
      "extension-background": "./extension-background.js",
    },
    output: {
      path: path.join(__dirname, "/scripts/"),
      filename: "[name].js",
      publicPath: "",
      library: undefined,
      libraryExport: 'default',
    },
    module: {
      rules,
      parser: { javascript: { dynamicImportMode: "eager" } },
    },
    plugins: [...base.plugins, new webpack.DefinePlugin({ "process.env.SINGLE_FILE": JSON.stringify(true) })],
  };

  return [web("dokieli", "./src/dokieli.js"), web("popup", "./src/popup.js"), bundle];
};
