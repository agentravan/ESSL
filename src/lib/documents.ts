// Onboarding documents: the checklist and file checks.

export const DOCUMENT_KINDS = [
  { key: 'id_proof', label: 'Identity proof', hint: 'Aadhaar card, passport, voter ID or driving licence', required: true },
  { key: 'pan_card', label: 'PAN card', hint: '', required: true },
  { key: 'address_proof', label: 'Address proof', hint: 'If different from the identity proof', required: false },
  { key: 'education', label: 'Education certificates', hint: 'Highest qualification', required: true },
  { key: 'experience', label: 'Relieving or experience letter', hint: 'From the last employer, if any', required: false },
  { key: 'payslips', label: 'Previous payslips', hint: 'Last three months, if any', required: false },
  { key: 'bank_proof', label: 'Bank proof', hint: 'Cancelled cheque or passbook first page', required: true },
  { key: 'photo', label: 'Photograph', hint: 'Passport size', required: true },
  { key: 'other', label: 'Other', hint: '', required: false },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['key'];

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

export function documentKindLabel(key: string): string {
  return DOCUMENT_KINDS.find((k) => k.key === key)?.label ?? key;
}

/** Looks at the first bytes of a file. Only PDF, JPEG and PNG are accepted. */
export function sniffFileType(bytes: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}

export const DOCUMENT_STATUS_LABEL = { uploaded: 'Waiting for HR', verified: 'Verified', rejected: 'Rejected' } as const;
export const DOCUMENT_STATUS_TONE = { uploaded: 'amber', verified: 'green', rejected: 'red' } as const;

export interface DocumentRow {
  id: string;
  employee_id: string;
  kind: string;
  file_name: string;
  size_bytes: number;
  status: 'uploaded' | 'verified' | 'rejected';
  note: string;
  uploaded_at: Date;
}

export const DOCUMENT_COLUMNS = 'd.id, d.employee_id, d.kind, d.file_name, d.size_bytes, d.status, d.note, d.uploaded_at';
