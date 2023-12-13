# RubyGems ChangeLog Urls Reporter

A GitHub Action that report changelog urls of updated rubygems.

## Usage:

The action works only with `pull_request` event.

### Inputs

- `githubToken` - The GITHUB_TOKEN secret.
- `rubygemsToken` - A API token of rubygems.org. Required scope is `Index rubygems`

## Example

```yaml
name: Gem ChangeLog
on:
  pull_request:
    paths:
      - "Gemfile.lock"

jobs:
  rubygems_changelog:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: kzkn/rubygems-changelog-url-action@v1
        with:
          githubToken: ${{ secrets.GITHUB_TOKEN }}
          rubygemsToken: ${{ secrets.RUBYGEMS_TOKEN }}
```
