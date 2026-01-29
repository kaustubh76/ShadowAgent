# Toast Notification System Guide

## Overview

ShadowAgent now includes a lightweight, accessible toast notification system for displaying user-facing messages. This replaces raw `console.error()` statements with proper UI feedback.

---

## Quick Start

### 1. Import the Hook

```typescript
import { useToast } from '../contexts/ToastContext';
```

### 2. Use in Component

```typescript
function MyComponent() {
  const toast = useToast();

  const handleAction = async () => {
    try {
      await riskyOperation();
      toast.success('Operation completed successfully!');
    } catch (error) {
      toast.error('Failed to complete operation');
    }
  };

  return <button onClick={handleAction}>Do Something</button>;
}
```

---

## API Reference

### `useToast()` Hook

Returns an object with the following methods:

| Method | Signature | Description |
|--------|-----------|-------------|
| `success` | `(message: string) => void` | Green success toast |
| `error` | `(message: string) => void` | Red error toast |
| `warning` | `(message: string) => void` | Yellow warning toast |
| `info` | `(message: string) => void` | Blue info toast |
| `showToast` | `(message: string, type?: ToastType) => void` | Generic method |

### Toast Types

```typescript
type ToastType = 'success' | 'error' | 'info' | 'warning';
```

---

## Usage Examples

### Success Messages

```typescript
// Agent registration
toast.success('Agent registered successfully!');

// Transaction confirmed
toast.success('Transaction confirmed on-chain');

// Data saved
toast.success('Settings saved');
```

### Error Messages

```typescript
// Registration failed
toast.error('Failed to register agent');

// Network error
toast.error('Unable to connect to network');

// Validation error
toast.error('Invalid endpoint URL');
```

### Warning Messages

```typescript
// Non-critical issues
toast.warning('Transaction still pending after 60 seconds');

// Resource limits
toast.warning('Approaching maximum bond amount');

// Deprecated features
toast.warning('This feature will be removed in v2.0');
```

### Info Messages

```typescript
// Status updates
toast.info('Transaction submitted to network');

// Feature announcements
toast.info('New tier system now available');

// Tips
toast.info('Pro tip: Use HTTPS endpoints for better security');
```

---

## Design Decisions

### When to Use Toasts

✅ **Use toasts for:**
- Critical errors that block user actions (registration failures, network errors)
- Success confirmations for important actions (registration, transactions)
- Warnings about resource limits or deprecated features
- Status updates for long-running operations

❌ **Don't use toasts for:**
- Non-critical background failures (balance fetching, metrics)
- Nice-to-have features (copy to clipboard)
- Debugging information (use `console.log` in DEV mode instead)
- Information already shown in the UI

### Silent Failures

Some operations fail silently without toasts:

1. **Balance fetching**: Uses cached balance instead
2. **Copy to clipboard**: Falls back to manual copy
3. **Registration status check**: Might just not be registered

**Rationale:** These are non-critical features that shouldn't interrupt the user experience with error messages.

### Development Mode Logging

Console errors are still logged in development mode:

```typescript
if (import.meta.env.DEV) {
  console.error('Detailed error for debugging:', error);
}
```

This helps developers debug issues while keeping production console clean.

---

## Accessibility Features

### Screen Reader Support

- All toasts have `role="alert"`
- Container has `aria-live="polite"` for announcements
- Icons + text for redundant communication

### Keyboard Navigation

