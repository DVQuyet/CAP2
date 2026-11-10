import { Fragment } from "react";
import HeroBanner from "./HeroBanner";
import AboutSection from "./AboutSection";
import LandingFeatureSection from "./LandingFeatureSection";
import StatsSection from "./StatsSection";
import useLandingContent from "../landing/useLandingContent";
import { HOME_KEYS, orderSections, isSectionVisible } from "../landing/landingContent";

const BLOCKS = {
  hero: () => <HeroBanner />,
  about: () => <section id="ve-chung-toi"><AboutSection /></section>,
  features: () => <LandingFeatureSection />,
  stats: () => <section id="huong-dan"><StatsSection /></section>,
};

// Thứ tự và việc ẩn/hiện từng khối lấy từ nội dung admin quản lý; chưa có dữ liệu thì giữ đúng bố cục cũ.
export default function Home() {
  const { content } = useLandingContent();
  const keys = orderSections(content, HOME_KEYS).filter((key) => isSectionVisible(content, key));

  return (
    <>
      {keys.map((key) => (
        <Fragment key={key}>{BLOCKS[key]()}</Fragment>
      ))}
    </>
  );
}
