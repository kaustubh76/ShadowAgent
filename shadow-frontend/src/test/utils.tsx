import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '../contexts/ToastContext';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <ToastProvider>{children}</ToastProvider>
    </BrowserRouter>
  );
}

const customRender = (ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
