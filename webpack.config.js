const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './app/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/',      // critical for SPA routing
    filename: 'bundle.js',
  },
  devServer: {
    historyApiFallback: {
      index: '/',
    },
    static: path.join(__dirname, 'public'),
    port: 3000,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './app/page.html',
      filename: 'index.html',
      publicPath: '/',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        include: [
          path.resolve(__dirname, 'rector-js'),
          path.resolve(__dirname, 'app'),
        ],
      },
      // add more loaders here if needed
    ],
  },
  resolve: {
    extensions: ['.js', '.ts'],
  },
};
