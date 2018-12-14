#!/usr/bin/env node

import { exec } from 'child_process'
import { promisify as pify } from 'util'
import fetch from 'node-fetch'

type Repo = {
  name: string
  url: string
}

type Issue = {
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

async function fetchData(token: string): Promise<{
  repos: Repo[]
  issues: Issue[]
  pulls: Issue[]
}> {
  const url = 'https://api.github.com/graphql'
  const repoArguments = 'first: 100'
  const issueArguments = 'first: 100, states: OPEN'
  const repoQuerySchema = `
    nodes {
      name: nameWithOwner
      url
    }
  `
  const issueQuerySchema = `
    nodes {
      title
      number
      url
      repo: repository { nameWithOwner }
    }
  `
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        query {
          viewer {
            repositories(${repoArguments}) { ${repoQuerySchema} }
            repositoriesContributedTo(${repoArguments}) { ${repoQuerySchema} }
            issues(${issueArguments}) { ${issueQuerySchema} }
            pullRequests(${issueArguments}) { ${issueQuerySchema} }
          }
          search(query: "assignee:caseyWebb is:issue state:open", type: ISSUE, first: 100) {
            edges {
              node {
                ...on Issue {
                  title
                  number
                  url
                  repo: repository { nameWithOwner }
                }
              }
            }
          }
        }
      `
    })
  })

  const { data } = await res.json()

  const repos = [
    ...data.viewer.repositories.nodes,
    ...data.viewer.repositoriesContributedTo.nodes
  ]
  const pulls = formatGraphQLIssues(data.viewer.pullRequests)
  const issues = [
    // issues assigned to you
    ...formatGraphQLIssues({ nodes: data.search.edges.map((edge: any) => edge.node) }),
    // issues created by you
    ...formatGraphQLIssues(data.viewer.issues)
  ]
    
  return { pulls, issues, repos }
}

function formatGraphQLIssues(data: any): Issue[] {
  return data.nodes.map((pr: any) => ({
    number: pr.number,
    repo: pr.repo.nameWithOwner,
    url: pr.url,
    displayText: `${pr.repo.nameWithOwner} - #${pr.number} (${pr.title})`
  }))
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr))
}

async function promptResource(): Promise<string> {
  return await dmenu(['repos', 'issues', 'pulls'])
}

async function promptRepos(repos: Repo[]): Promise<undefined | Repo> {
  const stdout = await dmenu(repos.map((repo) => repo.name))
  return repos.find((repo) => repo.name === stdout)
}

async function promptIssues(issues: Issue[]): Promise<undefined | Issue> {
  const stdout = await dmenu(issues.map((pr) => pr.displayText))
  const [_, repo, _number] = stdout.match(/(.+) - #(\d+)/) as any
  const number = parseInt(_number, 10)
  return issues.find((pr) => pr.number === number && pr.repo === repo)
}

async function main(): Promise<void> {
  try {
    const token = await getToken()
    const [data, resource] = await Promise.all([
      fetchData(token),
      promptResource()
    ])
    let selected: undefined | { url: string }
    switch (resource) {
      case 'repos':
      selected = await promptRepos(data.repos)
      break
      case 'issues':
      selected = await promptIssues(data.issues)
      break
      case 'pulls':
      // pull requests and issues have the same schema
      selected = await promptIssues(data.pulls)
      break
    }
    if (!selected) {
      throw new Error('Unexpected error: Failed to match selected item')
    }
    await pify(exec)(`xdg-open ${selected.url}`)
  } catch (e) {
    await pify(exec)(`notify-send "ghmenu error" "${e.message}"`)
  }
}

main()
