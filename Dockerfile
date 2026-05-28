# Ancroo Extension — Build Container
# Builds the browser extension and outputs dist/ as artifact.
#
# Usage:
#   docker build -t ancroo-extension-build packages/extension/
#   docker run --rm -v $(pwd)/dist:/out ancroo-extension-build
#
# Or extract directly:
#   id=$(docker create ancroo-extension-build)
#   docker cp $id:/app/dist ./extension-dist
#   docker rm $id

FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .
RUN pnpm build

# Output stage — just the built extension
FROM alpine:3.19
COPY --from=build /app/dist /dist
CMD ["cp", "-r", "/dist/.", "/out/"]
