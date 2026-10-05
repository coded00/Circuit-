-- The money ledgers are append-only for what a row says happened: its amount, kind and who or what it
-- belongs to can never be edited after it is written. Only the row's progress (status, provider reference,
-- timestamps) may change. A correction is a new row (a REFUND, a reversal), never an edit.

CREATE OR REPLACE FUNCTION circuit_escrow_ledger_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     -- A link to a tournament, registration, battle or challenge may be filled in later (a stake is linked to the
     -- battle it ends up in) or cleared when that record is deleted (the foreign key's SET NULL), but a row that
     -- already points somewhere can never be re-pointed at a different record.
     OR (OLD."tournamentId" IS NOT NULL AND NEW."tournamentId" IS NOT NULL AND NEW."tournamentId" <> OLD."tournamentId")
     OR (OLD."registrationId" IS NOT NULL AND NEW."registrationId" IS NOT NULL AND NEW."registrationId" <> OLD."registrationId")
     OR (OLD."battleId" IS NOT NULL AND NEW."battleId" IS NOT NULL AND NEW."battleId" <> OLD."battleId")
     OR (OLD."quickMatchChallengeId" IS NOT NULL AND NEW."quickMatchChallengeId" IS NOT NULL AND NEW."quickMatchChallengeId" <> OLD."quickMatchChallengeId") THEN
    RAISE EXCEPTION 'EscrowTransaction % is append-only: its amount, type and owner cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EscrowTransaction_append_only"
  BEFORE UPDATE ON "EscrowTransaction"
  FOR EACH ROW EXECUTE FUNCTION circuit_escrow_ledger_guard();

CREATE OR REPLACE FUNCTION circuit_wallet_ledger_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'WalletTransaction % is append-only: its amount, type and owner cannot be changed', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletTransaction_append_only"
  BEFORE UPDATE ON "WalletTransaction"
  FOR EACH ROW EXECUTE FUNCTION circuit_wallet_ledger_guard();
