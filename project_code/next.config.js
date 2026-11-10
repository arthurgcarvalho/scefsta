// API_PROXY_TARGET (set for the hosted, single-container build; see
// ../cloudrun) makes the web server forward /backend/* to the backend-api
// process, so the browser reaches the API on the same address as the app.
// It is read when the app is built and again when it starts. Locally it is
// unset and the app calls the API directly (NEXT_PUBLIC_API_URL).
const apiProxyTarget = process.env.API_PROXY_TARGET;

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: "/backend/:path*", destination: `${apiProxyTarget}/:path*` },
    ];
  },
};
