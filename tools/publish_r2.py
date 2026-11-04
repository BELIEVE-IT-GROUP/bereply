#!/usr/bin/env python3
"""Publica un archivo a Cloudflare R2 (bucket believe-r2) y devuelve el link publico.

Lee R2_ACCESS_KEY / R2_SECRET_KEY / R2_ENDPOINT del entorno (los inyecta
~/.believe/bin/infra desde Infisical). Firma AWS SigV4 a mano: cero dependencias,
solo stdlib. Imprime SOLO el link publico en stdout; todo lo demas va a stderr.

Uso:
  publish-r2.py <archivo> [--key h/abc.html]   # --key = actualizar un objeto existente
"""
import os, sys, hashlib, hmac, datetime, secrets, re, mimetypes, argparse
import urllib.request, urllib.parse, urllib.error

BUCKET      = os.environ.get("R2_BUCKET", "believe-r2")
PREFIX      = os.environ.get("R2_PREFIX", "h/")
PUBLIC_BASE = os.environ.get("R2_PUBLIC_BASE", "https://files.believe-global.com")
REGION, SERVICE = "auto", "s3"


def _sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def _signing_key(secret, datestamp):
    k = _sign(("AWS4" + secret).encode(), datestamp)
    k = _sign(k, REGION)
    k = _sign(k, SERVICE)
    return _sign(k, "aws4_request")


def put_object(key, body, content_type):
    ak, sk = os.environ["R2_ACCESS_KEY"], os.environ["R2_SECRET_KEY"]
    endpoint = os.environ["R2_ENDPOINT"].rstrip("/")
    host = urllib.parse.urlparse(endpoint).netloc
    enc_key = urllib.parse.quote(key, safe="/")
    canonical_uri = "/" + BUCKET + "/" + enc_key

    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, datestamp = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()

    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        ["PUT", canonical_uri, "", canonical_headers, signed_headers, payload_hash]
    )
    scope = f"{datestamp}/{REGION}/{SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        ["AWS4-HMAC-SHA256", amz_date, scope,
         hashlib.sha256(canonical_request.encode()).hexdigest()]
    )
    signature = hmac.new(
        _signing_key(sk, datestamp), string_to_sign.encode(), hashlib.sha256
    ).hexdigest()
    auth = (f"AWS4-HMAC-SHA256 Credential={ak}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}")

    req = urllib.request.Request(
        f"{endpoint}/{BUCKET}/{enc_key}", data=body, method="PUT",
        headers={"Authorization": auth, "x-amz-date": amz_date,
                 "x-amz-content-sha256": payload_hash, "Content-Type": content_type},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"R2 {e.code}: {e.read().decode(errors='replace')[:500]}", file=sys.stderr)
        return e.code


def slugify(name):
    base = re.sub(r"\.[^.]+$", "", name)
    s = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower()
    return s[:40] or "file"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--key", help="key R2 exacto para actualizar (ej h/abc.html)")
    args = ap.parse_args()

    with open(args.file, "rb") as f:
        body = f.read()
    fname = os.path.basename(args.file)
    ctype = mimetypes.guess_type(fname)[0] or "application/octet-stream"
    if ctype == "text/html":
        ctype = "text/html; charset=utf-8"

    if args.key:
        key = args.key
    else:
        m = re.search(r"(\.[^.]+)$", fname)
        ext = m.group(1) if m else ".html"
        key = f"{PREFIX}{secrets.token_hex(6)}-{slugify(fname)}{ext}"

    status = put_object(key, body, ctype)
    if status not in (200, 201):
        print(f"ERROR: PUT devolvio {status}", file=sys.stderr)
        sys.exit(1)
    print(f"{PUBLIC_BASE.rstrip('/')}/{key}")


if __name__ == "__main__":
    main()
