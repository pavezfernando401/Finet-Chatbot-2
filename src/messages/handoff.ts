import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';

/**
 * Handing the customer over to a person. There is no live agent behind the
 * bot yet, so the bot goes quiet: answering after that would compete with the
 * person who takes the case.
 *
 * An identified customer gets a support ticket with the conversation, which
 * Finet's team picks up from the CRM (CU-77). Without a RUT there is nobody
 * to file it for, so the handover is a pointer to Finet's WhatsApp.
 */

export const HANDOFF_TOOL = 'derivar_a_persona';

/**
 * Offered to the engine on every call. The engine decides because the
 * customer rarely asks in a fixed phrase — "sí" to the bot's own offer is
 * the usual way in.
 */
export const handoffTool: ChatCompletionFunctionTool = {
  type: 'function',
  function: {
    name: HANDOFF_TOOL,
    description:
      'Deriva al cliente con una persona del equipo. Úsala cuando el ' +
      'cliente pide hablar con una persona, un agente o un ejecutivo, o cuando ' +
      'acepta que lo derives. Si solo no sabes algo, primero ofrece derivarlo y ' +
      'espera su respuesta. Después de usarla ya no podrás responder en esta ' +
      'conversación.',
    parameters: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description:
            'Resumen breve de lo que el cliente necesita y no pudiste ' +
            'resolver, para la persona que tome el caso.',
        },
      },
    },
  },
};

/** The engine's summary, cut to what finet-clientes accepts. */
export function handoffReason(
  args: Record<string, unknown>,
): string | undefined {
  const reason = typeof args.motivo === 'string' ? args.motivo.trim() : '';
  return reason ? reason.slice(0, 1000) : undefined;
}

const NO_MORE_REPLIES =
  'Desde aquí ya no podré responder más mensajes en esta conversación.';

/**
 * CU-77: the ticket was filed. The code is what the customer can quote when
 * Finet gets in touch, or when they ask about it.
 */
export function ticketFiledText(trackingCode: string): string {
  return (
    `Generé un reporte con el código ${trackingCode} para que una persona de ` +
    `nuestro equipo te atienda. Te contactaremos a la brevedad. ${NO_MORE_REPLIES}`
  );
}

/**
 * CU-77, exception 1: the ticket could not be filed. The use case asks to tell
 * the customer they will be attended shortly; WhatsApp is how they can make
 * sure of it, since nothing was recorded.
 */
export function ticketFailedText(whatsappNumber: string): string {
  return (
    'Una persona de nuestro equipo te atenderá en breve. Si lo prefieres, ' +
    `también puedes escribirnos por WhatsApp al ${whatsappNumber}. ` +
    NO_MORE_REPLIES
  );
}

/** Goes in front of the ticket texts when the engine is what failed (CU-65). */
export const ENGINE_DOWN_LEAD = 'No pude responder en este momento.';

/** The ticket's description when the engine failed, since it wrote no reason. */
export const ENGINE_DOWN_REASON =
  'El asistente no pudo responder: el motor falló o no respondió a tiempo.';

/** Fixed rather than left to the engine, so the number reaches the customer as configured. */
export function handoffText(whatsappNumber: string): string {
  return (
    'Te recomiendo seguir esta consulta con una persona de nuestro equipo ' +
    `por WhatsApp, al ${whatsappNumber}. Desde aquí ya no podré responder ` +
    'más mensajes en esta conversación.'
  );
}

/**
 * CU-65, exception 1: the engine failed or ran out of time. The use case
 * says a human agent will take the case shortly; there is none behind the
 * bot yet, so this says what does exist, and the conversation is handed off
 * like any other handoff.
 */
export function engineDownText(whatsappNumber: string): string {
  return (
    'No pude responder en este momento. Una persona de nuestro equipo puede ' +
    `atenderte por WhatsApp al ${whatsappNumber}. Desde aquí ya no podré ` +
    'responder más mensajes en esta conversación.'
  );
}
