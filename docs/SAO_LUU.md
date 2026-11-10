# Sao lưu và khôi phục database

Workflow `.github/workflows/backup.yml` chạy lúc 02:30 mỗi ngày (và chạy tay được ở tab Actions → "Sao lưu database" → Run workflow). Nó dump toàn bộ MySQL, nén, mã hóa AES-256 bằng `gpg` rồi lưu làm artifact, giữ 30 ngày.

Trạng thái: workflow đã viết nhưng **chưa chạy lần nào**. Phải đặt secret (bên dưới), bấm chạy tay một lần và thử khôi phục thì mới coi là có sao lưu.

## Đặt secret (một lần)

GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Giá trị |
|---|---|
| `BACKUP_DB_HOST`, `BACKUP_DB_PORT`, `BACKUP_DB_NAME` | Lấy từ trang quản trị Aiven |
| `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD` | Nên tạo tài khoản MySQL riêng chỉ có quyền đọc (`SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT`) thay vì dùng tài khoản của ứng dụng |
| `BACKUP_PASSPHRASE` | Chuỗi ngẫu nhiên dài. Ghi lại ở nơi an toàn ngoài GitHub: mất chuỗi này là không mở được bản sao lưu |

Nếu Aiven giới hạn IP được kết nối thì phải cho phép IP của GitHub Actions (hoặc tắt giới hạn), nếu không bước dump sẽ lỗi kết nối.

## Khôi phục vào MySQL local (thử mỗi tháng một lần)

1. Tải artifact về từ tab Actions → lần chạy gần nhất → mục Artifacts, giải nén file zip được `cap2-<ngày>.sql.gz.gpg`.
2. Bật MySQL local: `docker compose -f docker/docker-compose.yml up -d`.
3. Giải mã và nạp vào một database trống (không nạp đè `cap2_dev` đang dùng):

```bash
docker exec cap2-mysql mysql -uroot -pcap2_dev_root -e "CREATE DATABASE cap2_restore CHARACTER SET utf8mb4"
gpg --batch --pinentry-mode loopback --decrypt --passphrase "<BACKUP_PASSPHRASE>" cap2-<ngày>.sql.gz.gpg | gunzip \
  | docker exec -i cap2-mysql mysql -uroot -pcap2_dev_root cap2_restore
```

4. Kiểm tra số dòng vài bảng chính (`people`, `families`, `accounts`, `media_files`) khớp với bản thật, rồi ghi ngày thử vào `docs/VIEC_CHUA_LAM.md`.

Khôi phục vào DB thật chỉ làm khi có sự cố, và phải dump bản hiện tại trước khi nạp.

## Giới hạn cần biết

- Artifact tính vào dung lượng lưu trữ Actions của tài khoản (repo riêng tư có hạn mức miễn phí nhỏ). Ảnh nằm trong DB nên bản dump có thể lớn; nếu chạm hạn mức thì giảm `retention-days`.
- Repo công khai thì ai đăng nhập GitHub cũng tải được artifact. File đã mã hóa, nên độ an toàn phụ thuộc hoàn toàn vào `BACKUP_PASSPHRASE`.
- GitHub tự tắt workflow theo lịch nếu repo không có hoạt động trong 60 ngày.
