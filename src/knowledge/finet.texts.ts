import type { CatalogPlan } from './catalog.service.js';
import { COMPANIES, type Company } from './companies.js';

/**
 * What the engine knows about Finet for general questions, so it answers
 * from the site's own information instead of making things up.
 *
 * The facts are the ones finet.cl publishes, mostly its help page
 * (finet-clientes, `apps/view/app/ayuda/page.tsx`): when the site changes
 * them, change them here too. Plans and prices are not here: they come from
 * the live catalog (see CatalogService).
 */

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
});

function describePlan(plan: CatalogPlan): string {
  const kind = [plan.type, plan.segment].filter(Boolean).join(', ');
  const speed = plan.speedMbps !== null ? `${plan.speedMbps} Mbps, ` : '';
  const description = plan.description ? ` ${plan.description}` : '';
  return (
    `- ${plan.name}${kind ? ` (${kind})` : ''}: ` +
    `${speed}${clp.format(plan.monthlyPrice)} al mes.${description}`
  );
}

function catalogSection(plans: CatalogPlan[] | null, site: string): string {
  if (!plans?.length) {
    return (
      'Ahora no tienes el catálogo de planes. No des nombres de planes, ' +
      'precios ni velocidades: indica que puede verlos en ' +
      `${site}/planes o consultarlos por WhatsApp.`
    );
  }
  return [
    'Catálogo de planes vigente, el mismo que muestra el sitio (precios ' +
      'mensuales en pesos chilenos):',
    ...plans.map(describePlan),
    'Da nombres de planes, precios y velocidades solo de este catálogo, tal ' +
      'como aparecen. Para contratar, envía al cliente a ' +
      `${site}/planes. Si pregunta por promociones o descuentos, no los ` +
      'confirmes: no tienes esa información.',
  ].join('\n');
}

/** The facts only Finet published (its help page and finet.cl). */
function finetFacts(site: string, whatsapp: string): string[] {
  return [
    '- Finet (Fibernet Limitada) es un proveedor de Internet por fibra óptica ' +
      'de la Región Metropolitana. Su sitio es ' +
      `${site} y su WhatsApp, ${whatsapp}.`,
    '- Cobertura: La Pintana, La Granja, La Florida y Puente Alto, y la red ' +
      'se está expandiendo. En otras comunas no hay servicio: no lo ofrezcas, ' +
      'pero el cliente puede consultar por WhatsApp. No puedes confirmar si llega ' +
      'a una dirección exacta: el cliente puede revisarla en el mapa de ' +
      `${site}/cobertura o consultarla por WhatsApp.`,
    '- Para contratar se necesita un RUT chileno vigente y la dirección de ' +
      `instalación. Se contrata desde ${site}/planes, y Finet contacta al ` +
      'cliente en menos de 24 horas para coordinar la visita del técnico.',
    '- La instalación se agenda dentro de las 24 horas siguientes a la ' +
      'contratación y se hace en 24 a 72 horas hábiles, según la comuna. El ' +
      'técnico instala la fibra óptica y el router Wi-Fi y deja todo ' +
      'configurado.',
    '- Todos los planes de Internet tienen datos ilimitados.',
  ];
}

/**
 * The facts Cable Mágico gave (11-11): name, coverage, WhatsApp and hours.
 * Installation times and the like it did not give, so the engine sends those
 * questions to its WhatsApp instead of borrowing Finet's.
 */
function cableMagicoFacts(company: Company, site: string, whatsapp: string): string[] {
  return [
    `- ${company.name} (${company.legalName}) es un proveedor de Internet de ` +
      `${company.region}. Su sitio es ${site} y su WhatsApp, ${whatsapp}` +
      (company.hours ? `, que atiende ${company.hours}.` : '.'),
    `- Cobertura: ${company.coverage}. En otras comunas no hay servicio: no lo ` +
      'ofrezcas, pero el cliente puede consultar por WhatsApp. No puedes ' +
      'confirmar si llega a una dirección exacta: el cliente puede consultarla ' +
      'por WhatsApp.',
    '- Para contratar se necesita un RUT chileno vigente y la dirección de ' +
      `instalación. Se contrata desde ${site}/planes. Los plazos de contacto e ` +
      'instalación no los tienes: dilos por WhatsApp, no los supongas.',
  ];
}

/**
 * The company's facts and current catalog, for every turn the engine answers.
 * `site` is the company's site, without a trailing slash.
 */
export function companyContext(options: {
  company: Company;
  plans: CatalogPlan[] | null;
  site: string;
  whatsapp: string;
}): string {
  const { company, plans, site, whatsapp } = options;
  const facts =
    company.id === COMPANIES[1].id
      ? finetFacts(site, whatsapp)
      : cableMagicoFacts(company, site, whatsapp);
  return [
    `Eres el asistente de ${company.name}: responde siempre a su nombre.`,
    `Información de ${company.name}. Úsala para las consultas generales y no ` +
      'inventes nada que no esté aquí.',
    ...facts,
    '- Ante problemas de conexión, primero recomienda reiniciar el router ' +
      '(desconectarlo 30 segundos y volver a conectarlo). Si sigue, soporte ' +
      'atiende por WhatsApp o con un ticket desde el Portal Cliente.',
    '- El pago es mensual, con factura electrónica que llega por correo con ' +
      'su fecha de vencimiento. Cualquiera puede consultar la deuda de un RUT ' +
      `en ${site}/consultar-deuda, y el cliente ve sus facturas en el Portal ` +
      `Cliente (${site}/inicio-sesion).`,
    `- Otras páginas: planes para empresas en ${site}/empresas, televisión ` +
      `y canales en ${site}/tv, test de velocidad en ${site}/velocidad y ` +
      `preguntas frecuentes en ${site}/ayuda.`,
    '',
    catalogSection(plans, site),
    '',
    'Si te preguntan algo que no está en esta información (por ejemplo ' +
      'plazos de contrato, equipos, canales de TV o horarios), no lo ' +
      'supongas: dilo, sugiere la página que corresponda u ofrece derivar con ' +
      'una persona del equipo.',
  ].join('\n');
}

/** Finet's context: what every turn got before there were two companies. */
export function finetContext(options: {
  plans: CatalogPlan[] | null;
  site: string;
  whatsapp: string;
}): string {
  return companyContext({ company: COMPANIES[1], ...options });
}
