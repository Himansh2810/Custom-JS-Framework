const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, "../App.js"),
  output: {
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
    filename: "bundle.js",
  },
  devServer: {
    client: {
      overlay: false, // ⬅️  This disables the red error overlay
    },
    historyApiFallback: {
      index: "/",
    },
    static: path.join(__dirname, "public"),
    port: 3000,
    open: false,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/page.html",
      filename: "index.html",
      publicPath: "/",
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        include: [
          path.resolve(__dirname, "rector-js"),
          // path.resolve(__dirname, "app"),
        ],
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-react",
                {
                  runtime: "automatic",
                  importSource: "rector-js", // adjust if needed
                },
              ],
            ],
            plugins: [
              path.resolve(__dirname, "plugins/babel-plugin-jsx-vars.js"), // 👈 add plugin here
              path.resolve(
                __dirname,
                "plugins/babel-plugin-props-intercept.js"
              ),
              path.resolve(__dirname, "plugins/babel-plugin-dynamic-attrs.js"),
              // path.resolve(
              //   __dirname,
              //   "plugins/babel-plugin-state-detection.js"
              // ),
            ],
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "rector-js": path.resolve(__dirname, "../rector-js"),
    },
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },
};
