---
description: Automatically fix linting and formatting issues across the project
---

1. **Run ESLint Fix**:
   - Attempt to automatically fix all fixable ESLint errors.
     // turbo
   - Run `npm run lint -- --fix`

2. **Run Prettier**:
   - Format all files in the project to ensure consistent style.
     // turbo
   - Run `npx prettier --write .`

3. **Pro Tips**:
   - Run this before every commit to keep your codebase clean.
   - Configure your editor to 'Format on Save' for real-time feedback.
