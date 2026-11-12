// Trang xem thử trình chỉnh sửa cây gia phả với dữ liệu mẫu, không cần backend.
// Chạy `npm run dev` rồi mở /dev/tree-preview.html
// (tham số: ?readonly=1, ?theme=modern|dark, ?orient=vertical, ?mode=overview, ?focus=<id người>, ?lang=en,
//  ?expand=1 mở mọi nhánh, ?n=500|2000 sinh cây lớn để đo hiệu năng, ?profile=1 ghi thời gian React commit vào window.__commits).
// Không được import từ app chính nên không nằm trong bản build.
import React, { Profiler } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../styles/tokens.css";
import "../index.css";
import "../app/App.css";
import "../i18n/i18n";
import { LanguageProvider } from "../i18n/LanguageContext";
import ConfirmProvider from "../shared/components/ConfirmProvider";
import FamilyTreeEditor from "../features/tree/components/FamilyTreeEditor.jsx";

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

// Sinh cây lớn có tính lặp lại được (không ngẫu nhiên) để đo hiệu năng: mỗi người dòng chính lấy vợ/chồng và có 2-4 con.
function generateTree(total) {
  const bigPeople = [];
  const bigFamilies = [];
  const bigChildren = [];
  let nextId = 1;
  const add = (gender, generation) => {
    const id = nextId++;
    bigPeople.push(person(id, `${gender === 1 ? "Nguyễn Văn" : "Nguyễn Thị"} Mẫu ${id}`, gender, generation, `${1900 + generation * 25}-01-01`, generation <= 2 ? `${1970 + generation * 25}-01-01` : null));
    return id;
  };
  let queue = [add(1, 1)];
  while (queue.length && bigPeople.length < total) {
    const next = [];
    for (const parentId of queue) {
      if (bigPeople.length >= total) break;
      const parent = bigPeople[parentId - 1];
      const spouseId = add(parent.gender === 1 ? 2 : 1, parent.generation);
      const familyId = bigFamilies.length + 1;
      bigFamilies.push({ id: familyId, clan_id: 1, father_id: parent.gender === 1 ? parentId : spouseId, mother_id: parent.gender === 1 ? spouseId : parentId });
      const childCount = 2 + (parentId % 3);
      for (let index = 0; index < childCount && bigPeople.length < total; index += 1) {
        const childId = add(index % 2 === 0 ? 1 : 2, parent.generation + 1);
        bigChildren.push({ id: bigChildren.length + 1, family_id: familyId, person_id: childId, sort_order: index + 1 });
        next.push(childId);
      }
    }
    queue = next;
  }
  return { people: bigPeople, families: bigFamilies, children: bigChildren };
}

const bigCount = Number(params.get("n")) || 0;
const data = bigCount > 0 ? generateTree(bigCount) : { people, families, children };
if (bigCount > 0) localStorage.setItem("auth_user", JSON.stringify({ id: 1, role_id: 2, role_name: "manager", person_id: 1 }));
const previewClanId = bigCount > 0 ? 1000 + bigCount : 1;
// Cây lớn (hoặc ?expand=1): mở sẵn mọi nhánh thay cho mặc định "3 đời quanh tôi", để đo với đủ số thẻ.
if (bigCount > 0 || params.get("expand") === "1") {
  localStorage.setItem(`cap2.tree.collapsed.1.${previewClanId}`, JSON.stringify({ collapsed: [], hiddenAncestors: [] }));
}
window.__commits = [];
const onCommit = (id, phase, actualDuration) => window.__commits.push(actualDuration);
const withProfiler = (node) => (params.get("profile") === "1" ? <Profiler id="tree" onRender={onCommit}>{node}</Profiler> : node);

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <LanguageProvider>
      <ConfirmProvider>
      <div style={{ padding: 16, minHeight: "100vh", boxSizing: "border-box" }}>
        {withProfiler(<FamilyTreeEditor
          clan={{ id: previewClanId, clan_name: "Họ Nguyễn" }}
          people={data.people}
          families={data.families}
          children={data.children}
          readOnly={params.get("readonly") === "1"}
          layoutSettings={{ tree_style: { theme: params.get("theme") || undefined, cardOrientation: params.get("orient") || undefined } }}
          initialDisplayMode={params.get("mode") === "overview" ? "overview" : "detail"}
          enableRealtime={false}
          onReload={() => {}}
        />)}
      </div>
      </ConfirmProvider>
    </LanguageProvider>
  </BrowserRouter>
);
