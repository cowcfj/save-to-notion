---
description: Standardize pull request descriptions for better code reviews
---

1. **Create Template Directory**:
   - GitHub looks for templates in `.github/` folder.
     // turbo
   - Run `mkdir -p .github`

2. **Create Pull Request Template**:
   - Create the template file with structured content.
     `markdown\n   ## Description\n   Briefly describe what this PR does.\n   \n   ## Type of Change\n   - [ ] Bug fix\n   - [ ] New feature\n   - [ ] Breaking change\n   - [ ] Documentation update\n   \n   ## Testing\n   - [ ] I have tested these changes locally\n   - [ ] I have added/updated tests\n   - [ ] All tests pass\n   \n   ## Screenshots (if applicable)\n   \n   ## Checklist\n   - [ ] My code follows the project's style guidelines\n   - [ ] I have performed a self-review\n   - [ ] I have commented complex code\n   - [ ] I have updated documentation\n   - [ ] No new warnings generated\n   \n   ## Related Issues\n   Closes #\n   `\n - Save this as `.github/PULL_REQUEST_TEMPLATE.md`\n
3. **Commit and Push**:
   - Add the template to your repository.
     // turbo
   - Run `git add .github/PULL_REQUEST_TEMPLATE.md && git commit -m \"Add PR template\" && git push`

4. **Test It**:
   - Create a new PR and the template will auto-populate.

5. **Pro Tips**:
   - Customize the template for your team's workflow.
   - Add a link to your contributing guidelines.
   - Use multiple templates for different PR types (create `.github/PULL_REQUEST_TEMPLATE/` folder).
