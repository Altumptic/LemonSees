# LemonSees by Altumptic — web mode
# docker build -t lemonsees .
# docker run -d -p 5199:5199 -e LEMONSEES_TOKEN="$(openssl rand -hex 24)" -v lemonsees-data:/data lemonsees
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
LABEL org.opencontainers.image.title="LemonSees" \
      org.opencontainers.image.vendor="Altumptic" \
      org.opencontainers.image.source="https://github.com/Altumptic/LemonSees" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production \
    LEMONSEES_HOST=0.0.0.0 \
    LEMONSEES_PORT=5199 \
    SHOK_CONFIG_DIR=/data \
    SHOK_NO_OPEN=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 5199
CMD ["node", "server/index.js", "--no-open"]
