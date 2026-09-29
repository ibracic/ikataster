import { Anchor, Skeleton, Text } from "@mantine/core";
import { useI18n } from "../i18n";
import { formatEur, type KoValuesState } from ".";

/** Value with an optional link to the GURS viewer; handles loading/missing/error. */
export function ValueCell({ state, value, href, size = "sm", label }: { state: KoValuesState; value: number | undefined; href?: string; size?: "xs" | "sm"; label?: string }) {
  const { t, lang } = useI18n();
  if (state.status === "loading") return <Skeleton h={12} w={60} display="inline-block" />;
  if (state.status === "error") return <Text span size="xs" c="dimmed">{t("valueError")}</Text>;
  if (value == null) return <Text span size="xs" c="dimmed">{size === "xs" ? "—" : t("valueNone")}</Text>;
  const text = formatEur(value, lang);
  return href
    ? <Anchor href={href} target="_blank" rel="noopener" size={size} aria-label={label ? `${label}: ${text}` : undefined} style={{ whiteSpace: "nowrap" }}>{text}</Anchor>
    : <Text span size={size} style={{ whiteSpace: "nowrap" }}>{text}</Text>;
}

export function ValueSource({ state }: { state: KoValuesState }) {
  const { t } = useI18n();
  if (state.status !== "ready" || !state.values) return null;
  const [y, m, d] = state.values.date.split("-");
  return <Text size="xs" c="dimmed" mt={4}>{t("valueSource").replace("{date}", `${+d}. ${+m}. ${y}`)}</Text>;
}
