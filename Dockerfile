# Single-stage build on a full Node.js image.
# Deliberately NOT multi-stage, NOT distroless — the final image ships with
# npm, bash, apt, curl, and the full Debian userland.  This is the standard
# approach most teams use, and it is what drives the high CVE count.

FROM docker.io/library/node:22

WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm install
COPY app/server.js ./

EXPOSE 3000
CMD ["node", "server.js"]
