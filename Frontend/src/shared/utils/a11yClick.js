// Gắn cho phần tử không phải <button> nhưng có onClick (thẻ thư mục, dòng bảng...):
// cho phép Tab vào và Enter/Space kích hoạt như bấm chuột. Không đổi giao diện.
function activateOnKey(event) {
  if (event.target !== event.currentTarget) return; // phím gõ ở nút/ô nhập con thì bỏ qua
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

export const buttonLikeProps = { role: "button", tabIndex: 0, onKeyDown: activateOnKey };
// Dòng <tr> giữ role "row" của bảng, chỉ thêm tabIndex + phím.
export const rowLikeProps = { tabIndex: 0, onKeyDown: activateOnKey };
