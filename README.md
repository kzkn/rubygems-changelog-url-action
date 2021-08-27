# RubyGems ChangeLog Urls Reporter

A GitHub Action that report changelog urls of updated rubygems.

## Usage:

The action works only with `pull_request` event.

### Inputs

- `githubToken` - The GITHUB_TOKEN secret.
- `rubygemsToken` - A API token of rubygems.org. Required scope is `Index rubygems`

## Example

```yaml
name: Tests
on:
  pull_request:

jobs:
  build:
    steps:
      - uses: kzkn/rubygems-changelog-url-action@v1
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          rubygemsToken: ${{ secrets.RUBYGEMS_TOKEN }}
```
