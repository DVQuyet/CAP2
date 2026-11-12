import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import useLandingContent from "../features/public/landing/useLandingContent";
import {
  sectionOf,
  isSectionVisible,
  mergeSectionText,
  mergeItems,
  buildDefaultSection,
  groupFooterLinks,
  contactHref,
  socialIconName,
  visibleSocialLinks,
  isExternalLink,
  itemKey,
  paragraphsOf,
  DEFAULT_CONTACT_EMAIL,
} from "../features/public/landing/landingContent";
import "./SiteFooter.css";

function FooterLink({ item }) {
  const url = item.link_url.trim();
  if (isExternalLink(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {item.title}
      </a>
    );
  }
  return <Link to={url}>{item.title}</Link>;
}

export default function SiteFooter() {
  const { t } = useTranslation();
  const { content } = useLandingContent();

  const showBrand = isSectionVisible(content, "footer");
  const brand = mergeSectionText(sectionOf(content, "footer"), buildDefaultSection("footer", t));
  const extra = paragraphsOf(brand.body);

  const contactSection = sectionOf(content, "footer_contact");
  const showContact = isSectionVisible(content, "footer_contact");
  // Chưa có dữ liệu: giữ nguyên giao diện cũ (một link "Liên hệ" cùng hàng với các link pháp lý).
  const legacyContact = !(contactSection && contactSection.items_custom);
  const contacts = legacyContact ? [] : mergeItems(contactSection, []);

  const showLinks = isSectionVisible(content, "footer_links");
  const linkItems = mergeItems(sectionOf(content, "footer_links"), buildDefaultSection("footer_links", t).items);
  const groups = groupFooterLinks(linkItems);
  const flatLinks = groups.length === 1 && !groups[0].heading;

  const showSocial = isSectionVisible(content, "footer_social");
  const socials = showSocial ? visibleSocialLinks(mergeItems(sectionOf(content, "footer_social"), [])) : [];

  return (
    <footer className="site-footer" data-no-translate="true">
      <div className="container footer-wrap">
        <div>
          {showBrand && (
            <>
              <h4>{brand.title}</h4>
              <p>{brand.quote}</p>
              {extra.map((line, index) => (
                <p key={index} className="footer-brand-extra">{line}</p>
              ))}
            </>
          )}
          {showContact && contacts.length > 0 && (
            <ul className="footer-contact">
              {contacts.map((item, index) => {
                const value = String(item.title || "").trim();
                if (!value) return null;
                const href = contactHref(item);
                return (
                  <li key={itemKey(item, index)}>
                    {item.icon && <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>}
                    {href ? <a href={href}>{value}</a> : <span>{value}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {socials.length > 0 && (
            <div className="footer-social">
              {socials.map((item, index) => (
                <a
                  key={itemKey(item, index)}
                  href={item.link_url.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.title || item.icon || "link"}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{socialIconName(item.icon)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        {(showLinks || (showContact && legacyContact)) &&
          (flatLinks || !showLinks || groups.length === 0 ? (
            <nav>
              {showContact && legacyContact && <a href={`mailto:${DEFAULT_CONTACT_EMAIL}`}>{t("layout.footer.contact")}</a>}
              {showLinks && groups[0] && groups[0].links.map((item, index) => <FooterLink key={itemKey(item, index)} item={item} />)}
            </nav>
          ) : (
            <div className="footer-columns">
              {groups.map((group) => (
                <nav key={group.heading || "_"} className="footer-column">
                  {group.heading && <h5>{group.heading}</h5>}
                  {group.links.map((item, index) => <FooterLink key={itemKey(item, index)} item={item} />)}
                </nav>
              ))}
            </div>
          ))}
      </div>
    </footer>
  );
}
