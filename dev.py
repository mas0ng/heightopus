"""Heightopus local dev: serves ./static on :8080 and runs the worker API on :8787.

Run:  python dev.py   (or double-click run-local.bat)
Stop: Ctrl+C or close the window.
"""
import http.server
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
WORKER = os.path.join(ROOT, "worker")
WEB_PORT = 8080
API_PORT = 8787
IS_WIN = os.name == "nt"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        ".css": "text/css",
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console readable


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def npm(cmd):
    exe = ("npm.cmd" if IS_WIN else "npm") if cmd[0] == "npm" else ("npx.cmd" if IS_WIN else "npx")
    return [exe] + cmd[1:]


def main():
    if not shutil.which("npx.cmd" if IS_WIN else "npx"):
        print("Node.js is required (npx not found). Install it from https://nodejs.org")
        sys.exit(1)

    if not os.path.isdir(os.path.join(WORKER, "node_modules")):
        print("Installing worker dependencies (first run only)...")
        subprocess.run(npm(["npm", "install", "--no-fund", "--no-audit"]), cwd=WORKER, check=True)

    print("Building the static pages (heights, how-to-play, sitemap)...")
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_pages.py")], check=True)

    print(f"Starting API worker on http://localhost:{API_PORT} ...")
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if IS_WIN else 0
    worker = subprocess.Popen(
        npm(["npx", "wrangler", "dev", "--config", os.path.join(WORKER, "wrangler.toml"), "--port", str(API_PORT), "--ip", "0.0.0.0"]),
        cwd=WORKER,
        creationflags=flags,
    )

    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", WEB_PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    ip = lan_ip()
    print()
    print("  Heightopus is running!")
    print(f"  Game:  http://localhost:{WEB_PORT}")
    if ip:
        print(f"  Phone (same Wi-Fi): http://{ip}:{WEB_PORT}")
    print(f"  API:   http://localhost:{API_PORT}/api/health")
    print("  Close this window or press Ctrl+C to stop.")
    print()
    if not os.environ.get("HO_NO_BROWSER"):
        threading.Timer(2.5, lambda: webbrowser.open(f"http://localhost:{WEB_PORT}")).start()

    def stop(*_):
        print("\nStopping...")
        httpd.shutdown()
        if worker.poll() is None:
            if IS_WIN:
                subprocess.run(["taskkill", "/T", "/F", "/PID", str(worker.pid)], capture_output=True)
            else:
                worker.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, stop)
    try:
        while True:
            if worker.poll() is not None:
                print("Worker stopped (exit code %s)." % worker.returncode)
                stop()
            time.sleep(0.5)
    except KeyboardInterrupt:
        stop()


if __name__ == "__main__":
    main()
