import * as core from '@actions/core'
import * as github from '@actions/github'
import * as cache from '@actions/cache'
import fetch from 'node-fetch'
import * as fs from 'fs'
import replaceComment from '@aki77/actions-replace-comment'
import {markdownTable} from 'markdown-table'
import {Gem, searchChangeLogUrl} from 'rubygems-changelog-url'
import {parseDiff, AddedRubyGems} from './diff'

async function listUpdatedRubyGems(): Promise<AddedRubyGems[]> {
  const token = core.getInput('githubToken')
  const octokit = github.getOctokit(token)

  if (core.isDebug()) {
    const rateLimit = await octokit.request('GET /rate_limit')
    console.log('rate limit', rateLimit) // eslint-disable-line no-console
  }

  const {data: pullRequest} = await octokit.rest.pulls.get({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: github.context.issue.number,
    mediaType: {
      format: 'diff'
    }
  })

  return parseDiff(pullRequest.toString())
}

function majorVersion(version: string): string {
  return version.split('.')[0]
}

function isMajorVersionUp(gem: AddedRubyGems): boolean {
  return (
    !!gem.oldVersion &&
    majorVersion(gem.oldVersion) !== majorVersion(gem.newVersion)
  )
}

async function fetchRubyGemsDescription(
  gemname: string,
  version: string
): Promise<Gem | null> {
  const token = core.getInput('rubygemsToken')
  const headers = {
    Authorization: token,
    'Content-Type': 'application/json'
  }

  const res = await fetch(
    `https://rubygems.org/api/v2/rubygems/${gemname}/versions/${version}.json`,
    {
      headers
    }
  )
  // if (!res.ok) {
  //   res = await fetch(`https://rubygems.org/api/v1/gems/${gemname}.json`, {
  //     headers
  //   })
  // }
  if (!res.ok) {
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gem = (await res.json()) as any
  return {
    name: gem['name'],
    projectUri: gem['project_uri'],
    homepageUri: gem['homepage_uri'],
    sourceCodeUri: gem['source_code_uri'],
    changelogUri: gem['changelog_uri'],
    licenses: gem['licenses']
  }
}

type GemWithChangeLogUrl = {
  gem: Gem
  changeLogUrl: string | null
}

async function rubyGemsChangeLogUrl(
  gem: Gem,
  option?: {token: string}
): Promise<GemWithChangeLogUrl> {
  try {
    let [found, changeLogUrl] = await findChangeLogUrlFromCache(gem) // eslint-disable-line prefer-const
    if (!found) {
      changeLogUrl = await searchChangeLogUrl(gem, option)
    }
    return {gem, changeLogUrl}
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.info(`[warning] rubyGemsChangeLogUrl: ${error.message}`)
    } else {
      core.info(`[warning] rubyGemsChangeLogUrl: ${error}`)
    }
    return {gem, changeLogUrl: null}
  }
}

let restoredCache: Map<string, string | null>
async function findChangeLogUrlFromCache(
  gem: Gem
): Promise<[boolean, string | null]> {
  if (!restoredCache) {
    const hit = await cache.restoreCache(
      ['changelogs.json'],
      `changelogs-${github.context.issue.number}`,
      ['changelogs-']
    )
    restoredCache = new Map()
    if (hit) {
      core.debug(`cache hit: ${hit}`)
      const content = fs.readFileSync('changelogs.json')
      const cachedChangelogs = JSON.parse(content.toString()) as {
        [key: string]: string | null
      }
      for (const [k, v] of Object.entries(cachedChangelogs)) {
        restoredCache.set(k, v)
      }
    } else {
      core.debug('no cache')
    }
  }

  if (restoredCache.has(gem.name)) {
    return [true, restoredCache.get(gem.name) || null]
  } else {
    return [false, null]
  }
}

async function saveCache(changelogs: GemWithChangeLogUrl[]): Promise<void> {
  const hash: {[key: string]: string | null} = changelogs.reduce(
    (obj, {gem, changeLogUrl}) => ({...obj, [gem.name]: changeLogUrl}),
    {}
  )
  const content = JSON.stringify(hash)
  fs.writeFileSync('changelogs.json', content)

  const paths = ['changelogs.json']
  const key = `changelogs-${github.context.issue.number}`
  try {
    await cache.saveCache(paths, key)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === cache.ValidationError.name) {
        throw error
      } else if (error.name === cache.ReserveCacheError.name) {
        core.info(error.message)
      } else {
        core.info(`[warning]${error.message}`)
      }
    } else {
      core.info(`[warning]${error}`)
    }
  }
}

function generateReport(
  changelogs: GemWithChangeLogUrl[],
  versions: Map<string, AddedRubyGems>
): string {
  return markdownTable([
    ['Gem', 'License', 'Before', 'After', 'ChangeLog URL'],
    ...changelogs.map(({gem, changeLogUrl}) => [
      gem.name,
      (gem.licenses || []).join(),
      versions.get(gem.name)?.oldVersion || '-',
      versions.get(gem.name)?.newVersion || '-',
      changeLogUrl || `https://rubygems.org/gems/${gem.name}`
    ])
  ])
}

async function postComment(title: string, text: string): Promise<void> {
  await replaceComment({
    token: core.getInput('githubToken'),
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: github.context.issue.number,
    body: `## ${title}
${text}
`
  })
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null
}

async function run(): Promise<void> {
  try {
    core.debug('listing rubygems')
    const updatedRubyGems = await listUpdatedRubyGems()
    if (updatedRubyGems.length === 0) {
      return
    }

    core.debug('fetch rubygems descriptions from rubygems.org')
    const rubygemsDescs = await Promise.all(
      updatedRubyGems.map(
        async gem => await fetchRubyGemsDescription(gem.name, gem.newVersion)
      )
    )
    if (rubygemsDescs.length === 0) {
      return
    }

    core.debug('search rubygems changelog urls')
    const changelogUrls: GemWithChangeLogUrl[] = []
    for (const gem of rubygemsDescs.filter(isNotNull)) {
      core.debug(`search rubygems changelog urls: ${gem.name}`)
      const url = await rubyGemsChangeLogUrl(gem, {
        token: core.getInput('githubToken')
      })
      core.debug(
        `search rubygems changelog urls: ${gem.name} => ${url.changeLogUrl}`
      )
      changelogUrls.push(url)
    }

    await saveCache(changelogUrls)

    core.debug('post report, start')
    const versions = new Map(updatedRubyGems.map(gem => [gem.name, gem]))
    const majorVersionUps = changelogUrls.filter(({gem}) => {
      const gemver = versions.get(gem.name)
      return gemver && isMajorVersionUp(gemver)
    })
    if (majorVersionUps.length > 0) {
      const majorVerUpReport = generateReport(majorVersionUps, versions)
      await postComment(':warning: Major Version Up', majorVerUpReport)
    }

    const fullReport = generateReport(changelogUrls, versions)
    await postComment('Updated RubyGems ChangeLog URLs', fullReport) // eslint-disable-line i18n-text/no-en
    core.debug('post report, finish')
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.info(`[warning]${error}`)
    }
  }
}

run()
