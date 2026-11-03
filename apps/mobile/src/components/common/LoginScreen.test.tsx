import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';


vi.mock('react-native', () => ({
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Linking: { openURL: vi.fn() },
}));
vi.mock('expo-router', () => ({ Redirect: () => null }));
vi.mock('../../constants/theme', () => ({ C: { ink: '#111', muted: '#666', greenSoft: '#eee', red: '#f00' } }));
vi.mock('../../context/AppContext', () => ({ useApp: () => ({ role: null, volunteerApplicationStatus: null, notify: vi.fn() }) }));
vi.mock('../../api/auth', () => ({ isLiveAuthConfigured: () => true, signInWithEmail: vi.fn(), signOut: vi.fn() }));
vi.mock('../../api/volunteers', () => ({ registerVolunteer: vi.fn() }));
vi.mock('./UI', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Header: ({ title }: { title: string }) => <h1>{title}</h1>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  T: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Field: ({ label }: { label: string }) => <input aria-label={label} />,
  Icon: () => <span />,
  LanguageSwitcher: () => null,
  Button: ({ title }: { title: string }) => <button>{title}</button>,
}));

describe('pilot sign-in screen', () => {
  it.each(['donor', 'volunteer'] as const)('%s exposes one real sign-in path and no demo bypass', role => {
    const html = renderToStaticMarkup(<LoginScreen role={role} />);
    expect(html.match(/<button>Sign in<\/button>/g)).toHaveLength(1);
    expect(html).not.toContain('Use demo account');
    expect(html).not.toContain('Sign in to shared API');
    expect(html).toContain('Email address');
  });

  it('offers donor registration with email confirmation while keeping a single sign-in control', () => {
    const html = renderToStaticMarkup(<LoginScreen role="donor" />);
    expect(html.match(/<button>Sign in<\/button>/g)).toHaveLength(1);
    expect(html).toContain('Register as Donor');
    expect(html).not.toContain('Phone verification');
    expect(html).not.toContain('Demo account');
  });
});
