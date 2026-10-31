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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", help="version to put in addon.xml, for example 0.19.0")
    parser.add_argument("--out", default=os.path.join(HERE, "dist"))
    args = parser.parse_args()

    with open(os.path.join(SOURCE, "addon.xml"), encoding="utf-8") as f:
        manifest = f.read()
    if args.version:
        if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
            raise SystemExit("Kodi needs a plain version such as 1.2.3, not %r" % args.version)
        manifest = re.sub(r'(<addon [^>]*version=")[^"]+', r"\g<1>" + args.version, manifest, count=1)
    version = re.search(r'<addon [^>]*version="([^"]+)"', manifest).group(1)

    os.makedirs(args.out, exist_ok=True)
    target = os.path.join(args.out, "%s-%s.zip" % (ADDON, version))
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, dirs, files in os.walk(SOURCE):
            dirs[:] = sorted(d for d in dirs if d not in SKIP)
            for name in sorted(files):
                if name.endswith(SKIP):
                    continue
                path = os.path.join(folder, name)
                inside = os.path.join(ADDON, os.path.relpath(path, SOURCE)).replace(os.sep, "/")
                if inside == ADDON + "/addon.xml":
                    z.writestr(inside, manifest)
                else:
                    z.write(path, inside)
    print(target)


if __name__ == "__main__":
    main()
