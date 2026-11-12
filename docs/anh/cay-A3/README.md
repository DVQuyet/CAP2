# Ảnh mẫu sau Giai đoạn 3 (cây gia phả)

Chụp ngày 12/11/2026 trên `Frontend/dev/tree-preview.html` (dữ liệu mẫu 14 người) bằng `Frontend/dev/tree-shots.sh` (Chrome headless, bật `--force-prefers-reduced-motion`, profile mới cho mỗi ảnh). Đây là bộ ảnh mẫu hiện hành; `../cay-A1/` giữ làm lịch sử trước/sau bước A1.

Tên file như ở `cay-A1`: `<chiều rộng>_<chủ đề>_<chế độ>_<h|v>`.

## Khác với `cay-A1/sau`

- Nhãn "Đời N" dính mép trái vùng nhìn, nằm dưới thẻ (không che tên), cỡ chữ gần như cố định trên màn hình.
- Cụm nút zoom có thêm "Tìm tôi" và "Về thủy tổ"; ở điện thoại mỗi nút cao 44px.
- Ảnh 390px: trạng thái thu gọn mặc định "3 đời quanh tôi" ẩn Đời 1 của dữ liệu xem thử (có từ trước, không phải lỗi mới).

## Độ ổn định

Chụp hai lần liên tiếp: 15/15 ảnh khác 0,000%. Trước đây ảnh có thao tác chọn lệch tới 7% vì chụp giữa hoạt ảnh phóng tới người; nay khi bật giảm chuyển động, phóng/di chuyển cây chạy ngay (`motionMs` trong `utils/tree-editor/treeFlash.js`).

## Cách so

```
cd Frontend && npx vite --port 5199 --strictPort            # chạy nền
bash dev/tree-shots.sh <thư mục mới>
node dev/tree-shots-compare.mjs ../docs/anh/cay-A3/mau <thư mục mới> <thư mục diff> [ngưỡng %]
```

## Giới hạn

Chrome headless trên Windows không thu cửa sổ xuống dưới khoảng 500px, nên ảnh "390" thực ra là trang rộng hơn bị cắt: không thấy cụm nút zoom và mép phải. Muốn xem đúng khổ 390×844 thì dùng chế độ giả lập thiết bị của trình duyệt (DevTools hoặc pane của Claude). Chưa thử trên điện thoại thật.
