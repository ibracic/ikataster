import { SETTINGS } from "../../data/inventory";
import { useEffect, useRef, useState } from "react";
import { Combobox, Group, Loader, ScrollArea, Text, TextInput, useCombobox } from "@mantine/core";
import { IconBuildingCommunity, IconDatabase } from "@tabler/icons-react";
import type { GursClient, Manager } from "../../gurs";
import { useI18n } from "../../i18n";
import { cacheStore } from "../../cache/instance";
import { knownManagers, matchManagers } from "../../cache/withCache";
import type { CacheStore } from "../../cache/store";

export const LAST_KEY = SETTINGS.lastManager;

interface Props { client: GursClient; onSelect: (m: Manager) => void; debounceMs?: number; store?: CacheStore }

/**
 * Building-manager (upravnik) search. Managers already saved in this browser are suggested instantly
 * (also with an empty box); GURS is still searched for any text of 3+ letters (~15-30 s the first time).
 */
export function ManagerSearch({ client, onSelect, debounceMs = 700, store = cacheStore }: Props) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB");
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  /** Last picked manager name, shown again after reload (its answers are cached locally). */
  const [value, setValue] = useState(() => { try { return localStorage.getItem(LAST_KEY) ?? ""; } catch { return ""; } });
  const [known, setKnown] = useState<Manager[]>([]);
  const [items, setItems] = useState<Manager[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const ctl = useRef<AbortController | null>(null);
  /** Name written into the input on pick; must not trigger another (slow) search. */
  const picked = useRef<string | null>(value || null);

  const reloadKnown = () => { void knownManagers(store).then(setKnown).catch(() => undefined); };
  useEffect(reloadKnown, [store]);

  useEffect(() => {
    const q = value.trim();
    if (picked.current !== null && value === picked.current) return;
    picked.current = null;
    if (q.length < 3) { ctl.current?.abort(); setItems([]); setState("idle"); setLoading(false); return; }
    const timer = setTimeout(async () => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true); setState("idle"); combobox.openDropdown();
      try {
        const r = await client.searchManagers(q, c.signal);
        if (!c.signal.aborted) { setItems(r.managers); setTruncated(r.truncated); setState("done"); combobox.openDropdown(); }
      } catch (e) {
        if (!c.signal.aborted && (e as Error)?.name !== "AbortError") { setItems([]); setState("failed"); }
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, client, debounceMs]);
  useEffect(() => () => ctl.current?.abort(), []);

  // A picked name in the box shows all saved managers; typing filters them.
  const query = picked.current !== null && value === picked.current ? "" : value;
  const local = matchManagers(known, query).slice(0, 50);
  const localIds = new Set(local.map((m) => m.id));
  const remote = items.filter((m) => !localIds.has(m.id));
  const byId = new Map([...known, ...items].map((m) => [String(m.id), m]));

  const choose = (id: string) => {
    const m = byId.get(id);
    if (!m) return;
    picked.current = m.name;
    setValue(m.name);
    try { localStorage.setItem(LAST_KEY, m.name); } catch { /* private mode */ }
    combobox.closeDropdown();
    onSelect(m);
  };

  const option = (m: Manager, saved: boolean) => (
    <Combobox.Option value={String(m.id)} key={m.id}>
      <Group gap={6} wrap="nowrap">
        {saved && <IconDatabase size={12} style={{ flexShrink: 0, opacity: 0.5 }} aria-label={t("savedLocally")} />}
        <Text size="sm" fw={600}>{m.name}</Text>
      </Group>
      <Text size="xs" c="dimmed">{[m.address, m.parts != null ? `${nf.format(m.parts)} ${t("managerParts")}` : null].filter(Boolean).join(" · ")}</Text>
    </Combobox.Option>
  );
  const short = value.trim().length < 3 && !(picked.current !== null && value === picked.current);

  return (
    <Combobox store={combobox} onOptionSubmit={choose} withinPortal>
      <Combobox.Target>
        <TextInput
          aria-label={t("managerLabel")} placeholder={t("managerPlaceholder")} value={value}
          onChange={(e) => { setValue(e.currentTarget.value); combobox.openDropdown(); }}
          onFocus={() => { reloadKnown(); combobox.openDropdown(); }}
          onClick={() => combobox.openDropdown()}
          leftSection={<IconBuildingCommunity size={16} />} rightSection={loading ? <Loader size={14} /> : null}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={!local.length && !remote.length && short}>
        <Combobox.Options>
          <ScrollArea.Autosize data-testid="manager-options" type="auto" scrollbars="y" mah="min(45dvh, 360px)" style={{ overscrollBehavior: "contain" }}>
            {local.length > 0 && (
              <Combobox.Group label={t("managerSaved")} data-testid="manager-saved-group">{local.map((m) => option(m, true))}</Combobox.Group>
            )}
            {!short && (
              <Combobox.Group label={t("managerFromGurs")}>
                {loading ? <Combobox.Empty>{t("managerSearching")}</Combobox.Empty>
                  : remote.length ? <>{remote.map((m) => option(m, false))}{truncated && <Combobox.Empty>{t("managerTruncated")}</Combobox.Empty>}</>
                  : state === "failed" ? <Combobox.Empty>{t("errService")}</Combobox.Empty>
                  : state === "done" ? <Combobox.Empty>{items.length ? t("managerAllSaved") : t("managerNoResults")}</Combobox.Empty>
                  : <Combobox.Empty>…</Combobox.Empty>}
              </Combobox.Group>
            )}
            {short && !local.length && <Combobox.Empty>{t("addressMinChars")}</Combobox.Empty>}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
