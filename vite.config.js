import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

let base = '/referanskontrol/'
try {
  const remoteUrl = execSync('git config --get remote.origin.url').toString().trim()
  const match = remoteUrl.match(/\/([^/]+)\.git$/)
  if (match) {
    base = `/${match[1]}/`
  }
} catch (e) {
  // fallback if git command fails or is not inside a repository
}

export default defineConfig({
  plugins: [react()],
  base: base,
})
