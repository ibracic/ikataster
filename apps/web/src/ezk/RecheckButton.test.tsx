import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { createBridgeClient, mockTransport } from "@ikataster/bridge";
import { I18nProvider } from "../i18n";
import { ResultsContext } from "./useResults";
import { createResultsStore } from "./results";
import { createQuota } from "./quota";
import type { EzkExtract } from "./types";
import { QueueContext } from "../queue/instance";
import { createQueueStore } from "../queue/store";
import { createRunner, type DownloadRequest } from "../queue/runner";
import { ResultsModal } from "./ResultsModal";

const extract = (number: string, owner: string, createdAt: string): EzkExtract => ({
  kind: "current", createdAt, pending: false, rights: [], benefits: [],
  owners: [{ positionId: 1, right: "101 - vknjižena lastninska pravica", share: "1/1", holder: { kind: "person", name: owner }, restrictions: [] }],
  property: { type: "parcel", koId: 999, koName: "VZORČNA VAS", number, label: `999 VZORČNA VAS ${number}` },
});

it("re-downloads all listed extracts and shows what changed in the land register", async () => {
  localStorage.setItem("ikataster.lang", "sl");
  const tag = Date.now();
  const results = createResultsStore(`rc-r-${tag}`), store = createQueueStore(`rc-q-${tag}`);
  await results.put(extract("100/1", "JANEZ NOVAK", "2026-10-01T10:00:00"), "a.pdf");
  await results.put(extract("100/2", "ANA KOS", "2026-10-01T10:00:00"), "b.pdf");
  const mem = new Map<string, string>();
  const quota = createQuota({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
  const bridge = createBridgeClient(mockTransport({ download: async (p) => ({ pdfBase64: btoa(JSON.stringify(p)) }) }));
  // 100/1 was sold meanwhile; 100/2 is unchanged.
  const parse = async (b: Uint8Array) => {
    const r = JSON.parse(new TextDecoder().decode(b)) as DownloadRequest;
    return extract(r.number, r.number === "100/1" ? "CIRIL ZUPAN" : "ANA KOS", "2026-11-13T10:00:00");
  };
  const runner = createRunner({ queue: store, bridge, results, quota, parse, pacingMs: 0 });
  render(<MantineProvider><I18nProvider><ResultsContext.Provider value={results}>
    <QueueContext.Provider value={{ store, runner, quota }}><ResultsModal opened onClose={() => {}} /></QueueContext.Provider>
  </ResultsContext.Provider></I18nProvider></MantineProvider>);

  fireEvent.click(await screen.findByRole("button", { name: /Preveri spremembe \(2\)/ }));
  await waitFor(() => expect(screen.getByTestId("recheck-report")).toHaveTextContent("Preverjenih: 2 · s spremembami: 1"));
  const cards = screen.getAllByTestId("result-group");
  const sold = cards.find((c) => c.textContent?.includes("100/1"))!;
  const same = cards.find((c) => c.textContent?.includes("100/2"))!;
  expect(within(sold).getByTestId("changes-badge")).toHaveTextContent("spremembe: 2");
  expect(within(same).getByTestId("changes-badge")).toHaveTextContent("brez sprememb");
  fireEvent.click(within(sold).getByText("999 VZORČNA VAS 100/1"));
  const list = await within(sold).findByTestId("changes-list", {}, { timeout: 3000 });
  expect(list).toHaveTextContent("ni več lastnik");
  expect(list).toHaveTextContent("JANEZ NOVAK");
  expect(list).toHaveTextContent("nov lastnik");
  expect(list).toHaveTextContent("CIRIL ZUPAN");
  await waitFor(async () => expect((await results.list()).find((r) => r.key === "parcel:999:100/1")?.changes?.seen).toBe(true));
  expect(mem.size).toBeGreaterThan(0); // counted towards the daily eZK quota
});
