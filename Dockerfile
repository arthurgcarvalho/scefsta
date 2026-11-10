# One container with the web app and the backend API, for Cloud Run.
# Build and deploy it with "node cloudrun/deploy.js" (see cloudrun/README.md),
# which also writes project_code/.env.production.local, read by "next build".

# ---- 1. Build the Next.js app. Next 11 needs an old Node. -------------------
FROM node:17.4.0-bullseye-slim AS web
WORKDIR /app/project_code
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--openssl-legacy-provider \
    API_PROXY_TARGET=http://127.0.0.1:5001
COPY project_code/package.json project_code/package-lock.json ./
# Install scripts are skipped: none are needed, and one of them would download
# a second copy of Node.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY project_code ./
# The page's scripts include deployments.json: ship only the deployment the
# hosted app uses, without the other networks and the superseded addresses
RUN node -e "const fs=require('fs');const net=fs.readFileSync('.env.production.local','utf8').match(/^NEXT_PUBLIC_NETWORK=(.+)$/m)[1].trim();const d=require('./deployments.json')[net];delete d.previous;delete d.transactions;fs.writeFileSync('deployments.json',JSON.stringify({[net]:d}))"
# Anyone with the address can use the test accounts, so keep it out of search engines
RUN printf 'User-agent: *\nDisallow: /\n' > public/robots.txt
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

# ---- 2. Runtime: a current Node for the API, plus Node 17 for the web app ---
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=web /usr/local/bin/node /usr/local/bin/node17
ENV WEB_NODE=/usr/local/bin/node17
COPY backend-api/package.json backend-api/package-lock.json backend-api/
RUN cd backend-api && npm ci --omit=dev --no-audit --no-fund
COPY backend-api backend-api
COPY testnet/deployments.json testnet/deployments.json
COPY --from=web /app/project_code project_code
COPY cloudrun/start.js cloudrun/start.js
CMD ["node", "cloudrun/start.js"]
