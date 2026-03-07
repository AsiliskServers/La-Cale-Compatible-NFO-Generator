FROM node:22-trixie-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-trixie-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends mediainfo \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/api ./api
COPY --from=build /app/dist ./dist
COPY --from=build /app/resources ./resources

EXPOSE 8787
CMD ["npm", "run", "start"]
