"""Upload a file to the File Drop server from the command line.
Stdlib only — no extra packages needed.

Usage:
    python3 client.py ./notes.txt
"""

import os
import sys
import urllib.request

SERVER = os.environ.get("FILEDROP_SERVER", "http://localhost:8091")


def upload(filepath):
    name = os.path.basename(filepath)
    with open(filepath, "rb") as f:
        data = f.read()

    boundary = b"----filedrop-boundary-abc123"
    body = (
        b"--" + boundary + b"\r\n"
        b'Content-Disposition: form-data; name="file"; filename="'
        + name.encode() + b'"\r\n'
        b"Content-Type: application/octet-stream\r\n\r\n"
        + data + b"\r\n"
        b"--" + boundary + b"--\r\n"
    )

    req = urllib.request.Request(
        f"{SERVER}/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode()}"},
        method="POST",
    )

    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303):
            pass
        else:
            raise

    print(f"uploaded {name} — open {SERVER}/ to see it")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python3 client.py <file>")
        sys.exit(1)
    upload(sys.argv[1])
