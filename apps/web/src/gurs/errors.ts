export type GursErrorKind = "network" | "http" | "service" | "timeout" | "invalid-input" | "parse";

export class GursError extends Error {
  constructor(public kind: GursErrorKind, message: string, public status?: number) {
    super(message);
    this.name = "GursError";
  }
}
