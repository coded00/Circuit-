import { describe, expect, it } from "vitest";
import { noWinnerNotice } from "@/lib/challengeDisclosure";

describe("noWinnerNotice", () => {
  it("says nothing for a free challenge", () => {
    expect(noWinnerNotice({ policy: "HOUSE_KEEPS", hasMandatoryTarget: true, entryFee: 0 })).toBeNull();
  });

  it("warns that the house keeps the money when there is a mandatory target and the policy is to keep it", () => {
    expect(noWinnerNotice({ policy: "HOUSE_KEEPS", hasMandatoryTarget: true, entryFee: 100_000 })).toMatch(/not returned/);
  });

  it("says nothing when the best score simply wins and there is no mandatory target", () => {
    expect(noWinnerNotice({ policy: "HOUSE_KEEPS", hasMandatoryTarget: false, entryFee: 100_000 })).toBeNull();
  });

  it("promises the refund when that is the policy", () => {
    expect(noWinnerNotice({ policy: "REFUND_ENTRIES", hasMandatoryTarget: true, entryFee: 100_000 })).toMatch(/refunded/);
    expect(noWinnerNotice({ policy: "REFUND_ENTRIES", hasMandatoryTarget: false, entryFee: 100_000 })).toMatch(/refunded/);
  });
});
