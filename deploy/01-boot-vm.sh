#!/usr/bin/env bash
#
# 01-boot-vm.sh
# Download a Fedora Cloud qcow2 image and boot it as a VM.
#
# RUN THIS ON YOUR LINUX/KVM HOST (not inside a VM).
# Requires: qemu-kvm, libvirt, virt-install, genisoimage
#
# After the VM boots, log in as core / filedrop, then copy the project
# onto the VM and run 02-deploy-filedrop.sh.

set -euo pipefail

VM_NAME="fedora-filedrop"
FEDORA_VERSION="42"
IMAGE_URL="https://download.fedoraproject.org/pub/fedora/linux/releases/${FEDORA_VERSION}/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-${FEDORA_VERSION}-1.1.x86_64.qcow2"
IMAGE_DIR="/var/lib/libvirt/images"
IMAGE_FILE="${IMAGE_DIR}/${VM_NAME}.qcow2"
CLOUD_INIT_DIR=$(mktemp -d)

echo ">> Downloading Fedora ${FEDORA_VERSION} Cloud image (if not cached)..."
if [ ! -f "${IMAGE_FILE}" ]; then
    curl -L -o "${IMAGE_FILE}" "${IMAGE_URL}"
    qemu-img resize "${IMAGE_FILE}" 20G
else
    echo "   (already downloaded)"
fi

echo ">> Creating cloud-init config..."
cat > "${CLOUD_INIT_DIR}/meta-data" <<EOF
instance-id: ${VM_NAME}
local-hostname: ${VM_NAME}
EOF

cat > "${CLOUD_INIT_DIR}/user-data" <<EOF
#cloud-config
users:
  - name: core
    plain_text_passwd: filedrop
    lock_passwd: false
    groups: wheel
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
EOF

echo ">> Building cloud-init ISO..."
genisoimage -output "${CLOUD_INIT_DIR}/cloud-init.iso" \
    -volid cidata -joliet -rock \
    "${CLOUD_INIT_DIR}/user-data" "${CLOUD_INIT_DIR}/meta-data" 2>/dev/null

echo ">> Booting VM: ${VM_NAME} (4 GB RAM, 2 vCPUs)..."
virt-install \
    --name "${VM_NAME}" \
    --memory 4096 \
    --vcpus 2 \
    --import \
    --disk "${IMAGE_FILE}" \
    --disk "${CLOUD_INIT_DIR}/cloud-init.iso",device=cdrom \
    --os-variant fedora-unknown \
    --network default \
    --graphics none \
    --console pty,target_type=serial \
    --noautoconsole

echo
echo ">> VM '${VM_NAME}' is booting."
echo ">> Connect with:  virsh console ${VM_NAME}"
echo ">> Login:          core / filedrop"
echo ">> Find VM IP:     virsh domifaddr ${VM_NAME}"
echo
echo ">> Next: copy the project onto the VM and run 02-deploy-filedrop.sh"

rm -rf "${CLOUD_INIT_DIR}"
