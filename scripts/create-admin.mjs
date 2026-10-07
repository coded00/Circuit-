// Circuit — create or update a Super Admin account
//
// Run with: node scripts/create-admin.mjs <emailOrPhone> <password> [handle] [--force]
//
// The password has no default, deliberately. This script mints the highest-privilege credential in a
// system that moves money and holds every player's PII, so a password written here would be a
// published credential for every deployment — and a default becomes that published password on any
// install where the operator runs the script the way its own usage line reads, no arguments and all.
// Pass it explicitly, or generate one and keep it in a password manager.
//
// A default identifier is just as bad in a quieter way: it makes the account's existence guessable, so
// the only thing left to guess is the password. Both are required now.
//
// --force is required to modify an account that already exists, because that resets its password.

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// The same floor the signup, change-password and reset-password routes enforce
// (src/lib/passwordRules.ts). Duplicated by hand rather than imported: this is a plain .mjs script run
// by bare `node`, with no `@/` alias and no TypeScript loader.
const MIN_PASSWORD_LENGTH = 8;

// What this script used to default to. Any deployment created with it is holding a credential that
// anyone who has seen this repository knows, so it is refused rather than merely discouraged.
const RETIRED_DEFAULT_PASSWORD = "CircuitAdmin2026!";

const USAGE = "Usage: node scripts/create-admin.mjs <emailOrPhone> <password> [handle] [--force]";

const args = process.argv.slice(2);
const force = args.includes("--force");
const [emailOrPhone, plainPassword, handle = "admin"] = args.filter((arg) => arg !== "--force");

function fail(message) {
  console.error(`\n${message}\n\n${USAGE}\n`);
  process.exit(1);
}

if (!emailOrPhone || !plainPassword) {
  fail("An email/phone and a password are both required.");
}
if (plainPassword.length < MIN_PASSWORD_LENGTH) {
  fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
}
if (plainPassword === RETIRED_DEFAULT_PASSWORD) {
  fail(
    "That is the password this script used to default to. It is in this repository's history, so it is a known credential — choose another."
  );
}

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { handle } });

  // Refusing by default matters more than it looks. The upsert below overwrites passwordHash, so
  // re-running this against a live deployment would lock the real admin out and replace their password
  // with one that was just typed into someone's terminal. --force is how an operator says that is what
  // they meant.
  if (existing && !force) {
    fail(
      `A user with handle "${handle}" already exists. Re-run with --force to update it — that resets its password.`
    );
  }

  // Worth knowing before overwriting: with --force this is about to change, but an operator who sees
  // this should treat the account as compromised rather than merely stale, and check whether anything
  // was done with it.
  if (existing && (await bcrypt.compare(RETIRED_DEFAULT_PASSWORD, existing.passwordHash))) {
    console.warn(
      `\nWARNING: "${handle}" is currently using the retired default password from this repository's history.` +
        "\nTreat that account as compromised — rotate it, and review what it did.\n"
    );
  }

  const passwordHash = await bcrypt.hash(plainPassword, 12);
  const user = await prisma.user.upsert({
    where: { handle },
    update: {
      isStaff: true,
      adminRole: "SUPER_ADMIN",
      emailOrPhone,
      email: emailOrPhone.includes("@") ? emailOrPhone : undefined,
      passwordHash,
    },
    create: {
      handle,
      displayName: "Circuit Admin",
      emailOrPhone,
      email: emailOrPhone.includes("@") ? emailOrPhone : undefined,
      passwordHash,
      isStaff: true,
      adminRole: "SUPER_ADMIN",
    },
  });

  // The password is deliberately not echoed. It was just typed on this terminal; printing it copies it
  // into scrollback, shell history and any log that captures the run.
  console.log(`\nSuper Admin account ${existing ? "updated" : "created"}:`);
  console.log(`  Handle:       ${user.handle}`);
  console.log(`  Email/Phone:  ${user.emailOrPhone}`);
  console.log(`  Role:         ${user.adminRole}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
