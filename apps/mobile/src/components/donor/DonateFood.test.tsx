import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DonateFood from '../../app/donor/(tabs)/donate';
import { normalizeIndianPhone, selectedTimeToIso, validateDonationTimes } from './LiveDonate';

const { state } = vi.hoisted(() => ({ state: { mode: 'live' as 'live' | 'demo' } }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@react-native-community/datetimepicker', () => ({ default: () => null, DateTimePickerAndroid: { open: vi.fn() } }));
vi.mock('../../api/foodRequests', () => ({ createFoodRequest: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pressable: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock('../../constants/theme', () => ({ C: { ink: '#111', muted: '#666', green: '#080', greenSoft: '#eee', white: '#fff', line: '#ddd' } }));
vi.mock('../../context/AppContext', () => ({ useApp: () => ({
  mode: state.mode,
  donor: { organization: '', address: '', name: '', phone: '' },
  notify: vi.fn(), submitRequest: vi.fn(),
}) }));
vi.mock('../common/UI', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Header: ({ title }: { title: string }) => <h1>{title}</h1>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Sheet: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
  T: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Field: ({ label }: { label: string }) => <input aria-label={label} />,
  Icon: () => <span />,
  Button: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
}));

describe('donor request mode boundary', () => {
  it('renders the backend-required form after live sign-in', () => {
    state.mode = 'live';
    const html = renderToStaticMarkup(<DonateFood />);
    expect(html).toContain('Food prepared');
    expect(html).toContain('Pickup deadline');
    expect(html).toContain('Handling requirements');
    expect(html).toContain('How many different food items are you donating?');
    expect(html).toContain('Food Item 1');
    expect(html).toMatch(/<button>Submit pickup request<\/button>/);
  });

  it('preserves the demo request action', () => {
    state.mode = 'demo';
    const html = renderToStaticMarkup(<DonateFood />);
    expect(html).not.toContain('Food prepared');
    expect(html).toMatch(/<button>Submit pickup request<\/button>/);
  });
});

describe('donor input normalization', () => {
  it('normalizes Indian mobile numbers and rejects duplicated prefixes', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('919876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91+919876543210')).toBeNull();
    expect(normalizeIndianPhone('1234567890')).toBeNull();
  });
  it('uses the selected local calendar date and clock time for UTC transport', () => {
    const date = new Date(2026, 11, 31);
    expect(selectedTimeToIso({ date, hour: 23, minute: 59 })).toBe(new Date(2026, 11, 31, 23, 59).toISOString());
    expect(selectedTimeToIso({ date, hour: null, minute: null })).toBeNull();
  });
  it('accepts midnight rollover and explains invalid ordering or expired deadlines', () => {
    const prepared = '2026-12-31T18:00:00.000Z';
    const ready = '2026-12-31T19:00:00.000Z';
    const deadline = '2027-01-01T01:00:00.000Z';
    const now = new Date('2026-12-31T12:00:00.000Z');
    expect(validateDonationTimes(prepared, ready, deadline, now)).toBeNull();
    expect(validateDonationTimes(ready, prepared, deadline, now)).toContain('Food ready');
    expect(validateDonationTimes(prepared, deadline, ready, now)).toContain('Pickup deadline');
    expect(validateDonationTimes(prepared, ready, deadline, new Date('2027-01-02T00:00:00Z'))).toContain('future');
  });
});
