import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { optionalSetting } from "../config/env.js";
import type {
  AccountLookup,
  CreatedSupportRequest,
  CustomerLookup,
  CustomerPlan,
  Escalation,
  Invoice,
  SupportCategory,
  SupportOutcome,
  SupportRequest,
} from "./customer.types.js";
import { isCompanyId } from "../knowledge/companies.js";

/** A RUT check sits in front of the customer's answer, so it stays short. */
const TIMEOUT_MS = 5_000;

/** Body of finet-clientes' `POST /asistente/clientes/identificar`. */
interface IdentifyResponse {
  encontrado?: boolean;
  cliente?: {
    nombre_completo?: unknown;
    id_empresa?: unknown;
    planes?: {
      nombre_comercial?: unknown;
      tipo_plan?: unknown;
      velocidad_mbps?: unknown;
      estado_contrato?: unknown;
    }[];
  } | null;
}

/** Body of finet-clientes' `GET /deuda-publica/rut` (CU-39). */
interface PublicDebtResponse {
  encontrado?: boolean;
  saldo_total?: unknown;
  facturas?: {
    periodo?: unknown;
    monto?: unknown;
    fecha_limite_pago?: unknown;
    estado?: unknown;
    dias_vencida?: unknown;
    dias_para_vencer?: unknown;
  }[];
  detalle_disponible?: boolean;
  informacion_completa?: boolean;
}

interface SupportResponse {
  id_ticket?: unknown;
  codigo_seguimiento?: unknown;
}

