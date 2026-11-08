/**
 * A Finet customer as the bot knows them once their RUT checks out. Only
 * what personalised answers need: this travels to the engine, so nothing
 * else (no RUT, email, phone or address) is fetched.
 */
export interface Customer {
  name: string;
  /** `null` without the portal session of this same customer. */
  plans: CustomerPlan[] | null;
}

export interface CustomerPlan {
  name: string;
  type: string;
  speedMbps: number | null;
  /** The contract's state as finet-clientes stores it: `activo`, `suspendido`... */
  contractStatus: string;
}

/**
 * Outcome of checking a RUT. `unavailable` covers finet-clientes being down
 * or not configured; the customer is told the same as for `not_found`.
 */
export type CustomerLookup =
  | { status: 'found'; customer: Customer }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/**
 * CU-64: what the customer owes, from finet-clientes' public debt lookup
 * (CU-39). The same figures the site shows to anyone with the RUT.
 */
export interface Account {
  /** Sum of the pending and overdue invoices, in pesos. */
  balance: number;
  invoices: Invoice[];
  /** CU-41, exception 2: false when an amount or a date is missing or invalid. */
  complete: boolean;
}

export interface Invoice {
  /** As finet-clientes writes it: `Septiembre 2026`. */
  period: string;
  amount: number;
  /** `YYYY-MM-DD`, or `''` when the stored date is invalid. */
  dueDate: string;
  /** `pendiente` or `vencida`. */
  status: string;
  daysOverdue: number | null;
  daysToDue: number | null;
}

/**
 * Outcome of looking the account up. Both failures get CU-64's exception 1,
 * but are told apart in the log.
 */
export type AccountLookup =
  | { status: 'found'; account: Account }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/** A ticket finet-clientes filed: CU-66's support request or CU-77's. */
export interface CreatedSupportRequest {
  id_ticket: number;
  codigo_seguimiento: string;
}

/** CU-66: a failure category, as finet-clientes lists them. */
export interface SupportCategory {
  id_categoria: number;
  nombre: string;
}

/** CU-66: the request the customer reports. */
export interface SupportRequest {
  rut: string;
  /** The conversation's store key. */
  sessionId: string;
  categoryId: number;
  description: string;
  /** The customer's portal JWT, which finet-clientes checks against the RUT. */
  accessToken: string;
}

/**
 * Outcome of filing it. `unauthorized` is the portal session failing the
 * check; `unavailable` is anything else, the use case's exception 1.
 */
export type SupportOutcome =
  | { status: 'created'; ticket: CreatedSupportRequest }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

/**
 * CU-77: what goes into the ticket when the bot hands an identified customer
 * off. The history is the stored one, so the RUT is already `[RUT]` in it.
 */
export interface Escalation {
  rut: string;
  /** The conversation's store key, as CU-66 sends it. */
  sessionId: string;
  /** Where it came through: `web`, `chatwoot` or `api`. */
  channel: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  /** The engine's summary of what it could not resolve, when it gave one. */
  reason?: string;
}
