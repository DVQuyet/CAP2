import HeroBanner from "./HeroBanner";
import AboutSection from "./AboutSection";
import LandingFeatureSection from "./LandingFeatureSection";
import StatsSection from "./StatsSection";

export default function Home() {
  return (
    <>
      <HeroBanner />
      <section id="ve-chung-toi"><AboutSection /></section>
      <LandingFeatureSection />
      <section id="huong-dan"><StatsSection /></section>
    </>
  );
}
