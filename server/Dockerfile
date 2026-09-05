# Centras Chat gateway — single bundled Node process, ~60 MB image.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY server ./server
COPY lib ./lib
COPY types ./types
COPY app/api ./app/api
RUN node server/build.mjs

FROM node:20-alpine
ENV NODE_ENV=production GATEWAY_HOST=0.0.0.0 GATEWAY_PORT=8080
WORKDIR /app
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist-server/index.js"]
