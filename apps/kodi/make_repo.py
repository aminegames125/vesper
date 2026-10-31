"""Builds the Kodi repository that GitHub Pages serves at https://amineos.dev/vesper/kodi/.

    python apps/kodi/make_repo.py --version 0.19.0 --out apps/site/dist/kodi

Writes addons.xml, addons.xml.md5 and, for each add-on, `<id>/<id>-<version>.zip` with its icon.
Kodi reads addons.xml to see which versions exist and downloads the zip when one is newer.
"""

import argparse
import hashlib
import os
import re
import shutil

from build import HERE, SOURCE, pack

REPO_SOURCE = os.path.join(HERE, "repository.vesper")


def build(out, version):
    entries = []
    for source, addon in ((SOURCE, "plugin.video.vesper"), (REPO_SOURCE, "repository.vesper")):
        folder = os.path.join(out, addon)
        zip_path, manifest = pack(source, addon, folder, version if addon.startswith("plugin") else None)
        for asset in ("icon.png", "fanart.jpg"):
            if os.path.exists(os.path.join(source, asset)):
                shutil.copy(os.path.join(source, asset), folder)
        entries.append(re.sub(r"^<\?xml[^>]*\?>\s*", "", manifest).strip())
        print(zip_path)
    catalogue = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<addons>\n' + "\n".join(entries) + "\n</addons>\n"
    with open(os.path.join(out, "addons.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write(catalogue)
    with open(os.path.join(out, "addons.xml.md5"), "w", encoding="ascii") as f:
        f.write(hashlib.md5(catalogue.encode("utf-8")).hexdigest())
    return catalogue


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    build(args.out, args.version)
