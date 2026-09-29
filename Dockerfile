FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/bridge/package.json packages/bridge/
COPY packages/extension/package.json packages/extension/
RUN npm ci
COPY . .
ARG IKATASTER_ORIGINS
ENV IKATASTER_ORIGINS=$IKATASTER_ORIGINS
RUN npm run test -w @ikataster/bridge && npm run test -w @ikataster/extension && npm run test -w @ikataster/web \
 && npm run build -w @ikataster/web \
 && node packages/extension/build.mjs --out apps/web/dist/extension

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
