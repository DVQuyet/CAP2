# Ảnh trước/sau bước A1 (thẻ trên cây)

Chụp ngày 10/11/2026 trên `Frontend/dev/tree-preview.html` (dữ liệu mẫu 14 người) bằng `Frontend/dev/tree-shots.sh`, Chrome headless. `truoc/` là mã ở commit `9335f33`, `sau/` là sau bước A1.

Tên file: `<chiều rộng>_<chủ đề>_<chế độ>_<h|v>` (h = thẻ ngang, v = thẻ dọc). Mã hiện có 2 chế độ hiển thị (tổng quan, chi tiết) và 3 chủ đề (truyền thống, hiện đại, tối), không phải 3 chế độ và 4 chủ đề như kế hoạch ghi.

## Lỗi thấy ở ảnh "trước"

| Lỗi | Ảnh |
|---|---|
| Nút mũi tên thu gọn luôn hiện trên từng nửa thẻ, đè lên dòng "Con thứ N"; ở chủ đề tối nút màu trắng chói | `1280_traditional_detail_v`, `1280_dark_detail_h` |
| Tên trong thẻ vợ chồng canh giữa, tên trong thẻ một người canh trái | `1280_traditional_detail_h` |
| Điện thoại: nút mũi tên che chữ cuối của tên ("Lê Thị Hoa", "Võ Thị Thu") | `390_traditional_detail_h` |
| Nhãn "Đã mất" nhỏ, nằm lệch ra ngoài góc thẻ | `1280_traditional_detail_h` |
| Dòng phụ dài (năm, đời, con thứ) bị cắt ở thẻ dọc | `1280_traditional_detail_v` |

## Thay đổi ở ảnh "sau"

- Thẻ thường không còn nút nào; thanh thao tác chỉ hiện khi rê chuột, focus hoặc chọn (`1280_traditional_chon-nguoi`, `1280_dark_chon-nua-the`).
- Tên canh trái ở mọi loại thẻ, tối đa 2 dòng; dòng phụ còn "năm sinh – năm mất · Đời N". Con thứ, chi, "đã mất" chuyển vào tooltip.
- Ảnh đại diện 40px. Người đã mất: nền nhạt và ảnh xám.
- Đường nối 1,5px giữ nguyên độ dày khi zoom; đường quan hệ tô cam (`1280_modern_duong-quan-he`).
- Nhánh đang thu gọn có nút "+N"; tổ tiên đang ẩn có nút "↑" ở mép trên thẻ.

## Chưa kiểm tra

Ảnh chụp bằng Chrome headless trên máy tính. Chưa thử trên điện thoại thật, chưa thử rê chuột/kéo thả bằng tay, chưa thử Firefox/Safari, chưa thử với cây thật (có thẻ tham chiếu, vợ lẽ/ly hôn, tộc trưởng, người đang sửa).

## So ảnh tự động khi sửa CSS

```
cd Frontend && npx vite --port 5199 --strictPort            # chạy nền
bash dev/tree-shots.sh <thư mục mới>                         # chụp 15 ảnh PNG
node dev/tree-shots-compare.mjs ../docs/anh/cay-A1/sau <thư mục mới> <thư mục diff> [ngưỡng %]
```

Script so ghép cặp theo tên (nhận .png và .webp), in % điểm ảnh khác (chênh mỗi kênh > 24) và ĐẠT/LỆCH theo ngưỡng (mặc định 1%), ghi ảnh diff (điểm khác tô đỏ) vào thư mục diff. Mã thoát 1 nếu có ảnh lệch hoặc thiếu. `tree-shots.sh` dùng profile Chrome mới cho mỗi ảnh nên không dính trạng thái localStorage cũ.

Lưu ý: bộ `sau/` chụp lúc đầu A1, trước các thay đổi sau đó, nên chạy lại có thể lệch nhiều; khi giao diện đã chốt thì chụp lại làm ảnh mẫu mới. Ảnh `1280_traditional_chon-nguoi` không ổn định giữa các lần chụp (hiệu ứng chọn/rê chuột), nên lệch vài % là bình thường.
