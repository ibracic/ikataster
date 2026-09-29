/** One positioned text run from a PDF page (pdf.js text item, y grows upwards). */
export interface PdfTextItem { page: number; x: number; y: number; w: number; str: string }

export type Holder =
  | { kind: "person"; name: string; address?: string; emso?: string; birthDate?: string }
  | { kind: "company"; name: string; address?: string; companyId?: string }
  /** "vsakokratni lastnik nepremičnine" — whoever owns another property. */
  | { kind: "ownerOf"; name: string };

export interface Restriction { id: number; since?: string; type: string }

/** One holder of one basic legal position (osnovni pravni položaj). */
export interface Owner {
  positionId: number;
  right: string;
  share: string;
  shareValue?: number;
  holder: Holder;
  restrictions: Restriction[];
}

export interface Property {
  type: "parcel" | "building" | "part" | "other";
  typeLabel?: string;
  koId?: number;
  koName?: string;
  /** Parcel number ("100/1") or building number ("50"). */
  number?: string;
  part?: number;
  ezkId?: number;
  label: string;
  address?: string;
}

export interface Charge {
  amount?: number;
  currency?: string;
  /** As printed, e.g. "200.000,00 EUR". */
  amountText?: string;
  interest?: string;
  maturityType?: string;
  maturityDate?: string;
}

/** An entered right or note (izvedena pravica / zaznamba) from the details section. */
export interface Right {
  id: number;
  /** 1-based order of entry as listed in the extract. */
  order: number;
  since?: string;
  type: string;
  code?: number;
  category: "mortgage" | "easement" | "note" | "other";
  /** Main property of the right, e.g. "999 VZORČNA VAS 100/3". */
  mainProperty?: string;
  description?: string;
  holders: Holder[];
  /** Basic legal positions (owners) the right restricts. */
  positionIds: number[];
  charge?: Charge;
  /** Secondary rights/notes entered at this right (e.g. 706 on a mortgage). */
  secondary: Right[];
}

/** A right entered in favour of whoever owns this property. */
export interface Benefit { id: number; type: string; code?: number; share?: string; on: string }

export interface EzkExtract {
  kind: "current" | "historical";
  createdAt?: string;
  property: Property;
  /** A land-registry case is still undecided (plomba). */
  pending: boolean;
  owners: Owner[];
  /** Charges, easements and notes restricting the ownership (may be missing on results stored before #12). */
  rights: Right[];
  benefits: Benefit[];
}

export type EzkFailure = "tooLarge" | "notPdf" | "tooManyPages" | "notEzk" | "unsupported";
export class EzkParseError extends Error {
  constructor(public reason: EzkFailure, message?: string) {
    super(message ?? reason);
    this.name = "EzkParseError";
  }
}
