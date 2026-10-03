import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Use — Circuit" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="2 October 2026">
      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 to hold a Circuit account. Paid entry and prize payouts are for players 18 and over.</li>
        <li>Give accurate details and keep your password to yourself. You are responsible for what happens on your account.</li>
        <li>One person, one account.</li>
      </ul>
      <h2>Competing</h2>
      <ul>
        <li>Report results honestly and upload real proof when asked. Faking a result, or editing proof, can get your account suspended.</li>
        <li>Disputes are ruled by the organizer first and, if escalated, by Circuit staff. Staff rulings are final.</li>
        <li>Organizers set each tournament&apos;s rules, entry fee and prizes. Circuit is the platform, not a party to the games.</li>
      </ul>
      <h2>Money</h2>
      <ul>
        <li>Entry fees, wallet top-ups, refunds and prize payouts are processed through our payment provider.</li>
        <li>Refund conditions are shown on each tournament before you pay.</li>
        <li>Circuit charges a platform fee, shown in the tournament details.</li>
      </ul>
      <h2>Conduct</h2>
      <ul>
        <li>No harassment, threats, hate or sexual content, and no spam, in chats, communities or profiles.</li>
        <li>We may remove content and suspend accounts that break these rules. You can appeal a suspension.</li>
      </ul>
    </LegalPage>
  );
}
