#!/bin/bash
# Chụp trang xem thử layout (dev/layout-preview.html) cho 3 vai trò ở 1280x800 và 390x844 (menu đóng và mở), bằng Chrome headless.
# Dùng để so ảnh trước/sau khi sửa thanh menu. Chrome headless không cho cửa sổ hẹp hơn ~500px, nên ảnh 390px
# chụp trang trong iframe 390px (?frame=390) ở cửa sổ 600px rồi cắt bằng ffmpeg (không có ffmpeg thì giữ ảnh 600px).
#   1) cd Frontend && npx vite --port 5199 --strictPort
#   2) bash dev/layout-shots.sh <thư mục ra> [đường dẫn chrome]
out="${1:?Cần thư mục ra}"; mkdir -p "$out"
chrome="${2:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
base="${LAYOUT_PREVIEW_URL:-http://localhost:5199/dev/layout-preview.html}"
tmproot="${TMPDIR:-${TEMP:-/tmp}}"
shoot() { # tên, cỡ, query
  local file="$out/$1.png" profile
  profile="$(mktemp -d "$tmproot/layout-shots-XXXXXX")"
  command -v cygpath >/dev/null && file="$(cygpath -w "$file")"
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --no-first-run --force-prefers-reduced-motion --user-data-dir="$profile" \
    --window-size="$2" --virtual-time-budget=6000 --screenshot="$file" "$base?$3" >/dev/null 2>&1
  rm -rf "$profile"
}
narrow() { # tên, query: chụp 390x844 qua iframe rồi cắt
  shoot "$1" 600,1000 "$2&frame=390"
  if command -v ffmpeg >/dev/null; then
    ffmpeg -loglevel error -y -i "$out/$1.png" -vf crop=390:844:0:0 "$out/$1.tmp.png" && mv "$out/$1.tmp.png" "$out/$1.png"
  fi
}
for role in admin manager member; do
  shoot "1280_${role}" 1280,800 "role=$role"
  shoot "1280_${role}_en" 1280,800 "role=$role&lang=en"
  narrow "390_${role}" "role=$role"
  narrow "390_${role}_menu" "role=$role&menu=1"
  narrow "390_${role}_menu_en" "role=$role&menu=1&lang=en"
done
ls "$out"
