/**
 * Vue配置文件
 */
const { defineConfig } = require('@vue/cli-service');
const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

// 动态读取baseConfig.js中的SITE_CONFIG
const getSiteName = () => {
  try {
    const baseConfigContent = fs.readFileSync(path.resolve(__dirname, 'src/utils/baseConfig.js'), 'utf-8');
    const siteNameMatch = baseConfigContent.match(/siteName:\s*['"]([^'"]+)['"]/);
    return siteNameMatch ? siteNameMatch[1] : 'EZ THEME USER';
  } catch (err) {
    return 'EZ THEME USER';
  }
};

const siteName = getSiteName();

module.exports = defineConfig({
  // 部署应用包时的基本URL
  publicPath: '/theme/default/',
  
  // 输出目录
  outputDir: 'dist',
  
  // 静态资源目录
  assetsDir: 'static',
  
  // 是否使用eslint
  lintOnSave: process.env.NODE_ENV === 'development',
  
  // 生产环境是否生成sourceMap
  productionSourceMap: false,
  
  // 配置别名
  configureWebpack: config => {
    
    
    // 基本配置
    config.resolve = {
      ...config.resolve,
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    };
    
    // 配置WebAssembly文件处理
    config.module = {
      ...config.module,
      rules: [
        ...config.module.rules,
        {
          test: /\.wasm$/,
          type: 'asset/resource',
          generator: {
            filename: 'static/modules/core/[name][ext]'
          }
        }
      ]
    };
    

    // 代码分割优化：分离 vendor 和公共模块，提升缓存命中率和并行加载
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // 将 vue、vue-router、vuex、vue-i18n 等核心框架单独打包
          vueVendor: {
            test: /[/]node_modules[/](vue|vue-router|vuex|vue-i18n|@vue)[/]/,
            name: 'chunk-vue-vendor',
            priority: 20,
            reuseExistingChunk: true
          },
          // UI 库单独打包
          uiVendor: {
            test: /[/]node_modules[/](@tabler[/]icons-vue|qrcode.vue)[/]/,
            name: 'chunk-ui-vendor',
            priority: 15,
            reuseExistingChunk: true
          },
          // 其他第三方依赖
          libs: {
            test: /[/]node_modules[/]/,
            name: 'chunk-libs',
            priority: 10,
            minChunks: 2,
            reuseExistingChunk: true
          }
        }
      }
    };

    // 添加插件
    config.plugins.push(
      // 使用DefinePlugin定义全局变量
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: JSON.stringify(true),
        __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false)
      })
    );
    
    // 忽略 Sass 弃用警告
    config.ignoreWarnings = [
      {
        module: /sass-loader/,
        message: /The legacy JS API is deprecated/
      }
    ];
    
    // 默认主题源码由项目直接维护，不再混淆业务代码，便于持续开发和排查。
  },
  
  // CSS配置
  css: {
    loaderOptions: {
      sass: {
        implementation: require('sass'),
        sassOptions: {
          outputStyle: 'expanded',
          fiber: false,
          indentedSyntax: false,
          includePaths: ['node_modules']
        },
        additionalData: `
          @use "@/assets/styles/base/variables.scss" as *;
        `
      }
    }
  },
  
  // 多页面配置
  pages: {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html',
      title: siteName
    }
  },

  devServer: {
    client: {
      overlay: false
    }
  }
}); 
