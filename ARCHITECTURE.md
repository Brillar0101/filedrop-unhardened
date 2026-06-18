# Architecture: File Drop on Standard Container Images (Unhardened)

This document describes the architecture of the unhardened File Drop deployment. It mirrors the structure of the [filedrop-hummingbird](https://github.com/Brillar0101/filedrop-hummingbird) architecture document, but every component runs on standard, unhardened container images from Docker Hub.

Both projects deploy on the same **Fedora Hummingbird Linux** host OS. The difference is entirely in the container images.

---

## 1. Context

File Drop is a file-upload service: upload a file through a web page, get a download link back. This version runs on **standard Docker Hub container images** inside a **Fedora Hummingbird Linux VM** — the same host OS as the hardened version.

This project answers two questions:

- **What is the impact of using external container repositories?** When your stack requires software outside the Hummingbird `hi/*` catalog, you pull from Docker Hub and inherit the full CVE exposure of standard images.
- **How does Fedora Hummingbird Linux still protect you?** Even with unhardened containers, the host OS provides protections that a traditional Fedora server does not (Section 7).

### How this differs from traditional Fedora

On a traditional Fedora server, you would install this stack directly on the host:

```bash
# Traditional Fedora
sudo dnf install nodejs mysql-server httpd
npm install express multer mysql2
sudo systemctl enable --now mysqld httpd
```

Every package you install — and every dependency it pulls in — lives on the host and contributes to the attack surface. The host filesystem is mutable, so a compromised process can modify system binaries, install additional software, or create persistence. Updates are applied file-by-file with `dnf update`; a failure partway through can leave the system in an inconsistent state.

On **Fedora Hummingbird Linux**, `dnf install` is blocked because the host root filesystem is read-only. Workloads run as containers instead. But when the required software has no Hummingbird `hi/*` image, you pull from external repositories:

```bash
# Hummingbird — containers from Docker Hub
podman pull docker.io/library/node:22
podman pull docker.io/library/httpd:latest
podman pull docker.io/library/mysql:8
```

The CVE exposure inside these containers is similar to what you would have on a traditional server — full OS distributions with hundreds of packages. The difference is what happens at the host OS level (Section 7).

---

## 2. Logical components

| Component | Image | Job |
|-----------|-------|-----|
| **App** | Built on `docker.io/library/node:22` | Express.js + web UI, file upload/download |
| **Web / Proxy** | `docker.io/library/httpd:latest` | Reverse proxy, upload size limits |
| **Database** | `docker.io/library/mysql:8` | Stores file metadata (name, size, ID) |
| **File storage** | Podman volume at `/data` | Stores uploaded file bytes |
| **DB storage** | Podman volume at `/var/lib/mysql` | MySQL data directory |

### What ships in these images (and why it matters)

- **node:22** is based on Debian with hundreds of system packages (apt, bash, curl, wget, gcc, etc.). Most are unused by the app but each one can have vulnerabilities.
- **httpd:latest** ships with a full Apache installation including modules the proxy doesn't use.
- **mysql:8** includes the full MySQL server distribution with client tools, shell utilities, and system libraries.

On a traditional Fedora server, you would install these same packages via `dnf` and they would live directly on the host. Here they are contained inside container images, which limits their reach — but the packages themselves are the same, and so are their CVEs.

---

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

Deployment (same Hummingbird OS as the hardened project):
- **VM:** boot a Hummingbird VM (same disk image as the hardened project), deploy with plain podman
- **Container:** `podman-compose up -d` on any Linux host (for local testing)

---

## 4. Build pipeline

### Single-stage build (contrast with Hummingbird)

On a traditional Fedora server, you would `dnf install nodejs` and `npm install` directly on the host. In a container, the standard approach is a single-stage Dockerfile that does the same thing inside the image:

```
Dockerfile (one stage):
  FROM node:22           <-- full image, ~1 GB, Debian-based
  COPY app/ .
  RUN npm install        <-- npm stays in final image
  CMD ["node", "server.js"]
```

The Hummingbird project uses a **multi-stage build** where the final image is distroless (no pip, no shell). This project deliberately uses a **single-stage build** where everything stays in the final image — because that is the standard approach when you don't have a distroless base image to target.

### What ships in the final image

- Node.js runtime + npm
- bash, sh, apt-get, curl, wget
- gcc, make, and build tools
- OpenSSL, zlib, and dozens of system libraries
- The application code and node_modules

On a traditional server, these would be installed on the host via `dnf`. In a container, they are inside the image. Either way, every one of these is a potential attack surface and CVE source.

---

## 5. Data, state, and networking

- Uploaded files are stored in the `file-data` volume at `/data`
- MySQL data is stored in the `db-data` volume at `/var/lib/mysql`
- Only the httpd proxy is exposed (port 8091); app and database are internal
- The container filesystem is **read-write** (standard container behavior, not locked down)

---

## 6. Security model: what the containers lack

This section honestly describes the security posture of standard container images compared to Hummingbird images.

| Property | This project (unhardened) | Hummingbird project |
|----------|--------------------------|---------------------|
| Runtime user | root | 65532 (non-root) |
| Shell access | Yes (bash, sh) | No (distroless) |
| Package manager | Yes (npm, apt) | No |
| Security headers | None | X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| Root filesystem | Read-write | Read-only, immutable |
| Image size | ~1 GB+ | ~100-200 MB |

### What an attacker gets if they compromise a container

- **This project (unhardened):** A full Linux environment with bash, apt, curl, wget, npm, and network tools. The attacker can install additional tools, modify the filesystem, and attempt to pivot. On a traditional Fedora server where these packages are installed on the host, the attacker would have the same tools — plus direct access to the host OS.
- **Hummingbird project:** Nothing. No shell, no package manager, no tools. The filesystem is read-only. There is almost nothing to work with.

---

## 7. What Fedora Hummingbird Linux still provides

Even when containers are pulled from external repositories and carry hundreds of CVEs, the Hummingbird host OS provides protections that a traditional Fedora server does not.

### Immutable host root filesystem

On a traditional Fedora server, an attacker who gains host access (e.g., through container escape) can:

```bash
# Traditional Fedora — host is mutable
sudo dnf install netcat              # install tools
sudo vi /etc/cron.d/backdoor         # create persistence
sudo cp /bin/bash /tmp/.hidden       # hide a shell
```

On a Hummingbird host, these commands fail:

```bash
# Hummingbird — host root is read-only
sudo dnf install netcat              # blocked: no dnf, root is read-only
sudo vi /etc/cron.d/backdoor         # blocked: filesystem is immutable
sudo cp /bin/bash /tmp/.hidden       # blocked: root filesystem is sealed
```

The host OS root filesystem is read-only. An attacker who escapes a container still cannot modify the host OS, install rootkits, or create persistence mechanisms on the host filesystem.

### Atomic OS updates via bootc

On a traditional Fedora server, updates are applied file-by-file:

```bash
# Traditional Fedora — file-by-file updates
sudo dnf update                      # modifies files in place
                                     # can fail partway through
                                     # can leave inconsistent state
```

On Hummingbird, the host OS is managed as a versioned image:

```bash
# Hummingbird — atomic image updates
sudo bootc status                    # what image is currently running
sudo bootc upgrade                   # pull and stage the next OS image
                                     # applies fully or not at all
                                     # no partial updates, no drift
```

An update either fully applies or does not apply at all. There is no half-patched state.

### Instant rollback

```bash
# Hummingbird — instant rollback
sudo bootc rollback                  # revert to the previous known-good OS image
```

On a traditional Fedora server, rolling back a `dnf update` requires manual effort and may not fully restore the previous state. On Hummingbird, rollback is a single command that instantly reverts to the previous OS image.

### No host-level package manager

On a traditional Fedora server, any user with `sudo` access can install packages:

```bash
# Traditional Fedora — open package installation
sudo dnf install whatever-you-want
```

On a Hummingbird host, there is no `dnf`. The host is image-based — what ships in the OS image is what runs. If you need additional software on the host, you build it into a new host image and deploy that image. This prevents:

- An attacker from installing tools on the host after container escape
- Accidental package installs that widen the attack surface
- Configuration drift from ad-hoc additions

### What this means for the unhardened deployment

This project runs containers with full Debian-based images that carry hundreds of CVEs. A vulnerability inside a container could allow an attacker to gain code execution inside that container — and inside the container, they have bash, apt, curl, and everything else the standard image ships.

But the Hummingbird host limits the blast radius:

- The host OS cannot be modified (immutable root)
- Other containers on the same host are isolated
- The host itself stays patched and recoverable (bootc update/rollback)
- There are no tools on the host to pivot with (no package manager)

Hummingbird Linux does not eliminate the risk of running unhardened containers — the CVEs inside the containers are real. But it contains the damage to the container layer in ways a traditional mutable Fedora server cannot.

---

## 8. Key decisions

**ADR-1: MySQL, not PostgreSQL.** There is no `hi/mysql` image in the Hummingbird catalog, which is exactly the point — MySQL forces us onto standard Docker Hub images. On a traditional Fedora server, you would `sudo dnf install mysql-server`.

**ADR-2: Node.js/Express, not Python/FastAPI.** There is no `hi/node` image in the Hummingbird catalog. Using a completely different language and framework makes the comparison more realistic.

**ADR-3: Apache httpd, not nginx.** There is no `hi/httpd` image in the Hummingbird catalog. Apache is a common choice for reverse proxying. On a traditional Fedora server, you would `sudo dnf install httpd`.

**ADR-4: Single-stage build, runs as root.** This is the standard approach. Most Dockerfiles on Docker Hub look like this. It is simple, it works, and it produces a high CVE count — because everything (npm, bash, apt, curl, gcc) ships in the final image.
