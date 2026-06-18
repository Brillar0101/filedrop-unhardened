# Deploy File Drop on a Hummingbird VM (Unhardened Containers)

This deploys the three-container File Drop stack on a **Fedora Hummingbird VM** — the same hardened OS used by the [filedrop-hummingbird-hardened](https://github.com/Brillar0101/filedrop-hummingbird-hardened) project. The only difference is the container images: this project uses standard Docker Hub images that have no `hi/*` hardened equivalents. This ensures an apples-to-apples comparison — same OS, different container-level security.

> **Where this runs:** The VM build and boot step must run on a **Linux host with KVM** (it needs `qemu-kvm`, `libvirt`, `virt-install`). A Fedora workstation works perfectly. The Hummingbird disk image must already be built by the filedrop-hummingbird project.

## What gets built

The three containers, all on standard (unhardened) images:

- `proxy` — `docker.io/library/httpd:latest`, the only exposed port (8091)
- `app` — File Drop (Express.js), built on `docker.io/library/node:22`
- `db` — `docker.io/library/mysql:8`
- volumes `file-data` (/data uploads) and `db-data` (MySQL data)

## Files

- `01-boot-vm.sh` — copy the Hummingbird disk image and boot a second VM (run on the Linux/KVM host)
- `02-deploy-filedrop.sh` — deploy the stack with plain `podman` (run inside the VM)

## On Fedora: prerequisites (do this first)

```bash
# install the VM tools (one time)
sudo dnf install -y qemu-kvm libvirt virt-install
sudo systemctl enable --now libvirtd

# confirm virtualization is available
ls /dev/kvm                                   # this file must exist
egrep -c '(vmx|svm)' /proc/cpuinfo            # should print a number > 0

# IMPORTANT: build the Hummingbird disk image first (if not already done)
cd ~/projects/filedrop-hummingbird/deploy && ./01-build-and-boot-vm.sh
```

## Steps

### 1. Boot the VM (on your Linux/KVM host)

```bash
cd filedrop-unhardened/deploy
./01-boot-vm.sh
```

Log in as `core` / `hummingbird`.

### 2. Copy the project onto the VM

From your host (replace `<vm-ip>`):

```bash
scp -r ~/projects/filedrop-unhardened core@<vm-ip>:~/
```

### 3. Deploy the app (inside the VM)

```bash
cd ~/filedrop-unhardened/deploy
./02-deploy-filedrop.sh
```

This creates the network and volumes, pulls MySQL and httpd, builds the app image, and starts all three containers with `--restart=always`.

### 4. Verify

```bash
podman ps                                # three containers running
curl http://localhost:8091/              # the File Drop page
grype filedrop_app:latest                # expect 200-400+ CVEs
```

Open `http://<vm-ip>:8091/` in a browser to use it.

## Notes

- Uses plain `podman` (not `podman-compose`), so it works on a minimal VM.
- The DB password here is a demo value. Use an injected secret before any real use.
- Compare the grype output with the hummingbird project (~20 CVEs) to see the difference.