- Close button is keyboard accessible (Tab + Enter)
- Auto-dismiss after 5 seconds (doesn't trap focus)

### Color Independence

- Each type has unique icon (not color-dependent)
- High contrast text and borders
- Works for colorblind users

---

## Visual Design

### Position & Layout

- **Location**: Bottom-right corner of viewport
- **Stacking**: Vertical stack, newest on bottom
- **Max width**: 384px (24rem)
- **Spacing**: 0.5rem gap between toasts

### Animation

- **Entry**: Slide in from right (0.3s ease-out)
- **Exit**: Fade out (handled automatically)
- **Duration**: 5 seconds before auto-dismiss

### Color Scheme

| Type | Background | Border | Icon Color |
|------|------------|--------|------------|
| Success | `bg-green-500/10` | `border-green-500/30` | Green 400 |
| Error | `bg-red-500/10` | `border-red-500/30` | Red 400 |
| Warning | `bg-yellow-500/10` | `border-yellow-500/30` | Yellow 400 |
| Info | `bg-blue-500/10` | `border-blue-500/30` | Blue 400 |

---

## Configuration

### Duration

Default auto-dismiss duration is 5 seconds. Configured in:

**[src/contexts/ToastContext.tsx:16](shadow-frontend/src/contexts/ToastContext.tsx#L16)**
```typescript
const TOAST_DURATION = 5000; // milliseconds
```

To change, edit this constant and rebuild.

### Max Toasts

Currently unlimited. To limit visible toasts:

```typescript
// In ToastProvider, modify showToast:
setToasts((prev) => {
  const newToasts = [...prev, toast];
  return newToasts.slice(-3); // Keep only last 3
});
```

---

## Migration Guide

### From console.error

**Before:**
```typescript
catch (error) {
  console.error('Registration failed:', error);
  setError('Registration failed');
}
```

**After:**
```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Registration failed';
  setError(errorMessage);
  toast.error(errorMessage);
}
```

### From alert()

**Before:**
```typescript
if (success) {
  alert('Agent registered!');
}
```

**After:**
```typescript
if (success) {
  toast.success('Agent registered successfully!');
}
```

---

## Technical Implementation

### Architecture

1. **ToastContext.tsx**: React Context provider with state management
2. **App.tsx**: Wraps entire app with `<ToastProvider>`
3. **useToast hook**: Consumed by any component needing toasts
4. **CSS animations**: Defined in `index.css`

### State Management

```typescript
interface Toast {
  id: string;           // Unique identifier
  message: string;      // Toast content
  type: ToastType;      // Visual styling
}
```

Toasts are stored in React state array. Each toast auto-removes after 5 seconds using `setTimeout`.

### Zero Dependencies

The toast system uses only:
- React (already in project)
- Lucide React icons (already in project)
- Native browser APIs (clipboard, setTimeout)

No external toast libraries required.

---

## Browser Compatibility

**Supported:**
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Features used:**
- CSS backdrop-filter (glassmorphism)
- CSS animations (keyframes)
- React Context API
- ES6+ JavaScript

---

## Testing Checklist

### Manual Testing

- [ ] Error toast appears on registration failure
- [ ] Success toast appears on registration success
- [ ] Multiple toasts stack correctly (create 3+ errors rapidly)
- [ ] Toast auto-dismisses after 5 seconds
- [ ] Close button dismisses toast immediately
- [ ] Toast is readable on light/dark backgrounds
- [ ] Screen reader announces toast message
- [ ] Keyboard can focus and activate close button

### Browser Testing

- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Future Enhancements

### Recommended

1. **Toast Queue**: Limit to 3 visible toasts, queue the rest
2. **Action Buttons**: Add optional action button to toasts
3. **Persistent Toasts**: Add `persistent: true` option (no auto-dismiss)
4. **Position Options**: Support top-right, top-left, bottom-left
5. **Sound Effects**: Optional sound for error toasts (accessibility)

### Not Recommended

- ❌ Custom duration per toast (inconsistent UX)
- ❌ HTML content in messages (XSS risk)
- ❌ Animated GIFs or complex content (distraction)
- ❌ Blocking toasts that require dismissal (interrupts flow)

---

## Troubleshooting

### Toast Doesn't Appear

**Check:**
1. Is `<ToastProvider>` wrapping your component in App.tsx?
2. Are you calling `useToast()` inside a functional component?
3. Is the toast being created successfully? (check React DevTools)
4. Is there a CSS issue hiding the toast? (check z-index)

### Toast Position Wrong

**Fix:** Adjust position in ToastContext.tsx:
```typescript
<div className="fixed bottom-4 right-4 z-50">
  {/* Change bottom-4 right-4 to desired position */}
</div>
```

### Accessibility Issues

**Check:**
- Is `aria-live="polite"` present on container?
- Does each toast have `role="alert"`?
- Is close button keyboard accessible?
- Are icons + text both present (redundant communication)?

---

## License

MIT License - Same as main project

---

**Last Updated:** January 27, 2026
**Version:** v0.2.0
**Status:** ✅ Production Ready
