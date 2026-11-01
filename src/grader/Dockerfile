FROM node:22-bookworm-slim

# Install g++ compiler
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root and workspace package manifests
COPY package*.json ./
COPY src/shared/package*.json ./src/shared/
COPY src/api/package*.json ./src/api/
COPY src/grader/package*.json ./src/grader/
COPY src/web/package*.json ./src/web/

# Install dependencies using lockfile
RUN npm ci

# Copy configurations and source code
COPY tsconfig.base.json ./
COPY src/shared ./src/shared
COPY src/grader ./src/grader

# Build dependencies and service
RUN npm run --workspace=src/shared build
RUN npm run --workspace=src/grader build

WORKDIR /app/src/grader
EXPOSE 4100
CMD ["node", "dist/index.js"]
