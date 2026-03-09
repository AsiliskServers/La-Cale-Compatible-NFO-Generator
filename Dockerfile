FROM node:22-trixie-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG VITE_BASE_PATH=./
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN npm run build

FROM node:22-trixie-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends mediainfo \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV BASE_PATH=/

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /app/api ./api
COPY --from=build /app/dist ./dist
COPY --from=build /app/resources ./resources

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
