import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { I18nProvider } from "../i18n";
import { ResultsModal } from "./ResultsModal";
import { ResultsContext } from "./useResults";
import { createResultsStore } from "./results";
import { EzkParseError, type EzkExtract } from "./types";

const two: EzkExtract = {
  kind: "current", createdAt: "2026-09-28T22:43:06", pending: false,
  property: { type: "parcel", typeLabel: "1 - zemljiška parcela", koId: 999, koName: "VZORČNA VAS", number: "100/1", ezkId: 1, label: "999 VZORČNA VAS 100/1" },
  owners: [
    { positionId: 1, right: "101 - vknjižena lastninska pravica", share: "1/2", holder: { kind: "person", name: "Janez Novak", address: "Vzorčna ulica 001, 2250 Ptuj", birthDate: "1990-01-01" },
      restrictions: [{ id: 10000002, type: "401 - vknjižena hipoteka" }] },
    { positionId: 2, right: "101 - vknjižena lastninska pravica", share: "1/2", holder: { kind: "person", name: "Marija Kranjc", birthDate: "1985-05-05" }, restrictions: [] },
  ],
  rights: [
    { id: 10000009, order: 1, since: "2020-01-01T10:00:00", code: 404, category: "easement", type: "404 - vknjižena stvarna služnost / nujna pot / nepravo stvarno breme",
      mainProperty: "999 VZORČNA VAS 100/1", description: "Služnost dostopa za vzdrževanje hiše.", holders: [{ kind: "ownerOf", name: "999 VZORČNA VAS 100/2" }], positionIds: [1, 2], secondary: [] },
    { id: 10000002, order: 2, since: "2021-01-01T10:00:00", code: 401, category: "mortgage", type: "401 - vknjižena hipoteka", mainProperty: "999 VZORČNA VAS 100/1",
      description: "Na podlagi notarskega zapisa …", holders: [{ kind: "company", name: "VZORČNA BANKA d.d.", companyId: "1111111000" }], positionIds: [1, 2],
      charge: { amount: 150000, currency: "EUR", amountText: "150.000,00 EUR", interest: "glej dodatni opis", maturityType: "1 - določen dan", maturityDate: "2040-12-31" },
      secondary: [{ id: 10000010, order: 1, code: 706, category: "note", type: "706 - zaznamba neposredne izvršljivosti", holders: [], positionIds: [], secondary: [] }] },
  ],
  benefits: [{ id: 10000003, code: 404, type: "404 - vknjižena stvarna služnost / nujna pot / nepravo stvarno breme", on: "999 VZORČNA VAS 101/4" }],
};
const { rights: _r, benefits: _b, ...legacy } = two;
const company = {
  ...legacy, pending: true,
  property: { type: "part", koId: 998, koName: "TESTNI KRAJ", number: "50", part: 21, ezkId: 2, label: "998 TESTNI KRAJ 50/21" },
  owners: [{ positionId: 3, right: "101 - vknjižena lastninska pravica", share: "1/1", holder: { kind: "company", name: "VZOREC NEPREMIČNINE d.o.o.", companyId: "1234567000" }, restrictions: [] }],
} as unknown as EzkExtract;

it("uploads PDFs, reports failures, groups owners by property and filters them", async () => {
  localStorage.setItem("ikataster.lang", "sl");
  const parse = vi.fn(async (b: Uint8Array) => {
    if (b[0] === 1) return two;
    if (b[0] === 2) return company;
    throw new EzkParseError("unsupported");
  });
  const onOpen = vi.fn();
  const download = vi.fn();
  render(
    <MantineProvider><I18nProvider><ResultsContext.Provider value={createResultsStore(`rm-${Date.now()}`)}>
      <ResultsModal opened onClose={() => {}} parse={parse} onOpenProperty={onOpen} download={download} />
    </ResultsContext.Provider></I18nProvider></MantineProvider>,
  );
  expect(await screen.findByText(/Ni še izpisov/)).toBeInTheDocument();
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const file = (n: string, b: number) => new File([new Uint8Array([b])], n, { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file("a.pdf", 1), file("b.pdf", 2), file("old.pdf", 9)] } });

  const report = await screen.findByTestId("results-report");
  expect(report).toHaveTextContent("Dodanih izpisov: 2");
  expect(report).toHaveTextContent("old.pdf – Zgodovinski izpis ni podprt");
  await waitFor(() => expect(screen.getAllByTestId("result-group")).toHaveLength(2));
  expect(screen.getAllByTestId("owner-row")).toHaveLength(3);
  const g = screen.getAllByTestId("result-group");
  expect(g[0]).toHaveTextContent("999 VZORČNA VAS 100/1");
  expect(g[1]).toHaveTextContent("Nerešena zadeva");
  const rows = screen.getAllByTestId("owner-row");
  expect(rows[0]).toHaveTextContent("Janez Novak");
  expect(rows[0]).toHaveTextContent("1. 1. 1990");
  expect(within(rows[0]).getByText("hipoteka")).toBeInTheDocument();
  expect(rows[2]).toHaveTextContent("1234567000");

  // charges + easements of the first property
  const rights = screen.getAllByTestId("rights");
  expect(rights).toHaveLength(1);
  const mort = within(rights[0]).getByTestId("right-10000002");
  expect(mort).toHaveTextContent("Hipoteka");
  expect(mort).toHaveTextContent("150.000,00 EUR");
  expect(mort).toHaveTextContent("VZORČNA BANKA d.d.");
  expect(mort).toHaveTextContent("zapadlost 31. 12. 2040");
  expect(mort).toHaveTextContent("vpis 1. 1. 2021");
  expect(mort).toHaveTextContent("706 - zaznamba neposredne izvršljivosti");
  const ease = within(rights[0]).getByTestId("right-10000009");
  expect(ease).toHaveTextContent("Služnost");
  expect(ease).toHaveTextContent("vsakokratni lastnik: 999 VZORČNA VAS 100/2");
  expect(ease).toHaveTextContent("Služnost dostopa za vzdrževanje hiše.");
  expect(rights[0]).toHaveTextContent("V korist nepremičnine");
  expect(mort).not.toHaveTextContent("Zemljiški dolg");
  expect(rights[0]).toHaveTextContent("999 VZORČNA VAS 101/4");

  // export ZIP: contains the uploaded PDF; the record without a stored PDF is reported
  fireEvent.click(screen.getByRole("button", { name: /Izvozi ZIP/ }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  const [name, bytes, mime] = download.mock.calls[0];
  expect(name).toMatch(/^ikataster-izvoz-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(mime).toBe("application/zip");
  const { unzipSync } = await import("fflate");
  expect(Object.keys(unzipSync(bytes))).toEqual(expect.arrayContaining(["podatki.xlsx", "lastniki.csv", "bremena.csv", "pdf/999_100-1_2026-09-28.pdf", "pdf/998_50-21_2026-09-28.pdf"]));
  expect(await screen.findByTestId("export-report")).toHaveTextContent("Izvoz pripravljen");

  fireEvent.change(screen.getByLabelText(/Filtriraj lastnike/), { target: { value: "kranjc" } });
  await waitFor(() => expect(screen.getAllByTestId("owner-row")).toHaveLength(1));
  expect(screen.getAllByTestId("result-group")).toHaveLength(1);

  fireEvent.click(screen.getByText("999 VZORČNA VAS 100/1"));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "parcel:999:100/1" }));
});
