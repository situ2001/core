// tslint:disable:no-var-requires
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const FriendlyErrorsWebpackPlugin = require('friendly-errors-webpack-plugin');
const webpack = require('webpack');
const path = require('path');
const utils = require('./utils');

const tsConfigPath = path.join(__dirname, '../../../tsconfig.json');
const port = 8080;

exports.createWebpackConfig = function (dir) {
  return {
    entry: dir + '/example/app',
    node: {
      net: "empty",
      child_process: "empty",
      path: "empty",
      url: false,
      fs: "empty"
    },
    output: {
      filename: 'bundle.js',
      path: dir + '/dist',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json', '.less'],
      plugins: [new TsconfigPathsPlugin({
        configFile: tsConfigPath
      })],
      alias: {
        'vscode': require.resolve('monaco-languageclient/lib/vscode-compatibility')
      }
    },
    mode: 'development',
    devtool: 'eval',
    module: {
      // https://github.com/webpack/webpack/issues/196#issuecomment-397606728
      exprContextCritical: false,
      rules: [{
          test: /\.tsx?$/,
          loader: 'ts-loader',
          options: {
            configFile: path.join(__dirname, '../../../tsconfig.json'),
          }
        },
        {
          test: /\.png$/,
          use: 'file-loader',
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
        {
          test: /\.module.less$/,
          use: [{
              loader: "style-loader"
            },
            {
              loader: "css-loader",
              options: {
                sourceMap: true,
                modules: true,
                localIdentName: "[local]___[hash:base64:5]"
              }
            },
            {
              loader: "less-loader"
            }
          ]
        },
        {
          test: /^((?!\.module).)*less$/,
          loader: 'style!css!less'
        },
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          use: [{
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'fonts/'
            }
          }]
        }
      ],
    },
    resolveLoader: {
      modules: [path.join(__dirname, '../../../node_modules'), path.join(__dirname, '../node_modules'), path.resolve('node_modules')],
      extensions: ['.ts', '.tsx', '.js', '.json', '.less'],
      mainFields: ['loader', 'main'],
      moduleExtensions: ['-loader'],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: __dirname + '/index.html',
      }),
      new MiniCssExtractPlugin({
        filename: '[name].[chunkhash:8].css',
        chunkFilename: '[id].css',
      }),
      new webpack.DefinePlugin({
        "process.browser": JSON.stringify(true),
        'process.env.WORKSPACE_DIR': JSON.stringify(path.join(__dirname, '../../workspace'))
      }),
      new FriendlyErrorsWebpackPlugin({
        compilationSuccessInfo: {
            messages: [`Your application is running here: http://localhost:${port}`],
        },
        onErrors: utils.createNotifierCallback(),
        clearConsole: true,
      }),
    ],
    devServer: {
      contentBase: dir + '/public',
      port,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
        },
        '/socket.io': {
          ws: true,
          target: 'ws://localhost:8000',
        },
      },
      quiet: true,
      overlay: true,
      open: true,
    }
  };
}
