import tseslint from 'typescript-eslint'
export default tseslint.config({ files: ['src/**/*.ts'], ignores: ['src/**/*.test.ts'] }, ...tseslint.configs.recommended)
