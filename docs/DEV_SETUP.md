# Hướng dẫn cài đặt và phát triển môi trường Local (DEV_SETUP)

Tài liệu hướng dẫn thiết lập, chạy và kiểm thử hệ thống CppDSA trên môi trường local từ bản clone sạch, chỉ yêu cầu cài đặt Docker Desktop (không cần cài đặt sẵn Node.js hay g++ trên máy host).

---

## 1. Quyết định kỹ thuật (Technical Decisions)

Theo phê duyệt của Claude trong task T-0005:
- **Runtime & Ngôn ngữ:** Node.js 22 LTS; TypeScript ở chế độ strict; quản lý monorepo qua `npm workspaces` với một file `package-lock.json` duy nhất ở thư mục gốc.
- **Backend API (`src/api`):** Framework Fastify, kết nối PostgreSQL qua pool `pg`, port 4000.
- **Grader Worker (`src/grader`):** Fastify server, môi trường biên dịch `g++` (C++17), port 4100.
- **Frontend Web (`src/web`):** Next.js 14 (App Router), React 18, port 3000.
- **Thư viện dùng chung (`src/shared`):** Các hàm tiện ích logic nghiệp vụ chuẩn hóa (chuẩn hóa output theo REQUIREMENTS §4.4) và kiểu dữ liệu chung.
- **Kiểm thử (Test):** Vitest cho toàn bộ các workspace (`api`, `grader`, `shared`, `web`); `web` sử dụng Vitest kết hợp Testing Library và môi trường `happy-dom`.
- **Lint & Format:** ESLint v9 với cấu hình Flat Config (`eslint.config.mjs`) kết hợp Prettier (`.prettierrc`, `.prettierignore`).
- **Cơ sở dữ liệu:** PostgreSQL image `postgres:16` trên local [CẦN XÁC MINH: major version Azure Flexible Server sẽ tạo ở P5; nếu khác thì đổi image cho khớp].
- **Migration:** `node-pg-migrate` (JS/CommonJS), quản lý bảng `users`, `classrooms`, `assignments` theo `docs/DATA_MODEL.md`. Migration `up` được chạy tự động khi container `api` khởi động; script `migrate:down` hỗ trợ rollback.
- **Cấu hình:** Quản lý qua biến môi trường; chỉ commit `.env.example`, tuyệt đối không commit file `.env` hoặc credential bí mật lên repo.

---

## 2. Cấu trúc Monorepo

```
CppDSA/
├── .github/workflows/ci.yml # CI GitHub Actions
├── docs/DEV_SETUP.md        # Tài liệu hướng dẫn setup môi trường
├── docker-compose.yml       # Khởi chạy toàn bộ hệ thống local bằng 1 lệnh
├── eslint.config.mjs        # Cấu hình ESLint 9 (Flat config)
├── .prettierrc              # Cấu hình Prettier
├── .prettierignore          # Danh sách bỏ qua định dạng
├── .env.example             # Biến môi trường mẫu
├── tsconfig.base.json       # Cấu hình TypeScript nền tảng
├── package.json             # Root npm workspaces manifest
├── package-lock.json        # Dependency lockfile dùng chung
└── src/
    ├── shared/              # Thư viện logic dùng chung (@cppdsa/shared)
    ├── api/                 # Backend API service (@cppdsa/api)
    ├── grader/              # Grader worker service (@cppdsa/grader)
    └── web/                 # Frontend Next.js app (@cppdsa/web)
```

---

## 3. Biến môi trường (Environment Variables)

Sao chép `.env.example` thành `.env` nếu cần tùy chỉnh (mặc định Docker Compose đã có giá trị fallback an toàn):

```bash
cp .env.example .env
```

