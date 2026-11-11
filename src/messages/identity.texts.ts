import type { Customer } from "../customers/customer.types.js";
import { COMPANIES, type Company } from "../knowledge/companies.js";

/**
 * CU-63 texts. The RUT request and the failure notice are fixed rather than
 * left to the engine: they are what the use case requires the customer to
 * read, and a model can drop or reword them.
 */

/**
 * Opens every new conversation. There is no button to skip it — the same
 * flow has to work on WhatsApp — so the text itself says how.
 */
export function rutRequest(company: Company): string {
  return (
    "¡Hola! Antes de seguir, ¿me indicas tu RUT? Así puedo ayudarte con tus " +
    "planes y tu servicio. Si prefieres no darlo, cuéntame tu consulta y te " +
    `ayudo con información general de ${company.name}.`
  );
}

/** Finet's, the one every conversation got before there were two companies. */
export const RUT_REQUEST = rutRequest(COMPANIES[1]);

/** CU-63, exception 1: the RUT is not on record, or the records did not answer. */
export const RUT_NOT_VERIFIED =
  "No pude verificar tu identidad con ese RUT, así que seguiré ayudándote " +
  "con consultas generales.";

/** Too many different RUTs tried from one place: see RutAttempts. */
export const RUT_LIMIT_REACHED =
  "Por seguridad no puedo verificar más RUT por ahora, así que seguiré " +
  "ayudándote con consultas generales. Puedes intentarlo en una hora.";

/** Stands in for the RUT in the history, so it never reaches the engine. */
export const RUT_PLACEHOLDER = "[RUT]";

const PENDING_QUESTION =
  "Si en la conversación quedó una consulta del cliente sin responder, " +
  "respóndela ahora.";

const PLACEHOLDER_NOTE = `En el historial, ${RUT_PLACEHOLDER} marca dónde el cliente escribió su RUT.`;

export function identifiedContext(
  customer: Customer,
  company: Company = COMPANIES[1],
): string {
  const plans =
    customer.plans === null
      ? "- No disponibles: no inició sesión en el portal. Si pregunta por sus " +
        "planes, pídele que inicie sesión; no le digas que no tiene planes."
      : customer.plans.length
        ? customer.plans
            .map((plan) => {
              const details = [
                plan.type,
                plan.speedMbps !== null ? `${plan.speedMbps} Mbps` : null,
              ].filter(Boolean);
              const suffix = details.length ? ` (${details.join(", ")})` : "";
              return `- ${plan.name}${suffix}, contrato ${plan.contractStatus}`;
            })
            .join("\n")
        : "- No tiene planes registrados.";

  return [
    `El cliente está identificado: su RUT se verificó contra los registros de ${company.name}.`,
    `Nombre: ${customer.name}`,
    "Planes contratados:",
    plans,
    "",
    "Usa estos datos para personalizar tus respuestas sobre sus planes, y " +
      "llámalo por su nombre de pila. Su saldo y sus facturas no los tienes de " +
      "antemano: si pregunta por eso, consúltalos con la herramienta " +
      "consultar_cuenta. Nunca inventes datos de su cuenta.",
    "Si reporta una falla o un problema técnico con su servicio, usa " +
      "consultar_categorias_falla para registrar un reporte de soporte.",
    PENDING_QUESTION,
    PLACEHOLDER_NOTE,
  ].join("\n");
}

export function anonymousContext(options: {
  justFailed: boolean;
  company?: Company;
}): string {
  const company = options.company ?? COMPANIES[1];
  return [
    "El cliente no está identificado: no entregó su RUT o no se pudo verificar.",
    `Responde solo consultas generales sobre ${company.name} y sus servicios. No tienes ` +
      "ningún dato de su cuenta.",
    "Si pregunta por sus planes, su saldo, sus facturas u otro dato de su " +
      "cuenta, explícale que para eso necesitas su RUT y pídeselo.",
    options.justFailed
      ? "Ya le informaste que no fue posible verificar su identidad; no lo repitas."
      : "",
    PENDING_QUESTION,
    PLACEHOLDER_NOTE,
  ]
    .filter(Boolean)
    .join("\n");
}
