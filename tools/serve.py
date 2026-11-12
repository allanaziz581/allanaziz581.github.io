#!/usr/bin/env python3
"""Local preview server with a save endpoint for the in-page editor (?edit).

Serves the site folder on 127.0.0.1 only. POST /__save with the edited content.json:
it is validated, the previous file is kept as content.json.bak, and tools/build.py
regenerates index.html and llms.txt. Never expose this server to a network; on a
public static host the editor falls back to downloading content.json instead.

Usage: python3 tools/serve.py [port]   (default 5178)
"""
import json
import os
import shutil
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402

ROOT = build.ROOT
MAX_BODY = 512 * 1024


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # always fresh while editing
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/__save":
            return self._json(404, {"ok": False, "error": "not found"})
        port = self.server.server_address[1]
        allowed = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        origin = self.headers.get("Origin")
        if origin not in allowed:  # same-origin pages only; blocks other sites posting here
            return self._json(403, {"ok": False, "error": "origin not allowed"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self._json(415, {"ok": False, "error": "send application/json"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            return self._json(413, {"ok": False, "error": "body missing or too large"})
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            clean = build.validate(data)
        except (ValueError, build.ContentError) as err:
            return self._json(400, {"ok": False, "error": str(err)})
        path = build.CONTENT
        if os.path.exists(path):
            shutil.copyfile(path, path + ".bak")
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(clean, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
        try:
            changed = build.build(clean)
        except build.ContentError as err:
            return self._json(500, {"ok": False, "error": f"saved, but the build failed: {err}"})
        self.log_message("saved content.json; rebuilt %s", ", ".join(changed) or "nothing")
        return self._json(200, {"ok": True, "changed": changed})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    handler = partial(Handler, directory=ROOT)
    srv = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving {ROOT} on http://127.0.0.1:{port}/  (editor: http://127.0.0.1:{port}/?edit)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
