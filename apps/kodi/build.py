"""Packs the add-on into a zip that Kodi can install (Add-ons > Install from zip file).

    python apps/kodi/build.py                 # dist/plugin.video.vesper-<version in addon.xml>.zip
    python apps/kodi/build.py --version 1.2.3 # same, with that version written into the zip
"""

import argparse
import os
import re
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = "plugin.video.vesper"
SOURCE = os.path.join(HERE, ADDON)
SKIP = ("__pycache__", ".pyc")


def pack(source, addon, out, version=None):
    """Zips one add-on folder as `<addon>-<version>.zip`; returns the zip path and its addon.xml text."""
    with open(os.path.join(source, "addon.xml"), encoding="utf-8") as f:
        manifest = f.read()
    if version:
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise SystemExit("Kodi needs a plain version such as 1.2.3, not %r" % version)
        manifest = re.sub(r'(<addon [^>]*version=")[^"]+', r"\g<1>" + version, manifest, count=1)
    version = re.search(r'<addon [^>]*version="([^"]+)"', manifest).group(1)

    os.makedirs(out, exist_ok=True)
    target = os.path.join(out, "%s-%s.zip" % (addon, version))
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, dirs, files in os.walk(source):
            dirs[:] = sorted(d for d in dirs if d not in SKIP)
            for name in sorted(files):
                if name.endswith(SKIP):
                    continue
                path = os.path.join(folder, name)
                inside = addon + "/" + os.path.relpath(path, source).replace(os.sep, "/")
                if inside == addon + "/addon.xml":
                    z.writestr(inside, manifest)
                else:
                    z.write(path, inside)
    return target, manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", help="version to put in addon.xml, for example 0.19.0")
    parser.add_argument("--out", default=os.path.join(HERE, "dist"))
    args = parser.parse_args()
    print(pack(SOURCE, ADDON, args.out, args.version)[0])


if __name__ == "__main__":
    main()
