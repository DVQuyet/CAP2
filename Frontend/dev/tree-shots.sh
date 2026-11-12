#!/bin/bash
# Chụp trang xem thử cây (dev/tree-preview.html) ở 390x844 và 1280x800, các chủ đề/chế độ, bằng Chrome headless.
# Dùng để so ảnh trước/sau khi sửa giao diện cây.
#   1) cd Frontend && npx vite --port 5199 --strictPort
#   2) bash dev/tree-shots.sh <thư mục ra> [đường dẫn chrome]
#   3) So tự động với ảnh mẫu (in % điểm ảnh khác, ghi ảnh diff, mã thoát 1 nếu lệch):
#      node dev/tree-shots-compare.mjs ../docs/anh/cay-A1/sau <thư mục ra> <thư mục diff> [ngưỡng %]
# Mỗi ảnh dùng một profile Chrome mới (xóa ngay sau khi chụp) để trạng thái thu gọn lưu trong
# localStorage không làm ảnh khác nhau giữa các lần chụp.
out="${1:?Cần thư mục ra}"; mkdir -p "$out"
chrome="${2:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
base="${TREE_PREVIEW_URL:-http://localhost:5199/dev/tree-preview.html}"
tmproot="${TMPDIR:-${TEMP:-/tmp}}"
shoot() { # tên, cỡ, query
  local file="$out/$1.png" profile
  profile="$(mktemp -d "$tmproot/tree-shots-XXXXXX")"
  command -v cygpath >/dev/null && file="$(cygpath -w "$file")"
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --no-first-run --force-prefers-reduced-motion --user-data-dir="$profile" \
    --window-size="$2" --virtual-time-budget=9000 --screenshot="$file" "$base?$3" >/dev/null 2>&1
  rm -rf "$profile"
}
for size in 1280,800 390,844; do
  w=${size%%,*}
  for theme in traditional modern dark; do shoot "${w}_${theme}_detail_h" "$size" "theme=$theme"; done
  shoot "${w}_traditional_detail_v" "$size" "theme=traditional&orient=vertical"
  shoot "${w}_traditional_overview_h" "$size" "theme=traditional&mode=overview"
  shoot "${w}_modern_overview_v" "$size" "theme=modern&mode=overview&orient=vertical"
done
# Trạng thái: chọn một người (thanh thao tác), chọn nửa thẻ vợ chồng, tô đường quan hệ.
shoot "1280_traditional_chon-nguoi" 1280,800 "theme=traditional&focus=5"
shoot "1280_dark_chon-nua-the" 1280,800 "theme=dark&focus=6"
shoot "1280_modern_duong-quan-he" 1280,800 "theme=modern&path=12,8,3,5"
ls "$out"
