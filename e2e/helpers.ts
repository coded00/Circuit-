/**
 * Circuit — shared Playwright fixtures. Mirrors src/testHelpers.ts's own
 * "TEST-"-prefix + direct-Prisma-write discipline: only the actual flow
 * under test (login, the registration form, the result form) goes
 * through a real browser — everything else (users, tournaments,
 * Battles, matches) is scaffolded directly, same as the Vitest suite.
 */
import type { Page } from "@playwright/test";
import { hashPassword } from "@/lib/auth";
import { createTestUser } from "@/testHelpers";
import type { Prisma } from "@prisma/client";

export const E2E_PASSWORD = "Test1234!";

/** A TEST- user with a real password hash and a valid (18+) date of birth
 *  — both required for the cash-touching flows these tests exercise. */
export async function createE2EUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const passwordHash = await hashPassword(E2E_PASSWORD);
  return createTestUser({
    passwordHash,
    dateOfBirth: new Date("2000-01-01"),
    ...overrides,
  });
}

export async function loginViaUI(page: Page, emailOrPhone: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.locator("#emailOrPhone").fill(emailOrPhone);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}
