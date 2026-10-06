/**
 * Circuit — may search engines index a player's profile? Only when the player opted in, is an adult, isn't suspended
 * or awaiting deletion, and has actually played (an empty profile is thin content). A profile that doesn't qualify is
 * still reachable by link for people; it just carries noindex and stays out of the sitemap.
 */
const ADULT_AGE = 18;

export function ageOn(dateOfBirth: Date, on: Date): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday = on.getUTCMonth() < dateOfBirth.getUTCMonth() || (on.getUTCMonth() === dateOfBirth.getUTCMonth() && on.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isProfileIndexable(
  user: { searchEngineIndexable: boolean; dateOfBirth: Date | null; isSuspended: boolean; deletionRequestedAt?: Date | null },
  hasPlayed: boolean,
  now: Date = new Date(),
): boolean {
  if (!user.searchEngineIndexable || user.isSuspended || user.deletionRequestedAt || !hasPlayed) return false;
  // No date of birth on record means age is unknown, and unknown is treated as not an adult.
  if (!user.dateOfBirth) return false;
  return ageOn(user.dateOfBirth, now) >= ADULT_AGE;
}
