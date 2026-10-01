FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg socat \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
RUN npm install --omit=optional
RUN npm run build

COPY scripts/cloud-entrypoint.sh /usr/local/bin/rewind-cloud-entrypoint
RUN chmod 0755 /usr/local/bin/rewind-cloud-entrypoint

ENV NODE_ENV=production \
    AWS_REGION=us-east-1 \
    RING_PREVIEW_PORT=3002 \
    RING_WEBHOOK_PORT=3003 \
    REWIND_MCP_PORT=3004 \
    REWIND_ALEXA_PORT=3005

EXPOSE 8080 8081 8082 8083

ENTRYPOINT ["/usr/local/bin/rewind-cloud-entrypoint"]
