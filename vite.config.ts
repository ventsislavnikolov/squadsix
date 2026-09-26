import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig(({ mode }) => {
  // Server code reads secrets from process.env (that is what Vercel provides). Locally,
  // pull them from .env.local so `pnpm dev` behaves the same. Nothing here is VITE_-prefixed,
  // so none of it reaches the browser bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''), process.env)

  return {
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), nitro(), tailwindcss(), tanstackStart(), viteReact()],
  }
})
