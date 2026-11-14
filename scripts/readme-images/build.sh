#!/usr/bin/env bash
# Redraws the README's pictures in assets/ from the mod's own output.
#
# scene.ts plays a sample flow against the engine's test host and prints the
# trees the mod draws (terminal text, desktop SVGs). `claude plugin test` runs every
# *.test.ts in the folder, so the scene is kept as scene.ts and runs, renamed, in a
# scratch copy of the repo. render.py lays the trees out as HTML; headless Chrome takes them
# at 2x and ImageMagick trims them.
#
# Needs: claude (2.1.323+), python3, google-chrome-stable (or $CHROME), magick.
set -euo pipefail

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
here="$root/scripts/readme-images"
chrome=${CHROME:-google-chrome-stable}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The tracked files, without the suite's own tests.
mkdir -p "$work/repo"
git -C "$root" ls-files -z | grep -zv '^tests/.*\.test\.ts$' | (cd "$root" && xargs -0 cp --parents -t "$work/repo")
cp "$here/scene.ts" "$work/repo/tests/scene.test.ts"

(cd "$work/repo" && claude plugin test .) > "$work/scene.log" 2>&1 || {
  cat "$work/scene.log" >&2
  exit 1
}
python3 -I "$here/render.py" "$work/scene.log" "$work"

for name in terminal desktop-light desktop-dark; do
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --default-background-color=00000000 --window-size=1400,1000 \
    --screenshot="$work/$name.png" "file://$work/$name.html" 2>/dev/null
  magick "$work/$name.png" -trim +repage -strip -define png:compression-level=9 "$root/assets/$name.png"
  echo "assets/$name.png"
done
