# File Drop on Standard Container Images (Unhardened)

A file-upload service built on **standard Docker Hub container images** — the same app as [filedrop-hummingbird](https://github.com/Brillar0101/filedrop-hummingbird), but on a completely different, unhardened stack. This project exists to show what happens when you **don't** use hardened images: same functionality, dramatically more CVEs.

## The stack

| Piece | Job | Image |
|------|-----|-------|
| Express.js | The app and web UI | built on `node:22` |
| Apache httpd | Front door / reverse proxy | `httpd:latest` |
| MySQL | Stores file details | `mysql:8` |
| Volume `/data` | Stores the actual files | mounted volume |

None of these images have a Fedora Hummingbird hardened equivalent. That is the point.

## What's in this folder

```
filedrop-unhardened/
  README.md            you are here
  ARCHITECTURE.md      the full architecture (components, topology, security)
  COMPARISON.md        side-by-side comparison with filedrop-hummingbird
  app/server.js        the Express.js app + web UI
  app/package.json     Node.js dependencies
  client.py            command-line uploader
  local_demo.py        stdlib-only local runner (preview the UI, no containers needed)
  Dockerfile           single-stage build on node:22
  compose.yaml         runs app + httpd + mysql, 24/7
  httpd.conf           reverse proxy config
  deploy/              deploy to a standard Fedora VM
  tests/               unit tests (incl. XSS-escaping regression)
```

## Three ways to run it

### 1. See the UI right now (any machine, no containers)

```bash
python3 local_demo.py
# open http://127.0.0.1:8088/
```

A stdlib-only stand-in that shows the exact UI and real upload/download. For previewing only.

### 2. Run on standard container images (Linux with Podman)

```bash
podman-compose up -d
# open http://localhost:8091/
```

Builds the app on `node:22` and runs the full stack on standard Docker Hub images.

### 3. Deploy on a standard Fedora VM

See [`deploy/README.md`](./deploy/README.md). It boots a Fedora Cloud VM and deploys the three-container stack on it.

## The comparison

Run `grype` on the app image:

```bash
grype filedrop-unhardened_app:latest    # expect 200-400+ CVEs
```

Then compare with the hummingbird version:

```bash
grype filedrop_app:latest               # ~20 CVEs
```

See [`COMPARISON.md`](./COMPARISON.md) for the full breakdown.

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — components, deployment topology, build pipeline, security model
- [`COMPARISON.md`](./COMPARISON.md) — side-by-side security comparison with filedrop-hummingbird
- [`deploy/README.md`](./deploy/README.md) — deploy on a Fedora VM

## Tests

```bash
cd app && npm install && npm test
```

Covers the HTML rendering, including the filename-escaping (XSS) safeguard.

## Notes

- All images are from Docker Hub (`docker.io/library/`). None are hardened.
- The Dockerfile is a **single-stage build** that runs as **root** and ships with npm, bash, and apt in the final image. This is the standard approach — and the reason for the high CVE count.
- The httpd config deliberately omits security headers that the hummingbird project includes.
- Uploaded files go to the `/data` volume. `DATABASE_URL` is required from the environment.
- Uploads are capped at 50 MB. The app has **no authentication** by design.
