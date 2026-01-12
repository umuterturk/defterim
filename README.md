# Defterim

A beautiful, distraction-free note-taking app for your writings and poems. Built with React, TypeScript, and Firebase.

**Defterim** means "my notebook" in Turkish.

## Features

- **Distraction-free Writing** - Clean, minimal editor focused on your content
- **Automatic Cloud Sync** - Your writings sync across all your devices via Firebase
- **Offline Support** - Write anytime, sync when you're back online
- **Type Organization** - Categorize as Şiir (Poem), Yazı (Prose), or Diğer (Other)
- **Search & Filter** - Find writings quickly with search and type filters
- **Auto-save** - Changes are automatically saved as you write

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Material UI (components)
- Firebase (Firestore + Anonymous Auth)
- IndexedDB (offline storage)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── contexts/       # React Context providers
├── hooks/          # Custom hooks
├── pages/          # Route pages
├── services/       # Business logic (storage, sync)
├── types/          # TypeScript types
└── config/         # Configuration (Firebase)
```

## License

MIT
