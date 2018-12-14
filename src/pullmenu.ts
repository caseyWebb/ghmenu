#!/usr/bin/env node

import { exec } from 'child_process'
import { promisify as pify } from 'util'
import fetch from 'node-fetch'
import { getToken, prompt } from './lib'

type PullRequest = {
  number: number
  repo: string
  url: string
  displayText: string
}

async function getPullRequests(token: string): Promise<PullRequest[]> {
  const url = 'https://api.github.com/graphql'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        query {
          viewer {
            pullRequests(first: 100, states: OPEN) { 
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                title
                number
                url
                repo: repository {
                  nameWithOwner
                }
              }
            }
          }
        }
      `
    })
  })

  const { data } = await res.json()

  return data.viewer.pullRequests.nodes.map((pr: any) => ({
    number: pr.number,
    repo: pr.repo.nameWithOwner,
    url: pr.url,
    displayText: `${pr.repo.nameWithOwner} - #${pr.number} (${pr.title})`
  }))
}

async function promptPullRequests(pulls: PullRequest[]): Promise<string> {
  return await prompt(pulls.map((pr) => pr.displayText))
}

function parseStdout(stdout: string): { repo: string, number: number } {
  const [_, repo, number] = stdout.match(/(.+) - #(\d+)/) as any
  return { repo, number: parseInt(number, 10) }
}

async function main(): Promise<void> {
  try {
    const token = await getToken()
    const pulls = await getPullRequests(token)
    const stdout = await promptPullRequests(pulls)
    const { repo, number } = parseStdout(stdout)
    const selectedPull = pulls.find(
      (pr) => pr.number === number && pr.repo === repo
    )
    if (!selectedPull) {
      throw new Error('Unexpected error: Failed to match selected PR')
    }
    await pify(exec)(`xdg-open ${selectedPull.url}`)
  } catch (e) {
    await pify(exec)(`notify-send "pullmenu error" "${e.message}"`)
  }
}

main()
