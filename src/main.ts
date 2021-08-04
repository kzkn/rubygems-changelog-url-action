import * as core from '@actions/core'
import * as github from '@actions/github'
import * as https from 'https'
import replaceComment from '@aki77/actions-replace-comment'
import { markdownTable } from 'markdown-table'
import { Gem, searchChangeLogUrl } from 'rubygems-changelog-url'

async function listUpdatedRubyGems(): Promise<string[]> {
  const token = core.getInput('githubToken')
  const octokit = github.getOctokit(token)
  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: github.context.issue.number,
    mediaType: {
      format: 'diff'
    }
  })

  console.log('foo', pullRequest)

  return ['csv', 'activerecord']
}

function fetchRubyGemsDescription(gemname: string): Promise<Gem | null> {
  const token = core.getInput('rubygemsToken')
  return new Promise<Gem | null>((resolve) => {
    const options = {
      hostname: 'rubygems.org',
      port: 443,
      path: `/gems/${gemname}`,
      method: 'GET',
      heders: {
        'Authorization': token
      }
    }
    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        res.on('data', (data) => {
          console.log('bar', data)
          resolve({
            name: data['name'],
            projectUri: data['project_uri'],
            homepageUri: data['homepage_uri'],
            sourceCodeUri: data['source_code_uri'],
            changelogUri: data['changelog_uri']
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

function generateReport(changelogs: GemWithChangeLogUrl[]): string {
  return markdownTable([
    ['Gem', 'ChangeLog URL'],
    ...changelogs.map(({ gem, changeLogUrl }) => [gem.name, changeLogUrl || 'UNKNOWN'])
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
    const updatedRubyGems = await listUpdatedRubyGems()
    const rubygemsDescs = await Promise.all(updatedRubyGems.map(gem => fetchRubyGemsDescription(gem)))
    const changelogUrls = await Promise.all(
      rubygemsDescs.filter(isNotNull)
        .map(gem => searchChangeLogUrl(gem).then((changeLogUrl) => ({ gem, changeLogUrl })))
    )

    const report = generateReport(changelogUrls)
    await postComment(report)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
