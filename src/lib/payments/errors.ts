/**
 * Circuit — telling "the provider said no" apart from "we don't know what happened".
 *
 * A transfer call that comes back with a 4xx (bad recipient, insufficient balance) was refused: nothing
 * was sent, so the money can safely go back at once. A call that times out, drops, or gets a 5xx may
 * still have been accepted, so the row stays PENDING and reconcilePendingMoney() asks the provider
 * about that reference later. Marking it failed on a timeout and letting the user try again could
 * pay out twice.
 */
export class ProviderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

/** True only when the provider answered and refused the request. Anything else is treated as unknown. */
export function isDefiniteRejection(err: unknown): boolean {
  return err instanceof ProviderRequestError && err.status >= 400 && err.status < 500;
}
