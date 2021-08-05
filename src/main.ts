import * as core from '@actions/core'
import * as github from '@actions/github'
import * as cache from '@actions/cache'
import * as https from 'https'
import * as fs from 'fs'
import replaceComment from '@aki77/actions-replace-comment'
import {markdownTable} from 'markdown-table'
import {Gem, searchChangeLogUrl} from 'rubygems-changelog-url'
import {parseDiff} from './diff'

async function listUpdatedRubyGems(): Promise<string[]> {
  const token = core.getInput('githubToken')
  const octokit = github.getOctokit(token)

  if (core.isDebug()) {
    const rateLimit = await octokit.request('GET /rate_limit')
    console.log('rate limit', rateLimit)
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

async function fetchRubyGemsDescription(gemname: string): Promise<Gem | null> {
  const token = core.getInput('rubygemsToken')
  return new Promise<Gem | null>(resolve => {
    const options = {
      hostname: 'rubygems.org',
      port: 443,
      path: `/api/v1/gems/${gemname}.json`,
      method: 'GET',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      }
    }
    const req = https.request(options, res => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        let data = ''
        res.on('data', chunk => {
          data += chunk
        })
        res.on('end', () => {
          const gem = JSON.parse(data)
          resolve({
            name: gem['name'],
            projectUri: gem['project_uri'],
            homepageUri: gem['homepage_uri'],
            sourceCodeUri: gem['source_code_uri'],
            changelogUri: gem['changelog_uri']
          })
        })
      } else {
        resolve(null)
      }
    })

    req.end()
  })
}

type GemWithChangeLogUrl = {
  gem: Gem
  changeLogUrl: string | null
}

async function rubyGemsChangeLogUrl(gem: Gem, option?: { token: string }): Promise<GemWithChangeLogUrl> {
  let [found, changeLogUrl] = await findChangeLogUrlFromCache(gem)
  if (!found) {
    changeLogUrl = await searchChangeLogUrl(gem, option)
  }
  return { gem, changeLogUrl }
}

let restoredCache: Map<string, string | null>
async function findChangeLogUrlFromCache(gem: Gem): Promise<[boolean, string | null]> {
  if (!restoredCache) {
    const hit = await cache.restoreCache(['changelogs.json'], `changelogs-${github.context.issue.number}`, ['changelogs-'])
    restoredCache = new Map()
    if (hit) {
      core.debug(`cache hit: ${hit}`)
      const content = fs.readFileSync('changelogs.json')
      const cachedChangelogs = JSON.parse(content.toString()) as { [key: string]: string | null }
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
  const hash: { [key: string]: string | null } =
    changelogs.reduce((obj, { gem, changeLogUrl }) => ({ ...obj, [gem.name]: changeLogUrl }), {})
  const content = JSON.stringify(hash)
  fs.writeFileSync('changelogs.json', content)

  const paths = ['changelogs.json']
  const key = `changelogs-${github.context.issue.number}`
  try {
    await cache.saveCache(paths, key)
  } catch (error) {
    if (error.name === cache.ValidationError.name) {
      throw error
    } else if (error.name === cache.ReserveCacheError.name) {
      core.info(error.message)
    } else {
      core.info(`[warning]${error.message}`)
    }
  }
}

function generateReport(changelogs: GemWithChangeLogUrl[]): string {
  return markdownTable([
    ['Gem', 'ChangeLog URL'],
    ...changelogs.map(({gem, changeLogUrl}) => [
      gem.name,
      changeLogUrl || `https://rubygems.org/gems/${gem.name}`
    ])
  ])
}

async function postComment(text: string): Promise<void> {
  await replaceComment({
    token: core.getInput('githubToken'),
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: github.context.issue.number,
    body: `## Updated RubyGems ChangeLog URLs
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
      updatedRubyGems.map(async gem => await fetchRubyGemsDescription(gem))
    )
    if (rubygemsDescs.length === 0) {
      return
    }

    core.debug('search rubygems changelog urls')
    const changelogUrls: GemWithChangeLogUrl[] = []
    for (const gem of rubygemsDescs.filter(isNotNull)) {
      core.debug(`search rubygems changelog urls: ${gem.name}`)
      const url = await rubyGemsChangeLogUrl(gem, { token: core.getInput('githubToken') })
      core.debug(`search rubygems changelog urls: ${gem.name} => ${url.changeLogUrl}`)
      changelogUrls.push(url)
    }

    await saveCache(changelogUrls)

    core.debug('post report')
    const report = generateReport(changelogUrls)
    await postComment(report)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
