# Architecture: File Drop (Unhardened)

This document describes the architecture of the unhardened File Drop deployment. It mirrors the structure of the [filedrop-hummingbird](https://github.com/Brillar0101/filedrop-hummingbird) architecture document, but every component runs on standard, unhardened container images.

## 1. Context

File Drop is a file-upload service: upload a file through a web page, get a download link back. This version runs on **standard Docker Hub images** — the kind most teams use by default. It exists as a security comparison against the Hummingbird-hardened version.

The key question this project answers: **what does your CVE exposure look like when you use standard images?**

## 2. Logical components

| Component | Image | Job |
|-----------|-------|-----|
| **App** | Built on `docker.io/library/node:22` | Express.js + web UI, file upload/download |
| **Web / Proxy** | `docker.io/library/httpd:latest` | Reverse proxy, upload size limits |
| **Database** | `docker.io/library/mysql:8` | Stores file metadata (name, size, ID) |
| **File storage** | Podman volume at `/data` | Stores uploaded file bytes |
| **DB storage** | Podman volume at `/var/lib/mysql` | MySQL data directory |

### What is NOT hardened (and why it matters)

- **node:22** is based on Debian with hundreds of system packages (apt, bash, curl, wget, gcc, etc.). Most are unused by the app but contribute to the CVE count.
- **httpd:latest** ships with a full Apache installation including modules the proxy doesn't use.
- **mysql:8** includes the full MySQL server distribution with client tools, shell utilities, and system libraries.

## 3. Deployment topology

```
Internet / LAN
    |  :8091
    v
Apache httpd (httpd:latest)
  |-- runs as root (default)
  |-- full Apache + Debian userland
  |-- no security headers
    |  ProxyPass http://app:3000
    v  (internal network)
Express.js app (node:22)
  |-- runs as root (default)
  |-- full Node.js + npm + Debian userland
  |-- writes to /data volume
  |-- connects to db:3306
    |
    v
MySQL (mysql:8)
  |-- runs as mysql user
  |-- /var/lib/mysql volume

Volumes:
  file-data -> /data (uploads)
  db-data   -> /var/lib/mysql
```

Three run modes (same as hummingbird):
- **Container:** `podman-compose up -d` on any Linux host
- **VM:** boot a standard Fedora Cloud VM, deploy with plain podman
- **Bare metal:** install Fedora, deploy with plain podman

## 4. Build pipeline

### Single-stage build (contrast with hummingbird)

```
Dockerfile (one stage):
  FROM node:22           <-- full image, ~1 GB, 200+ CVEs
  COPY app/ .
  RUN npm install        <-- npm stays in final image
  CMD ["node", "server.js"]
```

The hummingbird project uses a **multi-stage build** where the final image is distroless (no pip, no shell). This project deliberately uses a **single-stage build** where everything stays in the final image.

### What ships in the final image

- Node.js runtime + npm
- bash, sh, apt-get, curl, wget
- gcc, make, and build tools
- OpenSSL, zlib, and dozens of system libraries
- The application code and node_modules

Every one of these is a potential attack surface.

## 5. Data, state, and networking

- Uploaded files are stored in the `file-data` volume at `/data`
- MySQL data is stored in the `db-data` volume at `/var/lib/mysql`
- Only the httpd proxy is exposed (port 8091); app and database are internal
- The filesystem is **read-write** (standard container behavior, not locked down)

## 6. Security model

This section honestly describes the security posture — which is the standard posture most teams deploy with.

| Property | This project | Hummingbird |
|----------|-------------|-------------|
| Runtime user | root | 65532 (non-root) |
| Shell access | Yes (bash, sh) | No (distroless) |
| Package manager | Yes (npm, apt) | No |
| Security headers | None | X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| Root filesystem | Read-write | Read-only, immutable |
| CVE scan (grype) | 200-400+ | ~20 |
| Image size | ~1 GB+ | ~100-200 MB |

### What an attacker gets if they compromise a container

- **This project:** A full Linux environment with bash, apt, curl, wget, npm, and network tools. They can install additional tools, modify the filesystem, and pivot.
- **Hummingbird:** Nothing. No shell, no package manager, no tools. The filesystem is read-only. There is almost nothing to work with.

## 7. Key decisions

**ADR-1: MySQL, not PostgreSQL.** There is no `hi/mysql` image in Hummingbird, which is exactly the point — MySQL forces us onto standard images.

**ADR-2: Node.js/Express, not Python/FastAPI.** There is no `hi/node` image in Hummingbird. Using a completely different language and framework makes the comparison more realistic.

**ADR-3: Apache httpd, not nginx.** There is no `hi/httpd` image in Hummingbird. Apache is a common choice for reverse proxying.

**ADR-4: Single-stage build, runs as root.** This is the standard approach. Most Dockerfiles on Docker Hub look like this. It is simple, it works, and it produces a high CVE count.
