from __future__ import annotations

import argparse
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a local static dev server.")
    parser.add_argument("--port", type=int, default=5500, help="Port to serve on (default: 5500)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)

    address = ("", args.port)
    server = ThreadingHTTPServer(address, SimpleHTTPRequestHandler)

    print(f"Serving {root} at http://localhost:{args.port}")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
