{
  "name": "__APP_NAME__",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@intelligo/admin": "__INTELLIGO_DEP__",
    "@intelligo/audit": "__INTELLIGO_DEP__",
    "@intelligo/auth": "__INTELLIGO_DEP__",
    "@intelligo/billing": "__INTELLIGO_DEP__",
    "@intelligo/core": "__INTELLIGO_DEP__",
    "@intelligo/executions": "__INTELLIGO_DEP__",
    "@intelligo/ui": "__INTELLIGO_DEP__",
    "@radix-ui/react-slot": "^1.2.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.563.0",
    "next": "^16.2.3",
    "next-intl": "^4.9.2",
    "next-themes": "^0.4.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "server-only": "^0.0.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4",
    "tw-animate-css": "^1.4.0",
    "typescript": "^5.7.2"
  }
}
