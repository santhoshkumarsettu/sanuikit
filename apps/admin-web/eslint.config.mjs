import tseslint from 'typescript-eslint'

export default tseslint.config({ ignores: ['**/.next/**', '**/out/**', '**/build/**', '**/next-env.d.ts', '**/node_modules/**'] }, ...tseslint.configs.recommended)
