import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { BridgeError, createBridgeClient, mockTransport } from "@ikataster/bridge";
import { I18nProvider } from "../i18n";
import { CartContext } from "../cart/useCart";
import { ResultsContext } from "../ezk/useResults";
import { createCartStore } from "../cart/store";
import { createResultsStore } from "../ezk/results";
import { createQuota } from "../ezk/quota";
import type { EzkExtract } from "../ezk/types";
import { QueueContext } from "./instance";
import { createQueueStore } from "./store";
import { createRunner, type DownloadRequest } from "./runner";
import { QueuePanel } from "./QueuePanel";

const parse = async (b: Uint8Array): Promise<EzkExtract> => {
  const r = JSON.parse(new TextDecoder().decode(b)) as DownloadRequest;
  return { kind: "current", createdAt: "2026-09-29T10:00:00", pending: false, owners: [], rights: [], benefits: [],
    property: { type: "parcel", koId: r.koId, koName: "X", number: r.number, label: r.number } };
};

it("one click downloads the whole cart with per-item states, retry failed, and offers resume after a reload", async () => {
  const tag = Date.now();
  const cart = createCartStore(`qp-c-${tag}`), results = createResultsStore(`qp-r-${tag}`), store = createQueueStore(`qp-q-${tag}`);
  await cart.add(["1", "999", "2"].map((n) => ({ kind: "parcel" as const, koId: 657, koName: "MARIBOR GRAD", number: n, eid: n, geometry: null })));
  const mem = new Map<string, string>();
  const quota = createQuota({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
  let fail999 = true;
  const bridge = createBridgeClient(mockTransport({ download: async (p) => {
    const r = p as DownloadRequest;
    if (r.number === "999" && fail999) throw new BridgeError("NOT_IN_ZK");
    return { pdfBase64: btoa(JSON.stringify(r)) };
  } }));
  const runner = createRunner({ queue: store, bridge, results, quota, parse, pacingMs: 0 });
  const ui = () => render(<MantineProvider><I18nProvider><CartContext.Provider value={cart}><ResultsContext.Provider value={results}>
    <QueueContext.Provider value={{ store, runner, quota }}><QueuePanel /></QueueContext.Provider>
  </ResultsContext.Provider></CartContext.Provider></I18nProvider></MantineProvider>);
  const v = ui();
  fireEvent.click(await screen.findByRole("button", { name: "Prenesi vse izpiske (3)" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 2 od 3 · neuspelih 1 · čaka 0"));
  const rows = within(screen.getByTestId("queue-jobs"));
  expect(rows.getByText(/napaka · ni v ZK/)).toBeInTheDocument();
  expect(await results.list()).toHaveLength(2);
  expect(screen.getByTestId("ezk-quota")).toHaveTextContent("2 / 400");

  fail999 = false;
  fireEvent.click(await screen.findByRole("button", { name: "Ponovi neuspele (1)" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 3 od 3"));
  v.unmount();

  // reload mid-run: a job left "queued"/"running" in IndexedDB → the panel offers to resume
  await store.clear();
  await store.enqueue([{ kind: "parcel", koId: 657, koName: "M", number: "5", eid: "5", geometry: null }]);
  await store.set("parcel:657:5", { status: "running" });
  ui();
  expect(await screen.findByTestId("queue-resume")).toHaveTextContent("1 izpiskov še čaka");
  fireEvent.click(screen.getByRole("button", { name: "Nadaljuj" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 1 od 1"));
});
