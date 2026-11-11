import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWebMessageDto } from './create-web-message.dto.js';

const valid = {
  sessionId: '3f2b8e1c-5d4a-4f6b-9c7d-1e2f3a4b5c6d',
  content: 'hola',
};

async function errors(body: Record<string, unknown>) {
  return validate(plainToInstance(CreateWebMessageDto, body));
}

/** The site tells which company's site the visitor is on (Finet or Cable Mágico). */
describe('CreateWebMessageDto', () => {
  it('accepts the company of the site', async () => {
    expect(await errors({ ...valid, companyId: 2 })).toHaveLength(0);
    expect(await errors(valid)).toHaveLength(0);
  });

  it('rejects a company that does not exist', async () => {
    expect(await errors({ ...valid, companyId: 3 })).not.toHaveLength(0);
    expect(await errors({ ...valid, companyId: '2' })).not.toHaveLength(0);
  });
});
