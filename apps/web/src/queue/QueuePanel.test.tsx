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
  let v = ui();
  await waitFor(() => expect(screen.getByRole("button", { name: "Prenesi nove izpiske (3)" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Prenesi nove izpiske (3)" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 2 od 3 · neuspelih 1 · čaka 0"));
  const rows = within(screen.getByTestId("queue-jobs"));
  expect(rows.getByText(/ni samostojnega vpisa v ZK/)).toBeInTheDocument();
  expect(await results.list()).toHaveLength(2);
  expect(screen.getByTestId("ezk-quota")).toHaveTextContent("2 / 400");
  // Closing the dialog / switching tabs remounts the panel: the round's progress must still be there.
  v.unmount(); v = ui();
  expect(await screen.findByTestId("queue-summary")).toHaveTextContent("Preneseno 2 od 3 · neuspelih 1");
  expect(within(screen.getByTestId("queue-failures")).getByTestId("failure-group")).toHaveTextContent("(1)");

  // A second round contains only the new property, not old successes or failures.
  await cart.add([{ kind: "parcel", koId: 657, koName: "M", number: "8", eid: "8", geometry: null }]);
  fireEvent.click(await screen.findByRole("button", { name: "Prenesi nove izpiske (1)" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 1 od 1"));
  expect(await results.list()).toHaveLength(3);
  expect((await store.get("parcel:657:999"))?.attempts).toBe(1);
  expect(screen.getByTestId("queue-jobs")).not.toHaveTextContent("999");
  expect(screen.getByRole("button", { name: "Prenesi nove izpiske (0)" })).toBeDisabled();

  fail999 = false;
  fireEvent.click(screen.getByText(/Neuspešni prenosi/));
  fireEvent.click(await screen.findByRole("button", { name: "Poskusi znova parcel:657:999" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 1 od 1"));
  v.unmount();

  // reload mid-run: a job left "queued"/"running" in IndexedDB → the panel offers to resume
  await store.clear();
  await cart.clear();
  await cart.add([{ kind: "parcel", koId: 657, koName: "M", number: "5", eid: "5", geometry: null }]);
  await store.enqueue(await cart.list());
  await store.set("parcel:657:5", { status: "running" });
  ui();
  expect(await screen.findByTestId("queue-resume")).toHaveTextContent("1 izpiskov še čaka");
  fireEvent.click(screen.getByRole("button", { name: "Nadaljuj" }));
  await waitFor(() => expect(screen.getByTestId("queue-summary")).toHaveTextContent("Preneseno 1 od 1"));
});
