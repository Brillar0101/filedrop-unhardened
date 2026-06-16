#!/usr/bin/env bash
#
# 02-deploy-filedrop.sh
# Deploy the File Drop stack on a standard Fedora VM.
#
# RUN THIS INSIDE THE VM, after 01 booted it and you copied the project
# onto the VM. Uses plain podman (no podman-compose needed).
#
# Expects the filedrop-unhardened/ folder to be the parent folder (..).
# Adjust APP_SRC if your layout differs.

set -euo pipefail

APP_SRC="$(cd "$(dirname "$0")/.." && pwd)"

NET="filedrop-net"
DB_IMAGE="docker.io/library/mysql:8"
PROXY_IMAGE="docker.io/library/httpd:latest"
APP_IMAGE="filedrop_app:latest"

echo ">> Using app source: ${APP_SRC}"

echo ">> Creating network and volumes"
podman network exists "${NET}" || podman network create "${NET}"
podman volume exists db-data || podman volume create db-data
podman volume exists file-data || podman volume create file-data

echo ">> Pulling base images"
podman pull "${DB_IMAGE}"
podman pull "${PROXY_IMAGE}"

echo ">> Building the app image (single-stage build on node:22)"
podman build -t "${APP_IMAGE}" "${APP_SRC}"

echo ">> Starting MySQL (db)"
podman run -d --name db --network "${NET}" --restart=always \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=filedrop \
  -e MYSQL_USER=filedrop \
  -e MYSQL_PASSWORD=secret \
  -v db-data:/var/lib/mysql \
  "${DB_IMAGE}"

echo ">> Starting the app (Express.js)"
podman run -d --name app --network "${NET}" --restart=always \
  -e DATABASE_URL="mysql://filedrop:secret@db:3306/filedrop" \
  -v file-data:/data \
  "${APP_IMAGE}"

echo ">> Starting httpd (proxy), exposed on host port 8091"
podman run -d --name proxy --network "${NET}" --restart=always \
  -p 8091:80 \
  -v "${APP_SRC}/httpd.conf":/usr/local/apache2/conf/httpd.conf:ro \
  "${PROXY_IMAGE}"

echo
echo ">> Deployed. Verify with:"
echo ">>   podman ps"
echo ">>   curl http://localhost:8091/"
echo ">>   grype ${APP_IMAGE}       # expect 200-400+ CVEs (unhardened)"
