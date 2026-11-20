import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173 },
  // deck.gl-raster v0.10 依赖链含 top-level await（lzw-tiff-decoder），
  // 构建目标必须提到 esnext，否则 esbuild 拒绝打包。
  esbuild: { target: 'esnext' },
  build: { target: 'esnext' },
  // 官方 example 同款配置。
  worker: { format: 'es' },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    // 只排除 geotiff：它内部用 `new Worker(new URL('./worker.js', import.meta.url))`
    // 创建解码 worker，被预打包成扁平 chunk 后路径会失效。
    // deck.gl 系列必须保留预打包，否则其 CJS 依赖（earcut）无法被正确转换。
    exclude: ['@developmentseed/geotiff']
  }
});
