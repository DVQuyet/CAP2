// Phần dùng chung cho thẻ một người và mỗi nửa của thẻ vợ chồng: ảnh đại diện + tên + dòng phụ.
// Kiểu nằm ở ../styles/TreeCard.css.
import { genderKey, initialsOf } from "../utils/tree-editor/treeCardInfo";

export function PersonAvatar({ person, name }) {
  const className = `fte2-avatar is-${genderKey(person)}${Number(person?.is_living) === 0 ? " is-deceased" : ""}`;
  return person?.avatar_url
    ? <img className={className} src={person.avatar_url} alt="" draggable={false} />
    : <span className={className} aria-hidden="true">{initialsOf(name)}</span>;
}

export function CardPersonBody({ person, name, meta, showAvatar }) {
  return (
    <>
      {showAvatar ? <PersonAvatar person={person} name={name} /> : null}
      <div className="fte2-cardText">
        <div className="fte-cardName">{name}</div>
        {meta ? <div className="fte-cardMeta">{meta}</div> : null}
      </div>
    </>
  );
}