| Biến | Ý nghĩa | Giá trị mặc định local |
|---|---|---|
| `POSTGRES_USER` | Tên user database PostgreSQL | `postgres` |
| `POSTGRES_PASSWORD` | Mật khẩu database PostgreSQL | `postgres` |
| `POSTGRES_DB` | Tên database | `cppdsa` |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL | `postgres://postgres:postgres@localhost:5432/cppdsa` |
| `API_PORT` / `PORT` | Cổng HTTP của Backend API | `4000` |
| `API_HOST` / `HOST` | Địa chỉ bind của Backend API | `0.0.0.0` |
| `GRADER_PORT` / `PORT`| Cổng HTTP của Grader | `4100` |
| `GRADER_HOST` / `HOST`| Địa chỉ bind của Grader | `0.0.0.0` |
| `WEB_PORT` / `PORT` | Cổng HTTP của Frontend Web | `3000` |
| `WEB_HOST` / `HOST` | Địa chỉ bind của Frontend Web | `0.0.0.0` |
| `GRADER_CONCURRENCY` | Số worker chấm song song | `2` |
| `GRADER_WALL_FACTOR` | Hệ số wall deadline so với CPU time limit | `10` |
| `COMPILE_TIMEOUT_MS` | Giới hạn wall time biên dịch (ms) | `10000` (Local) / `15000` (Render) |
| `COMPILE_CPU_LIMIT_S` | Giới hạn CPU time biên dịch (s, RLIMIT_CPU) | `10` |
| `GRADER_MEMORY_BUDGET_MB` | Ngân sách RAM cho các job chấm đồng thời (MB) | `384` |
| `ENABLE_PCH` | Bật Precompiled Header cho `bits/stdc++.h` | `true` |
| `GLOBAL_RATE_LIMIT_MAX` | Giới hạn request toàn cục /api/* (req/phút/IP) | `300` |
| `LOGIN_RATE_LIMIT_MAX` | Giới hạn đăng nhập /api/auth/login (req/phút/IP) | `10` |
| `ENABLE_CGROUP_LOGGING` | Bật ghi log định kỳ tài nguyên cgroup CPU/RAM | `false` |

---

## 4. Hướng dẫn chạy và kiểm thử từ bản clone sạch (Chỉ cần Docker)

Nếu máy host không cài đặt Node.js/npm, toàn bộ các lệnh phát triển và kiểm tra có thể thực thi thông qua Docker.

### 4.1. Cài đặt / cập nhật dependencies và lockfile
Khi thay đổi dependency trong `package.json`:

```bash
docker run --rm -v "${PWD}:/src" node:22-bookworm sh -c "mkdir /w && cd /src && tar --exclude=node_modules --exclude=.git -cf - . | tar -xf - -C /w && cd /w && npm install --no-audit --no-fund && cp /w/package-lock.json /src/package-lock.json"
```

### 4.2. Chạy CI kiểm tra Lint, Format, Build và Test
Chạy lệnh sau từ thư mục gốc project (trong PowerShell trên Windows hoặc Terminal trên Linux/macOS):

```bash
docker run --rm -v "${PWD}:/src:ro" node:22-bookworm sh -c "mkdir /w && cd /src && tar --exclude=node_modules --exclude=.git -cf - . | tar -xf - -C /w && cd /w && npm ci && npm run lint && npm run format:check && npm run build && npm test"
```

### 4.3. Khởi động toàn bộ hệ thống bằng Docker Compose
Khởi động đồng thời 4 service: `db` (PostgreSQL), `api`, `grader`, `web`:

```bash
docker compose up -d --build
```

Kiểm tra trạng thái các container:
```bash
docker compose ps
```

Các cổng được bind vào loopback `127.0.0.1` của máy host:
- Web: `http://127.0.0.1:3000` (Route `/` và `/api/health` hoặc `/health`)
- API: `http://127.0.0.1:4000` (Route `/health` trả về `{"status":"ok","db":"ok"}`)
- Grader: `http://127.0.0.1:4100` (Route `/health` trả về `{"status":"ok"}`)
- DB: `127.0.0.1:5432`

### 4.4. Kiểm tra Healthcheck của các Service
Nếu chạy trên Linux có hỗ trợ `--network host`:
```bash
docker run --rm --network host curlimages/curl:8.10.1 -sf http://127.0.0.1:4000/health
docker run --rm --network host curlimages/curl:8.10.1 -sf http://127.0.0.1:4100/health
docker run --rm --network host curlimages/curl:8.10.1 -sf http://127.0.0.1:3000/api/health
```

Trên Docker Desktop Windows (khi `--network host` trỏ vào WSL2 VM thay vì loopback host Windows), kiểm tra trực tiếp qua tiến trình trong container:
```bash
docker compose exec api node -e "fetch('http://localhost:4000/health').then(r=>r.text()).then(console.log)"
docker compose exec grader node -e "fetch('http://localhost:4100/health').then(r=>r.text()).then(console.log)"
docker compose exec web node -e "fetch('http://localhost:3000/api/health').then(r=>r.text()).then(console.log)"
```

### 4.5. Quản lý Cơ sở dữ liệu và Migration
Container `api` tự động thực thi `npm run migrate:up` trước khi khởi động server Fastify.
Khi cần chạy migration thủ công:
- **Chạy migration up:**
  ```bash
  docker compose exec api npm run migrate:up
  ```
- **Rollback migration gần nhất (down 1 step):**
  ```bash
  docker compose exec api npm run migrate:down
  ```

### 4.6. Dừng hệ thống và giải phóng tài nguyên
Dừng toàn bộ container và xóa volume dữ liệu database:
```bash
docker compose down -v
```
