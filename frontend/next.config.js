/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Проксируем запросы на бэкенд. Telegram вызывает вебхук по URL без /api — проксируем /webhook/* отдельно.
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_API_BACKEND || 'http://127.0.0.1:4000';
    return [
      { source: '/api/:path*', destination: `${backend}/:path*` },
      { source: '/admin-login', destination: `${backend}/admin-login` },
      // Вебхуки Telegram часто настраивают без /api — проксируем /webhook/* на бэкенд
      { source: '/webhook/:path*', destination: `${backend}/webhook/:path*` },
    ];
  },
};
module.exports = nextConfig;
