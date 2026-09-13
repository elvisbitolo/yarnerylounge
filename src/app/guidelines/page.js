import LandingNav from "@/components/LandingNav";
import styles from "./guidelines.module.css";

export const metadata = {
  title: "Community Guidelines",
  description:
    "Secret Yarnery's community guidelines — how we keep this a respectful, focused space for every member.",
};

const SECTIONS = [
  {
    heading: "Respect every member",
    body: "Treat people the way you want to be treated. No harassment, hate speech, bullying or discrimination based on race, gender, religion, sexual orientation or any other identity.",
  },
  {
    heading: "Keep it professional",
    body: "This is a paid, focused community. Keep discussions on-topic, constructive and free of spam, self-promotion or unsolicited DMs.",
  },
  {
    heading: "Protect privacy",
    body: "Do not share other members' personal information. Be respectful of others' privacy in live lounges.",
  },
  {
    heading: "No harmful content",
    body: "Don't post illegal content, malware, explicit material, or anything that could endanger someone. If you see it, report it.",
  },
  {
    heading: "Respect the space you share",
    body: "Follow lounge etiquette in live video: mute when you're not speaking, be mindful of background noise, and let others have the floor.",
  },
  {
    heading: "Contribute generously",
    body: "Share what you know, ask honest questions, and support other members. The community is strongest when everyone gives a little.",
  },
];

export default function GuidelinesPage() {
  return (
    <main className={styles.page}>
      <LandingNav />
      <div className={styles.container}>
        <h1 className={styles.title}>Community Guidelines</h1>
        <p className={styles.lead}>
          These guidelines keep Secret Yarnery a respectful, valuable space for every member. By
          joining, you agree to follow them.
        </p>

        <div className={styles.sections}>
          {SECTIONS.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.heading}>{section.heading}</h2>
              <p className={styles.body}>{section.body}</p>
            </section>
          ))}
        </div>

        <section className={styles.enforcement}>
          <h2 className={styles.heading}>How we enforce them</h2>
          <p className={styles.body}>
            Moderators review reported content. Depending on severity, we may warn, remove content,
            or suspend a member. The community owner makes the final call on serious or repeated
            violations. Reporting is confidential.
          </p>
        </section>
      </div>
    </main>
  );
}
