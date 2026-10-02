import { Anchor, Group, Table, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { AddToCartButton } from "../../cart/AddToCartButton";
import type { CartInput } from "../../cart/store";
import { gursPublicViewUrl, valuationUrl, type BuildingPart } from "../../gurs";
import { useI18n, type MsgKey } from "../../i18n";
import { partTx, type KoTxState } from "../../transactions";
import { TxList } from "../../transactions/TxList";
import { PropertyResults } from "../../ezk/PropertyResults";
import type { KoValuesState } from "../../values";
import { partValue } from "../../values";
import { ValueCell } from "../../values/ValueCell";

interface Props {
  part: BuildingPart;
  building: number;
  values: KoValuesState;
  tx: KoTxState;
  cartItem: CartInput;
  /** The owner/burden summary is already shown in the row; show the full card anyway? */
  hideResults?: boolean;
}

/** Expanded details of one building part: cadastre attributes, GURS value, sales/rentals, actions. */
export function PartDetails({ part: p, building, values, tx, cartItem, hideResults }: Props) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", { maximumFractionDigits: 1 });
  const yn = (v: boolean | null | undefined) => (v == null ? null : t(v ? "yes" : "no"));
  const m2 = (v: number | null | undefined) => (v ? `${nf.format(v)} m²` : null);
  const rows: [MsgKey, React.ReactNode][] = [
    ["value", <ValueCell key="v" state={values} value={partValue(values.status === "ready" ? values.values : null, building, p.number)} href={p.id ? valuationUrl("part", p.id) : undefined} label={t("value")} />],
    ["partUse", p.use],
    ["address", p.address],
    ["partFlat", p.flat],
    ["partUsableArea", m2(p.usableArea)],
    ["partNetArea", m2(p.area)],
    ["partAreaMethod", p.areaMethod && p.areaMethod !== "Neznano" ? p.areaMethod : null],
    ["partFloor", p.floor],
    ["partEntranceFloor", p.entranceFloor],
    ["partElevator", yn(p.elevator)],
    ["partCondominium", yn(p.condominium)],
    ["partCommon", yn(p.commonPart)],
    ["partInstallations", p.installationsYear],
    ["partWindows", p.windowsYear],
    ["partManager", p.manager?.name],
    ["partStatus", p.status],
  ];
  return (
    <div data-testid="part-details" style={{ padding: "4px 2px 10px" }}>
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Th w="46%" style={{ fontWeight: 500, color: "var(--mantine-color-dimmed)" }}>{t(k)}</Table.Th>
              <Table.Td>{v}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <PropertyResults kind="part" ko={cartItem.koId} n={building} part={p.number} defaultOpen={!hideResults} />
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mt="sm" mb={4}>{t("txTitle")}</Text>
      <TxList state={tx} items={partTx(tx.status === "ready" ? tx.tx : null, building, p.number)} limit={3} />
      <Group justify="space-between" mt="xs" gap={6}>
        <Anchor href={gursPublicViewUrl(p.eid)} target="_blank" rel="noopener" size="sm" display="inline-flex" style={{ alignItems: "center", gap: 4 }}>
          {t("openGurs")} <IconExternalLink size={14} />
        </Anchor>
        <AddToCartButton item={cartItem} />
      </Group>
    </div>
  );
}
