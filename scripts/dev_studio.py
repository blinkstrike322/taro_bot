"""One supported local launch; signals terminate only children started here."""

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def check_ports(ports):
    for port in ports:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as e:
                raise RuntimeError(f"Port {port} is already in use. Existing process was not changed.") from e


def main():
    args = sys.argv[1:]
    api_only = "--api-only" in args
    if api_only:
        args.remove("--api-only")
    check_ports([8097] if api_only else [3210, 8097])
    children = []

    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        children.append(subprocess.Popen([sys.executable, str(ROOT / "scripts/studio_api.py"), *args], cwd=ROOT))
        for _ in range(100):
            if children[0].poll() is not None:
                raise RuntimeError("Studio API could not start")
            try:
                with urlopen("http://127.0.0.1:8097/__studio/bootstrap", timeout=0.3):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Studio API startup timeout")
        if not api_only:
            env = {**os.environ, "ARCANUM_STUDIO": "1", "NEXT_PUBLIC_ARCANUM_STUDIO": "1"}
            env.pop("NEXT_PUBLIC_DEV_MOCK_INITDATA", None)
            children.append(
                subprocess.Popen(
                    [
                        "node",
                        "node_modules/next/dist/bin/next",
                        "dev",
                        "--webpack",
                        "-p",
                        "3210",
                        "--hostname",
                        "127.0.0.1",
                    ],
                    cwd=ROOT / "web",
                    env=env,
                )
            )
        print("Studio: http://localhost:3210/ (Ctrl+C stops only this launcher’s children)", flush=True)
        while all(c.poll() is None for c in children):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    main()
