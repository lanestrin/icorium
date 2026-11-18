import { CUSTOMER_SECURITY } from './content';
import { Section } from './Section';
import { Card } from '../ui/Card';
import styles from './architecture.module.scss';

/** Section 7 describes future customer boundaries, not current demo guarantees. */
export function CustomersSecuritySection() {
  return (
    <Section id="customers" eyebrow="7 · Recommended, not built" title="Customers and security" intro={CUSTOMER_SECURITY.today}>
      <p className={styles.storageHeading}>{CUSTOMER_SECURITY.status}</p>
      <div className={styles.securityGrid}>
        {CUSTOMER_SECURITY.topics.map((topic) => (
          <Card as="article" key={topic.title}>
            <h3 className={styles.itemTitle}>{topic.title}</h3>
            <p className={styles.decisionSummary}>{topic.text}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
