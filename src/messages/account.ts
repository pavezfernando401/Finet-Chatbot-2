import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import type { Account, Invoice } from '../customers/customer.types.js';

/**
 * CU-64: the customer's balance and invoices, looked up when they ask.
 *
 * Fetched on demand rather than with the identification: the use case asks
 * for the records at each request, and a balance read up to 48 hours
 * earlier could already be paid.
 */

export const ACCOUNT_TOOL = 'consultar_cuenta';

/** Offered only once the customer is identified: it reads their records. */
export const accountTool: ChatCompletionFunctionTool = {
  type: 'function',
  function: {
    name: ACCOUNT_TOOL,
    description:
      'Consulta en los registros de Finet el saldo pendiente del cliente y el ' +
      'estado de sus facturas. Úsala cada vez que pregunte cuánto debe, por su ' +
      'saldo, sus facturas, sus pagos o sus vencimientos.',
    parameters: { type: 'object', properties: {} },
  },
};

/** CU-64, exception 1: the records did not answer or had nothing for the RUT. */
export function accountUnavailableText(whatsappNumber: string): string {
  return (
    'No fue posible recuperar tu información en este momento. Puedes ' +
    'intentarlo más tarde o escribir a soporte por WhatsApp al ' +
    `${whatsappNumber}.`
  );
}

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
});

/** `2026-09-20` → `20-09-2026`, the way dates are written in Chile. */
function chileanDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return day && month && year ? `${day}-${month}-${year}` : isoDate;
}

function describeInvoice(invoice: Invoice): string {
  const due = invoice.dueDate ? chileanDate(invoice.dueDate) : null;
  const timing =
    invoice.daysOverdue !== null
      ? `vencida hace ${invoice.daysOverdue} días${due ? ` (vencía el ${due})` : ''}`
      : invoice.daysToDue !== null && due
        ? `vence el ${due}, en ${invoice.daysToDue} días`
        : 'sin fecha de vencimiento registrada';
  return `- ${invoice.period}: ${clp.format(invoice.amount)}, ${invoice.status}, ${timing}`;
}

/**
 * The account for the engine to explain. Amounts and dates are written out
 * here rather than handed over raw, so the engine has nothing to compute.
 * Only figures: the name and RUT that come with them stay out.
 */
export function accountContext(account: Account): string {
  return [
    'Acabas de consultar la cuenta del cliente en los registros de Finet.',
    `Saldo pendiente: ${clp.format(account.balance)}`,
    account.invoices.length
      ? ['Facturas pendientes:', ...account.invoices.map(describeInvoice)].join(
          '\n',
        )
      : 'No tiene facturas pendientes.',
    account.complete
      ? ''
      : 'Algunos montos o fechas están incompletos en los registros: avísale ' +
        'que el detalle puede no ser exacto.',
    'Responde su consulta con estos datos y no inventes otros. No puedes ' +
      'registrar pagos.',
  ]
    .filter(Boolean)
    .join('\n');
}
