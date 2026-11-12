/**
 * The two companies the portal serves, with finet-clientes' `empresa` ids:
 * "a single-server web platform, differentiated by company (Finet and Cable
 * Mágico)" (Documento 0, §6.6). The site says which company's site the
 * visitor is on; once a RUT checks out, the customer's own company wins.
 *
 * The facts are the ones each company published (Cable Mágico's, 11-11):
 * nothing here is guessed. Finet's WhatsApp comes from `WHATSAPP_NUMBER`.
 */
export type CompanyId = 1 | 2;

export interface Company {
  id: CompanyId;
  name: string;
  legalName: string;
  /** "la Región Metropolitana". */
  region: string;
  /** Communes with service, as a sentence. */
  coverage: string;
  /** Where its site lives inside the portal: Finet at the root. */
  sitePath: '' | '/cable-magico';
  /** Opening hours, if the company gave them. */
  hours: string | null;
  /** Its office, as far as the company gave it: commune only, or street too. */
  office: string;
  /** Its WhatsApp; `null` means the configured `WHATSAPP_NUMBER`. */
  whatsapp: string | null;
}

export const COMPANIES: Record<CompanyId, Company> = {
  1: {
    id: 1,
    name: 'Finet',
    legalName: 'Fibernet Limitada',
    region: 'la Región Metropolitana',
    coverage: 'La Pintana, La Granja, La Florida y Puente Alto',
    sitePath: '',
    hours: null,
    office: 'en La Pintana',
    whatsapp: null,
  },
  2: {
    id: 2,
    name: 'Cable Mágico',
    legalName: 'Cable Magico Estelar S.A.',
    region: 'la Región de Valparaíso',
    coverage: 'Algarrobo y El Quisco',
    sitePath: '/cable-magico',
    hours: 'de 9:00 a 17:00',
    office: 'en Avenida Peñablanca 525, Algarrobo',
    whatsapp: '+56 9 3303 1480',
  },
};

export const DEFAULT_COMPANY_ID: CompanyId = 1;

export function isCompanyId(value: unknown): value is CompanyId {
  return value === 1 || value === 2;
}

/** The company with that id; Finet when it is unknown or missing. */
export function companyOf(id: unknown): Company {
  return COMPANIES[isCompanyId(id) ? id : DEFAULT_COMPANY_ID];
}
