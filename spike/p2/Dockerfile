FROM node:22-bookworm

# Cài đặt trình biên dịch g++ (hỗ trợ C++17), dumb-init và thư viện libseccomp
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    dumb-init \
    libseccomp-dev \
    libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

# Cấu hình SANDBOX_UID mặc định 2000000000 (tránh va chạm NPROC ngoài host trên Render)
# và SPIKE_MEMORY_BUDGET_MB mặc định 384 MB (tránh OOM container 512 MiB)
ARG SANDBOX_UID=2000000000
ENV SANDBOX_UID=${SANDBOX_UID}
ENV SPIKE_MEMORY_BUDGET_MB=384
ENV COMPILE_TIMEOUT_MS=60000
ENV WALL_FACTOR=10

# Tạo người dùng sandbox không đặc quyền tương ứng SANDBOX_UID
RUN groupadd -g ${SANDBOX_UID} sandbox && \
    useradd -u ${SANDBOX_UID} -g ${SANDBOX_UID} -m -s /bin/bash -K UID_MAX=2147483647 sandbox

WORKDIR /app

# Sao chép toàn bộ mã nguồn spike, launcher, cases và scripts vào image
COPY . /app

# Biên dịch launcher C và probe C với libseccomp
RUN gcc -O2 -Wall -Wextra /app/launcher.c -lseccomp -o /usr/local/bin/launcher \
    && chmod 755 /usr/local/bin/launcher \
    && chown root:root /usr/local/bin/launcher \
    && gcc -O2 -Wall -Wextra /app/probe.c -lseccomp -o /usr/local/bin/probe \
    && chmod 755 /usr/local/bin/probe \
    && chown root:root /usr/local/bin/probe

# Phân quyền thư mục và tạo secret giả
RUN mkdir -p /app/hidden_tests \
    && echo "super_secret_hidden_flag_12345" > /app/hidden_tests/secret.txt \
    && chmod 700 /app/hidden_tests \
    && chmod 600 /app/hidden_tests/secret.txt \
    && chown -R root:root /app \
    && chmod 700 /app \
    && chmod 755 /tmp && chown root:root /tmp \
    && chmod 755 /var/tmp && chown root:root /var/tmp \
    && mkdir -p /run/lock && chmod 755 /run/lock && chown root:root /run/lock \
    && chown root:root /home/sandbox && chmod 755 /home/sandbox

EXPOSE 10000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.mjs"]