/** A string field from the response, or `''` when it is anything else. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A number field from the response, or `null` when it is anything else. */
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Checks a RUT against Finet's customer records, which live in finet-clientes
 * (its backend owns the database). Every channel goes through here, Chatwoot
 * included, which is why the bot asks and not the site's backend.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);
  private readonly baseUrl?: string;
  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.baseUrl = optionalSetting(config, "CLIENTES_API_URL")?.replace(
      /\/+$/,
      "",
    );
    this.apiKey = optionalSetting(config, "CLIENTES_API_KEY");

    // Not fatal: without the records the bot still answers, in general mode,
    // which is what CU-63 asks for when the system does not respond.
    if (!this.baseUrl || !this.apiKey) {
      this.logger.warn(
        "CLIENTES_API_URL or CLIENTES_API_KEY is not set: no RUT can be verified, every conversation stays in general mode",
      );
    }
  }

  async lookup(rut: string, accessToken?: string): Promise<CustomerLookup> {
    if (!this.baseUrl || !this.apiKey) return { status: "unavailable" };

    try {
      const res = await fetch(
        `${this.baseUrl}/asistente/clientes/identificar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": this.apiKey,
          },
          body: JSON.stringify({
            rut,
            ...(accessToken ? { access_token: accessToken } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        throw new Error(`finet-clientes answered ${res.status}`);
      }

      const body = (await res.json()) as IdentifyResponse;
      if (body.encontrado !== true) return { status: "not_found" };

      const name = body.cliente?.nombre_completo;
      if (typeof name !== "string" || !name.trim()) {
        throw new Error("finet-clientes found the customer but sent no name");
      }

      const companyId = body.cliente?.id_empresa;
      return {
        status: "found",
        customer: {
          name: name.trim(),
          ...(isCompanyId(companyId) ? { companyId } : {}),
          plans:
            body.cliente?.planes?.map((plan): CustomerPlan => ({
              name: text(plan.nombre_comercial),
              type: text(plan.tipo_plan),
              speedMbps:
                typeof plan.velocidad_mbps === "number"
                  ? plan.velocidad_mbps
                  : null,
              contractStatus: text(plan.estado_contrato),
            })) ?? null,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`RUT check failed: ${reason}`);
      return { status: "unavailable" };
    }
  }

  /**
   * CU-64: the balance and pending invoices for `rut`, from the same public
   * lookup the site's "Consultar deuda" uses. The API key is not needed to
   * read it; it gets the bot a rate limit of its own, since every customer's
   * lookup leaves from this one address.
   */
  async account(rut: string): Promise<AccountLookup> {
    if (!this.baseUrl || !this.apiKey) return { status: "unavailable" };

    try {
      const res = await fetch(
        `${this.baseUrl}/deuda-publica/rut?rut=${encodeURIComponent(rut)}`,
        {
          headers: { "X-Api-Key": this.apiKey },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        throw new Error(`finet-clientes answered ${res.status}`);
      }

      const body = (await res.json()) as PublicDebtResponse;
      if (body.encontrado !== true) return { status: "not_found" };
      // CU-41, exception 1: the customer exists but their invoices could not be read.
      if (body.detalle_disponible === false) {
        throw new Error("finet-clientes could not read the invoices");
      }

      const balance = count(body.saldo_total);
      if (balance === null) {
        throw new Error("finet-clientes sent no balance");
      }

      return {
        status: "found",
        account: {
          balance,
          invoices: (body.facturas ?? []).map((invoice): Invoice => ({
            period: text(invoice.periodo),
            amount: count(invoice.monto) ?? 0,
            dueDate: text(invoice.fecha_limite_pago),
            status: text(invoice.estado),
            daysOverdue: count(invoice.dias_vencida),
            daysToDue: count(invoice.dias_para_vencer),
          })),
          complete: body.informacion_completa !== false,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Account lookup failed: ${reason}`);
      return { status: "unavailable" };
    }
  }

  /**
   * CU-66: the failure categories the customer picks from. `null` when they
   * could not be read, and an empty list counts as that too: there is nothing
   * to file a request under.
   *
   * `deadline` is the turn's: these calls sit between engine calls, so they
   * stop with it rather than run past the time the site waits.
   */
  async supportCategories(
    deadline?: AbortSignal,
  ): Promise<SupportCategory[] | null> {
    if (!this.baseUrl || !this.apiKey) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/asistente/clientes/soporte/categorias`,
        {
          headers: { "X-API-Key": this.apiKey },
          signal: this.signal(deadline),
        },
      );
      if (!res.ok) throw new Error(`finet-clientes answered ${res.status}`);
      const body = (await res.json()) as unknown;
      if (!Array.isArray(body)) throw new Error("invalid support categories");
      const categories = body.filter(
        (category): category is SupportCategory =>
          typeof category === "object" &&
          category !== null &&
          typeof (category as SupportCategory).id_categoria === "number" &&
          typeof (category as SupportCategory).nombre === "string",
      );
      if (!categories.length) throw new Error("no support categories");
      return categories;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Support categories lookup failed: ${reason}`);
      return null;
    }
  }

  /**
   * CU-66: files the support request the customer reported. finet-clientes
   * answers 401 when the portal session is not the RUT's customer's, which
   * the customer can fix by logging in again; anything else is exception 1.
   */
  async createSupport(
    request: SupportRequest,
    deadline?: AbortSignal,
  ): Promise<SupportOutcome> {
    if (!this.baseUrl || !this.apiKey) return { status: "unavailable" };
    try {
      const res = await fetch(`${this.baseUrl}/asistente/clientes/soporte`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({
          rut: request.rut,
          id_sesion: request.sessionId,
          id_categoria: request.categoryId,
          descripcion: request.description,
          access_token: request.accessToken,
        }),
        signal: this.signal(deadline),
      });
      if (res.status === 401) {
        this.logger.warn("Support request rejected: portal session not valid");
        return { status: "unauthorized" };
      }
      if (!res.ok) throw new Error(`finet-clientes answered ${res.status}`);
      const body = (await res.json()) as SupportResponse;
      if (
        typeof body.id_ticket !== "number" ||
        typeof body.codigo_seguimiento !== "string"
      ) {
        throw new Error("invalid support response");
      }
      return {
        status: "created",
        ticket: {
          id_ticket: body.id_ticket,
          codigo_seguimiento: body.codigo_seguimiento,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Support request failed: ${reason}`);
      return { status: "unavailable" };
    }
  }

  /** The call's own timeout, cut short by the turn's deadline when given. */
  private signal(deadline?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    return deadline ? AbortSignal.any([timeout, deadline]) : timeout;
  }

  /**
   * CU-77: files a support ticket with the conversation the bot could not
   * resolve, for Finet's team to pick up from the CRM. `null` when it could
   * not be filed — the use case's exception 1.
   *
   * No portal session, unlike {@link createSupport}: the system files it on
   * handing off, not the customer, and it has to work over WhatsApp too.
   */
  async escalate(
    escalation: Escalation,
  ): Promise<CreatedSupportRequest | null> {
    if (!this.baseUrl || !this.apiKey) return null;
    try {
      const res = await fetch(
        `${this.baseUrl}/asistente/clientes/escalamientos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({
            rut: escalation.rut,
            id_sesion: escalation.sessionId,
            plataforma: escalation.channel,
            ...(escalation.reason ? { motivo: escalation.reason } : {}),
            historial: escalation.history.map((turn) => ({
              rol: turn.role,
              contenido: turn.content,
            })),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(`finet-clientes answered ${res.status}`);
      const body = (await res.json()) as SupportResponse;
      if (
        typeof body.id_ticket !== "number" ||
        typeof body.codigo_seguimiento !== "string"
      ) {
        throw new Error("invalid escalation response");
      }
      return {
        id_ticket: body.id_ticket,
        codigo_seguimiento: body.codigo_seguimiento,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Escalation ticket failed: ${reason}`);
      return null;
    }
  }
}
