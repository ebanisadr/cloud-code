When you believe your work is complete:

1. Verify all changes compile/build successfully
2. Run any relevant tests
3. Provide a summary of what you changed and why
4. List any testing you performed
5. Say "CLOUD_CODE_DONE" followed by your summary

The harness will then:
- Mark the PR as ready for review
- Update the PR description with your summary
- Add `Fixes #XX` to auto-close the issue on merge
- Label the issue as `cloud-code:needs-qa`
