import { GursError } from "../../gurs";
import type { MsgKey } from "../../i18n";

/** Map any GURS failure to a friendly, translatable message key. */
export function errorMessageKey(e: unknown): MsgKey {
  if (e instanceof GursError) {
    switch (e.kind) {
      case "invalid-input": return "invalidInput";
      case "timeout": return "errTimeout";
      case "network": return "errNetwork";
      default: return "errService";
    }
  }
  return "errService";
}
