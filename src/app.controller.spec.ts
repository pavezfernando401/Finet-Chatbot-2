import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('says the process is up', () => {
    expect(new AppController().health()).toEqual({ status: 'ok' });
  });
});
