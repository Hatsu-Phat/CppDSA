FROM node:22-bookworm

# Cài đặt trình biên dịch g++ (hỗ trợ C++17), dumb-init và thư viện libseccomp
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    dumb-init \
    libseccomp-dev \
    libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

# Tạo người dùng sandbox không đặc quyền (UID/GID 10001)
RUN groupadd -g 10001 sandbox && \
    useradd -u 10001 -g 10001 -m -s /bin/bash sandbox

WORKDIR /app

# Sao chép toàn bộ mã nguồn spike, launcher, cases và scripts vào image
COPY . /app

# Biên dịch launcher C với libseccomp
RUN gcc -O2 -Wall -Wextra /app/launcher.c -lseccomp -o /usr/local/bin/launcher \
    && chmod 755 /usr/local/bin/launcher \
    && chown root:root /usr/local/bin/launcher

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

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "run-suite.mjs"]
