import { useMemo, useState } from "react";
import { ActionIcon, Group, Loader, Select, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { searchKos, type Ko } from "../../gurs";
import { useI18n } from "../../i18n";

interface Props {
  kos: Ko[];
  loading?: boolean;
  initialKo?: number;
  initialParcel?: string;
  onSearch: (koId: number, parcel: string) => void;
  /** Reuse for building-number search. */
  kind?: "parcel" | "building";
}

export function ParcelSearch({ kos, loading, initialKo, initialParcel, onSearch, kind = "parcel" }: Props) {
  const { t } = useI18n();
  const [ko, setKo] = useState<string | null>(initialKo ? String(initialKo) : null);
  const [query, setQuery] = useState("");
  const [parcel, setParcel] = useState(initialParcel ?? "");

  const data = useMemo(() => {
    const hits = query ? searchKos(kos, query, 30) : [];
    const sel = kos.find((k) => String(k.id) === ko);
    const list = sel && !hits.includes(sel) ? [sel, ...hits] : hits;
    return list.map((k) => ({ value: String(k.id), label: `${k.id} ${k.name}` }));
  }, [kos, query, ko]);

  const submit = () => {
    if (ko && parcel.trim()) onSearch(Number(ko), parcel.trim());
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="nowrap">
        <Select
          aria-label={t("koLabel")}
          placeholder={kos.length ? t("koPlaceholder") : t("loadingKos")}
          searchable
          clearable
          data={data}
          value={ko}
          onChange={setKo}
          searchValue={query}
          onSearchChange={setQuery}
          filter={({ options }) => options}
          nothingFoundMessage={query ? "—" : undefined}
          rightSection={!kos.length ? <Loader size={14} /> : undefined}
          style={{ flex: 3, minWidth: 0 }}
          comboboxProps={{ withinPortal: true }}
        />
        <TextInput
          aria-label={t(kind === "building" ? "buildingLabel" : "parcelLabel")}
          placeholder={t(kind === "building" ? "buildingPlaceholder" : "parcelPlaceholder")}
          value={parcel}
          onChange={(e) => setParcel(e.currentTarget.value)}
          inputMode={kind === "building" ? "numeric" : "text"}
          style={{ flex: 2, minWidth: 0 }}
        />
        <ActionIcon type="submit" size="lg" aria-label={t("search")} loading={loading} disabled={!ko || !parcel.trim()}>
          <IconSearch size={18} />
        </ActionIcon>
      </Group>
    </form>
  );
}
