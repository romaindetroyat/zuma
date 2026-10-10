#!/usr/bin/env python3
"""Carve the game files out of the original PopCap/InstallShield Zuma installer.

Usage: python3 tools/extract_installer.py ZumaSetup.exe private_assets/original

The installer embeds a Microsoft Cabinet (LZX). This script locates it, writes it
next to the output and extracts it with whichever tool is available: the
`libarchive` Python binding (pip install libarchive-c), `cabextract` or `7z`.
Everything lands under the destination folder, which must stay out of Git.
"""
import os
import shutil
import struct
import subprocess
import sys


def find_cabinet(data: bytes) -> tuple[int, int]:
    pos = 0
    best = None
    while True:
        pos = data.find(b"MSCF", pos)
        if pos < 0:
            break
        if pos + 36 <= len(data):
            size = struct.unpack_from("<I", data, pos + 8)[0]
            files = struct.unpack_from("<H", data, pos + 28)[0]
            if 0 < size <= len(data) - pos and files > 0:
                if best is None or size > best[1]:
                    best = (pos, size)
        pos += 4
    if best is None:
        raise SystemExit("no cabinet found in installer")
    return best


def extract(cab: str, dest: str) -> None:
    try:
        import libarchive  # type: ignore

        with libarchive.file_reader(cab) as archive:
            for entry in archive:
                name = str(entry).replace("\\", "/")
                if entry.isdir:
                    continue
                target = os.path.join(dest, name)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "wb") as out:
                    for block in entry.get_blocks():
                        out.write(block)
        return
    except ImportError:
        pass
    if shutil.which("cabextract"):
        subprocess.run(["cabextract", "-q", "-d", dest, cab], check=True)
        return
    if shutil.which("7z"):
        subprocess.run(["7z", "x", "-y", f"-o{dest}", cab], check=True, stdout=subprocess.DEVNULL)
        return
    raise SystemExit("install python3 libarchive-c, cabextract or 7z to extract the cabinet")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    installer, dest = sys.argv[1], sys.argv[2]
    data = open(installer, "rb").read()
    pos, size = find_cabinet(data)
    os.makedirs(dest, exist_ok=True)
    cab = os.path.join(dest, "installer-payload.cab")
    with open(cab, "wb") as out:
        out.write(data[pos:pos + size])
    staging = os.path.join(dest, "_cab")
    extract(cab, staging)
    # The cabinet nests the game under files/Zuma Deluxe; flatten it.
    game = None
    for root, dirs, files in os.walk(staging):
        if "levels" in dirs and "images" in dirs and "sounds" in dirs:
            game = root
            break
    if game is None:
        raise SystemExit("extracted cabinet does not look like a Zuma install")
    for name in os.listdir(game):
        src = os.path.join(game, name)
        dst = os.path.join(dest, name)
        if os.path.exists(dst):
            shutil.rmtree(dst) if os.path.isdir(dst) else os.remove(dst)
        shutil.move(src, dst)
    shutil.rmtree(staging)
    os.remove(cab)
    print(f"extracted original game files to {dest}")


if __name__ == "__main__":
    main()
