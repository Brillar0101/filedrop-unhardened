# File Drop on Standard Container Images

A file-upload service built on standard Docker Hub container images, deployed on a Fedora Hummingbird Linux VM. Same app and same host OS as [filedrop-hummingbird-hardened](https://github.com/Brillar0101/filedrop-hummingbird-hardened), but with container images from external repositories that have no Hummingbird `hi/*` equivalents.

## The stack

| Piece | Job | Image |
|------|-----|-------|
| Express.js | The app and web UI | built on `node:22` |
| Apache httpd | Front door / reverse proxy | `httpd:latest` |
| MySQL | Stores file details | `mysql:8` |
| Volume `/data` | Stores the actual files | mounted volume |

None of these images have a Hummingbird `hi/*` equivalent. That is the point.

## Three ways to run it

### See the UI right now (any machine, no containers)

```bash
python3 local_demo.py
# open http://127.0.0.1:8088/
```

A stdlib-only stand-in that shows the exact UI and real upload/download. For previewing only.

### Run on standard container images (Linux with Podman)

```bash
podman-compose up -d
# open http://localhost:8091/
```

Builds the app on `node:22` and runs the full stack on standard Docker Hub images.

### Deploy on a Hummingbird VM

See [`deploy/README.md`](./deploy/README.md). Boots a Hummingbird VM (same OS as the hardened project) and deploys the three-container stack on it. Same OS, different container images.

## Verify the CVE impact

Scan the app image to see the actual CVE count:

```bash
grype filedrop-hummingbird-unhardened_app:latest
```

Then compare with the hardened version to see the difference distroless images make. See [`COMPARISON.md`](./COMPARISON.md) for the full breakdown.

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - components, deployment topology, build pipeline, security model
- [`COMPARISON.md`](./COMPARISON.md) - side-by-side security comparison with filedrop-hummingbird-hardened
- [`deploy/README.md`](./deploy/README.md) - deploy on a Hummingbird VM

## Tests

```bash
cd app && npm install && npm test
```

Covers the HTML rendering, including the filename-escaping (XSS) safeguard.

## Notes

- All images are from Docker Hub (`docker.io/library/`). None are Hummingbird images.
- The Dockerfile is a single-stage build that runs as root and ships with npm, bash, and apt in the final image. That is the standard approach and the reason for the high CVE count.
- The httpd config deliberately omits security headers that the hardened project includes.
- Uploaded files go to the `/data` volume. `DATABASE_URL` is required from the environment.
- Uploads are capped at 50 MB. The app has no authentication by design.
