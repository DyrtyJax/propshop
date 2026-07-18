# Releasing PropShop

PropShop publishes to npm through GitHub Actions trusted publishing. The workflow uses a short-lived OpenID Connect identity, so releases do not require an npm token or a time-based one-time password.

## One-time npm configuration

Open the `propshop` package settings on npmjs.com, add a **Trusted Publisher**, and choose GitHub Actions with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `DyrtyJax` |
| Repository | `propshop` |
| Workflow filename | `publish.yml` |
| Allowed action | `npm publish` |

The workflow filename is case-sensitive. Do not add an npm token to the repository or to GitHub Actions secrets.

After trusted publishing works, npm recommends setting the package's publishing access to **Require two-factor authentication and disallow tokens**. Trusted publishing continues to work because it uses OIDC rather than a traditional access token.

## Normal release flow

1. Update `package.json` and `package-lock.json` to the release version.
2. Merge the change to `main` after CI passes.
3. Publish a GitHub Release tagged `v<package version>`.
4. The `publish-npm` workflow verifies that the tag matches `package.json`, runs the package's checks and build through `prepublishOnly`, and publishes to npm.

The workflow also supports manual dispatch for recovery or for a GitHub Release that predates the workflow:

```sh
gh workflow run publish.yml --repo DyrtyJax/propshop --ref main
gh run watch --repo DyrtyJax/propshop
```

Manual dispatch publishes the version currently declared on `main`. npm rejects a duplicate version, so bump the package version before retrying an already-published release.
