import { Controller, Get } from '@nestjs/common';

/**
 * Liveness check for whatever keeps the process running (systemd, PM2, a
 * load balancer). It only says the process answers: it does not call the
 * engine or finet-clientes, so it costs nothing to poll.
 */
@Controller()
export class AppController {
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
