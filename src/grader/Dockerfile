FROM node:22-bookworm

# Install g++, gcc, dumb-init and libseccomp
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    gcc \
    dumb-init \
    libseccomp-dev \
    libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

# Create pool of unprivileged sandbox users (UID 10001 to 10008)
RUN for uid in $(seq 10001 10008); do \
      groupadd -g $uid sandbox$uid && \
      useradd -u $uid -g $uid -m -s /bin/bash sandbox$uid; \
    done

WORKDIR /app

# Copy root and workspace package manifests
COPY package*.json ./
COPY src/shared/package*.json ./src/shared/
COPY src/api/package*.json ./src/api/
COPY src/grader/package*.json ./src/grader/
COPY src/web/package*.json ./src/web/

# Install dependencies using lockfile
RUN npm ci

# Copy configurations, source code and test suite
COPY tsconfig.base.json ./
COPY src/shared ./src/shared
COPY src/grader ./src/grader
COPY tests/grading ./tests/grading

# Compile sandbox launcher C binary
RUN gcc -O2 -Wall -Wextra src/grader/native/launcher.c -lseccomp -o /usr/local/bin/launcher \
    && chmod 755 /usr/local/bin/launcher \
    && chown root:root /usr/local/bin/launcher

# Build dependencies and service
RUN npm run --workspace=src/shared build
RUN npm run --workspace=src/grader build

# Secure system and application directories
RUN chmod 700 /app \
    && chown -R root:root /app \
    && chmod 755 /tmp && chown root:root /tmp \
    && chmod 755 /var/tmp && chown root:root /var/tmp \
    && mkdir -p /run/lock && chmod 755 /run/lock && chown root:root /run/lock \
    && mkdir -p /dev/shm && chmod 755 /dev/shm && chown root:root /dev/shm

WORKDIR /app/src/grader
EXPOSE 4100
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
