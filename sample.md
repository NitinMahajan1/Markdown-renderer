# Welcome to Markdown Renderer

A **beautiful** macOS app for viewing Markdown files with syntax highlighting.

## Features

- 🎨 **Dark & Light themes** with smooth transitions
- 📁 **Drag-and-drop** file support
- 🖥️ **Native macOS** look and feel
- ✨ **Syntax highlighting** for code blocks

## Code Example

```javascript
function greet(name) {
  return `Hello, ${name}! Welcome to Markdown Renderer.`;
}

console.log(greet('World'));
```

```python
def fibonacci(n):
    """Generate first n Fibonacci numbers."""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

print(list(fibonacci(10)))
```

## Table

| Feature | Status | Notes |
|---------|--------|-------|
| Markdown rendering | ✅ | Full GFM support |
| Syntax highlighting | ✅ | 190+ languages |
| Dark mode | ✅ | Default theme |
| Light mode | ✅ | Toggle with button |
| Drag & drop | ✅ | Drop files anywhere |

## Blockquote

> "The best way to predict the future is to invent it."
> — Alan Kay

## Task List

- [x] Set up Electron app
- [x] Add markdown parsing
- [x] Style with dark theme
- [x] Build DMG installer
- [ ] Enjoy using it! 🎉

---

*Built with ❤️ using Electron, marked, and highlight.js*
