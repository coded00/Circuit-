import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — Circuit" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="2 October 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, username, country, date of birth, and a phone number if you add one.</li>
        <li>Profile details you choose to add: photo, bio, games, city.</li>
        <li>Competition activity: tournament entries, match results, proof you upload, chat messages and reports.</li>
        <li>Payment activity: wallet transactions and a linked bank recipient. Card and bank details are handled by our payment provider, not stored by Circuit.</li>
      </ul>
      <h2>What other players see</h2>
      <ul>
        <li>Your username, name, photo, country, games and competitive record are public. Your email, phone and date of birth are not.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run tournaments, verify results, resolve disputes and pay prizes.</li>
        <li>To send account and tournament emails and notifications. You can turn off announcement emails in settings.</li>
        <li>To keep the platform safe: moderation, fraud checks and abuse prevention.</li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li>You can edit your profile and notification settings at any time.</li>
        <li>To have your account deleted, contact Circuit support.</li>
      </ul>
    </LegalPage>
  );
}
