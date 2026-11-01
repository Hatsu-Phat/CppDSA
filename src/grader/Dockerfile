FROM node:22-bookworm

# Install g++, gcc, dumb-init and libseccomp
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    gcc \
    dumb-init \
    libseccomp-dev \
    libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

# Precompile <bits/stdc++.h> and <iostream> with exact flags (-std=c++17 -O2) in read-only directory
# Provide symlinks to original headers so GCC can fall back to normal compilation if PCH is not usable
RUN mkdir -p /usr/local/include/cppdsa_pch/bits \
    && PCH_SRC=$(find /usr/include -name "stdc++.h" | head -n 1) \
    && echo "Compiling PCH from $PCH_SRC..." \
    && ln -s "$PCH_SRC" /usr/local/include/cppdsa_pch/bits/stdc++.h \
    && g++ -std=c++17 -O2 -x c++-header /usr/local/include/cppdsa_pch/bits/stdc++.h -o /usr/local/include/cppdsa_pch/bits/stdc++.h.gch \
    && PCH_IO=$(find /usr/include -name "iostream" | head -n 1) \
    && echo "Compiling PCH from $PCH_IO..." \
    && ln -s "$PCH_IO" /usr/local/include/cppdsa_pch/iostream \
    && g++ -std=c++17 -O2 -x c++-header /usr/local/include/cppdsa_pch/iostream -o /usr/local/include/cppdsa_pch/iostream.gch \
    && chmod -R 755 /usr/local/include/cppdsa_pch \
    && chown -R root:root /usr/local/include/cppdsa_pch

# Create pool of unprivileged sandbox users with no home directory (UID 2000000000 to 2000000015)
RUN for uid in $(seq 2000000000 2000000015); do \
      groupadd -g $uid sandbox$uid && \
      useradd -u $uid -g $uid -M -d /nonexistent -s /usr/sbin/nologin sandbox$uid; \
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

# Install entrypoint script
COPY src/grader/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

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
ENV SANDBOX_UID_BASE=2000000000
ENV SANDBOX_UID_COUNT=8
ENV GRADER_MEMORY_BUDGET_MB=400
ENV GRADER_CONCURRENCY=1
ENV GRADER_WALL_FACTOR=10
ENV COMPILE_TIMEOUT_MS=15000
ENV COMPILE_CPU_LIMIT_S=10
EXPOSE 4100
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
