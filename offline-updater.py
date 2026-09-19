#!/usr/bin/env python3
"""Integra la última versión de main antes de abrir la aplicación local."""

from pathlib import Path
import socket
import subprocess

ROOT = Path(__file__).resolve().parent
PORT = 8765


def run_git(*args):
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def local_server_running():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.15)
        return probe.connect_ex(("127.0.0.1", PORT)) == 0


def main():
    # Nunca actualiza archivos mientras el POS local está abierto.
    if local_server_running():
        return
    if run_git("status", "--porcelain").stdout.strip():
        return
    if run_git("fetch", "origin", "main").returncode != 0:
        return
    current = run_git("rev-parse", "HEAD")
    remote = run_git("rev-parse", "origin/main")
    if current.returncode or remote.returncode or current.stdout.strip() == remote.stdout.strip():
        return
    result = run_git("rebase", "origin/main")
    if result.returncode:
        # Conserva la copia que estaba funcionando si no puede integrar un cambio.
        run_git("rebase", "--abort")


if __name__ == "__main__":
    main()
