import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import type { SupportCategory } from '../customers/customer.types.js';
import { COMPANIES, type Company } from '../knowledge/companies.js';

/**
 * CU-66: the customer reports a failure and the bot files a support request
 * in finet-clientes, under the category the customer picks. The category is
 * what routes it to the right team in the CRM.
 *
 * Filing one takes the customer's portal session, not only the RUT: the
 * request is the customer's own, so finet-clientes checks that whoever is
 * logged in is the customer the RUT belongs to.
 */

export const SUPPORT_CATEGORIES_TOOL = 'consultar_categorias_falla';
export const CREATE_SUPPORT_TOOL = 'crear_solicitud_soporte';

/** Offered to an identified customer: the way into the use case. */
export const supportCategoriesTool: ChatCompletionFunctionTool = {
  type: 'function',
  function: {
    name: SUPPORT_CATEGORIES_TOOL,
    description:
      'Obtiene las categorías de falla disponibles. Úsala cuando el cliente ' +
      'reporta una falla o un problema técnico con su servicio, antes de ' +
      'pedirle que elija una categoría.',
    parameters: { type: 'object', properties: {} },
  },
};

/**
 * Offered only with a portal session. The category goes by name, not id:
 * after the turn that listed them, the names are all the engine still sees.
 */
export const createSupportTool: ChatCompletionFunctionTool = {
  type: 'function',
  function: {
    name: CREATE_SUPPORT_TOOL,
    description:
      'Registra una solicitud de soporte técnico. Úsala solo cuando el cliente ' +
      'ya eligió una de las categorías que le mostraste, describió la falla y ' +
      'te dio la información del reporte: desde cuándo ocurre, qué servicio o ' +
      'dirección afecta y qué ha intentado. No la uses con datos incompletos.',
    parameters: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          description:
            'Nombre exacto de la categoría elegida, como aparece en la lista.',
        },
        descripcion: {
          type: 'string',
          description:
            'La falla con las palabras del cliente, seguida de la información ' +
            'del reporte que entregó.',
        },
      },
      required: ['categoria', 'descripcion'],
      additionalProperties: false,
    },
  },
};

/** What finet-clientes takes as a description. */
export const MAX_DESCRIPTION = 5_000;

/** `Facturación y cobro` and `FACTURACION Y COBRO` are the same category. */
function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

/** The category the engine named, if it is one of the list. */
export function findCategory(
  categories: SupportCategory[],
  name: unknown,
): SupportCategory | undefined {
  if (typeof name !== 'string') return undefined;
  const wanted = normalise(name);
  return categories.find((category) => normalise(category.nombre) === wanted);
}

/** The categories, for the engine to show the customer. */
export function supportCategoriesContext(
  categories: SupportCategory[],
): string {
  return [
    'El cliente quiere reportar una falla. Estas son las categorías disponibles:',
    ...categories.map((category) => `- ${category.nombre}`),
    '',
    'Muéstraselas tal cual y pídele que elija la que corresponde a su problema ' +
      'y que describa la falla. Luego pídele la información del reporte: desde ' +
      'cuándo ocurre, qué servicio o dirección afecta y qué ha intentado.',
    'Con todo eso, registra la solicitud con crear_solicitud_soporte. No la ' +
      'registres antes de tenerlo.',
  ].join('\n');
}

/** The engine named a category that is not on the list. */
export function unknownCategoryText(categories: SupportCategory[]): string {
  return [
    'No encontré esa categoría. ¿Cuál de estas corresponde a tu problema?',
    ...categories.map((category) => `- ${category.nombre}`),
  ].join('\n');
}

/** The engine filed without a description, which the tool asks for. */
export const SUPPORT_DESCRIPTION_MISSING =
  'Para registrar el reporte necesito que me describas la falla.';

/**
 * No portal session: the bot cannot file the request on the RUT alone. Over
 * WhatsApp there never is one, so the text says where to go.
 */
export function supportLoginRequired(company: Company): string {
  return (
    'Para registrar un reporte de falla necesito que inicies sesión en tu ' +
    `cuenta en el sitio de ${company.name} y me escribas desde el chat de ahí. Si ` +
    'prefieres, puedo derivarte con una persona de nuestro equipo.'
  );
}
export const SUPPORT_LOGIN_REQUIRED = supportLoginRequired(COMPANIES[1]);

/** finet-clientes rejected the session: expired, or another customer's. */
export function supportSessionInvalid(company: Company): string {
  return (
    `No pude confirmar tu sesión en el sitio de ${company.name}: puede que haya expirado ` +
    'o que corresponda a otro RUT. Vuelve a iniciar sesión y cuéntame de nuevo ' +
    'la falla. Si prefieres, puedo derivarte con una persona de nuestro equipo.'
  );
}
export const SUPPORT_SESSION_INVALID = supportSessionInvalid(COMPANIES[1]);

/**
 * CU-66, exception 1: the support section did not answer. The conversation is
 * handed off, as the use case asks; WhatsApp is how the customer can make
 * sure of it, since nothing was recorded.
 */
export function supportUnavailableText(whatsappNumber: string): string {
  return (
    'No fue posible registrar tu reporte en este momento. Un agente humano ' +
    'tomará tu caso en breve; también puedes escribirnos por WhatsApp al ' +
    `${whatsappNumber}. Desde aquí ya no podré responder más mensajes en esta ` +
    'conversación.'
  );
}

/** CU-66: the request was filed. The code is what the customer quotes later. */
export function supportConfirmation(trackingCode: string): string {
  return (
    'Tu reporte quedó registrado. El identificador de tu solicitud es ' +
    `${trackingCode}. Nuestro equipo de soporte revisará la falla y te ` +
    'contactará.'
  );
}
