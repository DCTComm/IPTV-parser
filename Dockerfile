FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production

# Exec form so the process receives SIGTERM directly and shuts down cleanly.
# Auth must already be done: set ZOHO_REFRESH_TOKEN, or mount TOKEN_PATH.
CMD ["node", "src/main.js", "--loop"]
