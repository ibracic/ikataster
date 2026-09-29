import { useEffect, useRef, useState } from "react";
import { Combobox, Loader, ScrollArea, Text, TextInput, useCombobox } from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import type { Address, GursClient } from "../../gurs";
import { useI18n } from "../../i18n";

interface Props {
  client: GursClient;
  onSelect: (a: Address) => void;
  debounceMs?: number;
}

/** Debounced GURS address autocomplete. */
export function AddressSearch({ client, onSelect, debounceMs = 300 }: Props) {
  const { t } = useI18n();
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const [value, setValue] = useState("");
  const [items, setItems] = useState<Address[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) { setItems([]); setSearched(false); return; }
    const timer = setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true);
      setFailed(false);
      try {
        const res = await client.searchAddresses(q, 8, c.signal);
        if (!c.signal.aborted) { setItems(res); setSearched(true); combobox.openDropdown(); }
      } catch (e) {
        if (!c.signal.aborted && (e as Error)?.name !== "AbortError") { setFailed(true); setItems([]); setSearched(true); }
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, client, debounceMs]);

  const choose = (id: string) => {
    const a = items.find((x) => x.id === id);
    if (!a) return;
    setValue(`${a.label}, ${a.place}`);
    combobox.closeDropdown();
    onSelect(a);
  };

  return (
    <Combobox store={combobox} onOptionSubmit={choose} withinPortal>
      <Combobox.Target>
        <TextInput
          aria-label={t("addressLabel")}
          placeholder={t("addressPlaceholder")}
          value={value}
          onChange={(e) => { setValue(e.currentTarget.value); combobox.openDropdown(); combobox.updateSelectedOptionIndex(); }}
          onFocus={() => items.length && combobox.openDropdown()}
          // No close-on-blur: on iOS touching/scrolling the list blurs the input (keyboard hides).
          // Mantine closes on outside click, Escape and option select.
          leftSection={<IconMapPin size={16} />}
          rightSection={loading ? <Loader size={14} /> : null}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={value.trim().length < 3 && !items.length}>
        <Combobox.Options>
          <ScrollArea.Autosize
            data-testid="address-options" type="auto" scrollbars="y"
            // bounded to the visible viewport (keyboard-aware on iOS via dvh) and never chains scroll to the page
            style={{ maxHeight: "min(45dvh, 360px)", overscrollBehavior: "contain" }}
            mah="min(45dvh, 360px)"
          >
          {value.trim().length < 3 ? <Combobox.Empty>{t("addressMinChars")}</Combobox.Empty>
            : items.length ? items.map((a) => (
              <Combobox.Option value={a.id} key={a.id}>
                <Text size="sm">{a.label}</Text>
                <Text size="xs" c="dimmed">{a.place}</Text>
              </Combobox.Option>
            ))
            : searched ? <Combobox.Empty>{failed ? t("errService") : t("addressNoResults")}</Combobox.Empty>
            : <Combobox.Empty>…</Combobox.Empty>}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
