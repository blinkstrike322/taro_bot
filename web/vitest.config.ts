import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // css.postcss отключён: иначе vite подхватывает postcss.config.mjs
  // от Next (плагин-строка "@tailwindcss/postcss") и падает на загрузке.
  // Тесты CSS не импортируют — в тест-раннере PostCSS не нужен.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // один тестовый процесс: машинка слабая, параллельные форки
    // недопустимы (жёсткое ресурсное ограничение CI/локали)
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
