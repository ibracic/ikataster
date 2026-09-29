import { Badge, Group, Stack, Text } from "@mantine/core";
import { useI18n, type MsgKey } from "../i18n";
import type { EzkExtract, Holder, Right } from "./types";

const CAT: Record<Right["category"], { key: MsgKey; color: string }> = {
  mortgage: { key: "catMortgage", color: "red" },
  easement: { key: "catEasement", color: "blue" },
  note: { key: "catNote", color: "gray" },
  other: { key: "catOther", color: "gray" },
};

/** "2040-12-31" / "2021-01-01T10:00:00" -> "31. 12. 2040" */
export const fmtDay = (iso?: string) => {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : iso ?? "";
};

export function holderLabel(h: Holder, ownerOf: string) {
  if (h.kind === "ownerOf") return `${ownerOf}: ${h.name}`;
  if (h.kind === "company" && h.companyId) return `${h.name} (${h.companyId})`;
  return h.name;
}

function RightItem({ r, nested = false }: { r: Right; nested?: boolean }) {
  const { t } = useI18n();
  const c = CAT[r.category];
  const ch = r.charge;
  const facts = [
    r.since && `${t("entered")} ${fmtDay(r.since)}`,
    ch?.maturityDate ? `${t("maturity")} ${fmtDay(ch.maturityDate)}` : ch?.maturityType && `${t("maturity")} ${ch.maturityType.replace(/^\d+ - /, "")}`,
    ch?.interest && ch.interest !== "glej dodatni opis" && `${t("interest")} ${ch.interest}`,
    r.mainProperty && `${t("mainProperty")} ${r.mainProperty}`,
  ].filter(Boolean).join(" · ");
  return (
    <Stack gap={2} data-testid={`right-${r.id}`} pl={nested ? "md" : 0}
      style={nested ? { borderLeft: "2px solid var(--mantine-color-default-border)" } : undefined}>
      <Group gap={6} wrap="wrap">
        {!nested && <Badge size="sm" color={c.color} variant="light">{t(r.category === "mortgage" && /zemljišk\w* dolg/i.test(r.type) ? "catLandCharge" : c.key)}</Badge>}
        <Text size="sm" fw={600}>{nested ? r.type : r.type.replace(/^\d+ - /, "")}</Text>
        {ch?.amountText && <Text size="sm" fw={700} c="red">{ch.amountText}</Text>}
      </Group>
      {r.holders.length > 0 && (
        <Text size="sm">{r.holders.map((h) => holderLabel(h, t("ownerOf"))).join("; ")}</Text>
      )}
      {facts && <Text size="xs" c="dimmed">{facts}</Text>}
      {r.description && <Text size="xs" style={{ whiteSpace: "pre-wrap" }} lineClamp={nested ? 2 : 3}>{r.description}</Text>}
      {r.secondary.map((s) => <RightItem key={s.id} r={s} nested />)}
    </Stack>
  );
}

/** Charges/easements (in order of entry) plus rights in favour of the property. */
export function RightsList({ extract }: { extract: EzkExtract }) {
  const { t } = useI18n();
  const rights = extract.rights ?? [];
  const benefits = extract.benefits ?? [];
  if (!rights.length && !benefits.length) return null;
  return (
    <Stack gap="xs" data-testid="rights">
      {rights.length > 0 && <Text size="xs" fw={700} tt="uppercase" c="dimmed">{t("rightsTitle")}</Text>}
      {rights.map((r) => <RightItem key={r.id} r={r} />)}
      {benefits.length > 0 && (
        <>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mt={4}>{t("benefitsTitle")}</Text>
          {benefits.map((b) => (
            <Text size="sm" key={b.id}>{b.type.replace(/^\d+ - /, "")} · {b.on}{b.share && b.share !== "0/0" ? ` (${b.share})` : ""}</Text>
          ))}
        </>
      )}
    </Stack>
  );
}
