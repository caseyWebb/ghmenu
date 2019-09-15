#!/usr/bin/env node

import { exec } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify as pify } from 'util'
import fetch from 'node-fetch'

interface Repo {
  name: string
  owner: string
  url: string
}

interface IssueLike {
  number: number
  url: string
  displayText: string
}

async function getToken(): Promise<string> {
  const { stdout } = await pify(exec)('pass show tokens/github/repo')
  return stdout.trim()
}

async function dmenu(options: string[]): Promise<string> {
  const uniqOpts = Array.from(new Set(options))
  try {
    const { stdout } = await pify(exec)(
      `. $HOME/.dmenurc && echo "${uniqOpts
        .join('\n')
        .replace(/"/g, '\\"')}" | dmenu $DMENU_OPTIONS -i`
    )
    return stdout.trim()
  } catch (e) {
    process.exit()
    return ''
  }
}

async function queryGithub<T>(token: string, query: string): Promise<T> {
  const url = 'https://api.github.com/graphql'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`
    },
    body: JSON.stringify({ query })
  })
  const { data } = await res.json()
  return data
}

async function fetchRepositories(forceRefresh?: boolean): Promise<Repo[]> {
  const cache = path.join(os.tmpdir(), 'ghmenu_repos')
  if (!forceRefresh && fs.existsSync(cache)) {
    const buf = await pify(fs.readFile)(cache)
    return JSON.parse(buf.toString())
  } else {
    const token = await getToken()
    const repoArguments = 'first: 100'
    const repoSchema = `
      nodes {
        name
        owner {
          login
        }
        url
      }
    `
    const data = await queryGithub<{
      viewer: {
        repositories: {
          nodes: { name: string; url: string; owner: { login: string } }[]
        }
        repositoriesContributedTo: {
          nodes: { name: string; url: string; owner: { login: string } }[]
        }
      }
    }>(
      token,
      `
      query {
        viewer {
          repositories(${repoArguments}) { ${repoSchema} }
          repositoriesContributedTo(${repoArguments}) { ${repoSchema} }
        }
      }
    `
    )
    const repos = [
      ...data.viewer.repositories.nodes,
      ...data.viewer.repositoriesContributedTo.nodes
    ].map((repo) => ({
      ...repo,
      owner: repo.owner.login
    }))
    await pify(fs.writeFile)(cache, JSON.stringify(repos))
    return repos
  }
}

enum IssueLikeType {
  Issues = 'issues',
  PullRequests = 'pullRequests'
}

async function fetchRepositoryData(
  repo: Repo,
  resource: IssueLikeType
): Promise<IssueLike[]> {
  const token = await getToken()
  const query = `
    query {
      repository(owner: "${repo.owner}", name: "${repo.name}") {
        ${resource}(states: OPEN, last: 100) {
          nodes {
            number
            title
            url
          }
        }
      }
    }
  `
  const data = await queryGithub<{
    repository: Record<
      string,
      { nodes: { number: number; url: string; title: string }[] }
    >
  }>(token, query)
  return data.repository[resource].nodes.map((i) => ({
    number: i.number,
    url: i.url,
    displayText: `#${i.number} - ${i.title}`
  }))
}

async function open(url: string): Promise<void> {
  await pify(exec)(`xdg-open ${url}`)
}

async function promptResource(): Promise<string> {
  return await dmenu(['Open on GitHub', 'Issues', 'Pull Requests'])
}

async function promptRepos(repos: Repo[]): Promise<undefined | Repo> {
  const refreshOpt = 'Refresh Repository List'
  const options = [
    ...repos.map((repo) => `${repo.owner}/${repo.name}`),
    refreshOpt
  ]
  const stdout = await dmenu(options)
  if (stdout === refreshOpt) {
    repos = await fetchRepositories(true)
    return promptRepos(repos)
  } else {
    const [owner, name] = (/(.+)\/(.+)/.exec(stdout) as RegExpExecArray).slice(
      1
    )
    return repos.find((repo) => repo.owner === owner && repo.name === name)
  }
}

async function promptIssueLike(
  issues: IssueLike[]
): Promise<undefined | IssueLike> {
  const stdout = await dmenu(issues.map((i) => i.displayText))
  const matches = /^#(\d+)/.exec(stdout) as RegExpExecArray
  const number = parseInt(matches[1], 10)
  return issues.find((i) => i.number === number)
}

async function main(): Promise<void> {
  try {
    const repos = await fetchRepositories()
    const selectedRepo = await promptRepos(repos)
    const selectedResource = await promptResource()

    if (!selectedRepo) throw new Error('Error selecting repository')

    if (selectedResource === 'Open on GitHub') {
      open(selectedRepo.url)
    } else {
      const data = await fetchRepositoryData(
        selectedRepo,
        selectedResource === 'Issues'
          ? IssueLikeType.Issues
          : IssueLikeType.PullRequests
      )
      const selectedIssueOrPull = await promptIssueLike(data)
      if (!selectedIssueOrPull)
        throw new Error('Unexpected error: Failed to match selected item')
      open(selectedIssueOrPull.url)
    }
  } catch (e) {
    await pify(exec)(`notify-send "ghmenu error" "${e.message}"`)
  }
}

main()
