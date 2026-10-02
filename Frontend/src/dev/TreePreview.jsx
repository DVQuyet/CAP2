// Trang xem thử trình chỉnh sửa cây gia phả với dữ liệu mẫu, không cần backend.
// Chạy `npm run dev` rồi mở /dev/tree-preview.html (tham số: ?readonly=1, ?theme=modern|dark, ?lang=en).
// Không được import từ app chính nên không nằm trong bản build.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../index.css";
import "../app/App.css";
import "../i18n/i18n";
import { LanguageProvider } from "../i18n/LanguageContext";
import FamilyTreeEditor from "../features/genealogy/components/FamilyTreeEditor.jsx";

const params = new URLSearchParams(window.location.search);
localStorage.setItem("auth_user", JSON.stringify({ id: 1, role_id: 2, role_name: "manager", person_id: 8 }));
localStorage.setItem("auth_token", "preview");

function portrait(initials, background) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${background}"/><text x="48" y="60" font-size="34" font-family="Arial" text-anchor="middle" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const person = (id, display_name, gender, generation, birth, death = null, extra = {}) => ({
  id, clan_id: 1, display_name, gender, generation, birth_date: birth, death_date: death, is_living: death ? 0 : 1, ...extra,
});

const people = [
  person(1, "Nguyễn Văn Tổ", 1, 1, "1920-03-12", "1990-08-01", { avatar_url: portrait("T", "#8a6a4a") }),
  person(2, "Trần Thị Hiền", 2, 1, "1924-05-20", "1998-11-11"),
  person(3, "Nguyễn Văn Bình", 1, 2, "1948-01-02", null, { avatar_url: portrait("B", "#5b7083") }),
  person(4, "Lê Thị Hoa", 2, 2, "1950-07-07"),
  person(5, "Nguyễn Thị Lan", 2, 2, "1952-09-09"),
  person(6, "Nguyễn Văn Cường", 1, 2, "1955-04-04", "2015-02-02"),
  person(7, "Phạm Thị Mai", 2, 2, "1958-12-12"),
  person(8, "Nguyễn Văn Đức", 1, 3, "1975-03-03", null, { avatar_url: portrait("Đ", "#3f6d5c") }),
  person(9, "Võ Thị Thu", 2, 3, "1978-06-06"),
  person(10, "Nguyễn Thị Hằng", 2, 3, "1980-10-10"),
  person(11, "Nguyễn Văn Hải", 1, 3, "1983-01-15"),
  person(12, "Nguyễn Minh Khoa", 1, 4, "2005-05-05"),
  person(13, "Nguyễn Ngọc Anh", 2, 4, "2008-08-08"),
  person(14, "Nguyễn Gia Bảo", 1, 4, "2012-02-12"),
];
const families = [
  { id: 1, clan_id: 1, father_id: 1, mother_id: 2 },
  { id: 2, clan_id: 1, father_id: 3, mother_id: 4 },
  { id: 3, clan_id: 1, father_id: 6, mother_id: 7 },
  { id: 4, clan_id: 1, father_id: 8, mother_id: 9 },
];
const children = [
  { id: 1, family_id: 1, person_id: 3, sort_order: 1 },
  { id: 2, family_id: 1, person_id: 5, sort_order: 2 },
  { id: 3, family_id: 1, person_id: 6, sort_order: 3 },
  { id: 4, family_id: 2, person_id: 8, sort_order: 1 },
  { id: 5, family_id: 2, person_id: 10, sort_order: 2 },
  { id: 6, family_id: 3, person_id: 11, sort_order: 1 },
  { id: 7, family_id: 4, person_id: 12, sort_order: 1 },
  { id: 8, family_id: 4, person_id: 13, sort_order: 2 },
  { id: 9, family_id: 4, person_id: 14, sort_order: 3 },
];

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <LanguageProvider>
      <div style={{ padding: 16, minHeight: "100vh", boxSizing: "border-box" }}>
        <FamilyTreeEditor
          clan={{ id: 1, clan_name: "Họ Nguyễn" }}
          people={people}
          families={families}
          children={children}
          readOnly={params.get("readonly") === "1"}
          layoutSettings={params.get("theme") ? { tree_style: { theme: params.get("theme") } } : undefined}
          enableRealtime={false}
          onReload={() => {}}
        />
      </div>
    </LanguageProvider>
  </BrowserRouter>
);
