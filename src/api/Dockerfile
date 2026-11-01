FROM node:22-bookworm-slim
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
COPY src/api ./src/api

# Build dependencies and service
RUN npm run --workspace=src/shared build
RUN npm run --workspace=src/api build

WORKDIR /app/src/api
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate:up && npm run start"]
