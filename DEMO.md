# File Drop — What Happens When You Use External Container Repositories

## The project

**File Drop** is the same file-upload service as [filedrop-hummingbird](https://github.com/Brillar0101/filedrop-hummingbird) — upload a file through a web page, get a download link back. The difference is the container images: this version uses standard Docker Hub images because the required software (Node.js, Apache httpd, MySQL) has no Hummingbird `hi/*` equivalent.

Both versions deploy on the same **Fedora Hummingbird Linux** VM. Same OS, same functionality, dramatically different container-level security.

---

## The same Hummingbird OS

Even though the containers are unhardened, the host OS is identical. `bootc status` confirms the VM is running the Hummingbird OS image:

![bootc status on the unhardened VM — same Hummingbird OS image as the hardened project](screenshots/uh-bootc-status.png)

And `dnf install` is still blocked — the host root filesystem is read-only regardless of what containers run inside:

![dnf install blocked — the bootc system is read-only even with unhardened containers](screenshots/uh-dnf-blocked.png)

---

## The running stack

After deploying, three containers run on standard Docker Hub images — notice `docker.io/library/` in every image name:

![podman ps showing db (mysql:8), app (node), and proxy (httpd) running on Docker Hub images](screenshots/uh-podman-ps.png)

The image sizes tell the story. The app image alone is 1.3 GB because it includes the full Debian userland. Compare that to the Hummingbird `hi/*` images at 51-196 MB:

![podman images showing standard images at 831 MB to 1.3 GB compared to hi/* images at 51-196 MB](screenshots/uh-podman-images.png)

The File Drop UI works the same as the hardened version — upload a file, get a download link:

![File Drop web UI running on unhardened containers](screenshots/uh-ui.png)

---

## The CVE impact

A grype scan of the unhardened app image shows 1,470 vulnerability matches including 62 critical. The hardened version shows a handful:

![grype scan of the unhardened app image showing 1,470 vulnerabilities with critical and high severity](screenshots/uh-grype-scan.png)

The vulnerabilities come from the base image, not the application code. Standard Docker Hub images ship hundreds of packages the app never uses — but each one can have CVEs.

```bash
grype filedrop_app:latest
```

---

## The takeaway

When your stack requires software outside the Hummingbird `hi/*` catalog, you pull from external repositories and inherit their full CVE exposure. The Hummingbird host OS still protects you — immutable root, atomic updates, no host package manager — but the containers themselves carry the risk. See [`COMPARISON.md`](./COMPARISON.md) for the full side-by-side analysis.
