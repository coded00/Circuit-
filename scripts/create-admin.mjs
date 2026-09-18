// Circuit — create or update a Super Admin account
// Run with: node scripts/create-admin.mjs [emailOrPhone] [password] [handle]

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const emailOrPhone = process.argv[2] || "admin@circuit.gg";
const plainPassword = process.argv[3] || "CircuitAdmin2026!";
const handle = process.argv[4] || "admin";

async function main() {
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

  console.log(`\nSuper Admin account ready:`);
  console.log(`  Handle:       ${user.handle}`);
  console.log(`  Email/Phone:  ${user.emailOrPhone}`);
  console.log(`  Password:     ${plainPassword}`);
  console.log(`  Role:         ${user.adminRole}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
