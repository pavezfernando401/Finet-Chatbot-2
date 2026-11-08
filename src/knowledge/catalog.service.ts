import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { optionalSetting } from '../config/env.js';

/** One plan of Finet's public catalog, as the site's plans page shows it. */
export interface CatalogPlan {
  name: string;
  /** `tipo_plan` in finet-clientes, e.g. internet or tv. */
  type: string;
  /** `tipo_cliente` in finet-clientes, e.g. residential or business. */
  segment: string;
  speedMbps: number | null;
  /** In pesos. */
  monthlyPrice: number;
  description: string | null;
}

/** Body of finet-clientes' `GET /landing/planes` (CU-15, CU-17). */
interface PlanResponse {
  nombre_comercial?: unknown;
  tipo_plan?: unknown;
  tipo_cliente?: unknown;
  velocidad_mbps?: unknown;
  precio_mensual?: unknown;
  descripcion?: unknown;
}

/** Read in front of the engine's answer, so it stays short. */
const TIMEOUT_MS = 3_000;

/** Prices change rarely, and every conversation reads the same list. */
const FRESH_MS = 10 * 60_000;

/**
 * Past this, a catalog finet-clientes could not refresh is dropped rather
 * than quoted: a price a day old is still the site's, one older may not be.
 */
const STALE_MS = 24 * 60 * 60_000;

/**
 * Finet's plans and prices, read from finet-clientes' public catalog — the
 * one the site's plans page shows — so the engine quotes them instead of
 * making them up.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly baseUrl?: string;
  private cached?: { plans: CatalogPlan[]; at: number };
  private refreshing?: Promise<CatalogPlan[] | null>;

  constructor(config: ConfigService) {
    this.baseUrl = optionalSetting(config, 'CLIENTES_API_URL')?.replace(
      /\/+$/,
      '',
    );
  }

  /**
   * The active plans, cheapest first. `null` when there is no catalog to
   * quote: finet-clientes is not configured, or it has not answered for a
   * day. Never throws.
   */
  plans(): Promise<CatalogPlan[] | null> {
    const age = this.cached ? Date.now() - this.cached.at : Infinity;
    if (this.cached && age < FRESH_MS) {
      return Promise.resolve(this.cached.plans);
    }
    if (!this.baseUrl) return Promise.resolve(null);

    // Conversations arriving together share one request.
    this.refreshing ??= this.refresh(age).finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refresh(age: number): Promise<CatalogPlan[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/landing/planes`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`finet-clientes answered ${res.status}`);
      }

      const body = (await res.json()) as unknown;
      if (!Array.isArray(body)) {
        throw new Error('finet-clientes sent a catalog that is not a list');
      }
      const plans = (body as PlanResponse[]).flatMap(toPlan);
      this.cached = { plans, at: Date.now() };
      return plans;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const stale = age < STALE_MS ? this.cached?.plans : undefined;
      this.logger.warn(
        `Catalog refresh failed: ${reason}; ${stale ? 'keeping the last one' : 'no catalog'}`,
      );
      return stale ?? null;
    }
  }
}

/** A plan without a name or a price cannot be quoted, so it is left out. */
function toPlan(plan: PlanResponse): CatalogPlan[] {
  const name =
    typeof plan.nombre_comercial === 'string'
      ? plan.nombre_comercial.trim()
      : '';
  const price = plan.precio_mensual;
  if (!name || typeof price !== 'number' || !Number.isFinite(price)) {
    return [];
  }

  return [
    {
      name,
      type: typeof plan.tipo_plan === 'string' ? plan.tipo_plan : '',
      segment: typeof plan.tipo_cliente === 'string' ? plan.tipo_cliente : '',
      speedMbps:
        typeof plan.velocidad_mbps === 'number' ? plan.velocidad_mbps : null,
      monthlyPrice: price,
      description:
        typeof plan.descripcion === 'string' && plan.descripcion.trim()
          ? plan.descripcion.trim()
          : null,
    },
  ];
}
