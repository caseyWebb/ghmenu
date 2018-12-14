#!/usr/bin/env node

import { exec } from 'child_process'
import { promisify as pify } from 'util'
import fetch from 'node-fetch'

type Repo = {
  name: string
  url: string
}

type IssueOrPullRequest = {
  number: number
  repo: string
  url: string
  displayText: string
}

async function getToken(): Promise<string> {
  const { stdout } = await pify(exec)('pass show tokens/github/repo')
  return stdout.trim()
}

async function dmenu(options: string[]): Promise<string> {
  const { stdout } = await pify(exec)(
    `echo "${uniq(options).join('\n').replace(/"/g, '\\"')}" | dmenu -i`
  )
  return stdout.trim()
}

async function queryGithub(token: string, query: string): Promise<any> {
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

async function fetchRepositories(token: string): Promise<Repo[]> {
  const repoArguments = 'first: 100'
  const repoSchema = `
    nodes {
      name: nameWithOwner
      url
    }
  `
  const data = await queryGithub(token, `
    query {
      viewer {
        repositories(${repoArguments}) { ${repoSchema} }
        repositoriesContributedTo(${repoArguments}) { ${repoSchema} }
      }
    }
  `)
  return [
    ...data.viewer.repositories.nodes,
    ...data.viewer.repositoriesContributedTo.nodes
  ]
}

async function fetchRepositoryData(token: string, repo: string): Promise<{
  issues: IssueOrPullRequest[]
  pulls: IssueOrPullRequest[]
}> {
  const issueArguments = 'first: 100, states: OPEN'
  const issueQuerySchema = `
    title
    number
    url
  `
  const data = await queryGithub(token, `
    query {
      viewer {
        issues(${issueArguments}) { nodes { ${issueQuerySchema} } }
        pullRequests(${issueArguments}) { nodes { ${issueQuerySchema} } }
      }
      search(query: "assignee:caseyWebb state:open repo:${repo}", type: ISSUE, first: 100) {
        edges {
          node {
            __typename
            ...on PullRequest { ${ issueQuerySchema } }
            ...on Issue { ${issueQuerySchema} }
          }
        }
      }
    }
  `)
  const searchResults = data.search.edges.map((edge: any) => edge.node)
  const pulls = [
    // pulls assigned to you
    ...formatGraphQLIssues({ nodes: searchResults.filter((node: any) => node.__typename === "PullRequest") }),
    // pulls created by you
    ...formatGraphQLIssues(data.viewer.pullRequests)
  ]
  const issues = [
    // issues assigned to you
    ...formatGraphQLIssues({ nodes: searchResults.filter((node: any) => node.__typename = "Issue") }),
    // issues created by you
    ...formatGraphQLIssues(data.viewer.issues)
  ]
  return { pulls, issues }
}

function formatGraphQLIssues(data: any): IssueOrPullRequest[] {
  return data.nodes.map((pr: any) => ({
    number: pr.number,
    url: pr.url,
    displayText: `#${pr.number} - (${pr.title})`
  }))
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr))
}

async function open(url: string) {
  await pify(exec)(`xdg-open ${url}`)
}

async function promptResource(): Promise<string> {
  return await dmenu(['Open on GitHub', 'Issues', 'Pull Requests'])
}

async function promptRepos(repos: Repo[]): Promise<undefined | Repo> {
  const stdout = await dmenu(repos.map((repo) => repo.name))
  return repos.find((repo) => repo.name === stdout)
}

async function promptIssuesOrPullRequests(issues: IssueOrPullRequest[]): Promise<undefined | IssueOrPullRequest> {
  const stdout = await dmenu(issues.map((i) => i.displayText))
  const matches = stdout.match(/^#(\d+)/) as any
  const number = parseInt(matches[1], 10)
  return issues.find((i) => i.number === number)
}

async function main(): Promise<void> {
  try {
    const token = await getToken()
    const repos = await fetchRepositories(token)
    const selectedRepo = await promptRepos(repos)
    const selectedResource = await promptResource()

    if (!selectedRepo) throw new Error('Error selecting repository')

    if (selectedResource === 'Open on GitHub') {
      open(selectedRepo.url)
    } else {
      const data = await fetchRepositoryData(token, selectedRepo.name)
      let selectedIssueOrPull: undefined | { url: string }
      switch (selectedResource) {
        case 'Issues':
        selectedIssueOrPull = await promptIssuesOrPullRequests(data.issues)
        break
        case 'Pull Requests':
        // pull requests and issues have the same schema
        selectedIssueOrPull = await promptIssuesOrPullRequests(data.pulls)
        break
      }
      if (!selectedIssueOrPull) throw new Error('Unexpected error: Failed to match selected item')
      open(selectedIssueOrPull.url)
    }
  } catch (e) {
    await pify(exec)(`notify-send "ghmenu error" "${e.message}"`)
  }
}

main()
