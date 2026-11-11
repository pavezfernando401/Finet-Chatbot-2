import { COMPANIES, companyOf, isCompanyId } from './companies.js';

/** The two companies of the portal, with finet-clientes' empresa ids. */
describe('companies', () => {
  it('Finet is company 1 and Cable Mágico company 2', () => {
    expect(COMPANIES[1].name).toBe('Finet');
    expect(COMPANIES[2].name).toBe('Cable Mágico');
  });

  it('Cable Mágico serves Algarrobo and El Quisco, under its own site path', () => {
    expect(COMPANIES[2].coverage).toBe('Algarrobo y El Quisco');
    expect(COMPANIES[2].sitePath).toBe('/cable-magico');
    expect(COMPANIES[1].sitePath).toBe('');
  });

  it('an unknown or missing company is Finet', () => {
    expect(companyOf(2)).toBe(COMPANIES[2]);
    expect(companyOf(7)).toBe(COMPANIES[1]);
    expect(companyOf(undefined)).toBe(COMPANIES[1]);
    expect(isCompanyId(2)).toBe(true);
    expect(isCompanyId('2')).toBe(false);
  });
});
