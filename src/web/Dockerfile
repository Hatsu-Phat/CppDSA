FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

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
COPY src/web ./src/web

# Build shared and web packages
RUN npm run --workspace=src/shared build
RUN npm run --workspace=src/web build

WORKDIR /app/src/web
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
